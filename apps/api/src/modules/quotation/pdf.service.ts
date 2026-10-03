import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');

@Injectable()
export class PdfService {
  async generateQuotationPdf(quotation: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4', compress: false });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const currency = quotation.currency || 'AED';

      doc.fontSize(22).font('Helvetica-Bold').text('EL SCORE ACADEMY', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(16).font('Helvetica').text('QUOTATION', { align: 'center' });
      doc.moveDown();

      doc.fontSize(10).text(`Quotation Number: ${quotation.quotationNumber}`);
      doc.text(`Date: ${new Date(quotation.quotationDate).toLocaleDateString()}`);
      doc.moveDown(1.5);

      doc.fontSize(12).font('Helvetica-Bold').text('PREPARED FOR');
      doc.fontSize(10).font('Helvetica');
      doc.text(`Parent/Guardian: ${quotation.parentName || 'Unavailable'}`);
      doc.text(`Phone: ${quotation.parentPhone || 'Unavailable'}`);
      if (quotation.parentEmail) {
        doc.text(`Email: ${quotation.parentEmail}`);
      }
      doc.moveDown();

      doc.fontSize(12).font('Helvetica-Bold').text('STUDENT');
      doc.fontSize(10).font('Helvetica');
      doc.text(`Student: ${quotation.studentName || 'Unavailable'}`);
      doc.text(`Curriculum: ${quotation.curriculumName || 'Unavailable'}`);
      doc.text(`Grade: ${quotation.gradeName || 'Unavailable'}`);
      doc.moveDown(1.5);

      doc.fontSize(12).font('Helvetica-Bold').text('SUBJECTS & PRICING');
      doc.moveDown(0.5);

      let y = doc.y;
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('Subject', 50, y, { width: 100 });
      doc.text('Curriculum', 150, y, { width: 60 });
      doc.text('Grade', 210, y, { width: 60 });
      doc.text('Hours/Mo', 270, y, { width: 50 });
      doc.text('Rate', 330, y, { width: 50 });
      doc.text('Source', 380, y, { width: 100 });
      doc.text('Total', 480, y, { width: 60, align: 'right' });

      doc.moveTo(50, y + 15).lineTo(540, y + 15).stroke();
      doc.y = y + 20;

      const getSourceLabel = (s: string) => {
        if (s === 'SLAB') return 'General Pricing Slab';
        if (s === 'EXCEPTIONAL_SUBJECT') return 'Exceptional Subject Rate';
        return s || '-';
      };

      doc.font('Helvetica');
      quotation.lineItems.forEach((item: any) => {
        const itemY = doc.y;
        const displayRate =
          item.appliedOfferHourlyRate !== null && item.appliedOfferHourlyRate !== undefined
            ? item.appliedOfferHourlyRate
            : item.originalHourlyRate;
        const total =
          item.offerMonthlyAmount !== null && item.offerMonthlyAmount !== undefined
            ? item.offerMonthlyAmount
            : item.normalMonthlyAmount;

        doc.text(item.subjectName || '-', 50, itemY, { width: 100 });
        doc.text(item.curriculumName || '-', 150, itemY, { width: 60 });
        doc.text(item.gradeName || '-', 210, itemY, { width: 60 });
        doc.text(String(item.monthlyHours || '-'), 270, itemY, { width: 50 });
        doc.text(`${currency} ${displayRate}/hr`, 330, itemY, { width: 70 });
        doc.text(getSourceLabel(item.pricingSource), 400, itemY, { width: 80 });
        doc.text(`${currency} ${total}`, 480, itemY, { width: 60, align: 'right' });
        doc.moveDown();
      });

      doc.moveDown();

      doc.fontSize(12).font('Helvetica-Bold').text('FINANCIAL SUMMARY');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Normal Monthly Tuition: ${currency} ${quotation.normalMonthlyTotal}`);

      if (quotation.offerHourlyRate) {
        doc.text(`Offer Monthly Tuition: ${currency} ${quotation.offerMonthlyTotal}`);
        doc.text(`Savings Amount: ${currency} ${quotation.savingAmount}`);
        doc.text(`Savings Percentage: ${Number(quotation.savingPercentage).toFixed(2)}%`);
      }

      doc.moveDown();
      doc.text(`Registration Fee (One-Time): ${currency} ${quotation.registrationFee}`);

      doc.moveDown();
      doc.fontSize(14).font('Helvetica-Bold').text(`INITIAL AMOUNT DUE: ${currency} ${quotation.totalAmountDue}`);
      doc.moveDown(2);

      if (quotation.quotationNotes) {
        doc.fontSize(12).font('Helvetica-Bold').text('NOTES');
        doc.fontSize(10).font('Helvetica');
        doc.moveDown(0.5);
        doc.text(quotation.quotationNotes);
        doc.moveDown(2);
      }

      doc.fontSize(10).font('Helvetica-Bold').text('Bank Account Details:');
      doc.font('Helvetica');
      doc.text(`Account Holder Name: ${quotation.accountHolderName || 'Unavailable'}`);
      doc.text(`Bank Name: ${quotation.bankName || 'Unavailable'}`);
      doc.text(`Account Number: ${quotation.accountNumber || 'Unavailable'}`);
      doc.text(`IBAN: ${quotation.iban || 'Unavailable'}`);
      doc.text(`Currency: ${currency}`);

      doc.end();
    });
  }
}
