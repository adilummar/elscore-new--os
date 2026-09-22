-- CreateTable
CREATE TABLE "team_sales_targets" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "period_month" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "target_type" "SalesTargetType" NOT NULL,
    "target_value" DECIMAL(12,2) NOT NULL,
    "set_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_sales_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_sales_targets_department_id_period_year_period_month_key" ON "team_sales_targets"("department_id", "period_year", "period_month");

-- AddForeignKey
ALTER TABLE "team_sales_targets" ADD CONSTRAINT "team_sales_targets_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_sales_targets" ADD CONSTRAINT "team_sales_targets_set_by_user_id_fkey" FOREIGN KEY ("set_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

