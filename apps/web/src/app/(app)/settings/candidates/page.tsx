"use client";

import * as React from 'react';
import {
  AlertCircle,
  Building,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck,
  FileText,
  Filter,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Send,
  UserCheck,
  UserPlus,
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
  createApplicationAction,
  createCandidateAction,
  createOfferAction,
  expireOfferAction,
  getApplicationAction,
  getApplicationsAction,
  getCandidatesAction,
  getOffersAction,
  getVacanciesAction,
  recordInterviewFeedbackAction,
  recordOfferResponseAction,
  reviewOfferAction,
  reviseOfferAction,
  scheduleInterviewAction,
  sendOfferAction,
  submitOfferAction,
  transitionApplicationStageAction,
  withdrawOfferAction,
} from '../actions';
import { SettingsNavigation } from '../SettingsNavigation';

export default function CandidatesPage() {
  const { hasPermission } = usePermissions();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = React.useState<'applications' | 'candidates' | 'offers'>('applications');

  // Data states
  const [candidates, setCandidates] = React.useState<any[]>([]);
  const [applications, setApplications] = React.useState<any[]>([]);
  const [offers, setOffers] = React.useState<any[]>([]);
  const [openVacancies, setOpenVacancies] = React.useState<any[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Filters
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [stageFilter, setStageFilter] = React.useState('');

  // Modals
  const [isCandidateModalOpen, setIsCandidateModalOpen] = React.useState(false);
  const [isApplyModalOpen, setIsApplyModalOpen] = React.useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = React.useState(false);
  const [isInterviewModalOpen, setIsInterviewModalOpen] = React.useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = React.useState(false);
  const [isStageModalOpen, setIsStageModalOpen] = React.useState(false);
  const [isOfferModalOpen, setIsOfferModalOpen] = React.useState(false);
  const [isReviewOfferModalOpen, setIsReviewOfferModalOpen] = React.useState(false);
  const [isResponseModalOpen, setIsResponseModalOpen] = React.useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = React.useState(false);
  const [isReviseOfferModalOpen, setIsReviseOfferModalOpen] = React.useState(false);

  // Active selections
  const [selectedApplication, setSelectedApplication] = React.useState<any | null>(null);
  const [selectedInterview, setSelectedInterview] = React.useState<any | null>(null);
  const [selectedOffer, setSelectedOffer] = React.useState<any | null>(null);

  // Form states
  const [candidateForm, setCandidateForm] = React.useState({
    fullName: '',
    email: '',
    phone: '',
    source: 'DIRECT_APPLICATION',
    referralDetails: '',
    notes: '',
  });

  const [applyForm, setApplyForm] = React.useState({
    candidateId: '',
    vacancyId: '',
    coverLetter: '',
  });

  const [interviewForm, setInterviewForm] = React.useState({
    interviewType: 'TECHNICAL',
    interviewMode: 'ONLINE',
    scheduledAt: '',
    interviewerName: '',
    location: '',
  });

  const [feedbackForm, setFeedbackForm] = React.useState({
    rating: 4,
    recommendation: 'HIRE',
    feedback: '',
  });

  const [stageForm, setStageForm] = React.useState({
    stage: 'SCREENING',
    status: 'APPLIED',
    notes: '',
    rejectionReason: '',
  });

  const [offerForm, setOfferForm] = React.useState({
    roleTitle: '',
    employmentType: 'FULL_TIME',
    workMode: 'ON_SITE',
    location: '',
    offeredSalary: '',
    currency: 'INR',
    salaryPeriod: 'ANNUAL',
    proposedStartDate: '',
    offerExpiryDate: '',
    notes: '',
  });

  const [reviewOfferForm, setReviewOfferForm] = React.useState({
    action: 'APPROVE' as 'APPROVE' | 'REJECT',
    approvalNotes: '',
  });

  const [responseForm, setResponseForm] = React.useState({
    decision: 'ACCEPT' as 'ACCEPT' | 'DECLINE',
    responseNotes: '',
    declineReason: '',
  });

  const [withdrawForm, setWithdrawForm] = React.useState({
    withdrawalReason: '',
  });

  const [reviseOfferForm, setReviseOfferForm] = React.useState({
    offeredSalary: '',
    currency: 'INR',
    salaryPeriod: 'ANNUAL',
    employmentType: 'FULL_TIME',
    workMode: 'ON_SITE',
    location: '',
    proposedStartDate: '',
    offerExpiryDate: '',
    notes: '',
  });

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (search) query.append('search', search);

      if (activeTab === 'applications') {
        if (statusFilter) query.append('status', statusFilter);
        if (stageFilter) query.append('stage', stageFilter);
        const res = await getApplicationsAction(query.toString());
        if (res?.items) {
          setApplications(res.items);
          setTotal(res.total);
        }
      } else if (activeTab === 'candidates') {
        const res = await getCandidatesAction(query.toString());
        if (res?.items) {
          setCandidates(res.items);
          setTotal(res.total);
        }
      } else if (activeTab === 'offers') {
        if (statusFilter) query.append('status', statusFilter);
        const res = await getOffersAction(query.toString());
        if (res?.items) {
          setOffers(res.items);
          setTotal(res.total);
        }
      }

      // Fetch open vacancies for application modal
      const vacRes = await getVacanciesAction('status=OPEN');
      if (vacRes?.items) {
        setOpenVacancies(vacRes.items);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load recruitment data');
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, statusFilter, stageFilter]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers
  const handleCreateCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    try {
      await createCandidateAction(candidateForm);
      setSuccessMessage('Candidate profile successfully created');
      setIsCandidateModalOpen(false);
      setCandidateForm({ fullName: '', email: '', phone: '', source: 'DIRECT_APPLICATION', referralDetails: '', notes: '' });
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to create candidate');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    try {
      await createApplicationAction(applyForm.vacancyId, {
        candidateId: applyForm.candidateId,
        coverLetter: applyForm.coverLetter,
      });
      setSuccessMessage('Application successfully submitted');
      setIsApplyModalOpen(false);
      setApplyForm({ candidateId: '', vacancyId: '', coverLetter: '' });
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit application');
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewApplicationDetails = async (id: string) => {
    setActionLoading(true);
    try {
      const app = await getApplicationAction(id);
      setSelectedApplication(app);
      setIsDetailModalOpen(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to load application details');
    } finally {
      setActionLoading(false);
    }
  };

  const handleScheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApplication) return;
    setActionLoading(true);
    setError(null);
    try {
      await scheduleInterviewAction(selectedApplication.id, interviewForm);
      setSuccessMessage('Interview scheduled successfully');
      setIsInterviewModalOpen(false);
      const app = await getApplicationAction(selectedApplication.id);
      setSelectedApplication(app);
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to schedule interview');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecordFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInterview) return;
    setActionLoading(true);
    setError(null);
    try {
      await recordInterviewFeedbackAction(selectedInterview.id, feedbackForm);
      setSuccessMessage('Evaluation feedback recorded');
      setIsFeedbackModalOpen(false);
      if (selectedApplication) {
        const app = await getApplicationAction(selectedApplication.id);
        setSelectedApplication(app);
      }
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to record feedback');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTransitionStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApplication) return;
    setActionLoading(true);
    setError(null);
    try {
      await transitionApplicationStageAction(selectedApplication.id, stageForm);
      setSuccessMessage('Application stage updated');
      setIsStageModalOpen(false);
      const app = await getApplicationAction(selectedApplication.id);
      setSelectedApplication(app);
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to update stage');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApplication) return;
    setActionLoading(true);
    setError(null);
    try {
      await createOfferAction(selectedApplication.id, {
        ...offerForm,
        offeredSalary: Number(offerForm.offeredSalary),
      });
      setSuccessMessage('Draft offer prepared successfully');
      setIsOfferModalOpen(false);
      const app = await getApplicationAction(selectedApplication.id);
      setSelectedApplication(app);
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to create offer');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReviewOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOffer) return;
    setActionLoading(true);
    setError(null);
    try {
      await reviewOfferAction(selectedOffer.id, reviewOfferForm);
      setSuccessMessage(`Offer ${reviewOfferForm.action.toLowerCase()}d successfully`);
      setIsReviewOfferModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to review offer');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecordResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOffer) return;
    setActionLoading(true);
    setError(null);
    try {
      await recordOfferResponseAction(selectedOffer.id, responseForm);
      setSuccessMessage('Candidate response recorded successfully');
      setIsResponseModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to record response');
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdrawOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOffer) return;
    setActionLoading(true);
    setError(null);
    try {
      await withdrawOfferAction(selectedOffer.id, withdrawForm);
      setSuccessMessage('Offer withdrawn successfully');
      setIsWithdrawModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to withdraw offer');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReviseOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOffer) return;
    setActionLoading(true);
    setError(null);
    try {
      await reviseOfferAction(selectedOffer.id, {
        ...reviseOfferForm,
        offeredSalary: Number(reviseOfferForm.offeredSalary),
      });
      setSuccessMessage(`Offer ${selectedOffer.businessId} revised to next version successfully (pending approval)`);
      setIsReviseOfferModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to revise offer');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExpireOffer = async (offerId: string) => {
    setActionLoading(true);
    setError(null);
    try {
      await expireOfferAction(offerId);
      setSuccessMessage('Offer marked as expired');
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to expire offer');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsNavigation />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Candidates & Offers</h1>
          <p className="text-sm text-slate-500 mt-1">
            Corporate selection pipeline, interview scheduling, evaluation notes, and formal job offers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasPermission('candidate.manage') && (
            <>
              <Button
                variant="outline"
                onClick={() => setIsCandidateModalOpen(true)}
                className="flex items-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                New Candidate
              </Button>
              <Button
                variant="primary"
                onClick={() => setIsApplyModalOpen(true)}
                className="flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Apply to Vacancy
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Feedback Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between text-red-700 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="font-bold ml-2">×</button>
        </div>
      )}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-emerald-700 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="font-bold ml-2">×</button>
        </div>
      )}

      {/* Sub-Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => { setActiveTab('applications'); setSearch(''); setStatusFilter(''); }}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'applications'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Applications Pipeline
        </button>
        <button
          onClick={() => { setActiveTab('candidates'); setSearch(''); setStatusFilter(''); }}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'candidates'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Candidate Profiles
        </button>
        {hasPermission('offer.read') && (
          <button
            onClick={() => { setActiveTab('offers'); setSearch(''); setStatusFilter(''); }}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'offers'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Job Offers
          </button>
        )}
      </div>

      {/* Filters Bar */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <Input
              placeholder="Search by name, email, ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {activeTab === 'applications' && (
              <>
                <select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                >
                  <option value="">All Stages</option>
                  <option value="SCREENING">Screening</option>
                  <option value="INTERVIEW_ROUND_1">Interview Round 1</option>
                  <option value="INTERVIEW_ROUND_2">Interview Round 2</option>
                  <option value="MANAGEMENT_ROUND">Management Round</option>
                  <option value="OFFER_STAGE">Offer Stage</option>
                  <option value="HIRED">Hired</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="WITHDRAWN">Withdrawn</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                >
                  <option value="">All Statuses</option>
                  <option value="APPLIED">Applied</option>
                  <option value="SCREENING">Screening</option>
                  <option value="INTERVIEWING">Interviewing</option>
                  <option value="OFFERED">Offered</option>
                  <option value="ACCEPTED">Accepted (Handoff)</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="WITHDRAWN">Withdrawn</option>
                </select>
              </>
            )}

            {activeTab === 'offers' && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
              >
                <option value="">All Offer Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="APPROVED">Approved</option>
                <option value="SENT">Sent</option>
                <option value="ACCEPTED">Accepted</option>
                <option value="DECLINED">Declined</option>
                <option value="WITHDRAWN">Withdrawn</option>
                <option value="EXPIRED">Expired</option>
              </select>
            )}

            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </Card>

      {/* Main Content Area */}
      {activeTab === 'applications' && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Application ID</TableHead>
                <TableHead>Candidate</TableHead>
                <TableHead>Vacancy Position</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Applied At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    Loading applications...
                  </TableCell>
                </TableRow>
              ) : applications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    No vacancy applications found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                applications.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-mono font-medium text-xs text-brand-600">
                      {app.businessId}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{app.candidate.fullName}</div>
                      <div className="text-xs text-slate-500">{app.candidate.email}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-800">{app.vacancy.title}</div>
                      <div className="text-xs text-slate-400">{app.vacancy.businessId}</div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                        {app.stage}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={app.status} />
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {new Date(app.appliedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewApplicationDetails(app.id)}
                      >
                        View & Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {activeTab === 'candidates' && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Applications Count</TableHead>
                <TableHead>Added On</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    Loading candidates...
                  </TableCell>
                </TableRow>
              ) : candidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    No candidates found.
                  </TableCell>
                </TableRow>
              ) : (
                candidates.map((cand) => (
                  <TableRow key={cand.id}>
                    <TableCell className="font-mono font-medium text-xs text-brand-600">
                      {cand.businessId}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">{cand.fullName}</TableCell>
                    <TableCell className="text-sm text-slate-600">{cand.email}</TableCell>
                    <TableCell className="text-sm text-slate-600">{cand.phone || '—'}</TableCell>
                    <TableCell className="text-xs text-slate-500">{cand.source}</TableCell>
                    <TableCell className="text-sm font-semibold">{cand.applications?.length || 0}</TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {new Date(cand.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {activeTab === 'offers' && hasPermission('offer.read') && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Offer ID</TableHead>
                <TableHead>Candidate</TableHead>
                <TableHead>Role Title</TableHead>
                <TableHead>Compensation</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>Offer Expiry</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                    Loading offers...
                  </TableCell>
                </TableRow>
              ) : offers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                    No job offers found.
                  </TableCell>
                </TableRow>
              ) : (
                offers.map((off) => (
                  <TableRow key={off.id}>
                    <TableCell className="font-mono font-medium text-xs text-brand-600">
                      {off.businessId} {off.version > 1 && <span className="text-slate-400 font-sans">(v{off.version})</span>}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {off.application?.candidate?.fullName || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">{off.roleTitle}</TableCell>
                    <TableCell className="text-sm font-semibold text-slate-900">
                      {off.currency} {Number(off.offeredSalary).toLocaleString()}
                      <span className="text-xs font-normal text-slate-400">/{off.salaryPeriod?.toLowerCase() || 'yr'}</span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{off.proposedStartDate}</TableCell>
                    <TableCell className="text-xs text-slate-600">{off.offerExpiryDate}</TableCell>
                    <TableCell>
                      <StatusBadge status={off.status} />
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {off.status === 'DRAFT' && hasPermission('offer.manage') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await submitOfferAction(off.id);
                              setSuccessMessage('Offer submitted for approval');
                              loadData();
                            } catch (e: any) {
                              setError(e?.message);
                            }
                          }}
                        >
                          Submit
                        </Button>
                      )}

                      {off.status === 'PENDING_APPROVAL' && hasPermission('offer.approve') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedOffer(off);
                            setIsReviewOfferModalOpen(true);
                          }}
                        >
                          Review
                        </Button>
                      )}

                      {off.status === 'APPROVED' && hasPermission('offer.status.manage') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await sendOfferAction(off.id);
                              setSuccessMessage('Offer recorded as sent');
                              loadData();
                            } catch (e: any) {
                              setError(e?.message);
                            }
                          }}
                        >
                          Send
                        </Button>
                      )}

                      {off.status === 'SENT' && hasPermission('offer.status.manage') && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setSelectedOffer(off);
                            setIsResponseModalOpen(true);
                          }}
                        >
                          Record Response
                        </Button>
                      )}

                      {['APPROVED', 'SENT', 'DECLINED', 'EXPIRED'].includes(off.status) && hasPermission('offer.manage') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedOffer(off);
                            setReviseOfferForm({
                              offeredSalary: String(off.offeredSalary || ''),
                              currency: off.currency || 'INR',
                              salaryPeriod: off.salaryPeriod || 'ANNUAL',
                              employmentType: off.employmentType || 'FULL_TIME',
                              workMode: off.workMode || 'ON_SITE',
                              location: off.location || '',
                              proposedStartDate: off.proposedStartDate ? String(off.proposedStartDate).split('T')[0] : '',
                              offerExpiryDate: off.offerExpiryDate ? String(off.offerExpiryDate).split('T')[0] : '',
                              notes: off.notes || '',
                            });
                            setIsReviseOfferModalOpen(true);
                          }}
                        >
                          Revise
                        </Button>
                      )}

                      {off.status === 'SENT' && hasPermission('offer.status.manage') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExpireOffer(off.id)}
                        >
                          Expire
                        </Button>
                      )}

                      {['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT'].includes(off.status) && hasPermission('offer.status.manage') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedOffer(off);
                            setIsWithdrawModalOpen(true);
                          }}
                        >
                          Withdraw
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Modal: Create Candidate */}
      <Modal
        isOpen={isCandidateModalOpen}
        onClose={() => setIsCandidateModalOpen(false)}
      >
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Create Recruitment Candidate</h2>
          <form onSubmit={handleCreateCandidate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Full Name *</label>
            <Input
              required
              value={candidateForm.fullName}
              onChange={(e) => setCandidateForm({ ...candidateForm, fullName: e.target.value })}
              placeholder="e.g. Sarah Jenkins"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Email Address *</label>
            <Input
              type="email"
              required
              value={candidateForm.email}
              onChange={(e) => setCandidateForm({ ...candidateForm, email: e.target.value })}
              placeholder="sarah.j@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Phone</label>
            <Input
              value={candidateForm.phone}
              onChange={(e) => setCandidateForm({ ...candidateForm, phone: e.target.value })}
              placeholder="+971501234567"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Source</label>
            <select
              value={candidateForm.source}
              onChange={(e) => setCandidateForm({ ...candidateForm, source: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
            >
              <option value="DIRECT_APPLICATION">Direct Application</option>
              <option value="LINKEDIN">LinkedIn</option>
              <option value="JOB_PORTAL">Job Portal</option>
              <option value="REFERRAL">Referral</option>
              <option value="AGENCY">Agency</option>
              <option value="CAREERS_PAGE">Careers Page</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Referral Details</label>
            <Input
              value={candidateForm.referralDetails}
              onChange={(e) => setCandidateForm({ ...candidateForm, referralDetails: e.target.value })}
              placeholder="Referred by employee name or agency reference"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Recruiter Notes</label>
            <textarea
              value={candidateForm.notes}
              onChange={(e) => setCandidateForm({ ...candidateForm, notes: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              rows={3}
              placeholder="Candidate background, screening summary..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsCandidateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={actionLoading}>
              {actionLoading ? 'Creating...' : 'Create Candidate'}
            </Button>
          </div>
        </form>
        </div>
      </Modal>

      {/* Modal: Apply Candidate to Vacancy */}
      <Modal
        isOpen={isApplyModalOpen}
        onClose={() => setIsApplyModalOpen(false)}
      >
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Submit Candidate Application</h2>
          <form onSubmit={handleCreateApplication} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Select Open Vacancy *</label>
            <select
              required
              value={applyForm.vacancyId}
              onChange={(e) => setApplyForm({ ...applyForm, vacancyId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
            >
              <option value="">-- Choose Vacancy --</option>
              {openVacancies.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title} ({v.businessId})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Select Candidate *</label>
            <select
              required
              value={applyForm.candidateId}
              onChange={(e) => setApplyForm({ ...applyForm, candidateId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
            >
              <option value="">-- Choose Candidate --</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} ({c.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Cover Note / Pitch</label>
            <textarea
              value={applyForm.coverLetter}
              onChange={(e) => setApplyForm({ ...applyForm, coverLetter: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              rows={3}
              placeholder="Key qualifications, candidate highlights..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsApplyModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={actionLoading}>
              {actionLoading ? 'Submitting...' : 'Submit Application'}
            </Button>
          </div>
        </form>
        </div>
      </Modal>

      {/* Modal: Application Detail & Pipeline Actions */}
      {selectedApplication && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          size="lg"
        >
          <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto pr-1">
            <h2 className="text-xl font-bold text-slate-900">Application Details — {selectedApplication.businessId}</h2>
            {/* Candidate & Vacancy Summary */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg text-sm">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase">Candidate</span>
                <div className="font-semibold text-slate-900">{selectedApplication.candidate.fullName}</div>
                <div className="text-slate-600">{selectedApplication.candidate.email}</div>
                <div className="text-slate-500">{selectedApplication.candidate.phone || 'No phone'}</div>
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase">Target Vacancy</span>
                <div className="font-semibold text-slate-900">{selectedApplication.vacancy.title}</div>
                <div className="text-slate-600">{selectedApplication.vacancy.department?.name || 'Department'}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-slate-500">Stage:</span>
                  <span className="font-semibold">{selectedApplication.stage}</span>
                  <StatusBadge status={selectedApplication.status} />
                </div>
              </div>
            </div>

            {/* Quick Action Toolbar */}
            <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100">
              {hasPermission('candidate.interview.manage') && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsInterviewModalOpen(true)}
                >
                  <Calendar className="w-3.5 h-3.5 mr-1" />
                  Schedule Interview
                </Button>
              )}

              {hasPermission('candidate.manage') && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setStageForm({
                      stage: selectedApplication.stage,
                      status: selectedApplication.status,
                      notes: '',
                      rejectionReason: '',
                    });
                    setIsStageModalOpen(true);
                  }}
                >
                  <Layers className="w-3.5 h-3.5 mr-1" />
                  Update Stage
                </Button>
              )}

              {hasPermission('offer.manage') && selectedApplication.status !== 'REJECTED' && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setOfferForm({
                      roleTitle: selectedApplication.vacancy.title,
                      employmentType: 'FULL_TIME',
                      workMode: 'ON_SITE',
                      location: '',
                      offeredSalary: '',
                      currency: 'INR',
                      salaryPeriod: 'ANNUAL',
                      proposedStartDate: '',
                      offerExpiryDate: '',
                      notes: '',
                    });
                    setIsOfferModalOpen(true);
                  }}
                >
                  <FileText className="w-3.5 h-3.5 mr-1" />
                  Prepare Offer
                </Button>
              )}
            </div>

            {/* Scheduled Interviews */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-brand-600" />
                Interviews & Evaluations ({selectedApplication.interviews?.length || 0})
              </h3>
              {selectedApplication.interviews?.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No interviews scheduled yet.</p>
              ) : (
                <div className="space-y-2">
                  {selectedApplication.interviews?.map((int: any) => (
                    <div key={int.id} className="p-3 border border-slate-200 rounded-md text-xs space-y-1">
                      <div className="flex justify-between items-center font-medium">
                        <span>{int.interviewType} ({int.interviewMode})</span>
                        <StatusBadge status={int.status} />
                      </div>
                      <div className="text-slate-500">
                        {new Date(int.scheduledAt).toLocaleString()} | Interviewer: {int.interviewerName || int.interviewer?.employee?.firstName || 'Assigned'}
                      </div>
                      {int.feedback ? (
                        <div className="mt-1 p-2 bg-slate-100 rounded text-slate-800">
                          <span className="font-semibold">Recommendation: {int.recommendation} (Rating: {int.rating}/5)</span>
                          <p className="mt-0.5">{int.feedback}</p>
                        </div>
                      ) : (
                        hasPermission('candidate.interview.manage') && int.status === 'SCHEDULED' && (
                          <div className="pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedInterview(int);
                                setIsFeedbackModalOpen(true);
                              }}
                            >
                              Record Evaluation Feedback
                            </Button>
                          </div>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stage Progression History */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Stage History</h3>
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {selectedApplication.stageHistory?.map((hist: any) => (
                  <div key={hist.id} className="p-2 border-l-2 border-brand-500 bg-slate-50 text-xs">
                    <div className="font-medium">
                      {hist.toStage} ({hist.toStatus})
                    </div>
                    <div className="text-slate-500">{hist.notes || 'Stage updated'}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(hist.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Schedule Interview */}
      <Modal
        isOpen={isInterviewModalOpen}
        onClose={() => setIsInterviewModalOpen(false)}
      >
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Schedule Candidate Interview</h2>
          <form onSubmit={handleScheduleInterview} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Interview Type</label>
              <select
                value={interviewForm.interviewType}
                onChange={(e) => setInterviewForm({ ...interviewForm, interviewType: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
              >
                <option value="SCREENING">Screening</option>
                <option value="TECHNICAL">Technical Round</option>
                <option value="MANAGEMENT">Management Round</option>
                <option value="HR">HR Round</option>
                <option value="FINAL">Final Executive Round</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Interview Mode</label>
              <select
                value={interviewForm.interviewMode}
                onChange={(e) => setInterviewForm({ ...interviewForm, interviewMode: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
              >
                <option value="ONLINE">Online (Google Meet / Zoom)</option>
                <option value="IN_PERSON">In-Person Office</option>
                <option value="TELEPHONIC">Telephonic</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Scheduled Date & Time *</label>
              <Input
                type="datetime-local"
                required
                value={interviewForm.scheduledAt}
                onChange={(e) => setInterviewForm({ ...interviewForm, scheduledAt: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Interviewer Name</label>
              <Input
                value={interviewForm.interviewerName}
                onChange={(e) => setInterviewForm({ ...interviewForm, interviewerName: e.target.value })}
                placeholder="e.g. Lead Counselor / Head of Academics"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Meeting Link / Room</label>
              <Input
                value={interviewForm.location}
                onChange={(e) => setInterviewForm({ ...interviewForm, location: e.target.value })}
                placeholder="https://meet.google.com/xyz or Room 402"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsInterviewModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={actionLoading}>
                Schedule
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Modal: Record Interview Feedback */}
      <Modal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
      >
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Record Interview Evaluation Feedback</h2>
          <form onSubmit={handleRecordFeedback} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Recommendation Outcome *</label>
              <select
                value={feedbackForm.recommendation}
                onChange={(e) => setFeedbackForm({ ...feedbackForm, recommendation: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
              >
                <option value="STRONG_HIRE">Strong Hire</option>
                <option value="HIRE">Hire</option>
                <option value="NEUTRAL">Neutral / Hold</option>
                <option value="DO_NOT_HIRE">Do Not Hire</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Evaluation Rating (1 - 5)</label>
              <select
                value={feedbackForm.rating}
                onChange={(e) => setFeedbackForm({ ...feedbackForm, rating: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
              >
                <option value={5}>5 - Excellent</option>
                <option value={4}>4 - Good</option>
                <option value={3}>3 - Acceptable</option>
                <option value={2}>2 - Marginal</option>
                <option value={1}>1 - Unacceptable</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Feedback & Remarks *</label>
              <textarea
                required
                value={feedbackForm.feedback}
                onChange={(e) => setFeedbackForm({ ...feedbackForm, feedback: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                rows={4}
                placeholder="Detailed candidate evaluation, technical strengths, culture fit..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsFeedbackModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={actionLoading}>
                Save Evaluation
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Modal: Transition Stage */}
      <Modal
        isOpen={isStageModalOpen}
        onClose={() => setIsStageModalOpen(false)}
      >
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Transition Application Stage</h2>
          <form onSubmit={handleTransitionStage} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Target Stage</label>
              <select
                value={stageForm.stage}
                onChange={(e) => setStageForm({ ...stageForm, stage: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
              >
                <option value="SCREENING">Screening</option>
                <option value="INTERVIEW_ROUND_1">Interview Round 1</option>
                <option value="INTERVIEW_ROUND_2">Interview Round 2</option>
                <option value="MANAGEMENT_ROUND">Management Round</option>
                <option value="OFFER_STAGE">Offer Stage</option>
                <option value="HIRED">Hired (Completed)</option>
                <option value="REJECTED">Rejected</option>
                <option value="WITHDRAWN">Withdrawn</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Target Status</label>
              <select
                value={stageForm.status}
                onChange={(e) => setStageForm({ ...stageForm, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
              >
                <option value="APPLIED">Applied</option>
                <option value="SCREENING">Screening</option>
                <option value="INTERVIEWING">Interviewing</option>
                <option value="OFFERED">Offered</option>
                <option value="ACCEPTED">Accepted</option>
                <option value="REJECTED">Rejected</option>
                <option value="WITHDRAWN">Withdrawn</option>
              </select>
            </div>

            {stageForm.status === 'REJECTED' && (
              <div>
                <label className="block text-sm font-medium text-red-700">Rejection Rationale *</label>
                <textarea
                  required
                  value={stageForm.rejectionReason}
                  onChange={(e) => setStageForm({ ...stageForm, rejectionReason: e.target.value })}
                  className="w-full px-3 py-2 border border-red-300 rounded-md text-sm"
                  rows={3}
                  placeholder="Required explanation for candidate rejection..."
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700">Transition Notes</label>
              <Input
                value={stageForm.notes}
                onChange={(e) => setStageForm({ ...stageForm, notes: e.target.value })}
                placeholder="e.g. Advanced after positive technical evaluation"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsStageModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={actionLoading}>
                Update Stage
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Modal: Prepare Job Offer */}
      <Modal
        isOpen={isOfferModalOpen}
        onClose={() => setIsOfferModalOpen(false)}
        size="lg"
      >
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Prepare Formal Job Offer</h2>
          <form onSubmit={handleCreateOffer} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Designation / Role Title *</label>
              <Input
                required
                value={offerForm.roleTitle}
                onChange={(e) => setOfferForm({ ...offerForm, roleTitle: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Offered Salary Amount *</label>
                <Input
                  type="number"
                  required
                  min="0"
                  value={offerForm.offeredSalary}
                  onChange={(e) => setOfferForm({ ...offerForm, offeredSalary: e.target.value })}
                  placeholder="e.g. 75000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Currency *</label>
                <select
                  value={offerForm.currency}
                  onChange={(e) => setOfferForm({ ...offerForm, currency: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                >
                  <option value="INR">INR</option>
                  <option value="AED">AED</option>
                  <option value="USD">USD</option>
                  <option value="SAR">SAR</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Proposed Start Date *</label>
                <Input
                  type="date"
                  required
                  value={offerForm.proposedStartDate}
                  onChange={(e) => setOfferForm({ ...offerForm, proposedStartDate: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Offer Expiry Date *</label>
                <Input
                  type="date"
                  required
                  value={offerForm.offerExpiryDate}
                  onChange={(e) => setOfferForm({ ...offerForm, offerExpiryDate: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Offer Terms / Notes</label>
              <textarea
                value={offerForm.notes}
                onChange={(e) => setOfferForm({ ...offerForm, notes: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                rows={3}
                placeholder="Allowances, probationary requirements, joining incentives..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsOfferModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={actionLoading}>
                Prepare Offer
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Modal: Review Offer (Approve / Reject) */}
      <Modal
        isOpen={isReviewOfferModalOpen}
        onClose={() => setIsReviewOfferModalOpen(false)}
      >
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Review Job Offer — {selectedOffer?.businessId}</h2>
          <form onSubmit={handleReviewOffer} className="space-y-4">
            <p className="text-sm text-slate-600">
              Designation: <span className="font-semibold text-slate-900">{selectedOffer?.roleTitle}</span>
              <br />
              Compensation: <span className="font-semibold text-slate-900">{selectedOffer?.currency} {Number(selectedOffer?.offeredSalary).toLocaleString()}</span>
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-700">Decision *</label>
              <select
                value={reviewOfferForm.action}
                onChange={(e) => setReviewOfferForm({ ...reviewOfferForm, action: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
              >
                <option value="APPROVE">Approve Offer</option>
                <option value="REJECT">Reject Offer</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                {reviewOfferForm.action === 'REJECT' ? 'Rejection Reason *' : 'Approval Notes'}
              </label>
              <textarea
                required={reviewOfferForm.action === 'REJECT'}
                value={reviewOfferForm.approvalNotes}
                onChange={(e) => setReviewOfferForm({ ...reviewOfferForm, approvalNotes: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                rows={3}
                placeholder={reviewOfferForm.action === 'REJECT' ? 'Reason for rejecting this offer...' : 'Optional approval notes...'}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsReviewOfferModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={reviewOfferForm.action === 'APPROVE' ? 'primary' : 'danger'}
                disabled={actionLoading}
              >
                Confirm Decision
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Modal: Record Candidate Response */}
      <Modal
        isOpen={isResponseModalOpen}
        onClose={() => setIsResponseModalOpen(false)}
      >
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Record Candidate Response — {selectedOffer?.businessId}</h2>
          <form onSubmit={handleRecordResponse} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Candidate Response *</label>
              <select
                value={responseForm.decision}
                onChange={(e) => setResponseForm({ ...responseForm, decision: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
              >
                <option value="ACCEPT">Accepted (Ready for Phase 6 Onboarding)</option>
                <option value="DECLINE">Declined</option>
              </select>
            </div>

            {responseForm.decision === 'DECLINE' ? (
              <div>
                <label className="block text-sm font-medium text-red-700">Decline Reason *</label>
                <textarea
                  required
                  value={responseForm.declineReason}
                  onChange={(e) => setResponseForm({ ...responseForm, declineReason: e.target.value })}
                  className="w-full px-3 py-2 border border-red-300 rounded-md text-sm"
                  rows={3}
                  placeholder="Reason provided by candidate for declining..."
                />
              </div>
            ) : (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800">
                Note: Marking this offer as ACCEPTED establishes a handoff marker for Phase 6 Onboarding. It does not automatically create an employee account or payroll record.
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700">Response Remarks</label>
              <Input
                value={responseForm.responseNotes}
                onChange={(e) => setResponseForm({ ...responseForm, responseNotes: e.target.value })}
                placeholder="e.g. Candidate signed and acknowledged joining terms"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsResponseModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={actionLoading}>
                Save Response
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Modal: Withdraw Offer */}
      <Modal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
      >
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Withdraw Job Offer — {selectedOffer?.businessId}</h2>
          <form onSubmit={handleWithdrawOffer} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-red-700">Withdrawal Reason *</label>
              <textarea
                required
                value={withdrawForm.withdrawalReason}
                onChange={(e) => setWithdrawForm({ withdrawalReason: e.target.value })}
                className="w-full px-3 py-2 border border-red-300 rounded-md text-sm"
                rows={3}
                placeholder="Organizational reason for withdrawing this offer..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsWithdrawModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" disabled={actionLoading}>
                Withdraw Offer
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Modal: Revise Job Offer */}
      <Modal
        isOpen={isReviseOfferModalOpen}
        onClose={() => setIsReviseOfferModalOpen(false)}
        size="lg"
      >
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-2">Revise Job Offer — {selectedOffer?.businessId}</h2>
          <p className="text-xs text-slate-500 mb-4">
            Creating a revision archives version {selectedOffer?.version} and generates version {((selectedOffer?.version || 1) + 1)} in PENDING_APPROVAL status.
          </p>
          <form onSubmit={handleReviseOffer} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Revised Salary Amount *</label>
                <Input
                  type="number"
                  required
                  min="0"
                  value={reviseOfferForm.offeredSalary}
                  onChange={(e) => setReviseOfferForm({ ...reviseOfferForm, offeredSalary: e.target.value })}
                  placeholder="e.g. 85000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Currency *</label>
                <select
                  value={reviseOfferForm.currency}
                  onChange={(e) => setReviseOfferForm({ ...reviseOfferForm, currency: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                >
                  <option value="INR">INR</option>
                  <option value="AED">AED</option>
                  <option value="USD">USD</option>
                  <option value="SAR">SAR</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Proposed Start Date *</label>
                <Input
                  type="date"
                  required
                  value={reviseOfferForm.proposedStartDate}
                  onChange={(e) => setReviseOfferForm({ ...reviseOfferForm, proposedStartDate: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Offer Expiry Date *</label>
                <Input
                  type="date"
                  required
                  value={reviseOfferForm.offerExpiryDate}
                  onChange={(e) => setReviseOfferForm({ ...reviseOfferForm, offerExpiryDate: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Revision Notes / Renegotiation Terms</label>
              <textarea
                value={reviseOfferForm.notes}
                onChange={(e) => setReviseOfferForm({ ...reviseOfferForm, notes: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                rows={3}
                placeholder="Details of renegotiated compensation or terms..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsReviseOfferModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={actionLoading}>
                Submit Revision
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
