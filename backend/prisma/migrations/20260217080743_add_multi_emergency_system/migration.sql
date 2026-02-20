-- AlterTable
ALTER TABLE "Accident" ADD COLUMN     "emergencyType" TEXT NOT NULL DEFAULT 'ACCIDENT';

-- CreateTable
CREATE TABLE "SOSUser" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastSOSAt" TIMESTAMP(3),
    "sosCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SOSUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SOSEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "deviceId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "emergencyType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationMethod" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SOSEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FireIncident" (
    "id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL,
    "detectedBy" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "cameraId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FireIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyQueue" (
    "id" TEXT NOT NULL,
    "emergencyType" TEXT NOT NULL,
    "emergencyId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "assignedTo" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FireDispatch" (
    "id" TEXT NOT NULL,
    "fireIncidentId" TEXT NOT NULL,
    "fireBrigadeId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endtime" TIMESTAMP(3),
    "routeProvider" TEXT,
    "routeDistanceKm" DOUBLE PRECISION,
    "routeDurationSec" INTEGER,
    "routeGeometry" JSONB,

    CONSTRAINT "FireDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoliceDispatch" (
    "id" TEXT NOT NULL,
    "sosEventId" TEXT NOT NULL,
    "policeUnitId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endtime" TIMESTAMP(3),
    "routeProvider" TEXT,
    "routeDistanceKm" DOUBLE PRECISION,
    "routeDurationSec" INTEGER,
    "routeGeometry" JSONB,

    CONSTRAINT "PoliceDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FireBrigade" (
    "id" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FireBrigade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoliceUnit" (
    "id" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoliceUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SOSUser_deviceId_key" ON "SOSUser"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyQueue_emergencyId_key" ON "EmergencyQueue"("emergencyId");

-- CreateIndex
CREATE UNIQUE INDEX "FireDispatch_fireIncidentId_key" ON "FireDispatch"("fireIncidentId");

-- CreateIndex
CREATE UNIQUE INDEX "PoliceDispatch_sosEventId_key" ON "PoliceDispatch"("sosEventId");

-- CreateIndex
CREATE UNIQUE INDEX "FireBrigade_vehicleNo_key" ON "FireBrigade"("vehicleNo");

-- CreateIndex
CREATE UNIQUE INDEX "PoliceUnit_vehicleNo_key" ON "PoliceUnit"("vehicleNo");

-- AddForeignKey
ALTER TABLE "SOSEvent" ADD CONSTRAINT "SOSEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "SOSUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyQueue" ADD CONSTRAINT "EmergencyQueue_accident_fkey" FOREIGN KEY ("emergencyId") REFERENCES "Accident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyQueue" ADD CONSTRAINT "EmergencyQueue_fire_fkey" FOREIGN KEY ("emergencyId") REFERENCES "FireIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireDispatch" ADD CONSTRAINT "FireDispatch_fireIncidentId_fkey" FOREIGN KEY ("fireIncidentId") REFERENCES "FireIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FireDispatch" ADD CONSTRAINT "FireDispatch_fireBrigadeId_fkey" FOREIGN KEY ("fireBrigadeId") REFERENCES "FireBrigade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoliceDispatch" ADD CONSTRAINT "PoliceDispatch_sosEventId_fkey" FOREIGN KEY ("sosEventId") REFERENCES "SOSEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoliceDispatch" ADD CONSTRAINT "PoliceDispatch_policeUnitId_fkey" FOREIGN KEY ("policeUnitId") REFERENCES "PoliceUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
