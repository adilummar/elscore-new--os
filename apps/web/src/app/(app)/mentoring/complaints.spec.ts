import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  AckView, CATEGORY_CHOICES, COMMUNICATION_CHOICES, ComplaintDetail, ComplaintRow, ENTRY_LABELS, PRIORITY_CHOICES, SETTABLE_STATUS_CHOICES, SLA_CHOICES, STAGE_CHOICES, STATUS_CHOICES, ackText, complaintProblems, emptyComplaintDraft, emptyResolutionDraft,
  isoFromLocal, minutesText, payloadOfComplaint, payloadOfResolution, resolutionProblems,
} from './complaint-view';
import { ClockPanel, ComplaintCard, ComplaintDetailView, ComplaintForm, ParentView, ResolveForm, Timeline } from './students/[id]/ComplaintsPanel';

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const noop = () => undefined;
const render = (el: React.ReactElement) => renderToStaticMarkup(el);

const ack = (over: Partial<AckView> = {}): AckView => ({
  startedAt: '2026-11-10T04:30:00.000Z', dueAt: '2026-11-10T06:30:00.000Z', acknowledgedAt: null, firstResponseAt: null, state: 'WITHIN_SLA', stateLabel: 'Within SLA', metSla: null, overdueMinutes: 0, remainingMinutes: 90,
  target: { label: 'Acknowledge a parent complaint', targetMinutes: 120, mode: 'WORKING_HOURS' }, ...over,
});
const row = (over: Partial<ComplaintRow> = {}): ComplaintRow => ({
  id: 'c-1', number: 'CMP-1A2B3C4D', title: 'Tutor joins late', category: 'TUTOR', categoryLabel: 'Tutor', priority: 'HIGH', priorityLabel: 'High', activationId: 'act-1', studentName: 'Synthetic Student A', parentName: 'Parent A',
  status: 'NEW', statusLabel: 'New', stage: 'STARTED', stageLabel: 'Started', assignedToUserId: 'mentor-1', assignedToName: 'Mira Mentor', receivedAt: '2026-11-10T04:30:00.000Z', ack: ack(), resolutionMinutes: null, reopenCount: 0, ...over,
});
const detail = (over: Partial<ComplaintDetail> = {}): ComplaintDetail => ({
  ...row(), description: 'The tutor joined 20 minutes late twice.', channel: 'PHONE', channelLabel: 'Phone call', supportingNote: null, subjectName: 'English', tutorName: 'Meera Thomas', loggedAt: '2026-11-10T04:35:00.000Z', loggedByName: 'Mira Mentor',
  acknowledged: null, resolution: null, resolutionNote: 'The resolution time is measured from when the parent complained. No resolution target is promised. The two-hour target is for acknowledgement only.',
  entries: [{ kind: 'LOGGED', visibility: 'PARENT', text: 'Complaint recorded: Tutor joins late', at: '2026-11-10T04:35:00.000Z', by: 'Mira Mentor' }, { kind: 'INTERNAL_REMARK', visibility: 'INTERNAL', text: 'Staff only note', at: '2026-11-10T04:40:00.000Z', by: 'Mira Mentor' }],
  parentView: { stage: 'STARTED', stageLabel: 'Started', title: 'Tutor joins late', categoryLabel: 'Tutor', history: [{ kind: 'LOGGED', text: 'Complaint recorded: Tutor joins late', at: '2026-11-10T04:35:00.000Z', by: 'Mira Mentor' }], note: 'This is what the parent can be shown. Parents have no login, so you read or send it to them. Internal remarks and actions are never part of it.' },
  actions: { canHandle: true, canAcknowledge: true, canRespond: false, canAssign: true, canSetStatus: false, canResolve: false, canReopen: false, reopenProblem: null }, ...over,
});

