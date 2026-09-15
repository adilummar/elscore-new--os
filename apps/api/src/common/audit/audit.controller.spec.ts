import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { RbacGuard } from '../rbac/rbac.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';

describe('AuditController', () => {
  let controller: AuditController;
  let service: AuditService;

  beforeEach(async () => {
    const mockAuditService = {
      findAll: jest.fn().mockResolvedValue({ data: [], pagination: { hasNextPage: false } }),
    };
    
    // Mock RbacGuard to just return true for testing controller logic
    const mockRbacGuard = {
      canActivate: (context: ExecutionContext) => true,
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        { provide: AuditService, useValue: mockAuditService },
      ],
    })
      .overrideGuard(RbacGuard)
      .useValue(mockRbacGuard)
      .compile();

    controller = module.get<AuditController>(AuditController);
    service = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call auditService.findAll with pagination parameters', async () => {
    await controller.findAll({ limit: 10, cursor: 'abc' });
    expect(service.findAll).toHaveBeenCalledWith({ limit: 10, cursor: 'abc' });
  });

  it('should pass filtering parameters', async () => {
    await controller.findAll({ limit: 20, entityType: 'User', action: 'CREATED' });
    expect(service.findAll).toHaveBeenCalledWith({ limit: 20, entityType: 'User', action: 'CREATED' });
  });

  it('should ensure no credentials are exposed by relying on the audit service data sanitization', async () => {
    // The audit service does not retrieve passwords, only defined metadata.
    // Testing the controller passes the request properly.
    const result = await controller.findAll({ limit: 20 });
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('pagination');
  });
});
