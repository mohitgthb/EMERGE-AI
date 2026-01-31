-- CreateTable
CREATE TABLE "Accident" (
    "id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL,
    "detectedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Accident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ambulance" (
    "id" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ambulance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hospital" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "beds" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" TEXT NOT NULL,
    "accidentId" TEXT NOT NULL,
    "ambulanceId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endtime" TIMESTAMP(3),

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ambulance_vehicleNo_key" ON "Ambulance"("vehicleNo");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_accidentId_key" ON "Dispatch"("accidentId");

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_accidentId_fkey" FOREIGN KEY ("accidentId") REFERENCES "Accident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_ambulanceId_fkey" FOREIGN KEY ("ambulanceId") REFERENCES "Ambulance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
