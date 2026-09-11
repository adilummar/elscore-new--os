import { Controller, Post, Body, Param, UseGuards, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';

import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { CreateInvoiceDto } from './dto/invoice.dto';
import { InvoiceService } from './invoice.service';


@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post('draft')
  @RequirePermissions('finance.invoice.create')
  @ApiOperation({ summary: 'Create a draft invoice' })
  createDraft(@Body() dto: CreateInvoiceDto, @CurrentUser() user: any) {
    return this.invoiceService.createDraft(dto, user.id);
  }

  @Post(':id/issue')
  @RequirePermissions('finance.invoice.issue')
  @ApiOperation({ summary: 'Issue a draft invoice' })
  issueInvoice(@Param('id') id: string, @CurrentUser() user: any) {
    return this.invoiceService.issueInvoice(id, user.id);
  }

  @Post(':id/void')
  @RequirePermissions('finance.invoice.void')
  @ApiOperation({ summary: 'Void an invoice' })
  voidInvoice(@Param('id') id: string, @CurrentUser() user: any) {
    return this.invoiceService.voidInvoice(id, user.id);
  }

  @Get(':id')
  @RequirePermissions('finance.invoice.read')
  @ApiOperation({ summary: 'Get invoice details' })
  getInvoice(@Param('id') id: string) {
    return this.invoiceService.getInvoice(id);
  }

  @Get(':id/pdf')
  @RequirePermissions('finance.invoice.read')
  @ApiOperation({ summary: 'Download invoice PDF' })
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.invoiceService.generatePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
