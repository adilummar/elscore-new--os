import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');

const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 42,
  bottom: 80,
};

const COLORS = {
  ink: '#0F172A',
  muted: '#64748B',
  line: '#E2E8F0',
  surface: '#F8FAFC',
  brand: '#1D4ED8',
  brandSoft: '#EFF6FF',
  accent: '#0F766E',
  accentSoft: '#F0FDFA',
  white: '#FFFFFF',
};

@Injectable()
export class PdfService {
  async generateQuotationPdf(quotation: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margin: PAGE.margin,
        size: 'A4',
        compress: false,
        bufferPages: true,
        info: {
          Title: `Quotation ${quotation.quotationNumber}`,
          Author: 'EL SCORE Academy',
          Subject: 'Tuition quotation',
        },
      });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const currency = quotation.currency || 'AED';

      const contentWidth = PAGE.width - PAGE.margin * 2;
      const money = (value: unknown) => `${currency} ${this.formatNumber(value)}`;
      const hasOffer = quotation.offerHourlyRate !== null && quotation.offerHourlyRate !== undefined;
      const lineItems = Array.isArray(quotation.lineItems) ? quotation.lineItems : [];
      const subjectNames = lineItems.map((item: any) => item.subjectName).filter(Boolean).join(', ') || 'Unavailable';

      this.drawHeader(doc, quotation);
      this.drawPreparedFor(doc, quotation, subjectNames);

      this.ensureSpace(doc, 128, quotation);
      this.drawSectionHeading(doc, 'PACKAGE OPTIONS');
      this.drawPackageOptions(doc, quotation, lineItems, money, hasOffer);

      this.ensureSpace(doc, 142, quotation);
      this.drawSectionHeading(doc, 'PAYMENT SUMMARY');
      this.drawPaymentSummary(doc, quotation, money, hasOffer);

      if (quotation.quotationNotes) {
        const notesHeight = doc
          .font('Helvetica')
          .fontSize(9)
          .heightOfString(String(quotation.quotationNotes), { width: contentWidth - 24 });
        this.ensureSpace(doc, notesHeight + 48, quotation);
        this.drawSectionHeading(doc, 'NOTES');
        const notesY = doc.y;
        doc.roundedRect(PAGE.margin, notesY, contentWidth, notesHeight + 20, 6).fill(COLORS.surface);
        doc
          .fillColor(COLORS.ink)
          .font('Helvetica')
          .fontSize(9)
          .text(String(quotation.quotationNotes), PAGE.margin + 12, notesY + 10, {
            width: contentWidth - 24,
            lineGap: 2,
          });
        doc.y = notesY + notesHeight + 30;
      }

      const accountRows = [
        ['Account Holder Name', quotation.accountHolderName || 'Unavailable'],
        ['Bank Name', quotation.bankName || 'Unavailable'],
        ['Account Number', quotation.accountNumber || 'Unavailable'],
        ['IBAN', quotation.iban || 'Unavailable'],
        ['Currency', currency],
      ];
      const accountHeight = this.accountDetailsHeight(doc, accountRows, contentWidth);
      this.ensureSpace(doc, accountHeight + 34, quotation);
      this.drawSectionHeading(doc, 'ACCOUNT DETAILS');
      this.drawAccountDetails(doc, accountRows, contentWidth);

      this.drawFooters(doc);

      doc.end();
    });
  }

  private drawHeader(doc: PDFKit.PDFDocument, quotation: any) {
    const left = PAGE.margin;
    const rightColumn = PAGE.width - PAGE.margin - 180;
    const top = PAGE.margin;

    doc.fillColor(COLORS.brand).font('Helvetica-Bold').fontSize(22).text('EL SCORE', left, top);
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9).text('ACADEMY', left + 2, top + 27, {
      characterSpacing: 2.2,
    });

    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7).text('QUOTATION NO.', rightColumn, top, {
      width: 180,
      align: 'right',
      characterSpacing: 1,
    });
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11).text(quotation.quotationNumber || '-', rightColumn, top + 12, {
      width: 180,
      align: 'right',
    });
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7).text('DATE', rightColumn, top + 32, {
      width: 180,
      align: 'right',
      characterSpacing: 1,
    });
    doc
      .fillColor(COLORS.ink)
      .font('Helvetica')
      .fontSize(9)
      .text(this.formatDate(quotation.quotationDate), rightColumn, top + 44, { width: 180, align: 'right' });

    doc.moveTo(left, top + 64).lineTo(PAGE.width - PAGE.margin, top + 64).lineWidth(1).strokeColor(COLORS.line).stroke();
    doc.y = top + 80;
  }

  private drawContinuationHeader(doc: PDFKit.PDFDocument, quotation: any) {
    doc
      .fillColor(COLORS.brand)
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('EL SCORE ACADEMY', PAGE.margin, PAGE.margin);
    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(8)
      .text(`Quotation ${quotation.quotationNumber}`, PAGE.width - PAGE.margin - 190, PAGE.margin + 2, {
        width: 190,
        align: 'right',
      });
    doc.moveTo(PAGE.margin, PAGE.margin + 22).lineTo(PAGE.width - PAGE.margin, PAGE.margin + 22).strokeColor(COLORS.line).stroke();
    doc.y = PAGE.margin + 36;
  }

  private drawPreparedFor(doc: PDFKit.PDFDocument, quotation: any, subjects: string) {
    const x = PAGE.margin;
    const width = PAGE.width - PAGE.margin * 2;
    const y = doc.y;

    doc.roundedRect(x, y, width, 90, 8).fill(COLORS.surface);
    doc.fillColor(COLORS.brand).font('Helvetica-Bold').fontSize(7).text('PREPARED FOR', x + 16, y + 13, {
      characterSpacing: 1.2,
    });
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(17).text(quotation.studentName || 'Unavailable', x + 16, y + 29, {
      width: width - 32,
    });
    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(9)
      .text(`${quotation.gradeName || 'Grade unavailable'}  •  ${quotation.curriculumName || 'Curriculum unavailable'}`, x + 16, y + 53, {
        width: width - 32,
      });
    doc.fillColor(COLORS.ink).font('Helvetica').fontSize(8.5).text(`Subjects: ${subjects}`, x + 16, y + 69, {
      width: width - 32,
      ellipsis: true,
    });
    doc.y = y + 104;
  }

  private drawSectionHeading(doc: PDFKit.PDFDocument, title: string) {
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9).text(title, PAGE.margin, doc.y, {
      characterSpacing: 1.25,
    });
    doc.y += 17;
  }

  private drawPackageOptions(
    doc: PDFKit.PDFDocument,
    quotation: any,
    lineItems: any[],
    money: (value: unknown) => string,
    hasOffer: boolean,
  ) {
    const x = PAGE.margin;
    const width = PAGE.width - PAGE.margin * 2;
    const columns = hasOffer ? 3 : 2;
    const gap = 8;
    const cardWidth = (width - gap * (columns - 1)) / columns;
    const cardHeight = 75;
    const y = doc.y;
    const originalRates = [...new Set(lineItems.map((item: any) => this.formatNumber(item.originalHourlyRate)))];
    const normalRate = originalRates.length === 1 ? `${currencyPrefix(quotation.currency)} ${originalRates[0]} / Hour` : 'Rates shown by subject';

    this.drawOptionCard(doc, x, y, cardWidth, cardHeight, 'HOURLY TUITION', 'Pay as you go', normalRate, false);
    this.drawOptionCard(
      doc,
      x + cardWidth + gap,
      y,
      cardWidth,
      cardHeight,
      'MONTHLY PACKAGE',
      this.hoursDescription(lineItems),
      `${money(quotation.normalMonthlyTotal)} / Month`,
      false,
    );

    if (hasOffer) {
      this.drawOptionCard(
        doc,
        x + (cardWidth + gap) * 2,
        y,
        cardWidth,
        cardHeight,
        'SPECIAL OFFER',
        'Limited time offer',
        `${money(quotation.offerHourlyRate)} / Hour`,
        true,
        `${money(quotation.offerMonthlyTotal)} / Month`,
      );
    }
    doc.y = y + cardHeight + 10;

    if (originalRates.length > 1) {
      this.drawSubjectRateRows(doc, lineItems, money, quotation);
    }
  }

  private drawOptionCard(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    subtitle: string,
    value: string,
    highlighted: boolean,
    secondaryValue?: string,
  ) {
    doc
      .roundedRect(x, y, width, height, 7)
      .fillAndStroke(highlighted ? COLORS.brandSoft : COLORS.white, highlighted ? COLORS.brand : COLORS.line);
    doc
      .fillColor(highlighted ? COLORS.brand : COLORS.muted)
      .font('Helvetica-Bold')
      .fontSize(7)
      .text(title, x + 10, y + 10, { width: width - 20, characterSpacing: 0.8 });
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5).text(subtitle, x + 10, y + 24, {
      width: width - 20,
      ellipsis: true,
    });
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(10).text(value, x + 10, y + 43, {
      width: width - 20,
    });
    if (secondaryValue) {
      doc.fillColor(COLORS.accent).font('Helvetica-Bold').fontSize(7.5).text(secondaryValue, x + 10, y + 59, {
        width: width - 20,
      });
    }
  }

  private drawSubjectRateRows(
    doc: PDFKit.PDFDocument,
    lineItems: any[],
    money: (value: unknown) => string,
    quotation: any,
  ) {
    const x = PAGE.margin;
    const width = PAGE.width - PAGE.margin * 2;
    let y = doc.y;
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7).text('SUBJECT RATE BREAKDOWN', x, y, {
      characterSpacing: 0.8,
    });
    y += 13;
    for (const item of lineItems) {
      doc.y = y;
      if (this.ensureSpace(doc, 18, quotation)) {
        this.drawSectionHeading(doc, 'PACKAGE OPTIONS — CONTINUED');
        doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7).text('SUBJECT RATE BREAKDOWN', x, doc.y, {
          characterSpacing: 0.8,
        });
        doc.y += 13;
        y = doc.y;
      }
      doc.fillColor(COLORS.ink).font('Helvetica').fontSize(8).text(item.subjectName || '-', x, y, { width: width * 0.45 });
      doc
        .fillColor(COLORS.muted)
        .text(`${this.formatNumber(item.monthlyHours)} hrs/month`, x + width * 0.46, y, { width: width * 0.22 });
      doc
        .fillColor(COLORS.ink)
        .font('Helvetica-Bold')
        .text(`${money(item.originalHourlyRate)} / Hour`, x + width * 0.69, y, { width: width * 0.31, align: 'right' });
      y += 14;
    }
    doc.y = y + 2;
  }

  private drawPaymentSummary(
    doc: PDFKit.PDFDocument,
    quotation: any,
    money: (value: unknown) => string,
    hasOffer: boolean,
  ) {
    const x = PAGE.margin;
    const width = PAGE.width - PAGE.margin * 2;
    const y = doc.y;
    const packageAmount = hasOffer ? quotation.offerMonthlyTotal : quotation.normalMonthlyTotal;
    const rows: Array<[string, string]> = [
      ['Registration Fee (One-Time)', money(quotation.registrationFee)],
      [hasOffer ? 'Special Offer Monthly Amount' : 'Monthly Package Amount', money(packageAmount)],
    ];
    if (hasOffer) {
      rows.push(['Savings', `${money(quotation.savingAmount)} (${this.formatNumber(quotation.savingPercentage)}%)`]);
    }

    const summaryHeight = rows.length * 19 + 16;
    doc.roundedRect(x, y, width, summaryHeight, 7).fill(COLORS.surface);
    rows.forEach(([label, value], index) => {
      const rowY = y + 10 + index * 19;
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text(label, x + 14, rowY, { width: width * 0.6 });
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').text(value, x + width * 0.61, rowY, {
        width: width * 0.35,
        align: 'right',
      });
    });
    doc.y = y + summaryHeight + 8;

    const totalY = doc.y;
    doc.roundedRect(x, totalY, width, 45, 7).fill(COLORS.ink);
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(10).text('TOTAL AMOUNT DUE', x + 16, totalY + 16);
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(17).text(money(quotation.totalAmountDue), x + width * 0.55, totalY + 12, {
      width: width * 0.41,
      align: 'right',
    });
    doc.y = totalY + 57;
  }

  private accountDetailsHeight(doc: PDFKit.PDFDocument, rows: string[][], width: number) {
    const valueWidth = width - 174;
    return (
      rows.reduce((height, [, value]) => {
        const valueHeight = doc.font('Helvetica').fontSize(9).heightOfString(String(value), { width: valueWidth });
        return height + Math.max(16, valueHeight + 5);
      }, 16) + 8
    );
  }

  private drawAccountDetails(doc: PDFKit.PDFDocument, rows: string[][], width: number) {
    const x = PAGE.margin;
    const y = doc.y;
    const labelWidth = 145;
    const valueX = x + labelWidth + 20;
    const valueWidth = width - labelWidth - 34;
    const height = this.accountDetailsHeight(doc, rows, width);
    doc.roundedRect(x, y, width, height, 7).fillAndStroke(COLORS.white, COLORS.line);

    let rowY = y + 12;
    for (const [label, value] of rows) {
      const valueHeight = doc.font('Helvetica').fontSize(9).heightOfString(String(value), { width: valueWidth });
      const rowHeight = Math.max(16, valueHeight + 5);
      doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(8).text(label, x + 14, rowY, { width: labelWidth });
      doc.fillColor(COLORS.ink).font('Helvetica').fontSize(9).text(String(value), valueX, rowY, {
        width: valueWidth,
        lineGap: 1,
      });
      rowY += rowHeight;
    }
    doc.y = y + height + 10;
  }

  private ensureSpace(doc: PDFKit.PDFDocument, requiredHeight: number, quotation: any) {
    if (doc.y + requiredHeight <= PAGE.height - PAGE.bottom) return false;
    doc.addPage();
    this.drawContinuationHeader(doc, quotation);
    return true;
  }

  private drawFooters(doc: PDFKit.PDFDocument) {
    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      const y = PAGE.height - 66;
      doc.moveTo(PAGE.margin, y - 9).lineTo(PAGE.width - PAGE.margin, y - 9).strokeColor(COLORS.line).stroke();
      doc
        .fillColor(COLORS.muted)
        .font('Helvetica')
        .fontSize(7.5)
        .text(
          "Thank you for choosing EL SCORE Academy. We look forward to being part of your child's learning journey.",
          PAGE.margin,
          y,
          { width: PAGE.width - PAGE.margin * 2 - 40, align: 'left', lineBreak: false, ellipsis: true },
        );
      doc.text(`${index - range.start + 1} / ${range.count}`, PAGE.width - PAGE.margin - 36, y, {
        width: 36,
        align: 'right',
        lineBreak: false,
      });
    }
  }

  private hoursDescription(lineItems: any[]) {
    const hours = lineItems.reduce((sum: number, item: any) => sum + Number(item.monthlyHours || 0), 0);
    return hours > 0 ? `${this.formatNumber(hours)} hours per month` : 'Monthly tuition';
  }

  private formatNumber(value: unknown) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0.00';
    return number.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private formatDate(value: unknown) {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return 'Unavailable';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}

function currencyPrefix(currency: unknown) {
  return String(currency || 'AED');
}
