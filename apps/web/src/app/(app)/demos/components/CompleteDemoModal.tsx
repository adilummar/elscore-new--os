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
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="max-w-2xl mx-auto">
        <h2 className="text-lg font-bold mb-1">Complete Demo & Finalize Post-Demo Plan</h2>
        <p className="text-xs text-slate-500 mb-4">
          Record mandatory attendance, multi-role evaluation, 4-week academic roadmap, and study plan.
        </p>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('feedback')}
            className={`flex items-center gap-1.5 pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'feedback'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            Attendance & Feedback
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('roadmap')}
            className={`flex items-center gap-1.5 pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'roadmap'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Academic Roadmap & Plan
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {activeTab === 'feedback' ? (
            <>
              {/* Mandatory Attendance Prerequisites */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Mandatory Attendance Verification
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Parent Attendance</label>
                    <select
                      value={parentStatus}
                      onChange={(e) => setParentStatus(e.target.value as any)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1.5"
                    >
                      <option value="PRESENT">Present</option>
                      <option value="LATE">Late</option>
                      <option value="ABSENT">Absent</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Coordinator Attendance</label>
                    <select
                      value={coordStatus}
                      onChange={(e) => setCoordStatus(e.target.value as any)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1.5"
                    >
                      <option value="PRESENT">Present</option>
                      <option value="LATE">Late</option>
                      <option value="ABSENT">Absent</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Tutor Attendance</label>
                    <select
                      value={tutorStatus}
                      onChange={(e) => setTutorStatus(e.target.value as any)}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1.5"
                    >
                      <option value="PRESENT">Present</option>
                      <option value="LATE">Late</option>
                      <option value="ABSENT">Absent</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Tutor Feedback */}
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Overall Demo Rating</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRating(r.toString())}
                        className={`flex-1 py-1.5 text-center rounded-md border text-xs sm:text-sm font-medium ${
                          rating === r.toString()
                            ? 'bg-amber-100 border-amber-400 text-amber-800 font-bold'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {r} ⭐
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Student Performance & Comments *
                  </label>
                  <textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    rows={2}
                    required
                    placeholder="Describe how the student performed during the demo session..."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Student Strengths</label>
                    <Input
                      value={strengths}
                      onChange={(e) => setStrengths(e.target.value)}
                      placeholder="e.g. Quick calculation, clear logic"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Areas for Improvement</label>
                    <Input
                      value={weaknesses}
                      onChange={(e) => setWeaknesses(e.target.value)}
                      placeholder="e.g. Word problems, formula retention"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tutor Recommendations</label>
                  <Input
                    value={tutorRecommendations}
                    onChange={(e) => setTutorRecommendations(e.target.value)}
                    placeholder="e.g. Needs 2 classes/week focusing on practice exercises"
                  />
                </div>
              </div>

              {/* Coordinator & Parent Observations */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Coordinator & Parent Evaluation
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Academic Assessment</label>
                    <Input
                      value={academicAssessment}
                      onChange={(e) => setAcademicAssessment(e.target.value)}
                      placeholder="Coordinator evaluation of academic level"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Engagement Level</label>
                    <select
                      value={engagementLevel}
                      onChange={(e) => setEngagementLevel(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-2 text-xs"
                    >
                      <option value="HIGH">High Engagement</option>
                      <option value="MEDIUM">Medium Engagement</option>
                      <option value="LOW">Low Engagement</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Parent Feedback</label>
                    <Input
                      value={parentFeedback}
                      onChange={(e) => setParentFeedback(e.target.value)}
                      placeholder="Parent verbal feedback during or after demo"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Parent Interest Level</label>
                    <select
                      value={parentInterestLevel}
                      onChange={(e) => setParentInterestLevel(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-2 text-xs"
                    >
                      <option value="HIGH">High Interest (Ready to Enroll)</option>
                      <option value="MEDIUM">Medium Interest (Follow-up needed)</option>
                      <option value="LOW">Low Interest</option>
                    </select>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Academic Roadmap (4 weeks = 1 month) */}
              <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg space-y-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-800 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                  Academic Roadmap (Post-Demo Recommendation)
                </span>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Recommendation Plan Title</label>
                  <Input
                    value={recommendationPlan}
                    onChange={(e) => setRecommendationPlan(e.target.value)}
                    placeholder="e.g. 4-week foundational acceleration plan (1 month)"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Recommended Classes</label>
                    <Input
                      type="number"
                      value={recommendedClassCount}
                      onChange={(e) => setRecommendedClassCount(e.target.value)}
                      placeholder="8"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Frequency</label>
                    <Input
                      value={recommendedFrequency}
                      onChange={(e) => setRecommendedFrequency(e.target.value)}
                      placeholder="2 classes/week"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Preferred Timing</label>
                    <Input
                      value={preferredTiming}
                      onChange={(e) => setPreferredTiming(e.target.value)}
                      placeholder="e.g. Evening 5-7 PM"
                    />
                  </div>
                </div>
              </div>

              {/* Academic Plan */}
              <div className="p-3 bg-amber-50/50 border border-amber-100 rounded-lg space-y-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-600" />
                  Academic Plan (Learning Goals & Milestones)
                </span>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Learning Goal</label>
                  <Input
                    value={learningGoal}
                    onChange={(e) => setLearningGoal(e.target.value)}
                    placeholder="Primary goal to achieve in the first month"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Target Chapters</label>
                  <Input
                    value={targetChapters}
                    onChange={(e) => setTargetChapters(e.target.value)}
                    placeholder="e.g. Chapters 1 to 3 syllabus coverage"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Study Approach</label>
                  <Input
                    value={studyApproach}
                    onChange={(e) => setStudyApproach(e.target.value)}
                    placeholder="Teaching methodology and focus areas"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Milestones & Checkpoints</label>
                  <Input
                    value={milestones}
                    onChange={(e) => setMilestones(e.target.value)}
                    placeholder="e.g. Week 2 review, Week 4 milestone exam"
                  />
                </div>
              </div>
            </>
          )}

          <div className="pt-4 flex items-center justify-between border-t border-slate-100">
            {activeTab === 'feedback' ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveTab('roadmap')}
                className="text-xs"
              >
                Next: Academic Roadmap &rarr;
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveTab('feedback')}
                className="text-xs"
              >
                &larr; Back to Feedback
              </Button>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button
                type="submit"
                isLoading={isLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Complete Demo
              </Button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}
