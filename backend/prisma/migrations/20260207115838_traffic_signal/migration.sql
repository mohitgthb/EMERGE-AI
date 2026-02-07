/*
  Warnings:

  - You are about to drop the column `latitutde` on the `TrafficSignal` table. All the data in the column will be lost.
  - Added the required column `latitude` to the `TrafficSignal` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TrafficSignal" DROP COLUMN "latitutde",
ADD COLUMN     "latitude" DOUBLE PRECISION NOT NULL;
