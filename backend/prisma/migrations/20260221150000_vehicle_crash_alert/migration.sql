-- CreateTable
CREATE TABLE "VehicleCrash" (
    "id" TEXT NOT NULL,
    "vehicleRegNo" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL,
    "airbagDeployed" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'VEHICLE_SENSOR',
    "status" TEXT NOT NULL DEFAULT 'REPORTED',
    "accidentId" TEXT,
    "dispatchId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleCrash_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleCrash_accidentId_key" ON "VehicleCrash"("accidentId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleCrash_idempotencyKey_key" ON "VehicleCrash"("idempotencyKey");

-- CreateIndex
CREATE INDEX "VehicleCrash_vehicleRegNo_idx" ON "VehicleCrash"("vehicleRegNo");

-- CreateIndex
CREATE INDEX "VehicleCrash_status_idx" ON "VehicleCrash"("status");

-- CreateIndex
CREATE INDEX "VehicleCrash_createdAt_idx" ON "VehicleCrash"("createdAt");
