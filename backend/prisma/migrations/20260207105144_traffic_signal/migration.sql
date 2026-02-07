-- CreateTable
CREATE TABLE "TrafficSignal" (
    "id" TEXT NOT NULL,
    "junctionId" TEXT NOT NULL,
    "latitutde" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "state" TEXT NOT NULL,
    "UpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrafficSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrafficSignal_junctionId_key" ON "TrafficSignal"("junctionId");
