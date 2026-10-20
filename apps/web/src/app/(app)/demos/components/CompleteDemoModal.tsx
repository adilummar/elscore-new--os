'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { CheckCircle2, UserCheck, BookOpen, MapPin, Award, AlertCircle, RefreshCw } from 'lucide-react';
import { completeDemo, getDemoById } from '../actions';

interface CompleteDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  demo: any;
  onSuccess: () => void;
}

export function CompleteDemoModal({ isOpen, onClose, demo, onSuccess }: CompleteDemoModalProps) {
  // Operational and UI states
  const [isLoading, setIsLoading] = React.useState(false);
  const [isFetchingEvaluation, setIsFetchingEvaluation] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [evaluationLoadError, setEvaluationLoadError] = React.useState<string | null>(null);
  const [isSaved, setIsSaved] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'feedback' | 'roadmap'>('feedback');

  // Attendance
  const [parentStatus, setParentStatus] = React.useState<'PRESENT' | 'ABSENT' | 'LATE'>('PRESENT');
  const [coordStatus, setCoordStatus] = React.useState<'PRESENT' | 'ABSENT' | 'LATE'>('PRESENT');
  const [tutorStatus, setTutorStatus] = React.useState<'PRESENT' | 'ABSENT' | 'LATE'>('PRESENT');

  // Tutor feedback
  const [rating, setRating] = React.useState('');
  const [comments, setComments] = React.useState('');
  const [strengths, setStrengths] = React.useState('');
  const [weaknesses, setWeaknesses] = React.useState('');
  const [tutorRecommendations, setTutorRecommendations] = React.useState('');

  // Coordinator & Parent Evaluation (clean defaults: empty string, unselected dropdowns)
  const [academicAssessment, setAcademicAssessment] = React.useState('');
  const [engagementLevel, setEngagementLevel] = React.useState('');
  const [parentFeedback, setParentFeedback] = React.useState('');
  const [parentInterestLevel, setParentInterestLevel] = React.useState('');

  // Roadmap (4 weeks)
  const [recommendationPlan, setRecommendationPlan] = React.useState('');
  const [recommendedClassCount, setRecommendedClassCount] = React.useState('');
  const [recommendedFrequency, setRecommendedFrequency] = React.useState('');
  const [preferredTiming, setPreferredTiming] = React.useState('');

  // Academic Plan
  const [learningGoal, setLearningGoal] = React.useState('');
  const [targetChapters, setTargetChapters] = React.useState('');
  const [studyApproach, setStudyApproach] = React.useState('');
  const [milestones, setMilestones] = React.useState('');

  // Isolation and stale-response guard refs
  const currentDemoIdRef = React.useRef<string | null>(null);
  const userEditedFieldsRef = React.useRef<Set<string>>(new Set());
  const activeFetchIdRef = React.useRef<string | null>(null);

  const markFieldEdited = React.useCallback((fieldName: string) => {
    userEditedFieldsRef.current.add(fieldName);
  }, []);

  // Hydration & demo transition effect
  React.useEffect(() => {
    if (!isOpen || !demo?.id) {
      if (!isOpen) {
        currentDemoIdRef.current = null;
        activeFetchIdRef.current = null;
        userEditedFieldsRef.current.clear();
        setSaveError(null);
        setEvaluationLoadError(null);
      }
      return;
    }

    const demoId = demo.id;

    // Reset cleanly when opening a new or different Demo
    if (currentDemoIdRef.current !== demoId) {
      currentDemoIdRef.current = demoId;
      userEditedFieldsRef.current.clear();
      setSaveError(null);
      setEvaluationLoadError(null);
      setActiveTab('feedback');
      setIsSaved(false);

      // Clean unpopulated state
      setParentStatus('PRESENT');
      setCoordStatus('PRESENT');
      setTutorStatus('PRESENT');
      setRating('');
      setComments('');
      setStrengths('');
      setWeaknesses('');
      setTutorRecommendations('');
      setAcademicAssessment('');
      setEngagementLevel('');
      setParentFeedback('');
      setParentInterestLevel('');
      setRecommendationPlan('');
      setRecommendedClassCount('');
      setRecommendedFrequency('');
      setPreferredTiming('');
      setLearningGoal('');
      setTargetChapters('');
      setStudyApproach('');
      setMilestones('');
    }

    const populateFromRecord = (demoData: any) => {
      // Guard against stale asynchronous responses
      if (currentDemoIdRef.current !== demoId) return;

      const fb =
        demoData?.feedbackRecord ||
        demoData?.booking?.feedbackRecord ||
        (Array.isArray(demoData?.feedback) ? demoData.feedback[0] : demoData?.feedback);
      const rm = demoData?.roadmap || demoData?.booking?.roadmap;
      const ap = demoData?.academicPlan || demoData?.booking?.academicPlan;
      const atts: any[] = demoData?.attendances || demoData?.booking?.attendances || [];

      const hasSavedFeedback = Boolean(
        fb?.id ||
        (fb && (fb.rating || fb.comments || fb.academicAssessment || fb.parentFeedback))
      );
      setIsSaved(hasSavedFeedback);

      // Attendances
      if (!userEditedFieldsRef.current.has('parentStatus')) {
        const parentAtt = atts.find((a: any) => a.participantType === 'PARENT');
        if (parentAtt?.status) setParentStatus(parentAtt.status);
      }
      if (!userEditedFieldsRef.current.has('coordStatus')) {
        const coordAtt = atts.find((a: any) => a.participantType === 'COORDINATOR');
        if (coordAtt?.status) setCoordStatus(coordAtt.status);
      }
      if (!userEditedFieldsRef.current.has('tutorStatus')) {
        const tutorAtt = atts.find((a: any) => a.participantType === 'TUTOR');
        if (tutorAtt?.status) setTutorStatus(tutorAtt.status);
      }

      // Tutor Feedback
      if (!userEditedFieldsRef.current.has('rating')) {
        const r = fb?.rating ?? fb?.tutorRating;
        setRating(r ? String(r) : '');
      }
      if (!userEditedFieldsRef.current.has('comments')) {
        setComments(fb?.comments || fb?.studentPerformance || '');
      }
      if (!userEditedFieldsRef.current.has('strengths')) {
        setStrengths(fb?.strengths || '');
      }
      if (!userEditedFieldsRef.current.has('weaknesses')) {
        setWeaknesses(fb?.weaknesses || '');
      }
      if (!userEditedFieldsRef.current.has('tutorRecommendations')) {
        setTutorRecommendations(fb?.tutorRecommendations || '');
      }

      // Coordinator & Parent Evaluation (preserves distinct persisted fields)
      if (!userEditedFieldsRef.current.has('academicAssessment')) {
        setAcademicAssessment(fb?.academicAssessment || fb?.coordinatorRemarks || '');
      }
      if (!userEditedFieldsRef.current.has('engagementLevel')) {
        setEngagementLevel(fb?.engagementLevel || '');
      }
      if (!userEditedFieldsRef.current.has('parentFeedback')) {
        setParentFeedback(fb?.parentFeedback || '');
      }
      if (!userEditedFieldsRef.current.has('parentInterestLevel')) {
        setParentInterestLevel(fb?.parentInterestLevel || '');
      }

      // Roadmap
      if (!userEditedFieldsRef.current.has('recommendationPlan')) {
        setRecommendationPlan(rm?.recommendationPlan || '');
      }
      if (!userEditedFieldsRef.current.has('recommendedClassCount')) {
        setRecommendedClassCount(rm?.recommendedClassCount ? String(rm.recommendedClassCount) : '');
      }
      if (!userEditedFieldsRef.current.has('recommendedFrequency')) {
        setRecommendedFrequency(rm?.recommendedFrequency || '');
      }
      if (!userEditedFieldsRef.current.has('preferredTiming')) {
        setPreferredTiming(rm?.preferredTiming || '');
      }

      // Academic Plan
      if (!userEditedFieldsRef.current.has('learningGoal')) {
        setLearningGoal(ap?.learningGoal || '');
      }
      if (!userEditedFieldsRef.current.has('targetChapters')) {
        setTargetChapters(ap?.targetChapters || '');
      }
      if (!userEditedFieldsRef.current.has('studyApproach')) {
        setStudyApproach(ap?.studyApproach || '');
      }
      if (!userEditedFieldsRef.current.has('milestones')) {
        setMilestones(ap?.milestones || '');
      }
    };

    // 1. Synchronously populate from currently available demo prop
    populateFromRecord(demo);

    // 2. Asynchronously fetch full demo details if relations might not be fully loaded
    const hasFullRelations = Boolean(
      demo.feedbackRecord !== undefined ||
      demo.booking?.feedbackRecord !== undefined
    );

    if (!hasFullRelations) {
      activeFetchIdRef.current = demoId;
      setIsFetchingEvaluation(true);
      getDemoById(demoId)
        .then((freshDemo) => {
          if (activeFetchIdRef.current === demoId && currentDemoIdRef.current === demoId) {
            populateFromRecord(freshDemo);
          }
        })
        .catch((err) => {
          if (activeFetchIdRef.current === demoId) {
            setEvaluationLoadError(err.message || 'Failed to load evaluation details');
          }
        })
        .finally(() => {
          if (activeFetchIdRef.current === demoId) {
            setIsFetchingEvaluation(false);
          }
        });
    }
  }, [isOpen, demo?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    if (!comments.trim()) {
      setSaveError('Please enter overall demo comments / student performance.');
      setActiveTab('feedback');
      return;
    }

    if (!rating || !parseInt(rating, 10)) {
      setSaveError('Please select an overall rating (1 to 5 stars).');
      setActiveTab('feedback');
      return;
    }

    setIsLoading(true);
    try {
      await completeDemo(demo.id, {
        rating: parseInt(rating, 10),
        comments: comments.trim(),
        studentPerformance: comments.trim(),
        strengths: strengths.trim() || undefined,
        weaknesses: weaknesses.trim() || undefined,
        tutorRecommendations: tutorRecommendations.trim() || undefined,
        tutorRating: parseInt(rating, 10),
        academicAssessment: academicAssessment.trim() || undefined,
        engagementLevel: engagementLevel || undefined,
        coordinatorRemarks: academicAssessment.trim() || undefined,
        parentFeedback: parentFeedback.trim() || undefined,
        parentInterestLevel: parentInterestLevel || undefined,
        recommendationPlan: recommendationPlan.trim() || undefined,
        recommendedClassCount: parseInt(recommendedClassCount, 10) || undefined,
        recommendedFrequency: recommendedFrequency.trim() || undefined,
        preferredDurationMin: demo.durationMinutes || 60,
        preferredTiming: preferredTiming.trim() || undefined,
        learningGoal: learningGoal.trim() || undefined,
        targetChapters: targetChapters.trim() || undefined,
        studyApproach: studyApproach.trim() || undefined,
        milestones: milestones.trim() || undefined,
        attendances: {
          parentStatus,
          coordinatorStatus: coordStatus,
          tutorStatus,
        },
      });
      onSuccess();
    } catch (err: any) {
      // Retain unsaved user input and surface actionable error banner
      setSaveError(err.message || 'Failed to save demo evaluation');
    } finally {
      setIsLoading(false);
    }
  };

  const studentName = demo?.student?.firstName
    ? `${demo.student.firstName} ${demo.student.lastName || ''}`.trim()
    : demo?.student?.name || 'Student';

  const sessions = demo?.booking?.sessions || [];
  const isMultiSession = sessions.length > 1;

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
            {isSaved ? 'Demo Evaluation & Academic Roadmap' : 'Complete Demo & Finalize Plan'}
          </h2>
          {demo?.businessId && (
            <Badge variant="default" className="bg-slate-100 text-slate-700 font-semibold px-2.5 py-0.5 text-xs">
              {demo.businessId}
            </Badge>
          )}
          <span className="text-xs sm:text-sm text-slate-500 font-medium">
            Student: <strong className="text-slate-800">{studentName}</strong>
          </span>
          {demo?.subject?.name && (
            <span className="text-xs sm:text-sm text-slate-400">
              • {demo.subject.name} ({demo.grade?.name || ''} {demo.curriculum?.name || ''})
            </span>
          )}
          {isMultiSession && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              <BookOpen className="w-3.5 h-3.5" />
              <span>{sessions.length} Multi-Session Demo</span>
            </span>
          )}
          {isSaved && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>Saved Evaluation</span>
            </span>
          )}
          {isFetchingEvaluation && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-slate-500 bg-slate-50">
              <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
              <span>Syncing...</span>
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
          {saveError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2.5 shadow-xs">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-800">Action Required</p>
                <p className="text-xs text-red-700 mt-0.5">{saveError}</p>
              </div>
            </div>
          )}

          {evaluationLoadError && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Notice: {evaluationLoadError}. Starting with fresh form inputs.</span>
            </div>
          )}

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
                      onChange={(e) => {
                        markFieldEdited('parentStatus');
                        setParentStatus(e.target.value as any);
                      }}
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
                      onChange={(e) => {
                        markFieldEdited('coordStatus');
                        setCoordStatus(e.target.value as any);
                      }}
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
                      onChange={(e) => {
                        markFieldEdited('tutorStatus');
                        setTutorStatus(e.target.value as any);
                      }}
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
                          onClick={() => {
                            markFieldEdited('rating');
                            setRating(r.toString());
                          }}
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
                      onChange={(e) => {
                        markFieldEdited('comments');
                        setComments(e.target.value);
                      }}
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
                      onChange={(e) => {
                        markFieldEdited('strengths');
                        setStrengths(e.target.value);
                      }}
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
                      onChange={(e) => {
                        markFieldEdited('weaknesses');
                        setWeaknesses(e.target.value);
                      }}
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
                      onChange={(e) => {
                        markFieldEdited('tutorRecommendations');
                        setTutorRecommendations(e.target.value);
                      }}
                      placeholder="e.g. Needs 2 classes/week focusing on practice exercises and periodic revision"
                      className="h-10 text-sm bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Coordinator & Parent Evaluation (True Persisted Auto-Fill, No Hardcoded Text) */}
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
                      onChange={(e) => {
                        markFieldEdited('academicAssessment');
                        setAcademicAssessment(e.target.value);
                      }}
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
                      onChange={(e) => {
                        markFieldEdited('engagementLevel');
                        setEngagementLevel(e.target.value);
                      }}
                      className="w-full h-10 bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    >
                      <option value="">Select Engagement Level</option>
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
                      onChange={(e) => {
                        markFieldEdited('parentFeedback');
                        setParentFeedback(e.target.value);
                      }}
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
                      onChange={(e) => {
                        markFieldEdited('parentInterestLevel');
                        setParentInterestLevel(e.target.value);
                      }}
                      className="w-full h-10 bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    >
                      <option value="">Select Interest Level</option>
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
                      Recommendation Plan Title
                    </label>
                    <Input
                      value={recommendationPlan}
                      onChange={(e) => {
                        markFieldEdited('recommendationPlan');
                        setRecommendationPlan(e.target.value);
                      }}
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
                      onChange={(e) => {
                        markFieldEdited('recommendedClassCount');
                        setRecommendedClassCount(e.target.value);
                      }}
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
                      onChange={(e) => {
                        markFieldEdited('recommendedFrequency');
                        setRecommendedFrequency(e.target.value);
                      }}
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
                      onChange={(e) => {
                        markFieldEdited('preferredTiming');
                        setPreferredTiming(e.target.value);
                      }}
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
                      Primary Learning Goal
                    </label>
                    <Input
                      value={learningGoal}
                      onChange={(e) => {
                        markFieldEdited('learningGoal');
                        setLearningGoal(e.target.value);
                      }}
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
                      onChange={(e) => {
                        markFieldEdited('targetChapters');
                        setTargetChapters(e.target.value);
                      }}
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
                      onChange={(e) => {
                        markFieldEdited('studyApproach');
                        setStudyApproach(e.target.value);
                      }}
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
                      onChange={(e) => {
                        markFieldEdited('milestones');
                        setMilestones(e.target.value);
                      }}
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
              {isSaved ? 'Update Evaluation & Roadmap' : 'Complete Demo & Finalize Plan'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
