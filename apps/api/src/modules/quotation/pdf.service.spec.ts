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

  const snapshot = (overrides: Record<string, unknown> = {}) => ({
    quotationNumber: 'QUO-1001',
    quotationDate: new Date('2026-10-03T00:00:00.000Z'),
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
    ...overrides,
  });

  it('renders the complete historical snapshot without recalculating financial values', async () => {
    const mockQuotation = snapshot({
      gradeName: 'Grade 5',
      normalMonthlyTotal: 777,
      offerMonthlyTotal: 555,
      registrationFee: 123,
      totalAmountDue: 678,
      lineItems: [
        {
          subjectName: 'Economics',
          curriculumName: 'CBSE',
          gradeName: 'Grade 5',
          monthlyHours: 7,
          originalHourlyRate: 123,
          appliedOfferHourlyRate: 90,
          normalMonthlyAmount: 777,
          offerMonthlyAmount: 555,
          pricingSource: 'SLAB',
        },
      ],
    });

    const buffer = await service.generateQuotationPdf(mockQuotation);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    const pdfText = decodePdfText(buffer);
    expect(buffer.toString('utf8', 0, 8)).toContain('%PDF-');
    expect(pdfText).toContain('Jane Doe');
    expect(pdfText).toContain('Grade 5');
    expect(pdfText).toContain('Economics');
    expect(pdfText).toContain('AED 123.00');
    expect(pdfText).toContain('AED 777.00');
    expect(pdfText).toContain('AED 90.00 / Hour');
    expect(pdfText).toContain('AED 555.00 / Month');
    expect(pdfText).toContain('AED 123.00');
    expect(pdfText).toContain('AED 678.00');
    expect(pdfText).not.toContain('AED 861.00');
    expect(pdfText).not.toContain('AED 630.00');
    expect(pdfText).toContain('Snapshot Holder');
    expect(pdfText).toContain('Snapshot Bank');
    expect(pdfText).toContain('AESNAPSHOT');
  });

  it('omits the Special Offer card when the saved quotation has no offer', async () => {
    const buffer = await service.generateQuotationPdf(
      snapshot({
        offerHourlyRate: null,
        offerMonthlyTotal: null,
        savingAmount: 0,
        savingPercentage: 0,
        totalAmountDue: 1200,
        lineItems: [
          {
            subjectName: 'Economics',
            curriculumName: 'CBSE',
            gradeName: 'Grade 5',
            monthlyHours: 15,
            originalHourlyRate: 11,
            appliedOfferHourlyRate: null,
            normalMonthlyAmount: 165,
            offerMonthlyAmount: null,
            pricingSource: 'SLAB',
          },
        ],
      }),
    );

    const pdfText = decodePdfText(buffer);
    expect(pdfText).not.toContain('SPECIAL OFFER');
    expect(pdfText).toContain('AED 11.00 / Hour');
    expect(pdfText).toContain('AED 1,000.00 / Month');
  });

  it('wraps long snapshotted account details and paginates intentionally', async () => {
    const longIban = `AE12${'1234567890'.repeat(12)}`;
    const manyItems = Array.from({ length: 40 }, (_, index) => ({
      subjectName: `Snapshot Subject ${index + 1}`,
      curriculumName: 'CBSE',
      gradeName: 'Grade 10',
      monthlyHours: 10,
      originalHourlyRate: index + 50,
      appliedOfferHourlyRate: null,
      normalMonthlyAmount: index + 500,
      offerMonthlyAmount: null,
      pricingSource: 'SLAB',
    }));

    const buffer = await service.generateQuotationPdf(
      snapshot({
        offerHourlyRate: null,
        offerMonthlyTotal: null,
        iban: longIban,
        accountHolderName: 'A Very Long Snapshotted Account Holder Name That Must Wrap Without Colliding',
        lineItems: manyItems,
      }),
    );
    const pdfText = decodePdfText(buffer);

    expect(pdfText).toContain(longIban);
    expect(pdfText).toContain('ACCOUNT DETAILS');
    expect(pdfText).toContain('PACKAGE OPTIONS');
    expect(pdfText).toContain('CONTINUED');
    expect(pdfText).toContain('Snapshot Subject 40');
    expect((buffer.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length).toBeGreaterThan(1);
  });
});
