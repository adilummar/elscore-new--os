import { PricingController } from '../../modules/pricing/pricing.controller';
import { QuotationController } from '../../modules/quotation/quotation.controller';
import { StudentController } from '../../modules/student/student.controller';
import { TutorProfileController } from '../../modules/tutor/tutor-profile.controller';
import { AuditController } from '../audit/audit.controller';

import { PERMISSIONS_KEY } from './require-permissions.decorator';

function requiredPermissions(target: object, method: string): string[] {
  return Reflect.getMetadata(PERMISSIONS_KEY, (target as any)[method]);
}

describe('canonical permission contracts', () => {
  it('audit list requires audit.view', () => {
    expect(requiredPermissions(AuditController.prototype, 'findAll')).toEqual(['audit.view']);
  });

  it('tutor profile read requires tutor.profile.read', () => {
    expect(requiredPermissions(TutorProfileController.prototype, 'getProfile')).toEqual(['tutor.profile.read']);
  });

  it('tutor profile management requires tutor.profile.manage', () => {
    expect(requiredPermissions(TutorProfileController.prototype, 'updateExperience')).toEqual([
      'tutor.profile.manage',
    ]);
    expect(requiredPermissions(TutorProfileController.prototype, 'addCurriculum')).toEqual(['tutor.profile.manage']);
    expect(requiredPermissions(TutorProfileController.prototype, 'removeCurriculum')).toEqual([
      'tutor.profile.manage',
    ]);
  });

  it('quotation history and PDF require quotation.read', () => {
    expect(requiredPermissions(QuotationController.prototype, 'getStudentQuotations')).toEqual(['quotation.read']);
    expect(requiredPermissions(QuotationController.prototype, 'downloadPdf')).toEqual(['quotation.read']);
  });

  it('quotation preview and generate require quotation.create', () => {
    expect(requiredPermissions(QuotationController.prototype, 'previewQuotation')).toEqual(['quotation.create']);
    expect(requiredPermissions(QuotationController.prototype, 'generateQuotation')).toEqual(['quotation.create']);
  });

  it('does not introduce scoped quotation.read.* permissions', () => {
    const methods = ['getStudentQuotations', 'downloadPdf', 'previewQuotation', 'generateQuotation'];
    const all = methods.flatMap((method) => requiredPermissions(QuotationController.prototype, method));
    expect(all).not.toEqual(expect.arrayContaining(['quotation.read.own', 'quotation.read.team', 'quotation.read.all']));
    expect(all.some((code) => code.startsWith('quotation.read.'))).toBe(false);
  });

  it('student deletion requires the non-delegated student.delete permission', () => {
    expect(requiredPermissions(StudentController.prototype, 'deleteStudent')).toEqual(['student.delete']);
  });

  it('pricing and finance-setting management keep pricing.manage', () => {
    expect(requiredPermissions(PricingController.prototype, 'getSlabs')).toEqual(['pricing.manage']);
    expect(requiredPermissions(PricingController.prototype, 'getFinanceSetting')).toEqual(['pricing.manage']);
    expect(requiredPermissions(PricingController.prototype, 'upsertFinanceSetting')).toEqual(['pricing.manage']);
  });
});
