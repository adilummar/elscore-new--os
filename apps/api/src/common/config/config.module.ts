import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration from './configuration';
import { validateEnv } from './env.validation';

/**
 * Global configuration module.
 * Marked @Global so ConfigService is available everywhere without re-importing.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      // In production, .env should be injected via secrets manager / runtime env.
      // In development, .env is read from the working directory.
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
  ],
})
export class AppConfigModule {}
