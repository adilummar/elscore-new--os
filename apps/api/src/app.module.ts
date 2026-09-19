/**
 * EL SCORE OS — Root Application Module
 *
 * Imports only cross-cutting infrastructure modules.
 * Business domain modules are imported here as they are built in later phases.
 *
 * Module loading order (dependency-aware):
 *   1. AppConfigModule      — env/config (required by everything)
 *   2. LoggerModule         — structured logging (required by everything)
 *   3. PrismaModule         — database access (required by all domain modules)
 *   4. DomainEventsModule   — in-process event bus
 *   5. QueueModule          — BullMQ/Redis background jobs
 *   6. AuditModule          — audit logging
 *   7. IdGeneratorModule    — human-readable business IDs
 *   8. RbacModule           — permission resolution (required by AuthModule)
 *   9. AuthModule           — authentication + JWT
 *   [future] domain modules (Phase 2+)
 */

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuditModule } from './common/audit/audit.module';
import { AuthModule } from './common/auth/auth.module';
import { JwtAuthGuard } from './common/auth/guards/jwt-auth.guard';
import { MustChangePasswordGuard } from './common/auth/guards/must-change-password.guard';
import { AppConfigModule } from './common/config/config.module';
import { IdGeneratorModule } from './common/id-generator/id-generator.module';
import { AppLoggerModule } from './common/logger/logger.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { QueueModule } from './common/queue/queue.module';
import { RbacGuard } from './common/rbac/rbac.guard';
import { RbacModule } from './common/rbac/rbac.module';
import { ReadOnlyGuard } from './common/rbac/read-only.guard';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { DemoModule } from './modules/demo/demo.module';
import { DepartmentModule } from './modules/department/department.module';
import { EmployeeModule } from './modules/employee/employee.module';
import { FinanceModule } from './modules/finance/finance.module';
import { FollowUpModule } from './modules/follow-up/follow-up.module';
import { LeadModule } from './modules/lead/lead.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { SalesTargetModule } from './modules/sales-target/sales-target.module';
import { PermissionModule } from './modules/permission/permission.module';
import { ReferenceModule } from './modules/reference/reference.module';
import { RoleModule } from './modules/role/role.module';
import { RoundRobinModule } from './modules/round-robin/round-robin.module';
import { StudentModule } from './modules/student/student.module';
import { TutorModule } from './modules/tutor/tutor.module';
import { UserModule } from './modules/user/user.module';

@Module({
  imports: [
    // Configuration must be first
    AppConfigModule,

    // Logging
    AppLoggerModule,

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60_000, // 60 seconds
        limit: 100,  // 100 requests per window
      },
    ]),

    // In-process domain event bus (EventEmitter2)
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),

    // Infrastructure
    PrismaModule,
    QueueModule,
    AuditModule,
    IdGeneratorModule,

    // Authorization
    RbacModule,

    // Authentication (Must run BEFORE Authorization)
    AuthModule,

    // 🚀 Business domain modules 🚀
    DepartmentModule,
    DashboardModule,
    AnalyticsModule,
    EmployeeModule,
    PermissionModule,
    ReferenceModule,
    RoleModule,
    TutorModule,
    UserModule,
    LeadModule,
    StudentModule,
    FollowUpModule,
    RoundRobinModule,
    DemoModule,
    FinanceModule,
    AttendanceModule,
    MarketingModule,
    SalesTargetModule,
    // Phase 2+: add module imports here as each phase is implemented.
    // Do not add placeholder imports for unbuilt modules.
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: MustChangePasswordGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RbacGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ReadOnlyGuard,
    },
  ]
})
export class AppModule {}
