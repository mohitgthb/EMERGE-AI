-- CreateTable
CREATE TABLE "RiskZone" (
    "id" TEXT NOT NULL,
    "gridKey" TEXT NOT NULL,
    "centerLat" DOUBLE PRECISION NOT NULL,
    "centerLng" DOUBLE PRECISION NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "incidentScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "densityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timeScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "incidentCount" INTEGER NOT NULL DEFAULT 0,
    "avgDensity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "peakHour" INTEGER,
    "reasons" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DensitySummary" (
    "id" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "vehicleCount" INTEGER NOT NULL DEFAULT 0,
    "avgDensity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DensitySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandbySuggestion" (
    "id" TEXT NOT NULL,
    "riskZoneId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "currentLat" DOUBLE PRECISION NOT NULL,
    "currentLng" DOUBLE PRECISION NOT NULL,
    "suggestedLat" DOUBLE PRECISION NOT NULL,
    "suggestedLng" DOUBLE PRECISION NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "responseTimeImprove" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandbySuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiskZone_gridKey_key" ON "RiskZone"("gridKey");

-- CreateIndex
CREATE INDEX "RiskZone_riskScore_idx" ON "RiskZone"("riskScore");

-- CreateIndex
CREATE INDEX "DensitySummary_cameraId_idx" ON "DensitySummary"("cameraId");

-- CreateIndex
CREATE INDEX "DensitySummary_windowStart_windowEnd_idx" ON "DensitySummary"("windowStart", "windowEnd");

-- CreateIndex
CREATE INDEX "StandbySuggestion_riskZoneId_idx" ON "StandbySuggestion"("riskZoneId");

-- CreateIndex
CREATE INDEX "StandbySuggestion_vehicleId_idx" ON "StandbySuggestion"("vehicleId");

-- CreateIndex
CREATE INDEX "StandbySuggestion_status_idx" ON "StandbySuggestion"("status");

-- AddForeignKey
ALTER TABLE "StandbySuggestion" ADD CONSTRAINT "StandbySuggestion_riskZoneId_fkey" FOREIGN KEY ("riskZoneId") REFERENCES "RiskZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
