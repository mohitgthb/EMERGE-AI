/**
 * resetData.js — Safe database reset for EMERGE-AI
 *
 * Deletes all transactional / demo / test records in dependency order
 * using a Prisma interactive transaction.
 *
 * Preserved:  User records with role = "ADMIN"
 * Cleared  :  Everything else (dispatches, incidents, vehicles, operators, etc.)
 *
 * Usage:  node prisma/resetData.js
 */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function resetDatabase() {
  console.log("═".repeat(60));
  console.log("  EMERGE-AI  ·  Database Reset");
  console.log("═".repeat(60));

  await prisma.$transaction(
    async (tx) => {
      // ── 1. Dispatch history (depends on incidents & vehicles) ───────────
      const statusHistory = await tx.statusHistory.deleteMany({});
      console.log(`  ✓ StatusHistory     ${statusHistory.count} rows deleted`);

      const dispatches = await tx.dispatch.deleteMany({});
      console.log(`  ✓ Dispatch          ${dispatches.count} rows deleted`);

      const fireDispatches = await tx.fireDispatch.deleteMany({});
      console.log(`  ✓ FireDispatch      ${fireDispatches.count} rows deleted`);

      const policeDispatches = await tx.policeDispatch.deleteMany({});
      console.log(`  ✓ PoliceDispatch    ${policeDispatches.count} rows deleted`);

      // ── 2. Emergency queue (references Accident / FireIncident) ─────────
      const queue = await tx.emergencyQueue.deleteMany({});
      console.log(`  ✓ EmergencyQueue    ${queue.count} rows deleted`);

      // ── 3. Incidents ────────────────────────────────────────────────────
      const accidents = await tx.accident.deleteMany({});
      console.log(`  ✓ Accident          ${accidents.count} rows deleted`);

      const fires = await tx.fireIncident.deleteMany({});
      console.log(`  ✓ FireIncident      ${fires.count} rows deleted`);

      const sos = await tx.sOSEvent.deleteMany({});
      console.log(`  ✓ SOSEvent          ${sos.count} rows deleted`);

      // ── 4. Operators (vehicle/hospital links) ──────────────────────────
      const operators = await tx.operator.deleteMany({});
      console.log(`  ✓ Operator          ${operators.count} rows deleted`);

      // ── 5. Vehicles ────────────────────────────────────────────────────
      const ambulances = await tx.ambulance.deleteMany({});
      console.log(`  ✓ Ambulance         ${ambulances.count} rows deleted`);

      const fireBrigades = await tx.fireBrigade.deleteMany({});
      console.log(`  ✓ FireBrigade       ${fireBrigades.count} rows deleted`);

      const policeUnits = await tx.policeUnit.deleteMany({});
      console.log(`  ✓ PoliceUnit        ${policeUnits.count} rows deleted`);

      // ── 6. Hospitals ───────────────────────────────────────────────────
      const hospitals = await tx.hospital.deleteMany({});
      console.log(`  ✓ Hospital          ${hospitals.count} rows deleted`);

      // ── 7. Infrastructure ──────────────────────────────────────────────
      const signals = await tx.trafficSignal.deleteMany({});
      console.log(`  ✓ TrafficSignal     ${signals.count} rows deleted`);

      const cameras = await tx.camera.deleteMany({});
      console.log(`  ✓ Camera            ${cameras.count} rows deleted`);

      // ── 8. Users — preserve ADMIN accounts ─────────────────────────────
      const nonAdminUsers = await tx.user.deleteMany({
        where: { role: { not: "ADMIN" } },
      });
      console.log(`  ✓ User (non-admin)  ${nonAdminUsers.count} rows deleted`);
    },
    { timeout: 30000 }
  );

  // Quick verification
  const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });

  console.log("");
  console.log("─".repeat(60));
  console.log(`  Reset complete.  Admin accounts preserved: ${adminCount}`);
  console.log("─".repeat(60));
}

resetDatabase()
  .catch((err) => {
    console.error("❌ Reset failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
