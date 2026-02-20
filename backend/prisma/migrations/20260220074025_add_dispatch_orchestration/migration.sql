-- AlterTable
ALTER TABLE "Dispatch" ADD COLUMN     "hospitalRouteDistanceKm" DOUBLE PRECISION,
ADD COLUMN     "hospitalRouteDurationSec" INTEGER,
ADD COLUMN     "hospitalRouteGeometry" JSONB,
ADD COLUMN     "hospitalRouteProvider" TEXT,
ADD COLUMN     "reassignCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "replacedById" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "FireDispatch" ADD COLUMN     "reassignCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "replacedById" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "PoliceDispatch" ADD COLUMN     "reassignCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "replacedById" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "SOSEvent" ADD COLUMN     "clusterCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "clusterId" TEXT,
ADD COLUMN     "severityScore" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "StatusHistory" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "dispatchType" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatusHistory_dispatchId_idx" ON "StatusHistory"("dispatchId");

-- CreateIndex
CREATE INDEX "StatusHistory_vehicleId_idx" ON "StatusHistory"("vehicleId");
