import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { TutorCalendarInput, checkWindow, isDateString, resolveDay } from '../tutor/tutor-calendar';
import { loadCalendars } from '../tutor/tutor-calendar.data';

import { MentoringAccessService, MentoringScope } from './mentoring-access.service';
import { MentoringTutorService } from './mentoring-tutor.service';
import {
  AvailabilityOf, Period, PlanAssignment, PlanOverride, SubjectWarning, TimetableEvent, TimetableStatus, TimetableSummary, TimetableView,
  biweeklyAnchor, buildEvents, periodFor, planFromSchedule, rangeProblem, subjectWarnings, summarise, timetableStatus,
} from './student-timetable';
import { isScheduleValue } from './subject-schedule';

const SCHEDULE_FIELD = 'timetable.schedule';
const APPROVAL_ITEM = 'mentor_approved_timetable';
const TIMETABLE_STAGE = 3;

export interface TimetableQuery {
  view: string;
  from: string;
  to?: string;
}

export interface TimetableSubjectView {
  subjectId: string;
  subjectName: string;
  gradeName: string;
  frequencyLabel: string;
  startDate: string | null;
  sessions: string[];
  tutorProfileId: string | null;
  tutorName: string | null;
  assignmentState: 'ASSIGNED' | 'NEEDS_REVIEW' | 'NO_TUTOR';
}

export interface StudentTimetableView {
  student: { id: string; name: string };
  view: TimetableView;
  period: Period;
  timeZone: string;
  status: TimetableStatus;
  summary: TimetableSummary;
  subjects: TimetableSubjectView[];
  warnings: SubjectWarning[];
  events: TimetableEvent[];
  /** The Mentor approval item as saved, so the page can show it beside the checklist. */
  approval: { state: string | null; stageStatus: string | null };
  canViewTutorProfile: boolean;
}

/**
 * Reads a student's timetable for a range of dates. It only reads: the saved schedule, the saved tutor assignments and
 * the tutors' calendars. It stores nothing and creates no booking. Who may read a student is decided by the same rule as
 * the rest of the workspace, in the database query.
 */
@Injectable()
export class MentoringTimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentoringAccessService,
    private readonly tutors: MentoringTutorService,
  ) {}

  async timetable(activationId: string, query: TimetableQuery, scope: MentoringScope): Promise<StudentTimetableView> {
    const db = this.prisma as unknown as PrismaTxClient;
    const activation = await db.mentoringActivation.findFirst({
      where: { AND: [{ id: activationId }, this.access.visibilityWhere(scope)] },
      include: { student: true, stages: { include: { checklist: true } } },
    });
    if (!activation) throw new NotFoundException('Student not found');

    const field = activation.handoverId ? await db.enrollmentHandoverField.findUnique({ where: { handoverId_fieldKey: { handoverId: activation.handoverId, fieldKey: SCHEDULE_FIELD } } }) : null;
    const subjects = planFromSchedule(isScheduleValue(field?.value) ? field.value : null);

    if (!isDateString(query.from) || (query.to !== undefined && !isDateString(query.to))) throw new BadRequestException('Choose real dates, written like 2026-11-09.');
    const wanted = query.to ? { view: query.view, from: query.from, to: query.to } : null;
    const problem = wanted ? rangeProblem(wanted.view, wanted.from, wanted.to) : rangeProblem(query.view, query.from, query.from);
    if (problem) throw new BadRequestException(problem);
    const view = query.view as TimetableView;
    const period: Period = wanted ? { view, from: wanted.from, to: wanted.to, month: view === 'monthly' ? wanted.from.slice(0, 7) : null } : periodFor(view, query.from, biweeklyAnchor(subjects));

    const rows = await db.mentoringTutorAssignment.findMany({ where: { activationId, status: { in: ['ACTIVE', 'NEEDS_REVIEW'] } }, orderBy: { assignedAt: 'asc' } });
    const refs = await this.tutors.refsFor([...new Set(rows.map((r) => r.tutorProfileId))]);
    const assignments: PlanAssignment[] = rows
      .filter((r) => subjects.some((s) => s.subjectId === r.subjectId))
      .map((r) => ({ id: r.id, subjectId: r.subjectId, status: r.status === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'ACTIVE', tutorProfileId: r.tutorProfileId, tutorName: refs.find((t) => t.tutorProfileId === r.tutorProfileId)?.name ?? 'Tutor' }));

    const overrideRows = assignments.length ? await db.mentoringTutorAssignmentOverride.findMany({ where: { assignmentId: { in: assignments.map((a) => a.id) } } }) : [];
    const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    const overrides: PlanOverride[] = overrideRows.map((o) => ({
      assignmentId: o.assignmentId, date: day(o.date) as string, originalStartMinute: o.originalStartMinute, kind: o.kind, newDate: day(o.newDate),
      newStartMinute: o.newStartMinute, newEndMinute: o.newEndMinute, reason: o.reason,
    }));

    // Each tutor's calendar for the period, with this subject's own booking left out so a class never clashes with itself.
    const timeZone = process.env.SYSTEM_TIMEZONE ?? 'Asia/Kolkata';
    const calendars = new Map<string, TutorCalendarInput>();
    for (const a of assignments) {
      const ref = refs.find((t) => t.tutorProfileId === a.tutorProfileId);
      if (!ref) continue;
      const loaded = await loadCalendars(db, [ref], { from: period.from, to: period.to, withStudentNames: false, timeZone, forSubject: { activationId, subjectId: a.subjectId, ignoreAssignmentId: a.id } });
      const calendar = loaded.get(a.tutorProfileId);
      if (calendar) calendars.set(a.id, calendar);
    }
    const availabilityOf: AvailabilityOf = (a, _s, date, start, end) => {
      const calendar = calendars.get(a.id);
      return calendar ? checkWindow(resolveDay(calendar, date), start, end) : null;
    };

    const events = buildEvents({ subjects, assignments, overrides, from: period.from, to: period.to, availabilityOf });
    const warnings = subjectWarnings(subjects, assignments);
    const summary = summarise(subjects, assignments, events, warnings);
    const stage = activation.stages.find((s) => s.stageNumber === TIMETABLE_STAGE);
    const approval = { state: stage?.checklist.find((i) => i.itemKey === APPROVAL_ITEM)?.state ?? null, stageStatus: stage?.status ?? null };

    return {
      student: { id: activation.studentId, name: `${activation.student.firstName} ${activation.student.lastName ?? ''}`.trim() },
      view,
      period,
      timeZone,
      status: timetableStatus({ summary, approvalItem: approval.state, stageStatus: approval.stageStatus }),
      summary,
      subjects: subjects.map((s) => {
        const a = assignments.find((x) => x.subjectId === s.subjectId);
        return {
          subjectId: s.subjectId, subjectName: s.subjectName, gradeName: s.gradeName, frequencyLabel: events.find((e) => e.subjectId === s.subjectId)?.frequencyLabel ?? this.frequencyLabel(s.frequency),
          startDate: s.startDate, sessions: s.sessions.map((x) => x.label), tutorProfileId: a?.tutorProfileId ?? null, tutorName: a?.tutorName ?? null,
          assignmentState: !a ? 'NO_TUTOR' : a.status === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'ASSIGNED',
        };
      }),
      warnings,
      events,
      approval,
      canViewTutorProfile: scope.perms.has('tutor.profile.read'),
    };
  }

  private frequencyLabel(f: string): string {
    return f === 'WEEKLY' ? 'Weekly' : f === 'BIWEEKLY' ? 'Bi-weekly' : 'Monthly';
  }
}
