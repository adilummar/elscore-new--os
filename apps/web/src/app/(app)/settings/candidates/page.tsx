"use client";

import * as React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Building,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck,
  FileText,
  Filter,
  History,
  Info,
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
  getOfferAction,
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

const getDefaultDates = () => {
  const today = new Date();
  const plus7 = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const plus30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    offerExpiryDate: plus7.toISOString().split('T')[0],
    proposedStartDate: plus30.toISOString().split('T')[0],
  };
};

export default function CandidatesPage() {
  const { hasPermission } = usePermissions();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = React.useState<'applications' | 'candidates' | 'offers'>('applications');

  // Data states
  const [candidates, setCandidates] = React.useState<any[]>([]);
  const [allCandidates, setAllCandidates] = React.useState<any[]>([]);
  const [applications, setApplications] = React.useState<any[]>([]);
  const [allApplications, setAllApplications] = React.useState<any[]>([]);
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
  const [isOfferDetailsModalOpen, setIsOfferDetailsModalOpen] = React.useState(false);
  const [isReviewOfferModalOpen, setIsReviewOfferModalOpen] = React.useState(false);
  const [isResponseModalOpen, setIsResponseModalOpen] = React.useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = React.useState(false);
  const [isReviseOfferModalOpen, setIsReviseOfferModalOpen] = React.useState(false);

  // Active selections
  const [selectedApplication, setSelectedApplication] = React.useState<any | null>(null);
  const [selectedInterview, setSelectedInterview] = React.useState<any | null>(null);
  const [selectedOffer, setSelectedOffer] = React.useState<any | null>(null);
  const [detailedOffer, setDetailedOffer] = React.useState<any | null>(null);

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

      // Pre-load candidates, applications, and vacancies for modals so selectors are never empty
      const [allCandRes, allAppRes, vacRes] = await Promise.all([
        getCandidatesAction('limit=100'),
        getApplicationsAction('limit=100'),
        getVacanciesAction('status=OPEN'),
      ]);

      if (allCandRes?.items) {
        setAllCandidates(allCandRes.items);
        if (activeTab !== 'candidates' && candidates.length === 0) {
          setCandidates(allCandRes.items);
        }
      }
      if (allAppRes?.items) {
        setAllApplications(allAppRes.items);
      }
      if (vacRes?.items) {
        setOpenVacancies(vacRes.items);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load recruitment data');
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, statusFilter, stageFilter, candidates.length]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers
  const handleCreateCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    try {
      const res = await createCandidateAction(candidateForm);
      if (!res.success) {
        setError(res.error || 'Failed to create candidate');
        return;
      }
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
      const res = await createApplicationAction(applyForm.vacancyId, {
        candidateId: applyForm.candidateId,
        coverLetter: applyForm.coverLetter,
      });
      if (!res.success) {
        setError(res.error || 'Failed to submit application');
        return;
      }
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
    setError(null);
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
      const res = await scheduleInterviewAction(selectedApplication.id, interviewForm);
      if (!res.success) {
        setError(res.error || 'Failed to schedule interview');
        return;
      }
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
      const res = await recordInterviewFeedbackAction(selectedInterview.id, feedbackForm);
      if (!res.success) {
        setError(res.error || 'Failed to record feedback');
        return;
      }
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
      const res = await transitionApplicationStageAction(selectedApplication.id, stageForm);
      if (!res.success) {
        setError(res.error || 'Failed to update stage');
        return;
      }
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

  // Open Prepare Offer modal directly or from application details
  const openPrepareOfferModal = (app?: any) => {
    const dates = getDefaultDates();
    if (app) {
      setSelectedApplication(app);
      setOfferForm({
        roleTitle: app.vacancy?.title || '',
        employmentType: app.vacancy?.employmentType || 'FULL_TIME',
        workMode: app.vacancy?.workMode || 'ON_SITE',
        location: app.vacancy?.location || '',
        offeredSalary: app.vacancy?.budgetMax ? String(app.vacancy.budgetMax) : '',
        currency: app.vacancy?.currency || 'INR',
        salaryPeriod: 'ANNUAL',
        proposedStartDate: dates.proposedStartDate,
        offerExpiryDate: dates.offerExpiryDate,
        notes: '',
      });
    } else {
      setSelectedApplication(null);
      setOfferForm({
        roleTitle: '',
        employmentType: 'FULL_TIME',
        workMode: 'ON_SITE',
        location: '',
        offeredSalary: '',
        currency: 'INR',
        salaryPeriod: 'ANNUAL',
        proposedStartDate: dates.proposedStartDate,
        offerExpiryDate: dates.offerExpiryDate,
        notes: '',
      });
    }
    setIsOfferModalOpen(true);
  };

  const handleSelectApplicationForOffer = (appId: string) => {
    const found = allApplications.find((a) => a.id === appId);
    if (found) {
      setSelectedApplication(found);
      const dates = getDefaultDates();
      setOfferForm({
        roleTitle: found.vacancy?.title || '',
        employmentType: found.vacancy?.employmentType || 'FULL_TIME',
        workMode: found.vacancy?.workMode || 'ON_SITE',
        location: found.vacancy?.location || '',
        offeredSalary: found.vacancy?.budgetMax ? String(found.vacancy.budgetMax) : '',
        currency: found.vacancy?.currency || 'INR',
        salaryPeriod: 'ANNUAL',
        proposedStartDate: dates.proposedStartDate,
        offerExpiryDate: dates.offerExpiryDate,
        notes: '',
      });
    }
  };

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApplication) {
      setError('Please select an eligible application to prepare an offer.');
      return;
    }

    // Client-side date order validation
    if (offerForm.offerExpiryDate > offerForm.proposedStartDate) {
      setError('Invalid Date Order: Offer expiry date (candidate acceptance deadline) cannot be after proposed start date.');
      return;
    }

    // Client-side salary cap validation
    const offeredSalaryNum = Number(offerForm.offeredSalary);
    if (isNaN(offeredSalaryNum) || offeredSalaryNum < 0) {
      setError('Offered salary must be a valid non-negative number.');
      return;
    }

    const budgetMax = selectedApplication.vacancy?.budgetMax ? Number(selectedApplication.vacancy.budgetMax) : null;
    if (budgetMax !== null && offeredSalaryNum > budgetMax) {
      setError(
        `Offered salary (${offeredSalaryNum.toLocaleString()} ${offerForm.currency}) exceeds approved vacancy budget maximum (${budgetMax.toLocaleString()} ${selectedApplication.vacancy.currency || offerForm.currency}) for vacancy ${selectedApplication.vacancy.businessId}.`,
      );
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      const res = await createOfferAction(selectedApplication.id, {
        ...offerForm,
        offeredSalary: offeredSalaryNum,
      });
      if (!res.success) {
        setError(res.error || 'Failed to prepare offer');
        return;
      }
      setSuccessMessage('Draft formal job offer prepared successfully');
      setIsOfferModalOpen(false);
      if (selectedApplication?.id) {
        const app = await getApplicationAction(selectedApplication.id);
        setSelectedApplication(app);
      }
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

    // Strict Anti-Self-Approval check
    const isSelfApproval =
      user?.id && (selectedOffer.requestedById === user.id || selectedOffer.lastModifiedById === user.id);
    if (isSelfApproval && reviewOfferForm.action === 'APPROVE') {
      setError(
        'Self-approval is prohibited: you cannot approve or review a job offer you requested or modified. Another authorized manager must review this offer.',
      );
      return;
    }

    if (reviewOfferForm.action === 'REJECT' && !reviewOfferForm.approvalNotes?.trim()) {
      setError('A rejection rationale is required when rejecting a job offer.');
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      const res = await reviewOfferAction(selectedOffer.id, reviewOfferForm);
      if (!res.success) {
        setError(res.error || 'Failed to review offer');
        return;
      }
      setSuccessMessage(`Offer ${selectedOffer.businessId} ${reviewOfferForm.action.toLowerCase()}d successfully`);
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
      const res = await recordOfferResponseAction(selectedOffer.id, responseForm);
      if (!res.success) {
        setError(res.error || 'Failed to record response');
        return;
      }
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
      const res = await withdrawOfferAction(selectedOffer.id, withdrawForm);
      if (!res.success) {
        setError(res.error || 'Failed to withdraw offer');
        return;
      }
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

    if (reviseOfferForm.offerExpiryDate > reviseOfferForm.proposedStartDate) {
      setError('Invalid Date Order: Offer expiry date cannot be after proposed start date.');
      return;
    }

    const revisedSalaryNum = Number(reviseOfferForm.offeredSalary);
    if (isNaN(revisedSalaryNum) || revisedSalaryNum < 0) {
      setError('Revised salary must be a valid non-negative number.');
      return;
    }

    const budgetMax = selectedOffer.vacancy?.budgetMax ? Number(selectedOffer.vacancy.budgetMax) : null;
    if (budgetMax !== null && revisedSalaryNum > budgetMax) {
      setError(
        `Revised salary (${revisedSalaryNum.toLocaleString()} ${reviseOfferForm.currency}) exceeds approved vacancy budget maximum (${budgetMax.toLocaleString()} ${selectedOffer.vacancy.currency || reviseOfferForm.currency}) for vacancy ${selectedOffer.vacancy.businessId}.`,
      );
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      const res = await reviseOfferAction(selectedOffer.id, {
        ...reviseOfferForm,
        offeredSalary: revisedSalaryNum,
      });
      if (!res.success) {
        setError(res.error || 'Failed to revise offer');
        return;
      }
      setSuccessMessage(`Offer ${selectedOffer.businessId} revised to version ${((selectedOffer.version || 1) + 1)} successfully (reset to Draft)`);
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
      const res = await expireOfferAction(offerId);
      if (!res.success) {
        setError(res.error || 'Failed to expire offer');
        return;
      }
      setSuccessMessage('Offer marked as expired');
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to expire offer');
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewOfferDetails = async (offer: any) => {
    setSelectedOffer(offer);
    setActionLoading(true);
    setError(null);
    try {
      const fullOffer = await getOfferAction(offer.id);
      setDetailedOffer(fullOffer || offer);
      setIsOfferDetailsModalOpen(true);
    } catch (err: any) {
      setDetailedOffer(offer);
      setIsOfferDetailsModalOpen(true);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
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
                Add Candidate
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsApplyModalOpen(true)}
                className="flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Apply to Vacancy
              </Button>
            </>
          )}

          {hasPermission('offer.manage') && (
            <Button
              variant="primary"
              onClick={() => openPrepareOfferModal()}
              className="flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4" />
              Prepare Job Offer
            </Button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-start justify-between">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-semibold block">Action Incomplete</span>
              {error}
            </div>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 text-xs font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-800 text-xs font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* Tab Navigation */}
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
                  className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white text-slate-900"
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
                  className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white text-slate-900"
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
                className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white text-slate-900"
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

      {/* Main Content Area: Applications */}
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
                    <TableCell className="text-right space-x-1">
                      {hasPermission('offer.manage') &&
                        app.status !== 'REJECTED' &&
                        app.status !== 'WITHDRAWN' &&
                        app.status !== 'ACCEPTED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPrepareOfferModal(app)}
                            className="text-brand-600 border-brand-200 hover:bg-brand-50"
                          >
                            <FileText className="w-3.5 h-3.5 mr-1" />
                            Offer
                          </Button>
                        )}
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

      {/* Main Content Area: Candidates */}
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

      {/* Main Content Area: Job Offers */}
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
                    No job offers found. Use &quot;Prepare Job Offer&quot; above to issue an offer.
                  </TableCell>
                </TableRow>
              ) : (
                offers.map((off) => (
                  <TableRow key={off.id}>
                    <TableCell>
                      <button
                        onClick={() => handleViewOfferDetails(off)}
                        className="font-mono font-semibold text-xs text-brand-600 hover:text-brand-800 underline text-left"
                      >
                        {off.businessId} {off.version > 1 && <span className="text-slate-500 font-sans">(v{off.version})</span>}
                      </button>
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
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                      {/* View Details Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewOfferDetails(off)}
                        title="View Full Offer Details & Version History"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Details
                      </Button>

                      {/* DRAFT -> Submit for Approval */}
                      {off.status === 'DRAFT' && hasPermission('offer.manage') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            setActionLoading(true);
                            setError(null);
                            try {
                              const res = await submitOfferAction(off.id);
                              if (!res.success) {
                                setError(res.error || 'Failed to submit offer for approval');
                                return;
                              }
                              setSuccessMessage(`Offer ${off.businessId} submitted for management approval`);
                              loadData();
                            } catch (e: any) {
                              setError(e?.message);
                            } finally {
                              setActionLoading(false);
                            }
                          }}
                        >
                          Submit
                        </Button>
                      )}

                      {/* PENDING_APPROVAL -> Review (Approve / Reject) */}
                      {off.status === 'PENDING_APPROVAL' && hasPermission('offer.approve') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedOffer(off);
                            setIsReviewOfferModalOpen(true);
                          }}
                          className="text-amber-700 border-amber-300 hover:bg-amber-50"
                        >
                          Review
                        </Button>
                      )}

                      {/* APPROVED -> Send Offer to Candidate */}
                      {off.status === 'APPROVED' && hasPermission('offer.status.manage') && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={async () => {
                            setActionLoading(true);
                            setError(null);
                            try {
                              const res = await sendOfferAction(off.id);
                              if (!res.success) {
                                setError(res.error || 'Failed to record offer as sent');
                                return;
                              }
                              setSuccessMessage(`Offer ${off.businessId} marked as SENT to candidate`);
                              loadData();
                            } catch (e: any) {
                              setError(e?.message);
                            } finally {
                              setActionLoading(false);
                            }
                          }}
                        >
                          <Send className="w-3.5 h-3.5 mr-1" />
                          Send
                        </Button>
                      )}

                      {/* SENT -> Record Response */}
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

                      {/* Revise Offer */}
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

                      {/* Expire Offer */}
                      {off.status === 'SENT' && hasPermission('offer.status.manage') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExpireOffer(off.id)}
                        >
                          Expire
                        </Button>
                      )}

                      {/* Withdraw Offer */}
                      {['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT'].includes(off.status) && hasPermission('offer.status.manage') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedOffer(off);
                            setIsWithdrawModalOpen(true);
                          }}
                          className="text-red-600 border-red-200 hover:bg-red-50"
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

      {/* ─────────────────── MODALS ─────────────────── */}

      {/* Modal: Create Candidate */}
      <Modal
        isOpen={isCandidateModalOpen}
        onClose={() => setIsCandidateModalOpen(false)}
      >
        <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 pb-3 mb-4 border-b border-slate-100 pr-10">
          <h2 className="text-xl font-bold text-slate-900">Create Recruitment Candidate</h2>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-1 space-y-4">
          <form onSubmit={handleCreateCandidate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Full Name *</label>
              <Input
                required
                value={candidateForm.fullName}
                onChange={(e) => setCandidateForm({ ...candidateForm, fullName: e.target.value })}
                placeholder="e.g. Sarah Jenkins"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Email Address *</label>
              <Input
                type="email"
                required
                value={candidateForm.email}
                onChange={(e) => setCandidateForm({ ...candidateForm, email: e.target.value })}
                placeholder="sarah.j@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Phone</label>
              <Input
                value={candidateForm.phone}
                onChange={(e) => setCandidateForm({ ...candidateForm, phone: e.target.value })}
                placeholder="+971501234567"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Source</label>
              <select
                value={candidateForm.source}
                onChange={(e) => setCandidateForm({ ...candidateForm, source: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
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
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Referral Details</label>
              <Input
                value={candidateForm.referralDetails}
                onChange={(e) => setCandidateForm({ ...candidateForm, referralDetails: e.target.value })}
                placeholder="Referred by employee name or agency reference"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Recruiter Notes</label>
              <textarea
                value={candidateForm.notes}
                onChange={(e) => setCandidateForm({ ...candidateForm, notes: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                rows={3}
                placeholder="Candidate background, screening summary..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
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
        <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 pb-3 mb-4 border-b border-slate-100 pr-10">
          <h2 className="text-xl font-bold text-slate-900">Submit Candidate Application</h2>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-1 space-y-4">
          <form onSubmit={handleCreateApplication} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Select Open Vacancy *</label>
              <select
                required
                value={applyForm.vacancyId}
                onChange={(e) => setApplyForm({ ...applyForm, vacancyId: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
              >
                <option value="">-- Choose Open Vacancy --</option>
                {openVacancies.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title} ({v.businessId}) — {v.department?.name || 'Department'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Select Candidate *</label>
              <select
                required
                value={applyForm.candidateId}
                onChange={(e) => setApplyForm({ ...applyForm, candidateId: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
              >
                <option value="">-- Choose Candidate --</option>
                {(allCandidates.length > 0 ? allCandidates : candidates).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.email}) [{c.businessId}]
                  </option>
                ))}
              </select>
              {allCandidates.length === 0 && candidates.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">No candidate profiles found. Please create a candidate profile first.</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Cover Note / Pitch</label>
              <textarea
                value={applyForm.coverLetter}
                onChange={(e) => setApplyForm({ ...applyForm, coverLetter: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                rows={3}
                placeholder="Key qualifications, candidate highlights..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
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
          <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 pb-3 mb-4 border-b border-slate-100 pr-10">
            <h2 className="text-xl font-bold text-slate-900">Application Details — {selectedApplication.businessId}</h2>
          </div>
          <div className="space-y-6 max-h-[75vh] overflow-y-auto px-1">
            {/* Candidate & Vacancy Summary */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase">Candidate</span>
                <div className="font-semibold text-slate-900">{selectedApplication.candidate?.fullName}</div>
                <div className="text-slate-600">{selectedApplication.candidate?.email}</div>
                <div className="text-slate-500">{selectedApplication.candidate?.phone || 'No phone'}</div>
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase">Target Vacancy</span>
                <div className="font-semibold text-slate-900">{selectedApplication.vacancy?.title}</div>
                <div className="text-slate-600">{selectedApplication.vacancy?.department?.name || 'Department'}</div>
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

              {hasPermission('offer.manage') &&
                selectedApplication.status !== 'REJECTED' &&
                selectedApplication.status !== 'WITHDRAWN' &&
                selectedApplication.status !== 'ACCEPTED' && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => openPrepareOfferModal(selectedApplication)}
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
        <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 pb-3 mb-4 border-b border-slate-100 pr-10">
          <h2 className="text-xl font-bold text-slate-900">Schedule Candidate Interview</h2>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-1 space-y-4">
          <form onSubmit={handleScheduleInterview} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Interview Type</label>
              <select
                value={interviewForm.interviewType}
                onChange={(e) => setInterviewForm({ ...interviewForm, interviewType: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
              >
                <option value="SCREENING">Screening</option>
                <option value="TECHNICAL">Technical Round</option>
                <option value="MANAGEMENT">Management Round</option>
                <option value="HR">HR Round</option>
                <option value="FINAL">Final Executive Round</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Interview Mode</label>
              <select
                value={interviewForm.interviewMode}
                onChange={(e) => setInterviewForm({ ...interviewForm, interviewMode: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
              >
                <option value="ONLINE">Online (Google Meet / Zoom)</option>
                <option value="IN_PERSON">In-Person Office</option>
                <option value="TELEPHONIC">Telephonic</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Scheduled Date & Time *</label>
              <Input
                type="datetime-local"
                required
                value={interviewForm.scheduledAt}
                onChange={(e) => setInterviewForm({ ...interviewForm, scheduledAt: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Interviewer Name</label>
              <Input
                value={interviewForm.interviewerName}
                onChange={(e) => setInterviewForm({ ...interviewForm, interviewerName: e.target.value })}
                placeholder="e.g. Lead Counselor / Head of Academics"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Meeting Link / Room</label>
              <Input
                value={interviewForm.location}
                onChange={(e) => setInterviewForm({ ...interviewForm, location: e.target.value })}
                placeholder="https://meet.google.com/xyz or Room 402"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
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
        <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 pb-3 mb-4 border-b border-slate-100 pr-10">
          <h2 className="text-xl font-bold text-slate-900">Record Interview Evaluation Feedback</h2>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-1 space-y-4">
          <form onSubmit={handleRecordFeedback} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Recommendation Outcome *</label>
              <select
                value={feedbackForm.recommendation}
                onChange={(e) => setFeedbackForm({ ...feedbackForm, recommendation: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
              >
                <option value="STRONG_HIRE">Strong Hire</option>
                <option value="HIRE">Hire</option>
                <option value="NEUTRAL">Neutral / Hold</option>
                <option value="DO_NOT_HIRE">Do Not Hire</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Evaluation Rating (1 - 5)</label>
              <select
                value={feedbackForm.rating}
                onChange={(e) => setFeedbackForm({ ...feedbackForm, rating: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
              >
                <option value={5}>5 - Excellent</option>
                <option value={4}>4 - Good</option>
                <option value={3}>3 - Acceptable</option>
                <option value={2}>2 - Marginal</option>
                <option value={1}>1 - Unacceptable</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Feedback & Remarks *</label>
              <textarea
                required
                value={feedbackForm.feedback}
                onChange={(e) => setFeedbackForm({ ...feedbackForm, feedback: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                rows={4}
                placeholder="Detailed candidate evaluation, technical strengths, culture fit..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
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
        <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 pb-3 mb-4 border-b border-slate-100 pr-10">
          <h2 className="text-xl font-bold text-slate-900">Transition Application Stage</h2>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-1 space-y-4">
          <form onSubmit={handleTransitionStage} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Target Stage</label>
              <select
                value={stageForm.stage}
                onChange={(e) => setStageForm({ ...stageForm, stage: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
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
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Target Status</label>
              <select
                value={stageForm.status}
                onChange={(e) => setStageForm({ ...stageForm, status: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
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
                <label className="block text-xs font-semibold uppercase tracking-wider text-red-700 mb-1.5">Rejection Rationale *</label>
                <textarea
                  required
                  value={stageForm.rejectionReason}
                  onChange={(e) => setStageForm({ ...stageForm, rejectionReason: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-red-300 rounded-lg text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 shadow-sm"
                  rows={3}
                  placeholder="Required explanation for candidate rejection..."
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Transition Notes</label>
              <Input
                value={stageForm.notes}
                onChange={(e) => setStageForm({ ...stageForm, notes: e.target.value })}
                placeholder="e.g. Advanced after positive technical evaluation"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
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
        <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 pb-3 mb-4 border-b border-slate-100 pr-10">
          <h2 className="text-xl font-bold text-slate-900">Prepare Formal Job Offer</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure approved compensation, position terms, and candidate acceptance window.
          </p>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-1 space-y-4">
          <form onSubmit={handleCreateOffer} className="space-y-4">
            {/* If opened from Job Offers tab without a selected application, allow choosing an eligible application */}
            {!selectedApplication ? (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Select Candidate Application *
                </label>
                <select
                  required
                  value=""
                  onChange={(e) => handleSelectApplicationForOffer(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                >
                  <option value="">-- Choose Candidate Application to Issue Offer --</option>
                  {allApplications
                    .filter((a) => a.status !== 'REJECTED' && a.status !== 'WITHDRAWN' && a.status !== 'ACCEPTED')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.candidate?.fullName} — {a.vacancy?.title} ({a.businessId})
                      </option>
                    ))}
                </select>
                <p className="text-xs text-slate-500">
                  Select an active application to automatically load candidate, vacancy, and budget constraints.
                </p>
              </div>
            ) : (
              /* Display selected candidate and target vacancy context */
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-slate-500 uppercase font-semibold block text-[11px]">Candidate</span>
                    <span className="font-semibold text-slate-900 text-sm">{selectedApplication.candidate?.fullName}</span>
                    <span className="text-slate-600 block text-xs">{selectedApplication.candidate?.email}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 uppercase font-semibold block text-[11px]">Target Requisition</span>
                    <span className="font-semibold text-slate-900 text-sm">{selectedApplication.vacancy?.title}</span>
                    <span className="text-slate-500 block font-mono text-[11px]">
                      {selectedApplication.vacancy?.businessId} — {selectedApplication.vacancy?.department?.name || 'Department'}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-xs">
                  <span className="text-slate-600 font-medium">Approved Requisition Budget:</span>
                  <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {selectedApplication.vacancy?.budgetMin ? Number(selectedApplication.vacancy.budgetMin).toLocaleString() : '0'} – {selectedApplication.vacancy?.budgetMax ? Number(selectedApplication.vacancy.budgetMax).toLocaleString() : 'No Cap'} {selectedApplication.vacancy?.currency || 'INR'}
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Designation / Role Title *</label>
              <Input
                required
                value={offerForm.roleTitle}
                onChange={(e) => setOfferForm({ ...offerForm, roleTitle: e.target.value })}
                placeholder="e.g. Senior System Architect"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Offered Salary Amount *</label>
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
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Currency *</label>
                <select
                  value={offerForm.currency}
                  onChange={(e) => setOfferForm({ ...offerForm, currency: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                >
                  <option value="INR">INR</option>
                  <option value="AED">AED</option>
                  <option value="USD">USD</option>
                  <option value="SAR">SAR</option>
                </select>
              </div>
            </div>

            {/* Live Budget Cap Enforcement Warning */}
            {selectedApplication?.vacancy?.budgetMax &&
              Number(offerForm.offeredSalary) > Number(selectedApplication.vacancy.budgetMax) && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold block">Salary Cap Exceeded</span>
                    Offered salary ({Number(offerForm.offeredSalary).toLocaleString()} {offerForm.currency}) exceeds approved vacancy budget maximum ({Number(selectedApplication.vacancy.budgetMax).toLocaleString()} {selectedApplication.vacancy.currency || offerForm.currency}). Organizational policy prohibits exceeding approved vacancy budgets.
                  </div>
                </div>
              )}

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Salary Period</label>
                <select
                  value={offerForm.salaryPeriod}
                  onChange={(e) => setOfferForm({ ...offerForm, salaryPeriod: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                >
                  <option value="ANNUAL">Annual</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Employment Type</label>
                <select
                  value={offerForm.employmentType}
                  onChange={(e) => setOfferForm({ ...offerForm, employmentType: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                >
                  <option value="FULL_TIME">Full Time</option>
                  <option value="PART_TIME">Part Time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="INTERNSHIP">Internship</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Work Mode</label>
                <select
                  value={offerForm.workMode}
                  onChange={(e) => setOfferForm({ ...offerForm, workMode: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                >
                  <option value="ON_SITE">On-Site</option>
                  <option value="REMOTE">Remote</option>
                  <option value="HYBRID">Hybrid</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Work Location</label>
              <Input
                value={offerForm.location}
                onChange={(e) => setOfferForm({ ...offerForm, location: e.target.value })}
                placeholder="e.g. Dubai Main Office / Academic Campus"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Proposed Start Date *</label>
                <Input
                  type="date"
                  required
                  min={new Date().toISOString().split('T')[0]}
                  value={offerForm.proposedStartDate}
                  onChange={(e) => setOfferForm({ ...offerForm, proposedStartDate: e.target.value })}
                />
                <span className="text-[11px] text-slate-500 mt-1 block">Expected first working day</span>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Offer Expiry Date *</label>
                <Input
                  type="date"
                  required
                  min={new Date().toISOString().split('T')[0]}
                  max={offerForm.proposedStartDate || undefined}
                  value={offerForm.offerExpiryDate}
                  onChange={(e) => setOfferForm({ ...offerForm, offerExpiryDate: e.target.value })}
                />
                <span className="text-[11px] text-slate-500 mt-1 block">Candidate acceptance deadline</span>
              </div>
            </div>

            {/* Live Date Ordering Check */}
            {offerForm.offerExpiryDate &&
              offerForm.proposedStartDate &&
              offerForm.offerExpiryDate > offerForm.proposedStartDate && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold block">Invalid Date Order</span>
                    Offer expiry date (deadline for candidate acceptance) cannot be after proposed start date.
                  </div>
                </div>
              )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Offer Terms / Notes</label>
              <textarea
                value={offerForm.notes}
                onChange={(e) => setOfferForm({ ...offerForm, notes: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                rows={3}
                placeholder="Allowances, probationary terms, joining incentives..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setIsOfferModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={
                  actionLoading ||
                  !selectedApplication ||
                  Boolean(
                    selectedApplication?.vacancy?.budgetMax &&
                    Number(offerForm.offeredSalary) > Number(selectedApplication.vacancy.budgetMax),
                  ) ||
                  Boolean(
                    offerForm.offerExpiryDate &&
                    offerForm.proposedStartDate &&
                    offerForm.offerExpiryDate > offerForm.proposedStartDate,
                  )
                }
              >
                {actionLoading ? 'Preparing...' : 'Prepare Draft Offer'}
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
        <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 pb-3 mb-4 border-b border-slate-100 pr-10">
          <h2 className="text-xl font-bold text-slate-900">Review Job Offer — {selectedOffer?.businessId}</h2>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-1 space-y-4">
          <form onSubmit={handleReviewOffer} className="space-y-4">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-sm space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 font-semibold uppercase block text-[11px]">Candidate</span>
                  <span className="font-semibold text-slate-900">{selectedOffer?.application?.candidate?.fullName || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold uppercase block text-[11px]">Requisition</span>
                  <span className="font-semibold text-slate-900">{selectedOffer?.roleTitle}</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                <span className="text-slate-600 text-xs font-medium">Proposed Compensation:</span>
                <span className="font-semibold text-slate-900">
                  {selectedOffer?.currency} {Number(selectedOffer?.offeredSalary).toLocaleString()} /{selectedOffer?.salaryPeriod?.toLowerCase() || 'yr'}
                </span>
              </div>
              <div className="text-xs flex justify-between items-center text-slate-500">
                <span>Requested By:</span>
                <span>
                  {selectedOffer?.requestedBy?.employee
                    ? `${selectedOffer.requestedBy.employee.firstName} ${selectedOffer.requestedBy.employee.lastName}`
                    : (selectedOffer?.requestedBy?.email || 'Recruiter')}
                </span>
              </div>
            </div>

            {/* Anti-Self-Approval Enforcement Check */}
            {user?.id && (selectedOffer?.requestedById === user.id || selectedOffer?.lastModifiedById === user.id) && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-semibold block">Anti-Self-Approval Governance Enforced</span>
                  You created or modified this job offer. Under EL SCORE OS governance policy, an independent authorized manager must review and approve this offer. You cannot self-approve.
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Decision *</label>
              <select
                value={reviewOfferForm.action}
                onChange={(e) => setReviewOfferForm({ ...reviewOfferForm, action: e.target.value as any })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
              >
                <option value="APPROVE">Approve Job Offer</option>
                <option value="REJECT">Reject Job Offer (Revert to Draft)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                {reviewOfferForm.action === 'REJECT' ? 'Rejection Rationale *' : 'Approval Notes'}
              </label>
              <textarea
                required={reviewOfferForm.action === 'REJECT'}
                value={reviewOfferForm.approvalNotes}
                onChange={(e) => setReviewOfferForm({ ...reviewOfferForm, approvalNotes: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                rows={3}
                placeholder={reviewOfferForm.action === 'REJECT' ? 'Mandatory reason for rejecting this offer...' : 'Optional approval notes...'}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setIsReviewOfferModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={reviewOfferForm.action === 'APPROVE' ? 'primary' : 'danger'}
                disabled={
                  actionLoading ||
                  (reviewOfferForm.action === 'APPROVE' &&
                    Boolean(
                      user?.id &&
                      (selectedOffer?.requestedById === user.id || selectedOffer?.lastModifiedById === user.id),
                    ))
                }
              >
                {actionLoading ? 'Processing...' : 'Confirm Decision'}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Modal: Job Offer Details & Version Audit Trail */}
      <Modal
        isOpen={isOfferDetailsModalOpen}
        onClose={() => setIsOfferDetailsModalOpen(false)}
        size="lg"
      >
        <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 pb-3 mb-4 border-b border-slate-100 pr-10">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">Job Offer Details — {detailedOffer?.businessId}</h2>
            {detailedOffer && <StatusBadge status={detailedOffer.status} />}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Version {detailedOffer?.version || 1} &bull; Controlled compensation terms and lifecycle history.
          </p>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-1 space-y-6 text-sm">
          {/* Candidate & Position Grid */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs">
            <div>
              <span className="text-slate-500 uppercase font-semibold block text-[11px]">Candidate</span>
              <span className="font-semibold text-slate-900 text-sm block">
                {detailedOffer?.application?.candidate?.fullName || '—'}
              </span>
              <span className="text-slate-600">{detailedOffer?.application?.candidate?.email}</span>
              <span className="text-slate-500 block">{detailedOffer?.application?.candidate?.phone || 'No phone'}</span>
            </div>
            <div>
              <span className="text-slate-500 uppercase font-semibold block text-[11px]">Target Requisition</span>
              <span className="font-semibold text-slate-900 text-sm block">{detailedOffer?.roleTitle}</span>
              <span className="text-slate-600 block">
                {detailedOffer?.vacancy?.businessId} — {detailedOffer?.vacancy?.department?.name || 'Department'}
              </span>
              <span className="text-emerald-700 block mt-1">
                Approved Budget Cap: {detailedOffer?.vacancy?.budgetMax ? `${Number(detailedOffer.vacancy.budgetMax).toLocaleString()} ${detailedOffer.vacancy.currency || detailedOffer?.currency}` : 'No Cap'}
              </span>
            </div>
          </div>

          {/* Compensation & Terms */}
          <div className="p-4 border border-slate-200 rounded-lg space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 text-brand-600" />
              Compensation & Position Terms
            </h3>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 bg-slate-50 rounded">
                <span className="text-slate-500 block">Offered Salary</span>
                <span className="font-semibold text-slate-900 text-sm">
                  {detailedOffer?.currency} {Number(detailedOffer?.offeredSalary).toLocaleString()}
                </span>
                <span className="text-slate-400 block text-[10px]">Per {detailedOffer?.salaryPeriod?.toLowerCase() || 'year'}</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded">
                <span className="text-slate-500 block">Employment Type</span>
                <span className="font-semibold text-slate-900">{detailedOffer?.employmentType}</span>
                <span className="text-slate-400 block text-[10px]">Work Mode: {detailedOffer?.workMode}</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded">
                <span className="text-slate-500 block">Work Location</span>
                <span className="font-semibold text-slate-900">{detailedOffer?.location || 'Unspecified'}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs pt-1">
              <div className="p-2.5 bg-slate-50 rounded flex justify-between items-center">
                <span className="text-slate-500">Proposed Start Date:</span>
                <span className="font-semibold text-slate-900">{detailedOffer?.proposedStartDate}</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded flex justify-between items-center">
                <span className="text-slate-500">Offer Expiry Date:</span>
                <span className="font-semibold text-slate-900">{detailedOffer?.offerExpiryDate}</span>
              </div>
            </div>

            {detailedOffer?.notes && (
              <div className="p-2.5 bg-slate-50 rounded text-xs text-slate-700">
                <span className="font-semibold block text-slate-600 mb-0.5">Offer Terms & Notes:</span>
                <p className="whitespace-pre-line">{detailedOffer.notes}</p>
              </div>
            )}
          </div>

          {/* Governance & Approvals */}
          <div className="p-4 border border-slate-200 rounded-lg space-y-2 text-xs">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-brand-600" />
              Governance & Approvals
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-slate-500 block">Requested By:</span>
                <span className="font-semibold text-slate-900">
                  {detailedOffer?.requestedBy?.employee
                    ? `${detailedOffer.requestedBy.employee.firstName} ${detailedOffer.requestedBy.employee.lastName}`
                    : (detailedOffer?.requestedBy?.email || detailedOffer?.requestedById)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Approved By:</span>
                <span className="font-semibold text-slate-900">
                  {detailedOffer?.approvedBy?.employee
                    ? `${detailedOffer.approvedBy.employee.firstName} ${detailedOffer.approvedBy.employee.lastName}`
                    : (detailedOffer?.approvedBy?.email || (detailedOffer?.approvedAt ? 'Approved' : 'Pending Management Approval'))}
                </span>
                {detailedOffer?.approvedAt && (
                  <span className="text-slate-400 block text-[10px]">
                    {new Date(detailedOffer.approvedAt).toLocaleString()}
                  </span>
                )}
              </div>
            </div>

            {detailedOffer?.approvalNotes && (
              <div className="mt-2 p-2 bg-slate-50 rounded text-slate-700">
                <span className="font-semibold text-slate-600">Approval Notes: </span>
                {detailedOffer.approvalNotes}
              </div>
            )}
            {detailedOffer?.declineReason && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-800">
                <span className="font-semibold">Candidate Decline Reason: </span>
                {detailedOffer.declineReason}
              </div>
            )}
          </div>

          {/* Version Audit Trail */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <History className="w-4 h-4 text-brand-600" />
              Version Snapshot History ({detailedOffer?.versions?.length || 0})
            </h3>
            {(!detailedOffer?.versions || detailedOffer.versions.length === 0) ? (
              <p className="text-xs text-slate-500 italic">Initial version snapshot recorded.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {detailedOffer.versions.map((v: any) => (
                  <div key={v.id} className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
                    <div className="flex justify-between items-center font-medium">
                      <span>Version {v.version} — <span className="font-mono text-brand-600">{v.action}</span></span>
                      <StatusBadge status={v.status} />
                    </div>
                    <div className="text-slate-500 flex justify-between">
                      <span>Salary: {v.currency} {Number(v.offeredSalary).toLocaleString()}</span>
                      <span>
                        Actor: {v.actor?.employee ? `${v.actor.employee.firstName} ${v.actor.employee.lastName}` : (v.actor?.email || 'System')}
                      </span>
                    </div>
                    {v.notes && <p className="text-slate-600 italic mt-0.5">{v.notes}</p>}
                    <span className="text-[10px] text-slate-400 block">
                      {new Date(v.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <Button variant="outline" onClick={() => setIsOfferDetailsModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Record Candidate Response */}
      <Modal
        isOpen={isResponseModalOpen}
        onClose={() => setIsResponseModalOpen(false)}
      >
        <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 pb-3 mb-4 border-b border-slate-100 pr-10">
          <h2 className="text-xl font-bold text-slate-900">Record Candidate Response — {selectedOffer?.businessId}</h2>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-1 space-y-4">
          <form onSubmit={handleRecordResponse} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Candidate Response *</label>
              <select
                value={responseForm.decision}
                onChange={(e) => setResponseForm({ ...responseForm, decision: e.target.value as any })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
              >
                <option value="ACCEPT">Accepted (Ready for Phase 6 Onboarding)</option>
                <option value="DECLINE">Declined</option>
              </select>
            </div>

            {responseForm.decision === 'DECLINE' ? (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-red-700 mb-1.5">Decline Reason *</label>
                <textarea
                  required
                  value={responseForm.declineReason}
                  onChange={(e) => setResponseForm({ ...responseForm, declineReason: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-red-300 rounded-lg text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 shadow-sm"
                  rows={3}
                  placeholder="Reason provided by candidate for declining..."
                />
              </div>
            ) : (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                Note: Marking this offer as ACCEPTED establishes a handoff marker for Phase 6 Onboarding. It does not automatically create an employee account or payroll record.
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Response Remarks</label>
              <Input
                value={responseForm.responseNotes}
                onChange={(e) => setResponseForm({ ...responseForm, responseNotes: e.target.value })}
                placeholder="e.g. Candidate signed and acknowledged joining terms"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
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
        <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 pb-3 mb-4 border-b border-slate-100 pr-10">
          <h2 className="text-xl font-bold text-slate-900">Withdraw Job Offer — {selectedOffer?.businessId}</h2>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-1 space-y-4">
          <form onSubmit={handleWithdrawOffer} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-red-700 mb-1.5">Withdrawal Reason *</label>
              <textarea
                required
                value={withdrawForm.withdrawalReason}
                onChange={(e) => setWithdrawForm({ withdrawalReason: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-red-300 rounded-lg text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 shadow-sm"
                rows={3}
                placeholder="Organizational reason for withdrawing this offer..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
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
        <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 pb-3 mb-4 border-b border-slate-100 pr-10">
          <h2 className="text-xl font-bold text-slate-900">Revise Job Offer — {selectedOffer?.businessId}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Creating a revision archives version {selectedOffer?.version} and generates version {((selectedOffer?.version || 1) + 1)} in DRAFT status.
          </p>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-1 space-y-4">
          <form onSubmit={handleReviseOffer} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Revised Salary Amount *</label>
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
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Currency *</label>
                <select
                  value={reviseOfferForm.currency}
                  onChange={(e) => setReviseOfferForm({ ...reviseOfferForm, currency: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                >
                  <option value="INR">INR</option>
                  <option value="AED">AED</option>
                  <option value="USD">USD</option>
                  <option value="SAR">SAR</option>
                </select>
              </div>
            </div>

            {/* Live Budget Cap Enforcement Warning */}
            {selectedOffer?.vacancy?.budgetMax &&
              Number(reviseOfferForm.offeredSalary) > Number(selectedOffer.vacancy.budgetMax) && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold block">Salary Cap Exceeded</span>
                    Revised salary ({Number(reviseOfferForm.offeredSalary).toLocaleString()} {reviseOfferForm.currency}) exceeds approved vacancy budget maximum ({Number(selectedOffer.vacancy.budgetMax).toLocaleString()} {selectedOffer.vacancy.currency || reviseOfferForm.currency}).
                  </div>
                </div>
              )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Proposed Start Date *</label>
                <Input
                  type="date"
                  required
                  min={new Date().toISOString().split('T')[0]}
                  value={reviseOfferForm.proposedStartDate}
                  onChange={(e) => setReviseOfferForm({ ...reviseOfferForm, proposedStartDate: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Offer Expiry Date *</label>
                <Input
                  type="date"
                  required
                  min={new Date().toISOString().split('T')[0]}
                  max={reviseOfferForm.proposedStartDate || undefined}
                  value={reviseOfferForm.offerExpiryDate}
                  onChange={(e) => setReviseOfferForm({ ...reviseOfferForm, offerExpiryDate: e.target.value })}
                />
              </div>
            </div>

            {/* Live Date Ordering Check */}
            {reviseOfferForm.offerExpiryDate &&
              reviseOfferForm.proposedStartDate &&
              reviseOfferForm.offerExpiryDate > reviseOfferForm.proposedStartDate && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold block">Invalid Date Order</span>
                    Offer expiry date cannot be after proposed start date.
                  </div>
                </div>
              )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">Revision Notes / Renegotiation Terms</label>
              <textarea
                value={reviseOfferForm.notes}
                onChange={(e) => setReviseOfferForm({ ...reviseOfferForm, notes: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                rows={3}
                placeholder="Details of renegotiated compensation or terms..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setIsReviseOfferModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={
                  actionLoading ||
                  Boolean(
                    selectedOffer?.vacancy?.budgetMax &&
                    Number(reviseOfferForm.offeredSalary) > Number(selectedOffer.vacancy.budgetMax),
                  ) ||
                  Boolean(
                    reviseOfferForm.offerExpiryDate &&
                    reviseOfferForm.proposedStartDate &&
                    reviseOfferForm.offerExpiryDate > reviseOfferForm.proposedStartDate,
                  )
                }
              >
                Submit Revision
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
