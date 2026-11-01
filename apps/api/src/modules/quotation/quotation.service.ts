import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { AuthorizationService } from '../../common/rbac/authorization.service';
import { assertOwnershipOrBypass } from '../../common/rbac/ownership.utils';
import { MentoringHandoverService, MONTHLY_HOURS_LOCKED_MESSAGE } from '../mentoring/mentoring-handover.service';
import { PricingService } from '../pricing/pricing.service';

import { GenerateQuotationDto } from './dto/quotation.dto';


const MIXED_CURRICULUM_GRADE_MESSAGE =
  'A quotation cannot include Requirements with different Curriculum and Grade combinations. Correct the Requirements so they share one Curriculum and Grade, then try again.';

const MISSING_FINANCE_MESSAGE =
  'Configuration Error: Finance Settings (Registration Fee) are not configured. Configure the DEFAULT finance setting before generating a quotation.';

const MISSING_ACCOUNT_DETAILS_MESSAGE =
  'Quotation account details are not configured. Set Account Holder Name, Bank Name, Account Number, and IBAN in Finance/Quotation settings before generating a quotation.';

@Injectable()
export class QuotationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idGenerator: IdGeneratorService,
    private readonly pricingService: PricingService,
    private readonly authzService: AuthorizationService,
    private readonly mentoringHandover: MentoringHandoverService,
  ) {}

  /**
   * Once a student has been handed over to Mentoring, Sales may not change monthly hours (here, through a
   * quotation). Supplying the hours that are already stored is not a change and is allowed, so quotations
   * can still be produced from the verified hours. Anything else is rejected, never silently ignored.
   * This is enforced on the server for both preview and generate; the web form is not relied upon.
   */
  private async assertMonthlyHoursUnchangedAfterHandover(
    client: PrismaTxClient | PrismaService,
    studentId: string,
    subjectHours: GenerateQuotationDto['subjectHours'],
  ): Promise<{ handedOver: boolean }> {
    if (!(await this.mentoringHandover.isHandedOver(client, studentId))) return { handedOver: false };
    if (!subjectHours || subjectHours.length === 0) return { handedOver: true };

    const stored = await client.requirement.findMany({
      where: { studentId },
      select: { subjectId: true, monthlyHours: true },
    });
    const storedBySubject = new Map(stored.map((r) => [r.subjectId, r.monthlyHours]));

    for (const sh of subjectHours) {
      if (!storedBySubject.has(sh.subjectId)) continue; // not this student's requirement: nothing would change
      const current = storedBySubject.get(sh.subjectId);
      const unchanged = current !== null && current !== undefined && Number(current).toFixed(2) === Number(sh.monthlyHours).toFixed(2);
      if (!unchanged) throw new ForbiddenException(MONTHLY_HOURS_LOCKED_MESSAGE);
    }
    return { handedOver: true };
  }

  public canGenerateQuotation(lead: { status: string }): boolean {
    return lead?.status === 'DEMO_COMPLETED';
  }

  async getQuotationsByStudent(studentId: string, currentUser: RequestUser) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { lead: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    const hasBypass = await this.authzService.hasPermissions(currentUser.id, ['lead.read-all']);

    assertOwnershipOrBypass(
      student.lead?.assignedToUserId,
      currentUser.id,
      hasBypass,
      'You do not have permission to view quotations for this student',
    );

    return this.prisma.quotation.findMany({
      where: { studentId },
      include: {
        lineItems: true,
        creator: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private snapshotParent(lead: { firstName?: string | null; lastName?: string | null; primaryPhone?: string | null }) {
    const parentName = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim();
    return {
      parentName: parentName || 'Unknown',
      parentPhone: lead.primaryPhone || 'Unknown',
      parentEmail: null as string | null,
    };
  }

  private resolveAuthoritativeCurriculumGrade(requirements: Array<{
    subjectId: string;
    curriculumId?: string | null;
    gradeId?: string | null;
    subject?: { name?: string };
    curriculum?: { name: string } | null;
    grade?: { name: string } | null;
  }>) {
    const combinations = new Map<string, { curriculumName: string; gradeName: string }>();

    for (const req of requirements) {
      if (!req.curriculumId || !req.gradeId || !req.curriculum || !req.grade) {
        throw new BadRequestException(
          `Subject ${req.subject?.name ?? req.subjectId} is missing a Curriculum or Grade. Correct the Requirement before generating a quotation.`,
        );
      }

      const key = `${req.curriculumId}::${req.gradeId}`;
      combinations.set(key, {
        curriculumName: req.curriculum.name,
        gradeName: req.grade.name,
      });
    }

    if (combinations.size > 1) {
      throw new BadRequestException(MIXED_CURRICULUM_GRADE_MESSAGE);
    }

    const [header] = combinations.values();
    return header;
  }

  private async loadAuthoritativeFinanceSetting(tx: PrismaTxClient | PrismaService) {
    const financeSetting = await tx.financeSetting.findUnique({
      where: { code: 'DEFAULT' },
    });

    if (!financeSetting) {
      throw new BadRequestException(MISSING_FINANCE_MESSAGE);
    }

    if (financeSetting.registrationFee === null || financeSetting.registrationFee === undefined) {
      throw new BadRequestException(MISSING_FINANCE_MESSAGE);
    }

    if (financeSetting.currency !== 'AED') {
      throw new BadRequestException('Quotation currency must be AED.');
    }

    const accountHolderName = financeSetting.accountHolderName?.trim();
    const bankName = financeSetting.bankName?.trim();
    const accountNumber = financeSetting.accountNumber?.trim();
    const iban = financeSetting.iban?.trim();

    if (!accountHolderName || !bankName || !accountNumber || !iban) {
      throw new BadRequestException(MISSING_ACCOUNT_DETAILS_MESSAGE);
    }

    return {
      registrationFee: Number(financeSetting.registrationFee),
      currency: financeSetting.currency,
      accountHolderName,
      bankName,
      accountNumber,
      iban,
    };
  }

  private async _calculateQuotation(dto: GenerateQuotationDto, tx: PrismaTxClient | PrismaService) {
    const student = await tx.student.findUnique({
      where: { id: dto.studentId },
      include: {
        lead: true,
        requirements: {
          include: { subject: true, curriculum: true, grade: true },
        },
      },
    });

    if (!student) throw new NotFoundException('Student not found');
    if (!student.lead) throw new BadRequestException('Student must be attached to a Lead');

    if (!this.canGenerateQuotation(student.lead)) {
      throw new BadRequestException('Quotation can only be generated after the Lead reaches DEMO_COMPLETED.');
    }

    const financeSetting = await this.loadAuthoritativeFinanceSetting(tx);

    if (student.requirements.length === 0) {
      throw new BadRequestException('Student has no subjects/requirements selected.');
    }

    const header = this.resolveAuthoritativeCurriculumGrade(student.requirements);
    const parent = this.snapshotParent(student.lead);

    const lineItems = [];
    let totalMonthlyHours = 0;
    let normalMonthlyTotal = 0;
    let minNormalRate = Infinity;

    for (const req of student.requirements) {
      const override = dto.subjectHours?.find((sh) => sh.subjectId === req.subjectId);
      const hours = override ? Number(override.monthlyHours) : (req.monthlyHours ? Number(req.monthlyHours) : 0);

      if (!hours || hours <= 0) {
        throw new BadRequestException(`Monthly hours missing or invalid for subject ${req.subject.name}.`);
      }

      const { rate: normalRate, source: pricingSource } = await this.pricingService.resolveHourlyRate(
        req.curriculumId,
        req.grade.sortOrder,
        req.subjectId,
        tx,
      );

      if (normalRate < minNormalRate) {
        minNormalRate = normalRate;
      }

      const monthlyAmount = hours * normalRate;
      const offerAmount = dto.offerHourlyRate ? hours * dto.offerHourlyRate : null;

      normalMonthlyTotal += monthlyAmount;
      totalMonthlyHours += hours;

      lineItems.push({
        subjectId: req.subjectId,
        subjectName: req.subject.name,
        curriculumName: req.curriculum.name,
        gradeName: req.grade.name,
        pricingSource,
        monthlyHours: hours,
        originalHourlyRate: normalRate,
        appliedOfferHourlyRate: dto.offerHourlyRate || null,
        normalMonthlyAmount: monthlyAmount,
        offerMonthlyAmount: offerAmount,
      });
    }

    if (dto.offerHourlyRate !== undefined && dto.offerHourlyRate !== null) {
      if (dto.offerHourlyRate <= 0) {
        throw new BadRequestException(`Offer hourly rate must be greater than 0.`);
      }
      if (dto.offerHourlyRate > minNormalRate) {
        throw new BadRequestException(
          `Offer hourly rate (${dto.offerHourlyRate}) cannot exceed the lowest applicable normal rate (${minNormalRate}).`,
        );
      }
    }

    const offerMonthlyTotal = dto.offerHourlyRate ? totalMonthlyHours * dto.offerHourlyRate : null;
    const finalMonthly = offerMonthlyTotal !== null ? offerMonthlyTotal : normalMonthlyTotal;
    const savingAmount = offerMonthlyTotal !== null ? normalMonthlyTotal - offerMonthlyTotal : 0;
    const savingPercentage = offerMonthlyTotal !== null ? (savingAmount / normalMonthlyTotal) * 100 : 0;

    const totalAmountDue = finalMonthly + financeSetting.registrationFee;

    return {
      student,
      currency: financeSetting.currency,
      registrationFee: financeSetting.registrationFee,
      accountHolderName: financeSetting.accountHolderName,
      bankName: financeSetting.bankName,
      accountNumber: financeSetting.accountNumber,
      iban: financeSetting.iban,
      parentName: parent.parentName,
      parentPhone: parent.parentPhone,
      parentEmail: parent.parentEmail,
      curriculumName: header.curriculumName,
      gradeName: header.gradeName,
      normalMonthlyTotal,
      offerHourlyRate: dto.offerHourlyRate,
      offerMonthlyTotal,
      savingAmount,
      savingPercentage,
      totalAmountDue,
      quotationNotes: dto.quotationNotes,
      lineItems,
    };
  }

  async previewQuotation(dto: GenerateQuotationDto, currentUser: RequestUser) {
    const studentCheck = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
      include: { lead: true },
    });
    if (!studentCheck) throw new NotFoundException('Student not found');

    const hasBypass = await this.authzService.hasPermissions(currentUser.id, ['lead.read-all']);
    assertOwnershipOrBypass(
      studentCheck.lead?.assignedToUserId,
      currentUser.id,
      hasBypass,
      'You do not have permission to view quotations for this student',
    );

    await this.assertMonthlyHoursUnchangedAfterHandover(this.prisma, dto.studentId, dto.subjectHours);

    const result = await this._calculateQuotation(dto, this.prisma);
    const { student: _student, ...preview } = result;
    void _student;
    return preview;
  }

  async generateQuotation(dto: GenerateQuotationDto, currentUser: RequestUser) {
    return this.prisma.$transaction(async (tx) => {
      const studentCheck = await tx.student.findUnique({
        where: { id: dto.studentId },
        include: { lead: true },
      });
      if (!studentCheck) throw new NotFoundException('Student not found');

      const hasBypass = await this.authzService.hasPermissions(currentUser.id, ['lead.read-all']);
      assertOwnershipOrBypass(
        studentCheck.lead?.assignedToUserId,
        currentUser.id,
        hasBypass,
        'You do not have permission to generate quotations for this student',
      );

      // Serialise with a concurrent handover for this lead, then apply the Mentoring rule before any write.
      await tx.$executeRaw`SELECT 1 FROM leads WHERE id = ${studentCheck.leadId} FOR UPDATE`;
      const { handedOver } = await this.assertMonthlyHoursUnchangedAfterHandover(tx, studentCheck.id, dto.subjectHours);

      const calc = await this._calculateQuotation(dto, tx);

      // After handover the hours are verified by Mentoring: the guard above proved nothing would change.
      if (!handedOver && dto.subjectHours && dto.subjectHours.length > 0) {
        for (const sh of dto.subjectHours) {
          await tx.requirement.updateMany({
            where: { studentId: studentCheck.id, subjectId: sh.subjectId },
            data: { monthlyHours: sh.monthlyHours },
          });
        }
      }

      const quotationNumber = await this.idGenerator.nextIdInTx(tx, 'QUO');

      const quotation = await tx.quotation.create({
        data: {
          quotationNumber,
          studentId: calc.student.id,
          leadId: calc.student.leadId,
          quotationDate: new Date(),
          currency: calc.currency,
          status: 'GENERATED',

          parentName: calc.parentName,
          parentPhone: calc.parentPhone,
          parentEmail: calc.parentEmail,
          studentName: calc.student.firstName + (calc.student.lastName ? ' ' + calc.student.lastName : ''),
          curriculumName: calc.curriculumName,
          gradeName: calc.gradeName,
          quotationNotes: calc.quotationNotes || null,

          accountHolderName: calc.accountHolderName,
          bankName: calc.bankName,
          accountNumber: calc.accountNumber,
          iban: calc.iban,

          normalMonthlyTotal: calc.normalMonthlyTotal,
          offerHourlyRate: calc.offerHourlyRate,
          offerMonthlyTotal: calc.offerMonthlyTotal,
          savingAmount: calc.savingAmount,
          savingPercentage: calc.savingPercentage,
          registrationFee: calc.registrationFee,
          totalAmountDue: calc.totalAmountDue,
          createdBy: currentUser.id,
          lineItems: {
            create: calc.lineItems,
          },
        },
        include: { lineItems: true },
      });

      await this.audit.recordInTx(tx, {
        entityType: 'Quotation',
        entityId: quotation.id,
        action: 'GENERATED',
        actorUserId: currentUser.id,
        newValue: quotation,
      });

      return quotation;
    });
  }
}
