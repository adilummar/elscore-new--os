import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RbacGuard } from '../rbac/rbac.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';

import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions('audit.read')
  @ApiOperation({ summary: 'List audit logs with filtering and pagination' })
  async findAll(@Query() query: AuditQueryDto) {
    return this.auditService.findAll({
      limit: query.limit ?? 20,
      cursor: query.cursor,
      actorUserId: query.actorUserId,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }
}
