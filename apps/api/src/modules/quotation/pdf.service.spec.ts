import { Test, TestingModule } from '@nestjs/testing';

import { PdfService } from './pdf.service';

function decodePdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  return [...raw.matchAll(/<([0-9A-Fa-f]+)>/g)]
    .map((match) => Buffer.from(match[1], 'hex').toString('latin1'))
    .join('');
}

describe('PdfService', () => {
  let service: PdfService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfService],
    }).compile();

    service = module.get<PdfService>(PdfService);
  });

  it('should generate a PDF buffer for a historical snapshot', async () => {
    const mockQuotation = {
      quotationNumber: 'QUO-1001',
      quotationDate: new Date(),
      parentName: 'John Doe',
      parentPhone: '+971501234567',
      parentEmail: null,
      studentName: 'Jane Doe',
      curriculumName: 'CBSE',
      gradeName: 'Grade 10',
      currency: 'AED',
      normalMonthlyTotal: 1000,
      offerHourlyRate: 90,
      offerMonthlyTotal: 900,
      savingAmount: 100,
      savingPercentage: 10,
      registrationFee: 200,
      totalAmountDue: 1100,
      quotationNotes: 'Special discount applied.',
      accountHolderName: 'Snapshot Holder',
      bankName: 'Snapshot Bank',
      accountNumber: '999',
      iban: 'AESNAPSHOT',
      lineItems: [
        {
          subjectName: 'Math',
          curriculumName: 'CBSE',
          gradeName: 'Grade 10',
          monthlyHours: 10,
          originalHourlyRate: 120,
          appliedOfferHourlyRate: 90,
          normalMonthlyAmount: 1200,
          offerMonthlyAmount: 900,
          pricingSource: 'SLAB',
        },
      ],
    };

    const buffer = await service.generateQuotationPdf(mockQuotation);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    const pdfText = decodePdfText(buffer);
    expect(buffer.toString('utf8', 0, 8)).toContain('%PDF-');
    expect(pdfText).toContain('AED 90/hr');
    expect(pdfText).not.toContain('AED 120/hr');
    expect(pdfText).toContain('Snapshot Holder');
    expect(pdfText).toContain('Snapshot Bank');
    expect(pdfText).toContain('AESNAPSHOT');
  });
});
