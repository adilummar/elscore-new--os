import { Module } from '@nestjs/common';

import { AuthModule } from '../../common/auth/auth.module';
import { IdGeneratorModule } from '../../common/id-generator/id-generator.module';

import { UserPermissionService } from './user-permission.service';
import { UserRoleService } from './user-role.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [IdGeneratorModule, AuthModule],
  controllers: [UserController],
  providers: [UserService, UserRoleService, UserPermissionService],
  exports: [UserService],
})
export class UserModule {}
