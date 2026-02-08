-- AlterTable
ALTER TABLE "Dispatch" ADD COLUMN     "routeDistanceKm" DOUBLE PRECISION,
ADD COLUMN     "routeDurationSec" INTEGER,
ADD COLUMN     "routeGeometry" JSONB,
ADD COLUMN     "routeProvider" TEXT;
