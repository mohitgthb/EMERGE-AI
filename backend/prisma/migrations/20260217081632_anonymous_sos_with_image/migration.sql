/*
  Warnings:

  - You are about to drop the column `deviceId` on the `SOSEvent` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `SOSEvent` table. All the data in the column will be lost.
  - You are about to drop the `SOSUser` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "SOSEvent" DROP CONSTRAINT "SOSEvent_userId_fkey";

-- AlterTable
ALTER TABLE "SOSEvent" DROP COLUMN "deviceId",
DROP COLUMN "userId",
ADD COLUMN     "deviceFingerprint" TEXT,
ADD COLUMN     "deviceIP" TEXT,
ADD COLUMN     "deviceMAC" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "lastSOSAt" TIMESTAMP(3),
ADD COLUMN     "sosCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "userAgent" TEXT;

-- DropTable
DROP TABLE "SOSUser";
