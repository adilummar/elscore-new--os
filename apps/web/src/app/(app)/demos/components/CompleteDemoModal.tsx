'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { CheckCircle2, UserCheck, BookOpen, MapPin, Award } from 'lucide-react';
import { completeDemo } from '../actions';

interface CompleteDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  demo: any;
  onSuccess: () => void;
}

export function CompleteDemoModal({ isOpen, onClose, demo, onSuccess }: CompleteDemoModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'feedback' | 'roadmap'>('feedback');

  // Attendance
  const [parentStatus, setParentStatus] = React.useState<'PRESENT' | 'ABSENT' | 'LATE'>('PRESENT');
  const [coordStatus, setCoordStatus] = React.useState<'PRESENT' | 'ABSENT' | 'LATE'>('PRESENT');
  const [tutorStatus, setTutorStatus] = React.useState<'PRESENT' | 'ABSENT' | 'LATE'>('PRESENT');

  // Tutor feedback
  const [rating, setRating] = React.useState('5');
  const [comments, setComments] = React.useState('');
  const [strengths, setStrengths] = React.useState('');
  const [weaknesses, setWeaknesses] = React.useState('');
  const [tutorRecommendations, setTutorRecommendations] = React.useState('');

  // Coordinator & Parent feedback
  const [academicAssessment, setAcademicAssessment] = React.useState('Student has strong fundamentals and showed good enthusiasm.');
  const [engagementLevel, setEngagementLevel] = React.useState('HIGH');
  const [parentFeedback, setParentFeedback] = React.useState('Parent was pleased with tutor explanation and pacing.');
  const [parentInterestLevel, setParentInterestLevel] = React.useState('HIGH');

  // Roadmap (4 weeks = 1 month)
  const [recommendationPlan, setRecommendationPlan] = React.useState('4-week foundational acceleration plan (1 month)');
  const [recommendedClassCount, setRecommendedClassCount] = React.useState('8');
  const [recommendedFrequency, setRecommendedFrequency] = React.useState('2 classes/week');
  const [preferredTiming, setPreferredTiming] = React.useState('Evening (5:00 PM - 7:00 PM)');

  // Academic Plan
  const [learningGoal, setLearningGoal] = React.useState('Master foundational concepts and improve problem-solving speed');
  const [targetChapters, setTargetChapters] = React.useState('Curriculum Chapters 1 - 3');
  const [studyApproach, setStudyApproach] = React.useState('Interactive conceptual sessions with guided problem-solving');
  const [milestones, setMilestones] = React.useState('Week 2 diagnostic check-in, Week 4 unit milestone test');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comments.trim()) {
      alert('Please enter overall demo comments / tutor feedback.');
      setActiveTab('feedback');
      return;
    }

    setIsLoading(true);
    try {
      await completeDemo(demo.id, {
        rating: parseInt(rating, 10),
        comments,
        studentPerformance: comments,
        strengths,
        weaknesses,
        tutorRecommendations,
        tutorRating: parseInt(rating, 10),
        academicAssessment,
        engagementLevel,
        coordinatorRemarks: academicAssessment,
        parentFeedback,
        parentInterestLevel,
        recommendationPlan,
        recommendedClassCount: parseInt(recommendedClassCount, 10) || 8,
        recommendedFrequency,
        preferredDurationMin: demo.durationMinutes || 60,
        preferredTiming,
        learningGoal,
        targetChapters,
        studyApproach,
        milestones,
        attendances: {
          parentStatus,
          coordinatorStatus: coordStatus,
          tutorStatus,
        },
      });
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to complete demo');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="6xl"
      className="p-0 bg-white"
      contentClassName="flex-1 flex flex-col min-h-0 overflow-hidden"
    >
      {/* Sticky Header */}
      <div className="px-6 sm:px-8 pt-6 pb-0 border-b border-slate-200 bg-white shrink-0 pr-14">
        <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Complete Demo & Finalize Plan
          </h2>
          {demo?.businessId && (
            <Badge variant="default" className="bg-slate-100 text-slate-700 font-semibold px-2.5 py-0.5 text-xs">
              {demo.businessId}
            </Badge>
          )}
          {demo?.student?.name && (
            <span className="text-xs sm:text-sm text-slate-500 font-medium">
              Student: <strong className="text-slate-800">{demo.student.name}</strong>
            </span>
          )}
          {demo?.subject?.name && (
            <span className="text-xs sm:text-sm text-slate-400">
              • {demo.subject.name} ({demo.grade?.name || ''} {demo.curriculum?.name || ''})
            </span>
          )}
        </div>
        <p className="text-xs sm:text-sm text-slate-500 mb-4">
          Record mandatory attendance verification, multi-role evaluation, structured 4-week academic roadmap, and monthly milestones.
        </p>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('feedback')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'feedback'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Attendance & Feedback</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('roadmap')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'roadmap'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Academic Roadmap & Plan</span>
            <span className="ml-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
              4-Week
            </span>
          </button>
        </div>
      </div>

      {/* Form Container */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 space-y-6">
          {activeTab === 'feedback' ? (
            <div className="space-y-6">
              {/* Mandatory Attendance Prerequisites */}
              <div className="p-5 sm:p-6 bg-slate-50/70 border border-slate-200 rounded-xl space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Mandatory Attendance Verification
                  </span>
                  <span className="text-xs text-slate-500">Prerequisite for demo completion</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Parent Attendance <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={parentStatus}
                      onChange={(e) => setParentStatus(e.target.value as any)}
                      className="w-full h-10 bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    >
                      <option value="PRESENT">Present</option>
                      <option value="LATE">Late</option>
                      <option value="ABSENT">Absent</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Coordinator Attendance <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={coordStatus}
                      onChange={(e) => setCoordStatus(e.target.value as any)}
                      className="w-full h-10 bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    >
                      <option value="PRESENT">Present</option>
                      <option value="LATE">Late</option>
                      <option value="ABSENT">Absent</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Tutor Attendance <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={tutorStatus}
                      onChange={(e) => setTutorStatus(e.target.value as any)}
                      className="w-full h-10 bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    >
                      <option value="PRESENT">Present</option>
                      <option value="LATE">Late</option>
                      <option value="ABSENT">Absent</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Tutor Feedback */}
              <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-xl space-y-5 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-brand-600" />
                    Tutor Evaluation & Performance
                  </span>
                  <span className="text-xs text-slate-500">Tutor qualitative observations</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Overall Demo Rating <span className="text-red-500">*</span>
                    </label>
                    <div className="flex flex-wrap gap-2.5">
                      {[1, 2, 3, 4, 5].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setRating(r.toString())}
                          className={`flex-1 min-w-[70px] py-2 px-3 text-center rounded-lg border text-sm font-semibold transition-all ${
                            rating === r.toString()
                              ? 'bg-amber-100 border-amber-400 text-amber-900 shadow-sm ring-2 ring-amber-400/30'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          {r} ⭐
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Student Performance & Comments <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                      rows={3}
                      required
                      placeholder="Describe how the student performed during the demo session, conceptual grasp, responsiveness..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Student Strengths
                    </label>
                    <Input
                      value={strengths}
                      onChange={(e) => setStrengths(e.target.value)}
                      placeholder="e.g. Quick calculation, clear logic, engaged attitude"
                      className="h-10 text-sm bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Areas for Improvement
                    </label>
                    <Input
                      value={weaknesses}
                      onChange={(e) => setWeaknesses(e.target.value)}
                      placeholder="e.g. Word problems, formula retention, careless mistakes"
                      className="h-10 text-sm bg-white"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Tutor Recommendations
                    </label>
                    <Input
                      value={tutorRecommendations}
                      onChange={(e) => setTutorRecommendations(e.target.value)}
                      placeholder="e.g. Needs 2 classes/week focusing on practice exercises and periodic revision"
                      className="h-10 text-sm bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Coordinator & Parent Observations */}
              <div className="p-5 sm:p-6 bg-white border border-slate-200 rounded-xl space-y-5 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <Award className="w-4 h-4 text-indigo-600" />
                    Coordinator & Parent Evaluation
                  </span>
                  <span className="text-xs text-slate-500">Academic & sales engagement assessment</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Academic Assessment (Coordinator)
                    </label>
                    <Input
                      value={academicAssessment}
                      onChange={(e) => setAcademicAssessment(e.target.value)}
                      placeholder="Coordinator evaluation of academic level"
                      className="h-10 text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Student Engagement Level
                    </label>
                    <select
                      value={engagementLevel}
                      onChange={(e) => setEngagementLevel(e.target.value)}
                      className="w-full h-10 bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    >
                      <option value="HIGH">High Engagement</option>
                      <option value="MEDIUM">Medium Engagement</option>
                      <option value="LOW">Low Engagement</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Parent Feedback
                    </label>
                    <Input
                      value={parentFeedback}
                      onChange={(e) => setParentFeedback(e.target.value)}
                      placeholder="Parent verbal feedback during or after demo"
                      className="h-10 text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Parent Interest Level
                    </label>
                    <select
                      value={parentInterestLevel}
                      onChange={(e) => setParentInterestLevel(e.target.value)}
                      className="w-full h-10 bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    >
                      <option value="HIGH">High Interest (Ready to Enroll)</option>
                      <option value="MEDIUM">Medium Interest (Follow-up needed)</option>
                      <option value="LOW">Low Interest</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Academic Roadmap (4 weeks = 1 month) */}
              <div className="bg-gradient-to-br from-indigo-50/50 via-white to-slate-50/30 border border-indigo-100 rounded-xl p-5 sm:p-6 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-indigo-100/70">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 shadow-xs">
                      <MapPin className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Academic Roadmap (Post-Demo Recommendation)
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-500">
                        Structured 4-week acceleration plan presented to parent and sales counselor.
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 self-start sm:self-auto shadow-2xs">
                    4-Week Acceleration Plan
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                      Recommendation Plan Title <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={recommendationPlan}
                      onChange={(e) => setRecommendationPlan(e.target.value)}
                      placeholder="e.g. 4-week foundational acceleration plan (1 month)"
                      className="h-10 text-sm bg-white"
                    />
                    <p className="text-xs text-slate-400 mt-1">Recommended program milestone title communicated to parent.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                      Recommended Classes
                    </label>
                    <Input
                      type="number"
                      value={recommendedClassCount}
                      onChange={(e) => setRecommendedClassCount(e.target.value)}
                      placeholder="8"
                      className="h-10 text-sm bg-white"
                    />
                    <p className="text-xs text-slate-400 mt-1">Total class sessions in initial cycle.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                      Class Frequency
                    </label>
                    <Input
                      value={recommendedFrequency}
                      onChange={(e) => setRecommendedFrequency(e.target.value)}
                      placeholder="2 classes/week"
                      className="h-10 text-sm bg-white"
                    />
                    <p className="text-xs text-slate-400 mt-1">Sessions per week cadence.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                      Preferred Timing Window
                    </label>
                    <Input
                      value={preferredTiming}
                      onChange={(e) => setPreferredTiming(e.target.value)}
                      placeholder="e.g. Evening (5:00 PM - 7:00 PM)"
                      className="h-10 text-sm bg-white"
                    />
                    <p className="text-xs text-slate-400 mt-1">Student available time band.</p>
                  </div>
                </div>
              </div>

              {/* Academic Plan (Learning Goals & Milestones) */}
              <div className="bg-gradient-to-br from-amber-50/50 via-white to-slate-50/30 border border-amber-100 rounded-xl p-5 sm:p-6 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-amber-100/70">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 shadow-xs">
                      <Award className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Academic Plan (Learning Goals & Milestones)
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-500">
                        Curriculum targets, pedagogical approach, and formal milestone reviews.
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 self-start sm:self-auto shadow-2xs">
                    Academic Milestones
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                      Primary Learning Goal <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={learningGoal}
                      onChange={(e) => setLearningGoal(e.target.value)}
                      placeholder="Primary goal to achieve in the first month"
                      className="h-10 text-sm bg-white"
                    />
                    <p className="text-xs text-slate-400 mt-1">Core objective agreed upon for student&apos;s roadmap.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                      Target Chapters & Syllabus Scope
                    </label>
                    <Input
                      value={targetChapters}
                      onChange={(e) => setTargetChapters(e.target.value)}
                      placeholder="e.g. Chapters 1 to 3 syllabus coverage"
                      className="h-10 text-sm bg-white"
                    />
                    <p className="text-xs text-slate-400 mt-1">Specific syllabus topics to cover.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                      Study Approach & Pedagogy
                    </label>
                    <Input
                      value={studyApproach}
                      onChange={(e) => setStudyApproach(e.target.value)}
                      placeholder="Teaching methodology and focus areas"
                      className="h-10 text-sm bg-white"
                    />
                    <p className="text-xs text-slate-400 mt-1">Pacing and teaching methodology.</p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                      Milestones & Review Checkpoints
                    </label>
                    <Input
                      value={milestones}
                      onChange={(e) => setMilestones(e.target.value)}
                      placeholder="e.g. Week 2 review, Week 4 milestone exam"
                      className="h-10 text-sm bg-white"
                    />
                    <p className="text-xs text-slate-400 mt-1">Check-in dates and progress reviews to validate learning goals.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Persistent Docked Footer */}
        <div className="px-6 sm:px-8 py-4 border-t border-slate-200 bg-slate-50/90 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          {activeTab === 'feedback' ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setActiveTab('roadmap')}
              className="text-xs sm:text-sm font-medium w-full sm:w-auto"
            >
              Next: Academic Roadmap & Plan &rarr;
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setActiveTab('feedback')}
              className="text-xs sm:text-sm font-medium w-full sm:w-auto"
            >
              &larr; Back to Attendance & Feedback
            </Button>
          )}

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose} 
              disabled={isLoading}
              className="text-xs sm:text-sm font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-medium px-5 shadow-sm"
            >
              Complete Demo & Finalize Plan
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
