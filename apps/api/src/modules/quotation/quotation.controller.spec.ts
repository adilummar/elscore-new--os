import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { QuotationController } from './quotation.controller';
import { QuotationService } from './quotation.service';
import { PdfService } from './pdf.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationService } from '../../common/rbac/authorization.service';
import { JwtAuthGuard } from '../../common/auth/guards/jwt-auth.guard';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Response } from 'express';

describe('QuotationController - PDF Download', () => {
  let controller: QuotationController;
  let mockPrisma: any;
  let mockPdfService: any;
  let mockAuthzService: any;
  let mockRes: Partial<Response>;

  beforeEach(async () => {
    mockPrisma = {
      quotation: {
        findUnique: jest.fn(),
      },
    };
    mockPdfService = {
      generateQuotationPdf: jest.fn(),
    };
    mockAuthzService = {
      hasPermissions: jest.fn(),
    };
    mockRes = {
      setHeader: jest.fn(),
      end: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuotationController],
      providers: [
        { provide: QuotationService, useValue: {} },
        { provide: PdfService, useValue: mockPdfService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthorizationService, useValue: mockAuthzService },
      ],
    }).compile();

    controller = module.get<QuotationController>(QuotationController);
  });

  it('does not re-apply JwtAuthGuard so God View identity is preserved', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, QuotationController) ?? [];
    expect(guards).not.toEqual(expect.arrayContaining([JwtAuthGuard]));
  });

  it('should authorize and download PDF for owner', async () => {
    mockPrisma.quotation.findUnique.mockResolvedValue({
      id: 'q1',
      quotationNumber: 'QT-1',
      lead: { assignedToUserId: 'user-1' },
      lineItems: [],
    });
    mockAuthzService.hasPermissions.mockResolvedValue(false);
    mockPdfService.generateQuotationPdf.mockResolvedValue(Buffer.from('pdf content'));

    await controller.downloadPdf('q1', { id: 'user-1' }, mockRes as Response);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(mockRes.end).toHaveBeenCalled();
  });

  it('should authorize and download PDF for god-view (all) permission', async () => {
    mockPrisma.quotation.findUnique.mockResolvedValue({
      id: 'q1',
      quotationNumber: 'QT-1',
      lead: { assignedToUserId: 'user-2' }, // different owner
      lineItems: [],
    });
    mockAuthzService.hasPermissions.mockResolvedValue(true); // Has lead.read.all
    mockPdfService.generateQuotationPdf.mockResolvedValue(Buffer.from('pdf content'));

    await controller.downloadPdf('q1', { id: 'user-1' }, mockRes as Response);

    expect(mockRes.end).toHaveBeenCalled();
  });

  it('should block unauthorized download (IDOR prevention)', async () => {
    mockPrisma.quotation.findUnique.mockResolvedValue({
      id: 'q1',
      quotationNumber: 'QT-1',
      lead: { assignedToUserId: 'user-2' }, // different owner
      lineItems: [],
    });
    mockAuthzService.hasPermissions.mockResolvedValue(false); // No global read permission

    await expect(controller.downloadPdf('q1', { id: 'user-1' }, mockRes as Response))
      .rejects.toThrow(ForbiddenException);
  });
});
