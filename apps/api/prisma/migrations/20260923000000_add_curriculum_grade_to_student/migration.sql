-- AlterTable
ALTER TABLE "students" ADD COLUMN     "curriculum_id" TEXT;
ALTER TABLE "students" ADD COLUMN     "grade_id" TEXT;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
