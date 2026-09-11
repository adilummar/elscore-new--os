const fs = require('fs');
const path = require('path');

const schemaPath = path.resolve('apps/api/prisma/schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

// 1. Add Enums
const enums = `
enum StudentAttendanceStatus {
  PRESENT
  LATE
  ABSENT
  EXCUSED
}

enum TutorClassRecordStatus {
  DRAFT
  SUBMITTED
  VERIFIED
  CORRECTION_REQUESTED
}

enum SessionCancellationReason {
  NOT_CANCELLED
  ACADEMY_CANCELLED
  TUTOR_CANCELLED
  STUDENT_CANCELLED
  TUTOR_NO_SHOW
}
`;

if (!schema.includes('enum StudentAttendanceStatus')) {
  const firstModelIndex = schema.indexOf('model ');
  schema = schema.slice(0, firstModelIndex) + enums + '\n' + schema.slice(firstModelIndex);
}

// 2. Add Models
const models = `
// =============================================================================
// M-010 — ATTENDANCE (Slice 2F)
// =============================================================================

model StudentAttendance {
  id              String   @id @default(uuid())
  businessId      String   @unique @map("business_id")
  
  sessionId       String   @map("session_id")
  
  studentId       String   @map("student_id")
  tutorClassRecId String?  @map("tutor_class_record_id")
  
  status          StudentAttendanceStatus
  actualStart     DateTime? @map("actual_start")
  actualEnd       DateTime? @map("actual_end")
  
  markedByUserId  String   @map("marked_by_user_id")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  isCorrected     Boolean  @default(false) @map("is_corrected")
  correctionReason String?  @map("correction_reason")
  correctedByUserId String? @map("corrected_by_user_id")
  correctedAt     DateTime? @map("corrected_at")

  student         Student  @relation(fields: [studentId], references: [id])
  tutorClassRecord TutorClassRecord? @relation(fields: [tutorClassRecId], references: [id])
  
  @@unique([sessionId, studentId])
  @@map("student_attendances")
}

model TutorClassRecord {
  id              String   @id @default(uuid())
  businessId      String   @unique @map("business_id")
  
  sessionId       String   @map("session_id")
  tutorId         String   @map("tutor_id")
  
  status          TutorClassRecordStatus @default(DRAFT)
  cancellation    SessionCancellationReason @default(NOT_CANCELLED)
  
  scheduledStart  DateTime @map("scheduled_start")
  scheduledEnd    DateTime @map("scheduled_end")
  actualStart     DateTime? @map("actual_start")
  actualEnd       DateTime? @map("actual_end")
  workedMinutes   Int?     @map("worked_minutes")
  
  appliedRate     Decimal? @map("applied_rate") @db.Decimal(10, 2)
  currency        String?
  rateGrade       String?  @map("rate_grade")
  rateSubject     String?  @map("rate_subject")

  submittedAt     DateTime? @map("submitted_at")
  verifiedAt      DateTime? @map("verified_at")
  verifiedByUserId String?  @map("verified_by_user_id")
  
  isPayrollReady  Boolean  @default(false) @map("is_payroll_ready")
  
  isCorrected     Boolean  @default(false) @map("is_corrected")
  correctionReason String?  @map("correction_reason")
  
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  tutor           User     @relation("TutorClassRecords", fields: [tutorId], references: [id])
  studentAttendances StudentAttendance[]

  @@unique([sessionId, tutorId])
  @@map("tutor_class_records")
}
`;

if (!schema.includes('model StudentAttendance')) {
  schema = schema + '\n' + models;
}

// 3. Add to User model
if (!schema.includes('tutorClassRecords')) {
  schema = schema.replace(
    /model User \{([\s\S]*?)\}/,
    `model User {$1  tutorClassRecords      TutorClassRecord[]      @relation("TutorClassRecords")\n}`
  );
}

// 4. Add to Student model
if (!schema.includes('studentAttendances')) {
  schema = schema.replace(
    /model Student \{([\s\S]*?)\}/,
    `model Student {$1  studentAttendances StudentAttendance[]\n}`
  );
}

fs.writeFileSync(schemaPath, schema, 'utf8');
console.log('Schema updated with Slice 2F Attendance models.');
