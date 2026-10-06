const { Client } = require('ssh2');

function sshExec(conn, cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    let out = '';
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => { out += d; if (!opts.silent) process.stdout.write(String(d)); });
      stream.stderr.on('data', d => process.stderr.write('[ERR] ' + String(d)));
      stream.on('close', () => resolve(out));
    });
  });
}

const CREATE_TUTOR_HR_SQL = `
-- =========================================================
-- TUTOR HR MODULE: New tables for Tutor Lead pipeline
-- =========================================================

-- Enums (create if not exists)
DO $$ BEGIN
  CREATE TYPE "TutorLeadStageCode" AS ENUM ('LEAD', 'DETAILS_SHARED', 'CV_SHARED', 'DEMO', 'TRAINING', 'READY_FOR_ASSIGNMENT', 'NOT_INTERESTED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TutorLeadAttendanceStatus" AS ENUM ('ATTENDED', 'NOT_ATTENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TutorLeadTaskStatus" AS ENUM ('DONE', 'NOT_DONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TutorSalarySlab
CREATE TABLE IF NOT EXISTS "tutor_salary_slabs" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "hourly_rate" DECIMAL(10,2) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- TutorHrSettings
CREATE TABLE IF NOT EXISTS "tutor_hr_settings" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- TutorLead (main table)
CREATE TABLE IF NOT EXISTS "tutor_leads" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "business_id" TEXT NOT NULL UNIQUE,
  "first_name" TEXT NOT NULL,
  "last_name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "mother_tongue_id" TEXT,
  "total_teaching_experience" INTEGER,
  "offline_teaching_experience" INTEGER,
  "expected_hourly_rate" DECIMAL(10,2),
  "remarks" TEXT,
  "current_stage" "TutorLeadStageCode" NOT NULL DEFAULT 'LEAD',
  "training_started_at" TIMESTAMP(3),
  "salary_slab_id" TEXT REFERENCES "tutor_salary_slabs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "created_by_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "assigned_to_user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "converted_tutor_profile_id" TEXT UNIQUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "tutor_leads_current_stage_idx" ON "tutor_leads"("current_stage");
CREATE INDEX IF NOT EXISTS "tutor_leads_created_by_user_id_idx" ON "tutor_leads"("created_by_user_id");
CREATE INDEX IF NOT EXISTS "tutor_leads_assigned_to_user_id_idx" ON "tutor_leads"("assigned_to_user_id");
CREATE INDEX IF NOT EXISTS "tutor_leads_deleted_at_idx" ON "tutor_leads"("deleted_at");

-- TutorLeadSubject
CREATE TABLE IF NOT EXISTS "tutor_lead_subjects" (
  "tutor_lead_id" TEXT NOT NULL REFERENCES "tutor_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "subject_id" TEXT NOT NULL REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY ("tutor_lead_id", "subject_id")
);

-- TutorLeadGrade
CREATE TABLE IF NOT EXISTS "tutor_lead_grades" (
  "tutor_lead_id" TEXT NOT NULL REFERENCES "tutor_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "grade_id" TEXT NOT NULL REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY ("tutor_lead_id", "grade_id")
);

-- TutorLeadLanguage (for communication languages)
CREATE TABLE IF NOT EXISTS "tutor_lead_languages" (
  "tutor_lead_id" TEXT NOT NULL REFERENCES "tutor_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "language_id" TEXT NOT NULL,
  PRIMARY KEY ("tutor_lead_id", "language_id")
);

-- TutorLeadAvailability
CREATE TABLE IF NOT EXISTS "tutor_lead_availability" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tutor_lead_id" TEXT NOT NULL REFERENCES "tutor_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "day_of_week" INTEGER NOT NULL,
  "start_time" TIMESTAMP(3) NOT NULL,
  "end_time" TIMESTAMP(3) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true
);

-- TutorLeadStageHistory
CREATE TABLE IF NOT EXISTS "tutor_lead_stage_history" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tutor_lead_id" TEXT NOT NULL REFERENCES "tutor_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "previous_stage" "TutorLeadStageCode",
  "new_stage" "TutorLeadStageCode" NOT NULL,
  "changed_by_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "remarks" TEXT
);
CREATE INDEX IF NOT EXISTS "tutor_lead_stage_history_tutor_lead_id_idx" ON "tutor_lead_stage_history"("tutor_lead_id");

-- TutorLeadCall
CREATE TABLE IF NOT EXISTS "tutor_lead_calls" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tutor_lead_id" TEXT NOT NULL REFERENCES "tutor_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "caller_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "called_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "remark" TEXT
);

-- TutorLeadDemo
CREATE TABLE IF NOT EXISTS "tutor_lead_demos" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tutor_lead_id" TEXT NOT NULL REFERENCES "tutor_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "is_live_demo" BOOLEAN NOT NULL DEFAULT false,
  "demo_date" TIMESTAMP(3),
  "start_time" TIMESTAMP(3),
  "end_time" TIMESTAMP(3),
  "remarks" TEXT,
  "recorded_by_user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- TutorLeadTrainingSession
CREATE TABLE IF NOT EXISTS "tutor_lead_training_sessions" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tutor_lead_id" TEXT NOT NULL REFERENCES "tutor_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "session_date" TIMESTAMP(3) NOT NULL,
  "start_time" TIMESTAMP(3),
  "end_time" TIMESTAMP(3),
  "attendance_status" "TutorLeadAttendanceStatus" NOT NULL DEFAULT 'NOT_ATTENDED',
  "task_status" "TutorLeadTaskStatus" NOT NULL DEFAULT 'NOT_DONE',
  "remarks" TEXT,
  "created_by_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "updated_by_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => {
    conn.on('ready', res).on('error', rej).connect({
      host: '200.234.39.163', port: 22, username: 'root',
      password: 'Elscoreacadrmy@786', readyTimeout: 30000,
    });
  });
  console.log('Connected\n');

  // Write SQL to file on server then execute it
  const escaped = CREATE_TUTOR_HR_SQL.replace(/'/g, "'\\''");
  await sshExec(conn, `cat > /tmp/tutor_hr_schema.sql << 'SQLEOF'\n${CREATE_TUTOR_HR_SQL}\nSQLEOF`, { silent: true });

  console.log('=== Creating Tutor HR tables ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -f /tmp/tutor_hr_schema.sql 2>&1`);

  // Check tables created
  console.log('\n=== Verify tables ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "SELECT tablename FROM pg_tables WHERE tablename LIKE 'tutor_lead%' ORDER BY tablename;" 2>&1`);

  // Mark our add-columns migration as applied (columns already in CREATE TABLE)
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "UPDATE \\"_prisma_migrations\\" SET finished_at=NOW(), applied_steps_count=1 WHERE migration_name='20260926000001_tutor_lead_assignment_softdelete';" 2>&1`);
  
  console.log('\n✅ Tutor HR schema applied on staging!');
  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
