"use client";

import * as React from 'react';
import {
  AlertCircle,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck,
  FileText,
  Filter,
  Lock,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';

import { useAuth, usePermissions } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

import {
  acknowledgePerformanceReviewAction,
  amendPerformanceReviewAction,
  createPerformanceCycleAction,
  createPerformanceGoalAction,
  createPerformancePipAction,
  createPerformanceReviewAction,
  evaluatePerformanceReviewAction,
  finalizePerformanceReviewAction,
  getPerformanceCyclesAction,
  getPerformanceDashboardAction,
  getPerformanceGoalsAction,
  getPerformancePipsAction,
  getPerformanceReviewDetailAction,
  getPerformanceReviewsAction,
  transitionPerformancePipStatusAction,
  updatePerformanceGoalAction,
  updatePipObjectiveStatusAction,
  updateSelfReviewAction,
} from '../actions';

export default function PerformanceManagementPage() {
  const { hasPermission } = usePermissions();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = React.useState<'reviews' | 'goals' | 'pips' | 'cycles'>('reviews');
  const [loading, setLoading] = React.useState(true);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  // Data states
  const [dashboard, setDashboard] = React.useState<any>(null);
  const [reviews, setReviews] = React.useState<any[]>([]);
  const [goals, setGoals] = React.useState<any[]>([]);
  const [pips, setPips] = React.useState<any[]>([]);
  const [cycles, setCycles] = React.useState<any[]>([]);

  // Selected item detail
  const [selectedReview, setSelectedReview] = React.useState<any>(null);
  const [selectedPip, setSelectedPip] = React.useState<any>(null);

  // Modals
  const [showNewReviewModal, setShowNewReviewModal] = React.useState(false);
  const [showEvaluateModal, setShowEvaluateModal] = React.useState(false);
  const [showSelfReviewModal, setShowSelfReviewModal] = React.useState(false);
  const [showAcknowledgeModal, setShowAcknowledgeModal] = React.useState(false);
  const [showAmendModal, setShowAmendModal] = React.useState(false);
  const [showNewGoalModal, setShowNewGoalModal] = React.useState(false);
  const [showNewPipModal, setShowNewPipModal] = React.useState(false);
  const [showNewCycleModal, setShowNewCycleModal] = React.useState(false);

  // Form states
  const [newReviewForm, setNewReviewForm] = React.useState({
    employeeId: '',
    period: new Date().toISOString().slice(0, 7),
    reviewType: 'MONTHLY',
    cycleId: '',
  });

  const [evalForm, setEvalForm] = React.useState({
    rating: 3,
    strengths: '',
    areasForImprovement: '',
    qualityAssessment: '',
    competencyAssessment: '',
    managerFeedback: '',
    confidentialNotes: '',
    recommendedTraining: '',
    pipRecommended: false,
    finalizeImmediately: false,
  });

  const [selfReviewForm, setSelfReviewForm] = React.useState({
    employeeComments: '',
  });

  const [ackForm, setAckForm] = React.useState({
    status: 'ACKNOWLEDGED',
    comments: '',
  });

  const [amendForm, setAmendForm] = React.useState({
    reason: '',
    newRating: 3,
    managerFeedback: '',
    strengths: '',
    areasForImprovement: '',
  });

  const [newGoalForm, setNewGoalForm] = React.useState({
    employeeId: '',
    title: '',
    target: '',
    measurementPeriod: new Date().toISOString().slice(0, 7),
    category: 'GENERAL',
    measurementMethod: 'NUMERICAL',
    weight: 0,
    description: '',
  });

  const [newPipForm, setNewPipForm] = React.useState({
    employeeId: '',
    reason: '',
    performanceGap: '',
    expectedStandard: '',
    supportProvided: '',
    startDate: new Date().toISOString().slice(0, 10),
    targetCompletionDate: '',
    reviewDate: '',
    objectiveTitle: '',
    objectiveCriteria: '',
    objectiveTargetDate: '',
  });

  const [newCycleForm, setNewCycleForm] = React.useState({
    name: '',
    reviewType: 'MONTHLY',
    startDate: '',
    endDate: '',
    dueDate: '',
  });

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [dashRes, revRes, goalRes, pipRes, cycRes] = await Promise.all([
        getPerformanceDashboardAction().catch(() => null),
        getPerformanceReviewsAction().catch(() => ({ data: [] })),
        getPerformanceGoalsAction().catch(() => []),
        getPerformancePipsAction().catch(() => []),
        getPerformanceCyclesAction().catch(() => []),
      ]);

      if (dashRes) setDashboard(dashRes);
      if (revRes?.data) setReviews(revRes.data);
      if (Array.isArray(goalRes)) setGoals(goalRes);
      if (Array.isArray(pipRes)) setPips(pipRes);
      if (Array.isArray(cycRes)) setCycles(cycRes);
    } catch (err: any) {
      setError(err?.message || 'Failed to load performance management data');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handlers
  const handleCreateReview = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      setError(null);
      await createPerformanceReviewAction(newReviewForm);
      setSuccess('Performance review initiated successfully');
      setShowNewReviewModal(false);
      fetchData();
    } catch (err: any) {
      setError(err?.message || 'Failed to initiate review');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReview) return;
    try {
      setActionLoading(true);
      setError(null);

      if (evalForm.finalizeImmediately) {
        if (selectedReview.status === 'DRAFT' || selectedReview.status === 'SELF_REVIEW') {
          await evaluatePerformanceReviewAction(selectedReview.id, {
            rating: Number(evalForm.rating),
            managerFeedback: evalForm.managerFeedback || undefined,
            strengths: evalForm.strengths || undefined,
            areasForImprovement: evalForm.areasForImprovement || undefined,
            qualityAssessment: evalForm.qualityAssessment || undefined,
            competencyAssessment: evalForm.competencyAssessment || undefined,
            confidentialNotes: evalForm.confidentialNotes || undefined,
            recommendedTraining: evalForm.recommendedTraining || undefined,
            pipRecommended: evalForm.pipRecommended,
          });
        }
        await finalizePerformanceReviewAction(selectedReview.id, {
          rating: Number(evalForm.rating),
          managerFeedback: evalForm.managerFeedback,
          strengths: evalForm.strengths,
          areasForImprovement: evalForm.areasForImprovement,
          qualityAssessment: evalForm.qualityAssessment || undefined,
          competencyAssessment: evalForm.competencyAssessment || undefined,
          confidentialNotes: evalForm.confidentialNotes || undefined,
          recommendedTraining: evalForm.recommendedTraining || undefined,
          pipRecommended: evalForm.pipRecommended,
        });
        setSuccess('Review finalized and completed successfully');
      } else {
        await evaluatePerformanceReviewAction(selectedReview.id, {
          rating: Number(evalForm.rating),
          managerFeedback: evalForm.managerFeedback || undefined,
          strengths: evalForm.strengths || undefined,
          areasForImprovement: evalForm.areasForImprovement || undefined,
          qualityAssessment: evalForm.qualityAssessment || undefined,
          competencyAssessment: evalForm.competencyAssessment || undefined,
          confidentialNotes: evalForm.confidentialNotes || undefined,
          recommendedTraining: evalForm.recommendedTraining || undefined,
          pipRecommended: evalForm.pipRecommended,
        });
        setSuccess('Review evaluation updated');
      }

      setShowEvaluateModal(false);
      setSelectedReview(null);
      fetchData();
    } catch (err: any) {
      setError(err?.message || 'Failed to update review evaluation');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelfReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReview) return;
    try {
      setActionLoading(true);
      setError(null);
      await updateSelfReviewAction(selectedReview.id, selfReviewForm);
      setSuccess('Self-review comments submitted');
      setShowSelfReviewModal(false);
      setSelectedReview(null);
      fetchData();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit self-review');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcknowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReview) return;
    try {
      setActionLoading(true);
      setError(null);
      await acknowledgePerformanceReviewAction(selectedReview.id, ackForm);
      setSuccess('Review acknowledged successfully');
      setShowAcknowledgeModal(false);
      setSelectedReview(null);
      fetchData();
    } catch (err: any) {
      setError(err?.message || 'Failed to acknowledge review');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAmend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReview) return;
    try {
      setActionLoading(true);
      setError(null);
      await amendPerformanceReviewAction(selectedReview.id, {
        reason: amendForm.reason,
        newRating: Number(amendForm.newRating),
        managerFeedback: amendForm.managerFeedback || undefined,
        strengths: amendForm.strengths || undefined,
        areasForImprovement: amendForm.areasForImprovement || undefined,
      });
      setSuccess('Review amended with audit trail');
      setShowAmendModal(false);
      setSelectedReview(null);
      fetchData();
    } catch (err: any) {
      setError(err?.message || 'Failed to amend review');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      setError(null);
      await createPerformanceGoalAction({
        ...newGoalForm,
        weight: Number(newGoalForm.weight),
      });
      setSuccess('Goal created successfully');
      setShowNewGoalModal(false);
      fetchData();
    } catch (err: any) {
      setError(err?.message || 'Failed to create goal');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreatePip = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      setError(null);
      await createPerformancePipAction({
        employeeId: newPipForm.employeeId,
        reason: newPipForm.reason,
        performanceGap: newPipForm.performanceGap,
        expectedStandard: newPipForm.expectedStandard,
        supportProvided: newPipForm.supportProvided,
        startDate: newPipForm.startDate,
        targetCompletionDate: newPipForm.targetCompletionDate,
        reviewDate: newPipForm.reviewDate || undefined,
        objectives: [
          {
            title: newPipForm.objectiveTitle,
            successCriteria: newPipForm.objectiveCriteria,
            targetDate: newPipForm.objectiveTargetDate || newPipForm.targetCompletionDate,
          },
        ],
      });
      setSuccess('Performance Improvement Plan initiated');
      setShowNewPipModal(false);
      fetchData();
    } catch (err: any) {
      setError(err?.message || 'Failed to create PIP');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      setError(null);
      await createPerformanceCycleAction(newCycleForm);
      setSuccess('Review cycle created');
      setShowNewCycleModal(false);
      fetchData();
    } catch (err: any) {
      setError(err?.message || 'Failed to create review cycle');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Performance Management</h1>
          <p className="text-sm text-slate-500">
            Set role-based goals, execute monthly review cycles, and coordinate structured improvement plans.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {activeTab === 'reviews' && hasPermission('performance.review.create') && (
            <Button size="sm" onClick={() => setShowNewReviewModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Review
            </Button>
          )}
          {activeTab === 'goals' && hasPermission('performance.goal.manage') && (
            <Button size="sm" onClick={() => setShowNewGoalModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Goal
            </Button>
          )}
          {activeTab === 'pips' && hasPermission('performance.pip.manage') && (
            <Button size="sm" onClick={() => setShowNewPipModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New PIP
            </Button>
          )}
          {activeTab === 'cycles' && hasPermission('performance.cycle.manage') && (
            <Button size="sm" onClick={() => setShowNewCycleModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Cycle
            </Button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm font-medium">{success}</span>
        </div>
      )}

      {/* Dashboard KPI Summary Cards */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card className="p-4 bg-white border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase">Reviews Total</span>
              <FileText className="h-4 w-4 text-brand-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{dashboard.reviewsTotal ?? 0}</div>
            <div className="text-xs text-slate-500 mt-1">{dashboard.reviewsCompleted ?? 0} Completed</div>
          </Card>
          <Card className="p-4 bg-white border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase">Pending Action</span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-600">{dashboard.reviewsPending ?? 0}</div>
            <div className="text-xs text-amber-600 mt-1">{dashboard.reviewsOverdue ?? 0} Overdue</div>
          </Card>
          <Card className="p-4 bg-white border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase">Acknowledged</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-600">{dashboard.reviewsAcknowledged ?? 0}</div>
            <div className="text-xs text-slate-500 mt-1">{dashboard.reviewsPendingAcknowledgement ?? 0} Pending Ack</div>
          </Card>
          <Card className="p-4 bg-white border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase">Goals On Track</span>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-600">{dashboard.goalsOnTrack ?? 0}</div>
            <div className="text-xs text-rose-500 mt-1">{dashboard.goalsAtRisk ?? 0} At Risk</div>
          </Card>
          <Card className="p-4 bg-white border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase">Active PIPs</span>
              <ShieldAlert className="h-4 w-4 text-rose-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-rose-600">{dashboard.activePips ?? 0}</div>
            <div className="text-xs text-slate-500 mt-1">Structured improvement</div>
          </Card>
          <Card className="p-4 bg-white border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase">Training Needs</span>
              <Award className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-indigo-600">{dashboard.reviewsWithTraining ?? 0}</div>
            <div className="text-xs text-slate-500 mt-1">Identified from reviews</div>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-6">
          <button
            onClick={() => setActiveTab('reviews')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'reviews'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Performance Reviews ({reviews.length})
          </button>
          <button
            onClick={() => setActiveTab('goals')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'goals'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Goals & KPIs ({goals.length})
          </button>
          <button
            onClick={() => setActiveTab('pips')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'pips'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Improvement Plans (PIPs) ({pips.length})
          </button>
          <button
            onClick={() => setActiveTab('cycles')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'cycles'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Review Cycles ({cycles.length})
          </button>
        </nav>
      </div>

      {/* ── TAB 1: REVIEWS ── */}
      {activeTab === 'reviews' && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Review Code</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Acknowledgement</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviews.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    No performance reviews found.
                  </TableCell>
                </TableRow>
              ) : (
                reviews.map((rev) => {
                  const isReviewedEmployee = rev.employee?.userId === user?.id;
                  const isCompleted = rev.status === 'COMPLETED' || rev.status === 'ACKNOWLEDGED';

                  return (
                    <TableRow key={rev.id}>
                      <TableCell className="font-mono text-xs font-semibold text-slate-700">
                        {rev.reviewCode}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">
                          {rev.employee?.firstName} {rev.employee?.lastName}
                        </div>
                        <div className="text-xs text-slate-500">{rev.employee?.businessId}</div>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{rev.period}</TableCell>
                      <TableCell>
                        {rev.rating ? (
                          <div className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            ★ {rev.rating} / 5
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Not rated</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={rev.status} />
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            rev.acknowledgementStatus === 'ACKNOWLEDGED'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {rev.acknowledgementStatus}
                        </span>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {/* Evaluate button for managers */}
                        {hasPermission('performance.review.evaluate') && !isReviewedEmployee && !isCompleted && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedReview(rev);
                              setEvalForm({
                                rating: rev.rating ?? 3,
                                strengths: rev.strengths ?? '',
                                areasForImprovement: rev.areasForImprovement ?? '',
                                qualityAssessment: rev.qualityAssessment ?? '',
                                competencyAssessment: rev.competencyAssessment ?? '',
                                managerFeedback: rev.managerFeedback ?? '',
                                confidentialNotes: rev.confidentialNotes ?? '',
                                recommendedTraining: rev.recommendedTraining ?? '',
                                pipRecommended: rev.pipRecommended ?? false,
                                finalizeImmediately: false,
                              });
                              setShowEvaluateModal(true);
                            }}
                          >
                            Evaluate
                          </Button>
                        )}

                        {/* Self Review button for employee */}
                        {isReviewedEmployee && !isCompleted && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedReview(rev);
                              setSelfReviewForm({
                                employeeComments: rev.employeeComments ?? '',
                              });
                              setShowSelfReviewModal(true);
                            }}
                          >
                            Self Review
                          </Button>
                        )}

                        {/* Acknowledge button for employee */}
                        {isReviewedEmployee && rev.status === 'COMPLETED' && rev.acknowledgementStatus !== 'ACKNOWLEDGED' && (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => {
                              setSelectedReview(rev);
                              setAckForm({
                                status: 'ACKNOWLEDGED',
                                comments: '',
                              });
                              setShowAcknowledgeModal(true);
                            }}
                          >
                            Acknowledge
                          </Button>
                        )}

                        {/* Amend button for HR */}
                        {hasPermission('performance.review.amend') && isCompleted && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedReview(rev);
                              setAmendForm({
                                reason: '',
                                newRating: rev.rating ?? 3,
                                managerFeedback: rev.managerFeedback ?? '',
                                strengths: rev.strengths ?? '',
                                areasForImprovement: rev.areasForImprovement ?? '',
                              });
                              setShowAmendModal(true);
                            }}
                          >
                            Amend
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ── TAB 2: GOALS & KPIS ── */}
      {activeTab === 'goals' && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Goal Code</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Title & Outcome</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Actual Result</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {goals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    No employee goals configured.
                  </TableCell>
                </TableRow>
              ) : (
                goals.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-mono text-xs font-semibold">{g.goalCode}</TableCell>
                    <TableCell className="text-sm font-medium">
                      {g.employee?.firstName} {g.employee?.lastName}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{g.title}</div>
                      <div className="text-xs text-slate-500">{g.category} · {g.measurementPeriod}</div>
                    </TableCell>
                    <TableCell className="text-sm font-semibold text-slate-800">{g.target}</TableCell>
                    <TableCell className="text-sm text-slate-600">{g.actualResult || '—'}</TableCell>
                    <TableCell className="text-sm">{g.weight}%</TableCell>
                    <TableCell>
                      <StatusBadge status={g.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ── TAB 3: PIPS ── */}
      {activeTab === 'pips' && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PIP Code</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Performance Gap</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>Target Date</TableHead>
                <TableHead>Objectives</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pips.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    No active Performance Improvement Plans.
                  </TableCell>
                </TableRow>
              ) : (
                pips.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs font-semibold">{p.pipCode}</TableCell>
                    <TableCell className="text-sm font-medium">
                      {p.employee?.firstName} {p.employee?.lastName}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700 max-w-xs truncate">
                      {p.performanceGap}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{p.startDate}</TableCell>
                    <TableCell className="text-xs font-medium text-slate-800">{p.targetCompletionDate}</TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {p.objectives?.length ?? 0} items
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ── TAB 4: CYCLES ── */}
      {activeTab === 'cycles' && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cycle Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Period Window</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cycles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    No review cycles created.
                  </TableCell>
                </TableRow>
              ) : (
                cycles.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs font-semibold">{c.cycleCode}</TableCell>
                    <TableCell className="text-sm font-medium">{c.name}</TableCell>
                    <TableCell className="text-xs text-slate-600">{c.reviewType}</TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {c.startDate} to {c.endDate}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-slate-800">{c.dueDate}</TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ── MODAL: EVALUATE REVIEW ── */}
      <Modal
        isOpen={showEvaluateModal}
        onClose={() => setShowEvaluateModal(false)}
      >
        <h2 className="text-lg font-bold text-slate-900 mb-4 pb-2 border-b">
          Evaluate Performance Review — {selectedReview?.reviewCode}
        </h2>
        <form onSubmit={handleEvaluate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Rating (1 to 5)
            </label>
            <select
              value={evalForm.rating}
              onChange={(e) => setEvalForm({ ...evalForm, rating: Number(e.target.value) })}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            >
              <option value={1}>1 — Unsatisfactory</option>
              <option value={2}>2 — Needs Improvement</option>
              <option value={3}>3 — Meets Expectations</option>
              <option value={4}>4 — Exceeds Expectations</option>
              <option value={5}>5 — Outstanding</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Strengths & Achievements</label>
            <textarea
              value={evalForm.strengths}
              onChange={(e) => setEvalForm({ ...evalForm, strengths: e.target.value })}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              rows={2}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Areas Requiring Improvement</label>
            <textarea
              value={evalForm.areasForImprovement}
              onChange={(e) => setEvalForm({ ...evalForm, areasForImprovement: e.target.value })}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              rows={2}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Manager Feedback (Shared with Employee)</label>
            <textarea
              value={evalForm.managerFeedback}
              onChange={(e) => setEvalForm({ ...evalForm, managerFeedback: e.target.value })}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              rows={3}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-amber-800 uppercase mb-1 flex items-center gap-1">
              <Lock className="h-3.5 w-3.5" /> Confidential Notes (Restricted from Employee)
            </label>
            <textarea
              value={evalForm.confidentialNotes}
              onChange={(e) => setEvalForm({ ...evalForm, confidentialNotes: e.target.value })}
              className="w-full text-sm border border-amber-300 bg-amber-50 rounded-lg p-2.5 text-slate-900 placeholder:text-slate-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              rows={2}
              placeholder="Internal management notes for promotion or calibration..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Recommended Training</label>
            <input
              type="text"
              value={evalForm.recommendedTraining}
              onChange={(e) => setEvalForm({ ...evalForm, recommendedTraining: e.target.value })}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g. Advanced CRM Objection Handling"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="finalizeImmediately"
              checked={evalForm.finalizeImmediately}
              onChange={(e) => setEvalForm({ ...evalForm, finalizeImmediately: e.target.checked })}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="finalizeImmediately" className="text-sm font-semibold text-slate-800">
              Finalize & Complete Review (Enforces Separation of Duties)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setShowEvaluateModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={actionLoading}>
              {actionLoading ? 'Saving...' : evalForm.finalizeImmediately ? 'Finalize Review' : 'Save Draft Evaluation'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: SELF REVIEW ── */}
      <Modal
        isOpen={showSelfReviewModal}
        onClose={() => setShowSelfReviewModal(false)}
      >
        <h2 className="text-lg font-bold text-slate-900 mb-4 pb-2 border-b">
          Employee Self-Review — {selectedReview?.reviewCode}
        </h2>
        <form onSubmit={handleSelfReview} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Your Self-Assessment & Achievements
            </label>
            <textarea
              value={selfReviewForm.employeeComments}
              onChange={(e) => setSelfReviewForm({ employeeComments: e.target.value })}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              rows={5}
              placeholder="Detail your highlights, challenges overcome, and key results..."
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setShowSelfReviewModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={actionLoading}>
              {actionLoading ? 'Submitting...' : 'Submit Self-Review'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: ACKNOWLEDGE REVIEW ── */}
      <Modal
        isOpen={showAcknowledgeModal}
        onClose={() => setShowAcknowledgeModal(false)}
      >
        <h2 className="text-lg font-bold text-slate-900 mb-4 pb-2 border-b">
          Acknowledge Review — {selectedReview?.reviewCode}
        </h2>
        <form onSubmit={handleAcknowledge} className="space-y-4">
          <p className="text-xs text-slate-600">
            Note: Acknowledgement confirms receipt and discussion of this review, not necessarily full agreement with ratings.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Acknowledgement Status</label>
            <select
              value={ackForm.status}
              onChange={(e) => setAckForm({ ...ackForm, status: e.target.value })}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="ACKNOWLEDGED">Acknowledge Receipt</option>
              <option value="REFUSED">Refuse Acknowledgement</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Employee Comments</label>
            <textarea
              value={ackForm.comments}
              onChange={(e) => setAckForm({ ...ackForm, comments: e.target.value })}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              rows={3}
              placeholder="Add your comments or contextual notes..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setShowAcknowledgeModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={actionLoading}>
              {actionLoading ? 'Saving...' : 'Confirm Acknowledgement'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: AMEND REVIEW ── */}
      <Modal
        isOpen={showAmendModal}
        onClose={() => setShowAmendModal(false)}
      >
        <h2 className="text-lg font-bold text-slate-900 mb-4 pb-2 border-b">
          Amend Completed Review — {selectedReview?.reviewCode}
        </h2>
        <form onSubmit={handleAmend} className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded text-xs">
            Amendments create an immutable audit record and preserve historical ratings.
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Reason for Amendment *</label>
            <textarea
              value={amendForm.reason}
              onChange={(e) => setAmendForm({ ...amendForm, reason: e.target.value })}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              rows={2}
              placeholder="e.g. Verified data correction from departmental audit..."
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Adjusted Rating</label>
            <select
              value={amendForm.newRating}
              onChange={(e) => setAmendForm({ ...amendForm, newRating: Number(e.target.value) })}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value={1}>1 — Unsatisfactory</option>
              <option value={2}>2 — Needs Improvement</option>
              <option value={3}>3 — Meets Expectations</option>
              <option value={4}>4 — Exceeds Expectations</option>
              <option value={5}>5 — Outstanding</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setShowAmendModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={actionLoading}>
              {actionLoading ? 'Saving...' : 'Record Amendment'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
