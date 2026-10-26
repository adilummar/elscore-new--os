import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RbacService } from '../../common/rbac/rbac.service';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { CreateVacancyDto } from './dto/create-vacancy.dto';
import { QueryVacanciesDto } from './dto/query-vacancies.dto';
import { ReviewVacancyDto } from './dto/review-vacancy.dto';
import { TransitionVacancyStatusDto } from './dto/transition-vacancy-status.dto';
import { UpdateVacancyDto } from './dto/update-vacancy.dto';
import { VacancyService } from './vacancy.service';

@ApiTags('Workforce Vacancies')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('vacancies')
export class VacancyController {
  constructor(
    private readonly vacancyService: VacancyService,
    private readonly rbacService: RbacService,
  ) {}

  @Post()
  @RequirePermissions('vacancy.create')
  @ApiOperation({ summary: 'Create a new draft workforce vacancy' })
  async createVacancy(
    @Body() dto: CreateVacancyDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vacancyService.createVacancy(dto, user.id);
  }

  @Get()
  @RequirePermissions('vacancy.read')
  @ApiOperation({ summary: 'List workforce vacancies with filters and pagination' })
  async getVacancies(
    @Query() query: QueryVacanciesDto,
    @CurrentUser() user: RequestUser,
  ) {
    const perms = await this.rbacService.getPermissionsForUser(user.id);
    const isCeo = perms.has('vacancy.approve');
    return this.vacancyService.getVacancies(query, user.id, isCeo);
  }

  @Get(':id')
  @RequirePermissions('vacancy.read')
  @ApiOperation({ summary: 'Get a single workforce vacancy by ID' })
  async getVacancy(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const perms = await this.rbacService.getPermissionsForUser(user.id);
    const isCeo = perms.has('vacancy.approve');
    return this.vacancyService.getVacancy(id, user.id, isCeo);
  }

  @Patch(':id')
  @RequirePermissions('vacancy.read')
  @ApiOperation({ summary: 'Update workforce vacancy fields (DRAFT or PENDING_APPROVAL; creator or manager)' })
  async updateVacancy(
    @Param('id') id: string,
    @Body() dto: UpdateVacancyDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vacancyService.updateVacancy(id, dto, user.id);
  }

  @Post(':id/submit')
  @RequirePermissions('vacancy.read')
  @ApiOperation({ summary: 'Submit a draft vacancy for management approval (creator or manager)' })
  async submitForApproval(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vacancyService.submitForApproval(id, user.id);
  }

  @Post(':id/review')
  @RequirePermissions('vacancy.approve')
  @ApiOperation({ summary: 'Approve or reject a pending workforce vacancy (CEO approval and self-approval)' })
  async reviewVacancy(
    @Param('id') id: string,
    @Body() dto: ReviewVacancyDto,
    @CurrentUser() user: RequestUser,
  ) {
    const perms = await this.rbacService.getPermissionsForUser(user.id);
    const isCeo = perms.has('vacancy.approve');
    return this.vacancyService.reviewVacancy(id, dto, user.id, isCeo);
  }

  @Post(':id/status')
  @RequirePermissions('vacancy.manage-status')
  @ApiOperation({ summary: 'Transition vacancy lifecycle status (OPEN, ON_HOLD, FILLED, CANCELLED)' })
  async transitionStatus(
    @Param('id') id: string,
    @Body() dto: TransitionVacancyStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vacancyService.transitionStatus(id, dto, user.id);
  }
}