describe('the complaint card', () => {
  it('shows the title, category, status, stage, parent, when it was made, who has it, and the acknowledgement clock', () => {
    const t = text(render(React.createElement(ComplaintCard, { c: row(), onOpen: noop })));
    for (const part of ['Tutor joins late', 'CMP-1A2B3C4D', 'Tutor', 'New', 'Started', 'Parent A', 'Mira Mentor', 'High', 'Acknowledgement: Within SLA', '1 h 30 min left', 'Not resolved yet']) expect(t).toContain(part);
  });

  it('shows the resolution time of a resolved complaint, apart from the acknowledgement', () => {
    const t = text(render(React.createElement(ComplaintCard, { c: row({ stage: 'RESOLVED', stageLabel: 'Resolved', status: 'RESOLVED', statusLabel: 'Resolved', resolutionMinutes: 210, ack: ack({ state: 'RESOLVED', stateLabel: 'Resolved', metSla: true }) }), onOpen: noop })));
    expect(t).toContain('Resolution time 3 h 30 min');
    expect(t).toContain('Answered within the target');
  });

  it('shows a breached clock plainly', () => {
    const t = text(render(React.createElement(ComplaintCard, { c: row({ ack: ack({ state: 'BREACHED', stateLabel: 'SLA breached', overdueMinutes: 45 }) }), onOpen: noop })));
    expect(t).toContain('Acknowledgement: SLA breached');
    expect(t).toContain('45 min past the target');
  });
});

describe('the clock words', () => {
  it('says a length of time plainly', () => {
    expect(minutesText(0)).toBe('under a minute');
    expect(minutesText(45)).toBe('45 min');
    expect(minutesText(90)).toBe('1 h 30 min');
    expect(minutesText(120)).toBe('2 h');
    expect(minutesText(1440)).toBe('1 day');
    expect(minutesText(2 * 1440 + 3 * 60 + 5)).toBe('2 days 3 h');
  });

  it('says whether the acknowledgement was on time, in working hours', () => {
    expect(ackText(ack({ state: 'RESOLVED', metSla: false, overdueMinutes: 60 }))).toContain('Answered late, 1 h over the target');
    expect(ackText(ack({ state: 'RESOLVED', metSla: true }))).toContain('Answered within the target');
    expect(ackText(ack())).toContain('2 h of working hours');
    expect(ackText(ack({ state: null, stateLabel: null, target: null }))).toBe('No response target is set.');
  });

  it('keeps the acknowledgement clock and the resolution time in two places, and promises no resolution target', () => {
    const t = text(render(React.createElement(ClockPanel, { c: detail() })));
    for (const part of ['Acknowledgement target', 'Complaint made', 'Acknowledgement due', 'First response: Not yet', 'Resolution time', 'Not resolved yet', 'No resolution target is promised', 'The two-hour target is for acknowledgement only']) expect(t).toContain(part);
  });
});

describe('logging a complaint', () => {
  const full = { ...emptyComplaintDraft('Parent A'), title: 'Tutor joins late', category: 'TUTOR', channel: 'PHONE', description: 'The tutor joined late.' };

  it('has every field of the specification and says what is missing', () => {
    const html = render(React.createElement(ComplaintForm, { draft: emptyComplaintDraft(), onChange: noop, onSubmit: noop, onCancel: noop }));
    const t = text(html);
    for (const part of ['Complaint title', 'Parent', 'Category', 'Priority', 'How the parent made it', 'When the parent made it', 'What the parent complained about', 'Supporting material, if any', 'working hours from the time the parent made the complaint']) expect(t).toContain(part);
    expect(t).toContain('Still needed: a title, the category, what the parent complained about, the name of the parent, how the parent made the complaint');
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>[^<]*Log the complaint/);
    expect(html).toContain('Files are not stored here');
    for (const [, label] of CATEGORY_CHOICES) expect(t).toContain(label);
  });

  it('turns what is typed into a request, with the time left to the server when empty', () => {
    expect(complaintProblems(full)).toEqual([]);
    expect(payloadOfComplaint(full)).toMatchObject({ title: 'Tutor joins late', category: 'TUTOR', priority: 'NORMAL', channel: 'PHONE', parentName: 'Parent A', receivedAt: undefined });
    expect(isoFromLocal('')).toBeUndefined();
    expect(isoFromLocal('not a time')).toBeUndefined();
    expect(isoFromLocal('2026-11-10T10:00')).toMatch(/Z$/);
    expect(complaintProblems({ ...full, receivedAtLocal: 'later' })).toEqual(['a real date and time']);
  });

  it('has the categories, priorities and stages of the specification', () => {
    expect(CATEGORY_CHOICES.map((c) => c[1])).toEqual(['Tutor', 'Timetable', 'Payment', 'Learning or academic progress', 'Other']);
    expect(PRIORITY_CHOICES.map((c) => c[1])).toEqual(['Low', 'Normal', 'High', 'Urgent']);
    expect(STAGE_CHOICES.map((c) => c[1])).toEqual(['Started', 'Ongoing', 'Resolved']);
    expect(STATUS_CHOICES.map((c) => c[1])).toEqual(['New', 'Acknowledged', 'Assigned', 'In progress', 'Waiting for parent', 'Waiting for tutor', 'Resolved', 'Reopened']);
    expect(SLA_CHOICES.map((c) => c[1])).toEqual(['Within SLA', 'Approaching SLA', 'SLA breached', 'Resolved']);
  });
});

