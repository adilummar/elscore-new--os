import { Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { CurrentUser, RequestUser } from '../../../common/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/auth/guards/jwt-auth.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RbacGuard } from '../../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../../common/rbac/require-permissions.decorator';

import { TutorTransferService } from './tutor-transfer.service';

class ListTutorsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) search?: string;
}

/**
 * Tutor Management — Tutors. Profile fields and operational workflows for this section
 * are specified separately; this exposes the transfer from Training and the tutor list.
 */
@ApiTags('Tutor Management — Tutors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('tutor-hr/tutors')
export class TutorsController {
  constructor(
    private readonly transfer: TutorTransferService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('ready-for-assignment/:leadId')
  @RequirePermissions('tutor_hr.ready_for_assignment')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Final verification: create the tutor account and Tutor ID. Returns the temporary password once.' })
  ready(@Param('leadId', ParseUUIDPipe) leadId: string, @CurrentUser() user: RequestUser) {
    return this.transfer.readyForAssignment(leadId, user.id);
  }

  @Get()
  @RequirePermissions('tutor_hr.tutors.read')
  async list(@Query() q: ListTutorsQueryDto) {
    const s = q.search?.trim();
    const rows = await this.prisma.tutorProfile.findMany({
      where: {
        tutorCode: { not: null },
        ...(s
          ? {
              OR: [
                { tutorCode: { contains: s, mode: 'insensitive' } },
                { employee: { firstName: { contains: s, mode: 'insensitive' } } },
                { employee: { lastName: { contains: s, mode: 'insensitive' } } },
                { employee: { phone: { contains: s } } },
                { employee: { user: { email: { contains: s, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      orderBy: { verifiedAt: 'desc' },
      take: 500,
      select: {
        id: true, tutorCode: true, tutorOperationalStatus: true, verifiedAt: true, sourceTutorLeadId: true,
        verifiedBy: { select: { id: true, email: true } },
        employee: { select: { firstName: true, lastName: true, phone: true, user: { select: { email: true, status: true, mustChangePassword: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      tutorId: r.tutorCode,
      name: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
      email: r.employee.user.email,
      phone: r.employee.phone,
      status: r.tutorOperationalStatus,
      accountPendingFirstLogin: r.employee.user.mustChangePassword,
      verifiedAt: r.verifiedAt,
      verifiedBy: r.verifiedBy,
      candidateId: r.sourceTutorLeadId,
    }));
  }
}
