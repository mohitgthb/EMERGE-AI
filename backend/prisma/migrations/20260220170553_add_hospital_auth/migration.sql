-- AlterTable
ALTER TABLE "Operator" ADD COLUMN     "hospitalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Operator_hospitalId_key" ON "Operator"("hospitalId");

-- AddForeignKey
ALTER TABLE "Operator" ADD CONSTRAINT "Operator_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;
