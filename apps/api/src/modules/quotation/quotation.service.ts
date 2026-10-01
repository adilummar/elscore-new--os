import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PricingService } from '../pricing/pricing.service';
import { GenerateQuotationDto } from './dto/quotation.dto';
import { assertOwnershipOrBypass } from '../../common/rbac/ownership.utils';
import { AuthorizationService } from '../../common/rbac/authorization.service';

@Injectable()
export class QuotationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idGenerator: IdGeneratorService,
    private readonly pricingService: PricingService,
    private readonly authzService: AuthorizationService,
  ) {}

  public canGenerateQuotation(lead: { status: string }): boolean {
    return lead?.status === 'DEMO_COMPLETED';
  }

  async getQuotationsByStudent(studentId: string, currentUser: any) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { lead: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    
    // Check bypass
    const hasBypass = await this.authzService.hasPermissions(currentUser.id, ['quotation.read.all']);

    assertOwnershipOrBypass(student.lead?.assignedToUserId, currentUser.id, hasBypass, 'You do not have permission to view quotations for this student');

    return this.prisma.quotation.findMany({
      where: { studentId },
      include: { lineItems: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async _calculateQuotation(dto: GenerateQuotationDto, tx: any) {
    // 1. Validate Ownership and Student
    const student = await tx.student.findUnique({
      where: { id: dto.studentId },
      include: {
        lead: true,
        curriculum: true,
        grade: true,
        requirements: {
          include: { subject: true },
        },
      },
    });

    if (!student) throw new NotFoundException('Student not found');
    if (!student.lead) throw new BadRequestException('Student must be attached to a Lead');
    if (!student.curriculum || !student.grade) throw new BadRequestException('Student must have a curriculum and grade selected.');

    // 2. Validate Demo Completion (Temporary Rule)
    if (!student.lead || !this.canGenerateQuotation(student.lead)) {
      throw new BadRequestException('Quotation can only be generated after the Lead reaches DEMO_COMPLETED.');
    }

    // 3. Load Finance Setting
    const financeSetting = await tx.financeSetting.findFirst();
    const registrationFee = financeSetting ? Number(financeSetting.registrationFee) : 0;
    const currency = financeSetting ? financeSetting.currency : 'AED';

    // 4. Validate Requirements
    if (student.requirements.length === 0) {
      throw new BadRequestException('Student has no subjects/requirements selected.');
    }

    const lineItems = [];
    let totalMonthlyHours = 0;
    let normalMonthlyTotal = 0;

    for (const req of student.requirements) {
      if (!req.monthlyHours || Number(req.monthlyHours) <= 0) {
        throw new BadRequestException(`Monthly hours missing or invalid for subject ${req.subject.name}.`);
      }

      const hours = Number(req.monthlyHours);
      const normalRate = await this.pricingService.resolveHourlyRate(
        student.curriculumId!,
        student.grade.sortOrder,
        req.subjectId,
      );

      if (dto.offerHourlyRate !== undefined && dto.offerHourlyRate !== null && dto.offerHourlyRate > normalRate) {
        throw new BadRequestException(`Offer hourly rate (${dto.offerHourlyRate}) cannot exceed the normal rate (${normalRate}) for ${req.subject.name}.`);
      }
      if (dto.offerHourlyRate !== undefined && dto.offerHourlyRate !== null && dto.offerHourlyRate <= 0) {
        throw new BadRequestException(`Offer hourly rate must be greater than 0.`);
      }

      const monthlyAmount = hours * normalRate;
      const offerAmount = dto.offerHourlyRate ? hours * dto.offerHourlyRate : null;

      normalMonthlyTotal += monthlyAmount;
      totalMonthlyHours += hours;

      lineItems.push({
        subjectId: req.subjectId,
        subjectName: req.subject.name,
        monthlyHours: hours,
        originalHourlyRate: normalRate,
        appliedOfferHourlyRate: dto.offerHourlyRate || null,
        normalMonthlyAmount: monthlyAmount,
        offerMonthlyAmount: offerAmount,
      });
    }

    // 5. Calculate Totals
    const offerMonthlyTotal = dto.offerHourlyRate ? totalMonthlyHours * dto.offerHourlyRate : null;
    const finalMonthly = offerMonthlyTotal !== null ? offerMonthlyTotal : normalMonthlyTotal;
    const savingAmount = offerMonthlyTotal !== null ? normalMonthlyTotal - offerMonthlyTotal : 0;
    const savingPercentage = offerMonthlyTotal !== null ? (savingAmount / normalMonthlyTotal) * 100 : 0;
    
    const totalAmountDue = finalMonthly + registrationFee;

    return {
      student,
      currency,
      registrationFee,
      normalMonthlyTotal,
      offerHourlyRate: dto.offerHourlyRate,
      offerMonthlyTotal,
      savingAmount,
      savingPercentage,
      totalAmountDue,
      lineItems
    };
  }

  async previewQuotation(dto: GenerateQuotationDto, currentUser: any) {
    // Check bypass manually since we don't do it inside the calculation logic
    const studentCheck = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
      include: { lead: true }
    });
    if (!studentCheck) throw new NotFoundException('Student not found');
    
    const hasBypass = await this.authzService.hasPermissions(currentUser.id, ['quotation.read.all']);
    assertOwnershipOrBypass(studentCheck.lead?.assignedToUserId, currentUser.id, hasBypass, 'You do not have permission to view quotations for this student');

    const result = await this._calculateQuotation(dto, this.prisma);
    return result;
  }

  async generateQuotation(dto: GenerateQuotationDto, currentUser: any) {
    return this.prisma.$transaction(async (tx) => {
      // Check authorization
      const studentCheck = await tx.student.findUnique({
        where: { id: dto.studentId },
        include: { lead: true }
      });
      if (!studentCheck) throw new NotFoundException('Student not found');

      const hasBypass = await this.authzService.hasPermissions(currentUser.id, ['quotation.read.all']);
      assertOwnershipOrBypass(studentCheck.lead?.assignedToUserId, currentUser.id, hasBypass, 'You do not have permission to generate quotations for this student');

      const calc = await this._calculateQuotation(dto, tx);

      // 6. Generate Quotation Number
      const quotationNumber = await this.idGenerator.nextIdInTx(tx, 'QUO');

      // 7. Create Quotation Snapshot
      const quotation = await tx.quotation.create({
        data: {
          quotationNumber,
          studentId: calc.student.id,
          leadId: calc.student.leadId,
          quotationDate: new Date(),
          currency: calc.currency,
          status: 'GENERATED',
          studentName: calc.student.firstName + (calc.student.lastName ? ' ' + calc.student.lastName : ''),
          curriculumName: calc.student.curriculum.name,
          gradeName: calc.student.grade.name,
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
          }
        },
        include: { lineItems: true }
      });

      // 8. Audit
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
