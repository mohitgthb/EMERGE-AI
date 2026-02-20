require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding operators...\n");

  // Fetch existing vehicles & hospitals for linking
  const ambulances = await prisma.ambulance.findMany({ orderBy: { vehicleNo: "asc" } });
  const fireBrigades = await prisma.fireBrigade.findMany({ orderBy: { vehicleNo: "asc" } });
  const policeUnits = await prisma.policeUnit.findMany({ orderBy: { vehicleNo: "asc" } });
  const hospitals = await prisma.hospital.findMany({ orderBy: { name: "asc" } });

  console.log(`Found: ${ambulances.length} ambulances, ${fireBrigades.length} fire brigades, ${policeUnits.length} police units, ${hospitals.length} hospitals\n`);

  const defaultPassword = await bcrypt.hash("emerge123", 10);

  // --- Admin operator ---
  const operators = [
    {
      operatorId: "ADMIN-001",
      password: defaultPassword,
      name: "System Admin",
      role: "ADMIN",
      vehicleId: null,
    },
  ];

  // --- Ambulance operators (one per ambulance) ---
  ambulances.forEach((amb, i) => {
    operators.push({
      operatorId: `AMB-${String(i + 1).padStart(3, "0")}`,
      password: defaultPassword,
      name: `Ambulance Operator ${i + 1}`,
      role: "AMBULANCE",
      vehicleId: amb.id,
    });
  });

  // --- Fire brigade operators (one per vehicle) ---
  fireBrigades.forEach((fb, i) => {
    operators.push({
      operatorId: `FB-${String(i + 1).padStart(3, "0")}`,
      password: defaultPassword,
      name: `Fire Brigade Operator ${i + 1}`,
      role: "FIRE_BRIGADE",
      vehicleId: fb.id,
    });
  });

  // --- Police operators (one per vehicle) ---
  policeUnits.forEach((pu, i) => {
    operators.push({
      operatorId: `PU-${String(i + 1).padStart(3, "0")}`,
      password: defaultPassword,
      name: `Police Operator ${i + 1}`,
      role: "POLICE",
      vehicleId: pu.id,
    });
  });

  // --- Hospital operators (one per hospital) ---
  hospitals.forEach((hosp, i) => {
    operators.push({
      operatorId: `HOSP-${String(i + 1).padStart(3, "0")}`,
      password: defaultPassword,
      name: `${hosp.name} Operator`,
      role: "HOSPITAL",
      vehicleId: null,
      hospitalId: hosp.id,
    });
  });

  let created = 0;
  let skipped = 0;

  for (const op of operators) {
    const existing = await prisma.operator.findUnique({ where: { operatorId: op.operatorId } });
    if (existing) {
      console.log(`  SKIP  ${op.operatorId} (already exists)`);
      skipped++;
      continue;
    }

    await prisma.operator.create({ data: op });
    console.log(`  CREATE  ${op.operatorId}  →  ${op.role}${op.vehicleId ? `  [vehicle: ${op.vehicleId.slice(0, 8)}...]` : ""}`);
    created++;
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
  console.log(`\nAll operators use password: emerge123`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => { pool.end(); });
