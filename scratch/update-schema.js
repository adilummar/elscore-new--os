const fs = require('fs');

const path = 'apps/api/prisma/schema.prisma';
let schema = fs.readFileSync(path, 'utf8');

// 1. Remove enum TutorRecruitmentStageCode and TutorRejectionReason
schema = schema.replace(/enum TutorRecruitmentStageCode \{[\s\S]*?\}/, '');
schema = schema.replace(/enum TutorRejectionReason \{[\s\S]*?\}/, '');

// 2. Remove model TutorRecruitment, TutorRecruitmentStage, TutorInterview
schema = schema.replace(/\/\/\/.*?\nmodel TutorRecruitment \{[\s\S]*?\n\}/, '');
schema = schema.replace(/model TutorRecruitment \{[\s\S]*?\n\}/, '');
schema = schema.replace(/\/\/\/.*?\nmodel TutorRecruitmentStage \{[\s\S]*?\n\}/, '');
schema = schema.replace(/model TutorRecruitmentStage \{[\s\S]*?\n\}/, '');
schema = schema.replace(/\/\/\/.*?\nmodel TutorInterview \{[\s\S]*?\n\}/, '');
schema = schema.replace(/model TutorInterview \{[\s\S]*?\n\}/, '');

// 3. Update TutorProfile to use sourceTutorLeadId instead of sourceRecruitmentId
schema = schema.replace(/sourceRecruitmentId String\? @unique @map\("source_recruitment_id"\)/, 'sourceTutorLeadId   String? @unique @map("source_tutor_lead_id")');
schema = schema.replace(/tutorProfile TutorProfile\?           @relation\("RecruitmentTutorProfile"\)/g, '');

