import { Controller, Get, Post, Param, Body, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { QuotationService } from './quotation.service';
import { PdfService } from './pdf.service';
import { JwtAuthGuard } from '../../common/auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { GenerateQuotationDto } from './dto/quotation.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertOwnershipOrBypass } from '../../common/rbac/ownership.utils';
import { AuthorizationService } from '../../common/rbac/authorization.service';
import { NotFoundException } from '@nestjs/common';

@Controller('quotations')
@UseGuards(JwtAuthGuard)
export class QuotationController {
  constructor(
    private readonly quotationService: QuotationService,
    private readonly pdfService: PdfService,
    private readonly prisma: PrismaService,
    private readonly authzService: AuthorizationService,
  ) {}

  @Get('student/:studentId')
  @RequirePermissions('quotation.read.own', 'quotation.read.team', 'quotation.read.all')
  getStudentQuotations(@Param('studentId') studentId: string, @CurrentUser() user: any) {
    return this.quotationService.getQuotationsByStudent(studentId, user);
  }

  @Post('preview')
  @RequirePermissions('quotation.create')
  previewQuotation(@Body() dto: GenerateQuotationDto, @CurrentUser() user: any) {
    return this.quotationService.previewQuotation(dto, user);
  }

  @Post('generate')
  @RequirePermissions('quotation.create')
  generateQuotation(@Body() dto: GenerateQuotationDto, @CurrentUser() user: any) {
    return this.quotationService.generateQuotation(dto, user);
  }

  @Get(':id/pdf')
  @RequirePermissions('quotation.read.own', 'quotation.read.team', 'quotation.read.all')
  async downloadPdf(@Param('id') id: string, @CurrentUser() user: any, @Res() res: Response) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { lead: true, lineItems: true },
    });
    if (!quotation) throw new NotFoundException('Quotation not found');

    const hasBypass = await this.authzService.hasPermissions(user.id, ['quotation.read.all']);
    assertOwnershipOrBypass(quotation.lead?.assignedToUserId, user.id, hasBypass, 'You do not have permission to download this quotation');

    const buffer = await this.pdfService.generateQuotationPdf(quotation);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${quotation.quotationNumber}.pdf"`);
    res.setHeader('Content-Length', buffer.length);
    
    res.end(buffer);
  }
}
