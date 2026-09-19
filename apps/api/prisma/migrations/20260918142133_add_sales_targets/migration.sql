-- CreateEnum
CREATE TYPE "SalesTargetType" AS ENUM ('CONVERSION_PERCENTAGE', 'REVENUE_AED');

-- CreateTable
CREATE TABLE "sales_targets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period_month" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "target_type" "SalesTargetType" NOT NULL,
    "target_value" DECIMAL(10,2) NOT NULL,
    "set_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_targets_user_id_period_year_period_month_key" ON "sales_targets"("user_id", "period_year", "period_month");

-- AddForeignKey
ALTER TABLE "sales_targets" ADD CONSTRAINT "sales_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_targets" ADD CONSTRAINT "sales_targets_set_by_user_id_fkey" FOREIGN KEY ("set_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
