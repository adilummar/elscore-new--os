/**
 * Application configuration factory.
 *
 * Centralises all environment variable access.
 * All consumers use ConfigService.get('app.port') etc.
 * Never access process.env directly outside this file.
 */
export default () => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.API_PORT ?? '3001', 10),
    prefix: process.env.API_PREFIX ?? 'api/v1',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','),
  },

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL_SECONDS ?? '60', 10) * 1000,
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },

  logging: {
    level: process.env.LOG_LEVEL ?? 'info',
  },

  crm: {
    /**
     * The authoritative business timezone for EL SCORE OS.
     * All date-boundary logic (Today, Upcoming, Overdue, reminders, check-out)
     * must use this timezone. Never use server-local time or hard-code 'Asia/Kolkata'.
     */
    businessTimezone: process.env.SYSTEM_TIMEZONE ?? 'Asia/Kolkata',
  },

  /**
   * Tutor HR background jobs. They run on their own BullMQ queue (not the shared
   * housekeeping queue), created at runtime by TutorHrQueueService.
   * Redis keys: `<prefix>:<name>:*`, e.g. `elscore-staging:tutor-hr:*`.
   */
  tutorHr: {
    queue: {
      /** Set TUTOR_HR_QUEUE_ENABLED=false to start neither the worker nor the schedule. */
      enabled: (process.env.TUTOR_HR_QUEUE_ENABLED ?? 'true').toLowerCase() !== 'false',
      /** Queue name. Default `tutor-hr` (QUEUES.TUTOR_HR). */
      name: process.env.TUTOR_HR_QUEUE_NAME ?? 'tutor-hr',
      /** Key prefix. Default: the prefix every other queue uses, `elscore-${APP_ENV ?? NODE_ENV}`. */
      prefix: process.env.TUTOR_HR_QUEUE_PREFIX ?? `elscore-${process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development'}`,
      /** Cron (UTC) for the overdue demo-evaluation scan. Default every 5 minutes. */
      overdueScanCron: process.env.TUTOR_HR_OVERDUE_SCAN_CRON ?? '*/5 * * * *',
    },
  },
});