describe('resolving a complaint', () => {
  it('cannot be done without the explanation, how it was resolved and whether the parent was told', () => {
    expect(resolutionProblems(emptyResolutionDraft())).toEqual(['the resolution remarks, explaining how it was resolved', 'how the problem was resolved', 'whether the parent has been told']);
    const ok = { remarks: 'The tutor was spoken to and the time fixed.', how: 'Class moved', resolutionDate: '', communication: 'INFORMED', communicationNote: '' };
    expect(resolutionProblems(ok)).toEqual([]);
    expect(resolutionProblems({ ...ok, communication: 'NOT_REACHABLE' })).toEqual(['why the parent has not been told yet']);
    expect(resolutionProblems({ ...ok, remarks: 'ok' })).toHaveLength(1);
    expect(payloadOfResolution(ok)).toMatchObject({ remarks: ok.remarks, how: 'Class moved', communication: 'INFORMED', resolutionDate: undefined });
  });

  it('keeps the resolve button off until it is complete, and says what is still needed', () => {
    const html = render(React.createElement(ResolveForm, { busy: false, onSubmit: noop }));
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>[^<]*Resolve the complaint/);
    const t = text(html);
    for (const part of ['Resolution remarks', 'How the problem was resolved', 'Resolution date', 'Parent communication', 'cannot be resolved without this explanation', 'You are recorded as the person who resolved it', 'Still needed']) expect(t).toContain(part);
    expect(COMMUNICATION_CHOICES).toHaveLength(3);
  });
});

describe('the complaint detail', () => {
  const view = (c: ComplaintDetail, handlers: Array<{ userId: string; name: string }> = [{ userId: 'head-1', name: 'Hari Head' }, { userId: 'mentor-1', name: 'Mira Mentor' }], error: string | null = null) =>
    render(React.createElement(ComplaintDetailView, { c, handlers, busy: false, error, call: noop, onClose: noop }));

  it('shows everything about the complaint, and a form to acknowledge it first', () => {
    const t = text(view(detail()));
    for (const part of ['Tutor joins late', 'The tutor joined 20 minutes late twice.', 'Made by: Phone call', 'Logged by: Mira Mentor', 'Subject: English', 'Tutor: Meera Thomas', 'Acknowledge the complaint', 'How you told the parent', 'Record the acknowledgement']) expect(t).toContain(part);
    expect(t).not.toContain('Send the response'); // not before the acknowledgement
    expect(t).not.toContain('Resolve the complaint');
  });

  it('offers the response, the status and the resolution once acknowledged', () => {
    const c = detail({ status: 'ACKNOWLEDGED', statusLabel: 'Acknowledged', actions: { canHandle: true, canAcknowledge: false, canRespond: true, canAssign: true, canSetStatus: true, canResolve: true, canReopen: false, reopenProblem: null } });
    const html = view(c);
    const t = text(html);
    for (const part of ['Response to the parent', 'Send the response', 'What the parent said', 'Internal remark', 'Staff only. The parent never sees it.', 'Action taken', 'Change the status', 'Assign or escalate', 'This is an escalation', 'Resolve the complaint']) expect(t).toContain(part);
    expect(t).not.toContain('Record the acknowledgement');
    for (const [, label] of SETTABLE_STATUS_CHOICES) expect(t).toContain(label);
  });

  it('offers only staff other than the person who has it as someone to assign to', () => {
    const html = view(detail());
    expect(html).toContain('Hari Head');
    expect(html).not.toContain('>Mira Mentor</option>');
  });

  it('shows the resolution, and a reopen form for a resolved complaint', () => {
    const resolved = detail({
      status: 'RESOLVED', statusLabel: 'Resolved', stage: 'RESOLVED', stageLabel: 'Resolved', resolutionMinutes: 210,
      resolution: { resolvedAt: '2026-11-10T08:00:00.000Z', resolvedByName: 'Mira Mentor', date: '2026-11-10', remarks: 'The tutor was spoken to.', how: 'Class moved', communication: 'INFORMED', communicationLabel: 'The parent has been told', communicationNote: null, minutes: 210 },
      actions: { canHandle: true, canAcknowledge: false, canRespond: true, canAssign: false, canSetStatus: false, canResolve: false, canReopen: true, reopenProblem: null },
    });
    const t = text(view(resolved));
    for (const part of ['Class moved', 'The tutor was spoken to.', 'Resolved on Tuesday, 10 November 2026 by Mira Mentor', 'The parent has been told', 'Reopen the complaint', '3 h 30 min']) expect(t).toContain(part);
  });

  it('says why a complaint cannot be reopened any more', () => {
    const old = detail({ status: 'RESOLVED', stage: 'RESOLVED', stageLabel: 'Resolved', actions: { canHandle: true, canAcknowledge: false, canRespond: true, canAssign: false, canSetStatus: false, canResolve: false, canReopen: false, reopenProblem: 'A complaint can be reopened for 30 days after it was resolved. Log a new complaint instead.' } });
    const t = text(view(old));
    expect(t).toContain('Log a new complaint instead');
    expect(t).not.toContain('Why required');
  });

  it('shows someone who may not handle it no action at all, only the record', () => {
    const t = text(view(detail({ actions: { canHandle: false, canAcknowledge: false, canRespond: false, canAssign: false, canSetStatus: false, canResolve: false, canReopen: false, reopenProblem: null } })));
    for (const part of ['Acknowledge the complaint', 'Add the remark', 'Staff only. The parent never sees it.', 'Assign or escalate', 'Resolve the complaint', 'Record the parent message']) expect(t).not.toContain(part);
    expect(t).toContain('Everything recorded');
    expect(t).toContain('Staff only note'); // the record itself is still readable
  });

  it('shows an error from the server as it is', () => {
    expect(text(view(detail(), [], 'Acknowledge the complaint first.'))).toContain('Acknowledge the complaint first.');
  });
});

