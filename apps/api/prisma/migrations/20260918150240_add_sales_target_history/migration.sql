-- CreateTable
CREATE TABLE "sales_target_history" (
    "id" TEXT NOT NULL,
    "sales_target_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period_month" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "previous_type" "SalesTargetType" NOT NULL,
    "previous_value" DECIMAL(10,2) NOT NULL,
    "new_type" "SalesTargetType" NOT NULL,
    "new_value" DECIMAL(10,2) NOT NULL,
    "changed_by_user_id" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_target_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_target_history_sales_target_id_changed_at_idx" ON "sales_target_history"("sales_target_id", "changed_at");

-- CreateIndex
CREATE INDEX "sales_target_history_user_id_period_year_period_month_idx" ON "sales_target_history"("user_id", "period_year", "period_month");

-- AddForeignKey
ALTER TABLE "sales_target_history" ADD CONSTRAINT "sales_target_history_sales_target_id_fkey" FOREIGN KEY ("sales_target_id") REFERENCES "sales_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_target_history" ADD CONSTRAINT "sales_target_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