const newModels = `
// ============================================================================
// TUTOR HR - RECRUITMENT & FOUNDATION
// ============================================================================

enum TutorLeadStageCode {
  LEAD
  DETAILS_SHARED
  CV_SHARED
  DEMO
  TRAINING
  READY_FOR_ASSIGNMENT
  NOT_INTERESTED
  REJECTED
}

enum TutorLeadAttendance {
  ATTENDED
  NOT_ATTENDED
}

enum TutorLeadTaskStatus {
  DONE
  NOT_DONE
}

model MotherTongue {
  id        String   @id @default(uuid())
  name      String   @unique
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  tutorLeads TutorLead[]

  @@map("mother_tongues")
}

model CommunicationLanguage {
  id        String   @id @default(uuid())
  name      String   @unique
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  tutorLeadLanguages TutorLeadLanguage[]

  @@map("communication_languages")
}

model TutorSalarySlab {
  id         String   @id @default(uuid())
  name       String   @unique
  hourlyRate Decimal  @map("hourly_rate") @db.Decimal(10, 2)
  currency   String   @default("AED")
  isActive   Boolean  @default(true) @map("is_active")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  subjects TutorSalarySlabSubject[]
  grades   TutorSalarySlabGrade[]
  tutorLeads TutorLead[]

  @@map("tutor_salary_slabs")
}

model TutorSalarySlabSubject {
  slabId    String @map("slab_id")
  subjectId String @map("subject_id")

  slab    TutorSalarySlab @relation(fields: [slabId], references: [id], onDelete: Cascade)
  subject Subject         @relation(fields: [subjectId], references: [id], onDelete: Restrict)

  @@id([slabId, subjectId])
  @@map("tutor_salary_slab_subjects")
}

model TutorSalarySlabGrade {
  slabId  String @map("slab_id")
  gradeId String @map("grade_id")

  slab  TutorSalarySlab @relation(fields: [slabId], references: [id], onDelete: Cascade)
  grade Grade           @relation(fields: [gradeId], references: [id], onDelete: Restrict)

  @@id([slabId, gradeId])
  @@map("tutor_salary_slab_grades")
}

model TutorLead {
  id         String @id @default(uuid())
  businessId String @unique @map("business_id") // TL-####

  firstName String  @map("first_name")
  lastName  String  @map("last_name")
  phone     String
  email     String? 

  motherTongueId            String?  @map("mother_tongue_id")
  totalTeachingExperience   Int?     @map("total_teaching_experience")
  offlineTeachingExperience Int?     @map("offline_teaching_experience")
  expectedHourlyRate        Decimal? @map("expected_hourly_rate") @db.Decimal(10, 2)
  remarks                   String?

  currentStage      TutorLeadStageCode @default(LEAD) @map("current_stage")
  trainingStartedAt DateTime?          @map("training_started_at")

  salarySlabId String? @map("salary_slab_id")

  createdByUserId String   @map("created_by_user_id")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  createdBy    User             @relation("TutorLeadCreator", fields: [createdByUserId], references: [id], onDelete: Restrict)
  motherTongue MotherTongue?    @relation(fields: [motherTongueId], references: [id], onDelete: Restrict)
  salarySlab   TutorSalarySlab? @relation(fields: [salarySlabId], references: [id], onDelete: Restrict)
  
  tutorProfile TutorProfile?    @relation("LeadTutorProfile")

  subjects         TutorLeadSubject[]
  grades           TutorLeadGrade[]
  languages        TutorLeadLanguage[]
  availability     TutorLeadAvailability[]
  stageHistory     TutorLeadStageHistory[]
  calls            TutorLeadCall[]
  demos            TutorLeadDemo[]
  trainingSessions TutorLeadTrainingSession[]

  @@index([currentStage])
  @@index([createdByUserId])
  @@map("tutor_leads")
}

model TutorLeadSubject {
  tutorLeadId String @map("tutor_lead_id")
  subjectId   String @map("subject_id")

  tutorLead TutorLead @relation(fields: [tutorLeadId], references: [id], onDelete: Cascade)
  subject   Subject   @relation(fields: [subjectId], references: [id], onDelete: Restrict)

  @@id([tutorLeadId, subjectId])
  @@map("tutor_lead_subjects")
}

model TutorLeadGrade {
  tutorLeadId String @map("tutor_lead_id")
  gradeId     String @map("grade_id")

  tutorLead TutorLead @relation(fields: [tutorLeadId], references: [id], onDelete: Cascade)
  grade     Grade     @relation(fields: [gradeId], references: [id], onDelete: Restrict)

  @@id([tutorLeadId, gradeId])
  @@map("tutor_lead_grades")
}

model TutorLeadLanguage {
  tutorLeadId String @map("tutor_lead_id")
  languageId  String @map("language_id")

  tutorLead TutorLead             @relation(fields: [tutorLeadId], references: [id], onDelete: Cascade)
  language  CommunicationLanguage @relation(fields: [languageId], references: [id], onDelete: Restrict)

  @@id([tutorLeadId, languageId])
  @@map("tutor_lead_languages")
}

model TutorLeadAvailability {
  id          String   @id @default(uuid())
  tutorLeadId String   @map("tutor_lead_id")
  dayOfWeek   Int      @map("day_of_week") // 0=Sun, 1=Mon...
  startTime   DateTime @map("start_time") @db.Time
  endTime     DateTime @map("end_time") @db.Time
  isActive    Boolean  @default(true) @map("is_active")

  tutorLead TutorLead @relation(fields: [tutorLeadId], references: [id], onDelete: Cascade)

  @@map("tutor_lead_availability")
}

model TutorLeadStageHistory {
  id              String             @id @default(uuid())
  tutorLeadId     String             @map("tutor_lead_id")
  previousStage   TutorLeadStageCode? @map("previous_stage")
  newStage        TutorLeadStageCode @map("new_stage")
  changedByUserId String             @map("changed_by_user_id")
  remarks         String?
  changedAt       DateTime           @default(now()) @map("changed_at")

  tutorLead TutorLead @relation(fields: [tutorLeadId], references: [id], onDelete: Cascade)
  changedBy User      @relation("StageChangedBy", fields: [changedByUserId], references: [id], onDelete: Restrict)

  @@index([tutorLeadId])
  @@map("tutor_lead_stage_history")
}

model TutorLeadCall {
  id              String   @id @default(uuid())
  tutorLeadId     String   @map("tutor_lead_id")
  callerUserId    String   @map("caller_user_id")
  remark          String
  calledAt        DateTime @default(now()) @map("called_at")

  tutorLead TutorLead @relation(fields: [tutorLeadId], references: [id], onDelete: Cascade)
  caller    User      @relation("TutorLeadCalledBy", fields: [callerUserId], references: [id], onDelete: Restrict)

  @@index([tutorLeadId])
  @@map("tutor_lead_calls")
}

model TutorLeadDemo {
  id              String   @id @default(uuid())
  tutorLeadId     String   @map("tutor_lead_id")
  
  isLiveDemo      Boolean  @default(false) @map("is_live_demo")
  demoDate        DateTime? @db.Date @map("demo_date")
  startTime       DateTime? @db.Time @map("start_time")
  endTime         DateTime? @db.Time @map("end_time")
  
  remarks         String?
  recordedByUserId String  @map("recorded_by_user_id")
  createdAt       DateTime @default(now()) @map("created_at")

  tutorLead  TutorLead @relation(fields: [tutorLeadId], references: [id], onDelete: Cascade)
  recordedBy User      @relation("TutorLeadDemoRecordedBy", fields: [recordedByUserId], references: [id], onDelete: Restrict)

  @@index([tutorLeadId])
  @@map("tutor_lead_demos")
}

model TutorLeadTrainingSession {
  id               String               @id @default(uuid())
  tutorLeadId      String               @map("tutor_lead_id")
  sessionDate      DateTime             @db.Date @map("session_date")
  startTime        DateTime?            @db.Time @map("start_time")
  endTime          DateTime?            @db.Time @map("end_time")
  attendanceStatus TutorLeadAttendance  @map("attendance_status")
  taskStatus       TutorLeadTaskStatus  @map("task_status")
  remarks          String?
  
  createdById      String               @map("created_by_id")
  updatedById      String               @map("updated_by_id")
  createdAt        DateTime             @default(now()) @map("created_at")
  updatedAt        DateTime             @updatedAt @map("updated_at")

  tutorLead TutorLead @relation(fields: [tutorLeadId], references: [id], onDelete: Cascade)
  createdBy User      @relation("TutorTrainingCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedBy User      @relation("TutorTrainingUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)

  @@index([tutorLeadId])
  @@map("tutor_lead_training_sessions")
}
`;

schema += newModels;

let userRelations = '\n  tutorLeadsCreated        TutorLead[]              @relation("TutorLeadCreator")\n' +
'  tutorLeadStagesChanged   TutorLeadStageHistory[]  @relation("StageChangedBy")\n' +
'  tutorLeadCalls           TutorLeadCall[]          @relation("TutorLeadCalledBy")\n' +
'  tutorLeadDemos           TutorLeadDemo[]          @relation("TutorLeadDemoRecordedBy")\n' +
'  tutorTrainingsCreated    TutorLeadTrainingSession[] @relation("TutorTrainingCreatedBy")\n' +
'  tutorTrainingsUpdated    TutorLeadTrainingSession[] @relation("TutorTrainingUpdatedBy")\n';

schema = schema.replace(/(model User \{[\s\S]*?)(  @@map\("users"\))/, '$1' + userRelations + '$2');

schema = schema.replace(/(model TutorProfile \{[\s\S]*?)(  @@map\("tutor_profiles"\))/, '$1\n  tutorLead TutorLead? @relation("LeadTutorProfile", fields: [sourceTutorLeadId], references: [id], onDelete: SetNull)\n$2');

fs.writeFileSync(path, schema);
console.log('Schema updated successfully');
