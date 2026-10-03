"use client";

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { previewQuotationAction, generateQuotationAction } from '../../actions';
import { useDebounce } from '@/hooks/use-debounce';

export function GenerateQuotationDialog({
  student,
  lead,
  isOpen,
  onClose,
  onSuccess,
  onAddRequirement,
  onEditRequirement,
}: {
  student: any;
  lead: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (quotationId: string) => void;
  onAddRequirement: () => void;
  onEditRequirement: (req: any) => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [fetchingPreview, setFetchingPreview] = React.useState(true);
  const [offerRateInput, setOfferRateInput] = React.useState<string>('');
  const [quotationNotes, setQuotationNotes] = React.useState<string>('');
  
  const debouncedOfferRate = useDebounce(offerRateInput, 500);
  const debouncedNotes = useDebounce(quotationNotes, 500);
  
  const [previewData, setPreviewData] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen && student) {
      fetchPreview(student.id, debouncedOfferRate ? Number(debouncedOfferRate) : undefined, debouncedNotes);
    }
  }, [isOpen, student, debouncedOfferRate, debouncedNotes]);

  const fetchPreview = async (studentId: string, offerRate?: number, notes?: string) => {
    setFetchingPreview(true);
    setError(null);
    try {
      const res = await previewQuotationAction(studentId, offerRate, notes);
      if (res.error) {
        setError(res.error);
        setPreviewData(null);
      } else {
        setPreviewData(res.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to calculate pricing.');
      setPreviewData(null);
    } finally {
      setFetchingPreview(false);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const rate = offerRateInput ? Number(offerRateInput) : undefined;
      const res = await generateQuotationAction(student.id, rate, quotationNotes);
      if (res.error) {
        setError(res.error);
      } else if (res.data && res.data.id) {
        onSuccess(res.data.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate quotation.');
    } finally {
      setLoading(false);
    }
  };

  const parentName = [lead?.firstName, lead?.lastName].filter(Boolean).join(' ').trim() || 'Unavailable';
  const parentPhone = lead?.primaryPhone || 'Unavailable';
  const curriculumName = previewData?.curriculumName || null;
  const gradeName = previewData?.gradeName || null;

  const getSourceLabel = (source: string) => {
    if (source === 'SLAB') return 'General Pricing Slab';
    if (source === 'EXCEPTIONAL_SUBJECT') return 'Exceptional Subject Rate';
    return source;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="flex justify-between items-start mb-6 border-b border-slate-200 pb-4">
        <h2 className="text-2xl font-bold text-slate-900">Quotation Builder</h2>
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 text-red-700 border border-red-200 rounded-md text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          
          {/* Customer / Student Presentation */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">PREPARED FOR</h3>
              <p className="text-sm"><span className="font-medium text-slate-700">Parent/Guardian:</span> {parentName}</p>
              <p className="text-sm"><span className="font-medium text-slate-700">Phone:</span> {parentPhone}</p>
              <p className="text-sm"><span className="font-medium text-slate-700">Email:</span> N/A</p>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">STUDENT</h3>
              <p className="text-sm"><span className="font-medium text-slate-700">Student:</span> {student?.firstName} {student?.lastName}</p>
              <p className="text-sm"><span className="font-medium text-slate-700">Curriculum:</span> {curriculumName || 'Pending validation'}</p>
              <p className="text-sm"><span className="font-medium text-slate-700">Grade:</span> {gradeName || 'Pending validation'}</p>
            </div>
          </div>

          {/* Subjects / Requirements */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-semibold text-slate-800 uppercase tracking-wider text-sm">SUBJECTS / REQUIREMENTS</h3>
              <Button variant="outline" size="sm" onClick={onAddRequirement}>+ Add Subject</Button>
            </div>
            
            <div className="p-4 space-y-4">
              {student?.requirements?.length > 0 ? (
                student.requirements.map((req: any) => {
                  const lineItem = previewData?.lineItems?.find((item: any) => item.subjectId === req.subjectId);
                  
                  return (
                    <div key={req.id} className="p-4 border border-slate-100 bg-slate-50 rounded-lg">
                      <div className="flex justify-between items-start mb-3 border-b border-slate-200 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{req.subject?.name}</span>
                          <Badge variant="info">{req.curriculum?.name || 'No Curr'}</Badge>
                          <Badge variant="info">{req.grade?.name || 'No Grade'}</Badge>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => onEditRequirement(req)}>Edit</Button>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                        <div>
                          <p className="text-slate-500 text-xs mb-1 uppercase tracking-wider">Monthly Hours</p>
                          <p className="font-semibold">{req.monthlyHours} hours</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1 uppercase tracking-wider">Normal Hourly Rate</p>
                          <p className="font-semibold">
                            {lineItem ? `AED ${lineItem.originalHourlyRate}` : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1 uppercase tracking-wider">Pricing Source</p>
                          <p className="font-semibold text-brand-600">
                            {lineItem ? getSourceLabel(lineItem.pricingSource) : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1 uppercase tracking-wider">Monthly Amount</p>
                          <p className="font-semibold text-brand-700">
                            {lineItem ? `AED ${lineItem.normalMonthlyAmount}` : '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-slate-500 italic text-sm">
                  No subjects added yet. Please add a subject to calculate pricing.
                </div>
              )}
            </div>
          </div>
          
          {/* Offer & Notes Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
              <h3 className="font-semibold text-slate-800 mb-3">Special Offer</h3>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Offer Hourly Rate (AED)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="w-full p-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                  value={offerRateInput}
                  onChange={e => setOfferRateInput(e.target.value)}
                  placeholder="Leave blank for normal pricing"
                />
                <p className="text-xs text-slate-500">Applies a flat hourly rate to all subjects.</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
              <h3 className="font-semibold text-slate-800 mb-3">Customer Notes</h3>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Quotation Notes (Customer Facing)</label>
                <textarea
                  className="w-full h-[68px] p-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                  value={quotationNotes}
                  onChange={e => setQuotationNotes(e.target.value)}
                  placeholder="Add notes to appear on the PDF..."
                />
              </div>
            </div>
          </div>
        </div>
        
        {/* Summary Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-slate-900 text-white rounded-lg shadow-sm p-5 sticky top-6">
            <h3 className="font-bold text-lg mb-4 text-slate-100 border-b border-slate-700 pb-2">Quotation Summary</h3>
            
            {fetchingPreview ? (
              <div className="py-8 text-center text-slate-400 text-sm animate-pulse">
                Calculating...
              </div>
            ) : previewData ? (
              <div className="space-y-4 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Normal Monthly Tuition</span>
                  <span className="font-semibold">AED {previewData.normalMonthlyTotal}</span>
                </div>
                
                {previewData.offerHourlyRate && (
                  <>
                    <div className="flex justify-between items-center text-green-400">
                      <span>Offer Hourly Rate</span>
                      <span className="font-semibold">AED {previewData.offerHourlyRate}/hour</span>
                    </div>
                    <div className="flex justify-between items-center text-green-400">
                      <span>Offer Monthly Tuition</span>
                      <span className="font-semibold">AED {previewData.offerMonthlyTotal}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-slate-700 pt-2 text-green-300">
                      <span>Savings Amount</span>
                      <span className="font-bold">AED {previewData.savingAmount}</span>
                    </div>
                    <div className="flex justify-between items-center text-green-300">
                      <span>Savings Percentage</span>
                      <span className="font-bold">{previewData.savingPercentage.toFixed(2)}%</span>
                    </div>
                  </>
                )}
                
                <div className="flex justify-between items-center border-t border-slate-700 pt-3">
                  <span className="text-slate-300">Registration Fee</span>
                  <span className="font-semibold">AED {previewData.registrationFee}</span>
                </div>
                
                <div className="flex justify-between items-center border-t border-slate-700 pt-4 mt-2">
                  <span className="font-bold text-base text-white">INITIAL AMOUNT DUE</span>
                  <span className="font-bold text-xl text-brand-400">AED {previewData.totalAmountDue}</span>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-sm">
                Add subjects to see summary.
              </div>
            )}
            
            <div className="mt-8 space-y-3">
              <Button 
                className="w-full" 
                size="lg" 
                onClick={handleGenerate}
                disabled={loading || fetchingPreview || !previewData || student?.requirements?.length === 0}
              >
                {loading ? 'Generating...' : 'Finalize & Generate'}
              </Button>
              <Button 
                variant="outline" 
                className="w-full text-slate-900 bg-white hover:bg-slate-100" 
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
            
            <p className="text-xs text-slate-400 text-center mt-4">
              Generating will create an immutable snapshot.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
