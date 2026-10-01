import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');

@Injectable()
export class PdfService {
  async generateQuotationPdf(quotation: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('EL SCORE ACADEMY', { align: 'center' });
      doc.moveDown();
      doc.fontSize(14).text('QUOTATION', { align: 'center' });
      doc.moveDown();
      
      doc.fontSize(10).text(`Quotation Number: ${quotation.quotationNumber}`);
      doc.text(`Date: ${new Date(quotation.quotationDate).toLocaleDateString()}`);
      doc.moveDown();

      // Customer
      doc.fontSize(12).text('PREPARED FOR:');
      doc.fontSize(10).text(`Student Name: ${quotation.studentName}`);
      doc.text(`Curriculum: ${quotation.curriculumName}`);
      doc.text(`Grade: ${quotation.gradeName}`);
      doc.moveDown();

      // Subjects
      doc.fontSize(12).text('SUBJECTS & PRICING:');
      doc.moveDown(0.5);
      
      let y = doc.y;
      doc.text('Subject', 50, y, { width: 150 });
      doc.text('Hours/Mo', 200, y, { width: 100 });
      doc.text('Rate', 300, y, { width: 100 });
      doc.text('Total', 400, y, { width: 100 });
      
      doc.moveTo(50, y + 15).lineTo(500, y + 15).stroke();
      doc.y = y + 20;

      quotation.lineItems.forEach((item: any) => {
        const itemY = doc.y;
        doc.text(item.subjectName, 50, itemY, { width: 150 });
        doc.text(item.monthlyHours.toString(), 200, itemY, { width: 100 });
        doc.text(`${quotation.currency} ${item.originalHourlyRate}`, 300, itemY, { width: 100 });
        doc.text(`${quotation.currency} ${item.normalMonthlyAmount}`, 400, itemY, { width: 100 });
        doc.moveDown();
      });

      doc.moveDown();

      // Totals
      doc.fontSize(12).text('SUMMARY:');
      doc.fontSize(10);
      doc.text(`Normal Monthly Total: ${quotation.currency} ${quotation.normalMonthlyTotal}`);
      
      if (quotation.offerHourlyRate) {
        doc.text(`Special Offer Rate: ${quotation.currency} ${quotation.offerHourlyRate}/hr`);
        doc.text(`Offer Monthly Total: ${quotation.currency} ${quotation.offerMonthlyTotal}`);
        doc.text(`Total Savings: ${quotation.currency} ${quotation.savingAmount} (${Number(quotation.savingPercentage).toFixed(2)}%)`);
      }

      doc.moveDown();
      doc.text(`Registration Fee (One-Time): ${quotation.currency} ${quotation.registrationFee}`);
      
      doc.moveDown();
      doc.fontSize(14).text(`TOTAL AMOUNT DUE: ${quotation.currency} ${quotation.totalAmountDue}`, { underline: true });
      doc.moveDown(2);

      // Footer
      doc.fontSize(10).text('Bank Account Details:', { underline: true });
      doc.text('Bank Name: El Score Bank');
      doc.text('Account Name: El Score Academy');
      doc.text('IBAN: AE00000000000000000000');
      
      doc.end();
    });
  }
}
