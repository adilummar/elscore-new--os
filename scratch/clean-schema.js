const fs = require('fs');
const path = 'apps/api/prisma/schema.prisma';
let schema = fs.readFileSync(path, 'utf8');

// Remove from User
schema = schema.replace(/createdRecruitments\s+TutorRecruitment\[\]\s+@relation\("RecruitmentCreator"\)/g, '');
schema = schema.replace(/advancedStages\s+TutorRecruitmentStage\[\]\s+@relation\("StageAdvancedBy"\)/g, '');
schema = schema.replace(/conductedInterviews\s+TutorInterview\[\]\s+@relation\("InterviewConductor"\)/g, '');

// Remove from Employee
schema = schema.replace(/recruitment\s+TutorRecruitment\?\s+@relation\("RecruitmentHiredEmployee"\)/g, '');

// Remove from TutorProfile
schema = schema.replace(/recruitment\s+TutorRecruitment\?\s+@relation\("RecruitmentTutorProfile".*?\)/g, '');

fs.writeFileSync(path, schema);
console.log('Cleanup completed.');