describe('what the parent sees, and what only staff see', () => {
  it('shows the parent only the entries meant for them, with the stage in their words, and says there is no login', () => {
    const t = text(render(React.createElement(ParentView, { c: detail() })));
    expect(t).toContain('Started');
    expect(t).toContain('Complaint recorded: Tutor joins late');
    expect(t).toContain('Parents have no login');
    expect(t).not.toContain('Staff only note');
  });

  it('marks each entry in the staff timeline as internal or visible to the parent', () => {
    const html = render(React.createElement(Timeline, { entries: detail().entries }));
    expect(html).toContain('data-visibility="PARENT"');
    expect(html).toContain('data-visibility="INTERNAL"');
    const t = text(html);
    expect(t).toContain('Parent can see');
    expect(t).toContain('Internal');
    expect(t).toContain('Staff only note');
  });

  it('has a label for every kind of entry', () => {
    for (const kind of ['LOGGED', 'ACKNOWLEDGED', 'INTERNAL_REMARK', 'ACTION_TAKEN', 'PARENT_RESPONSE', 'PARENT_MESSAGE', 'STATUS_CHANGED', 'ASSIGNED', 'ESCALATED', 'RESOLVED', 'REOPENED']) expect(ENTRY_LABELS[kind]).toBeTruthy();
  });
});

describe('the words', () => {
  it('writes no dashes or emoji in its copy', () => {
    const all = [
      render(React.createElement(ComplaintCard, { c: row(), onOpen: noop })), render(React.createElement(ComplaintForm, { draft: emptyComplaintDraft(), onChange: noop, onSubmit: noop, onCancel: noop })),
      render(React.createElement(ClockPanel, { c: detail() })), render(React.createElement(ParentView, { c: detail() })), render(React.createElement(ResolveForm, { busy: false, onSubmit: noop })),
      render(React.createElement(ComplaintDetailView, { c: detail(), handlers: [], busy: false, error: null, call: noop, onClose: noop })),
      ...[...CATEGORY_CHOICES, ...PRIORITY_CHOICES, ...STATUS_CHOICES, ...COMMUNICATION_CHOICES, ...SLA_CHOICES, ...STAGE_CHOICES].map((c) => c[1]), ...Object.values(ENTRY_LABELS),
    ].map(text).join(' ');
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
