/**
 * seedPune.js — Structured Pune-city seed for EMERGE-AI
 *
 * Idem­potent: uses upsert on unique fields so re-running is safe.
 * All coordinates are real Pune locations (WGS-84).
 * Passwords hashed with bcrypt (default: emerge123).
 *
 * Usage:  node prisma/seedPune.js
 */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ═══════════════════════════════════════════════════════════════════════════
//  DATA  — all Pune-based, real coordinates
// ═══════════════════════════════════════════════════════════════════════════

// ── Ambulances ─────────────────────────────────────────────────────────────
const AMBULANCES = [
  { vehicleNo: "MH-12-AMB-001", latitude: 18.5314, longitude: 73.8446, zone: "Shivajinagar", driver: "Rajesh Patil"    },
  { vehicleNo: "MH-12-AMB-002", latitude: 18.5912, longitude: 73.7389, zone: "Hinjewadi",    driver: "Sanjay Kulkarni" },
  { vehicleNo: "MH-12-AMB-003", latitude: 18.5074, longitude: 73.8077, zone: "Kothrud",      driver: "Amit Jadhav"     },
  { vehicleNo: "MH-12-AMB-004", latitude: 18.5089, longitude: 73.9260, zone: "Hadapsar",     driver: "Vikas Shinde"    },
  { vehicleNo: "MH-12-AMB-005", latitude: 18.5679, longitude: 73.9787, zone: "Wagholi",      driver: "Prashant More"   },
  { vehicleNo: "MH-12-AMB-006", latitude: 18.5590, longitude: 73.7868, zone: "Baner",        driver: "Suresh Deshmukh" },
  { vehicleNo: "MH-12-AMB-007", latitude: 18.5196, longitude: 73.8553, zone: "Swargate",     driver: "Ganesh Pawar"    },
  { vehicleNo: "MH-12-AMB-008", latitude: 18.4616, longitude: 73.8686, zone: "Katraj",       driver: "Mahesh Gaikwad"  },
];

// ── Fire Brigades ──────────────────────────────────────────────────────────
const FIRE_BRIGADES = [
  { vehicleNo: "MH-12-FB-001", latitude: 18.5196, longitude: 73.8807, zone: "Pune Camp",      driver: "Nilesh Bhosale"  },
  { vehicleNo: "MH-12-FB-002", latitude: 18.6298, longitude: 73.7997, zone: "Pimpri",         driver: "Ramesh Chavan"   },
  { vehicleNo: "MH-12-FB-003", latitude: 18.4810, longitude: 73.8149, zone: "Sinhagad Road",  driver: "Tanaji Mane"     },
  { vehicleNo: "MH-12-FB-004", latitude: 18.5150, longitude: 73.9340, zone: "Magarpatta",     driver: "Sachin Kale"     },
  { vehicleNo: "MH-12-FB-005", latitude: 18.5641, longitude: 73.7719, zone: "Balewadi",       driver: "Deepak Rane"     },
];

// ── Police Units ───────────────────────────────────────────────────────────
const POLICE_UNITS = [
  { vehicleNo: "MH-12-POL-001", latitude: 18.5314, longitude: 73.8446, zone: "Shivajinagar PS", officer: "Insp. Patil"    },
  { vehicleNo: "MH-12-POL-002", latitude: 18.5953, longitude: 73.7614, zone: "Wakad PS",        officer: "Insp. Desai"    },
  { vehicleNo: "MH-12-POL-003", latitude: 18.5089, longitude: 73.9260, zone: "Hadapsar PS",     officer: "Insp. Jagtap"   },
  { vehicleNo: "MH-12-POL-004", latitude: 18.5590, longitude: 73.7868, zone: "Baner PS",        officer: "Insp. Kulkarni" },
  { vehicleNo: "MH-12-POL-005", latitude: 18.5074, longitude: 73.8077, zone: "Kothrud PS",      officer: "Insp. Bhagwat"  },
  { vehicleNo: "MH-12-POL-006", latitude: 18.5196, longitude: 73.8553, zone: "Swargate PS",     officer: "Insp. Sawant"   },
];

// ── Hospitals ──────────────────────────────────────────────────────────────
const HOSPITALS = [
  { name: "Ruby Hall Clinic",            latitude: 18.5336, longitude: 73.8819, beds: 40, trauma: true  },
  { name: "Sassoon General Hospital",    latitude: 18.5226, longitude: 73.8697, beds: 60, trauma: true  },
  { name: "Jupiter Hospital",           latitude: 18.5640, longitude: 73.7710, beds: 35, trauma: true  },
  { name: "Sahyadri Hospital Deccan",   latitude: 18.5160, longitude: 73.8410, beds: 30, trauma: true  },
  { name: "Noble Hospital Hadapsar",    latitude: 18.5050, longitude: 73.9350, beds: 28, trauma: false },
  { name: "Deenanath Mangeshkar Hospital", latitude: 18.5105, longitude: 73.8070, beds: 45, trauma: true  },
  { name: "KEM Hospital Pune",          latitude: 18.4975, longitude: 73.8645, beds: 50, trauma: true  },
  { name: "Aditya Birla Memorial Hospital", latitude: 18.6480, longitude: 73.7760, beds: 32, trauma: false },
];

// ── Traffic Signals (major Pune junctions) ─────────────────────────────────
const TRAFFIC_SIGNALS = [
  { junctionId: "SIG-PUNE-001", name: "University Chowk",          latitude: 18.5255, longitude: 73.8468 },
  { junctionId: "SIG-PUNE-002", name: "Swargate Chowk",            latitude: 18.5012, longitude: 73.8630 },
  { junctionId: "SIG-PUNE-003", name: "Chandni Chowk Bavdhan",     latitude: 18.5130, longitude: 73.7812 },
  { junctionId: "SIG-PUNE-004", name: "Hinjewadi Chowk",           latitude: 18.5912, longitude: 73.7389 },
  { junctionId: "SIG-PUNE-005", name: "Wakad Chowk",               latitude: 18.5953, longitude: 73.7614 },
  { junctionId: "SIG-PUNE-006", name: "Baner Sus Road Signal",     latitude: 18.5580, longitude: 73.7880 },
  { junctionId: "SIG-PUNE-007", name: "Deccan Gymkhana Signal",    latitude: 18.5160, longitude: 73.8400 },
  { junctionId: "SIG-PUNE-008", name: "FC Road JM Road Junction",  latitude: 18.5280, longitude: 73.8420 },
  { junctionId: "SIG-PUNE-009", name: "Magarpatta Road Signal",    latitude: 18.5150, longitude: 73.9340 },
  { junctionId: "SIG-PUNE-010", name: "RTO Chowk Koregaon Park",  latitude: 18.5370, longitude: 73.8960 },
  { junctionId: "SIG-PUNE-011", name: "Katraj Chowk",              latitude: 18.4580, longitude: 73.8650 },
  { junctionId: "SIG-PUNE-012", name: "Hadapsar Gadital",          latitude: 18.5070, longitude: 73.9280 },
  { junctionId: "SIG-PUNE-013", name: "Nigdi Pradhikaran Signal",  latitude: 18.6500, longitude: 73.7720 },
  { junctionId: "SIG-PUNE-014", name: "Shivajinagar ST Stand",     latitude: 18.5340, longitude: 73.8500 },
  { junctionId: "SIG-PUNE-015", name: "Kothrud Depo Signal",       latitude: 18.5100, longitude: 73.8110 },
];

// ── Cameras (Pune locations) ──────────────────────────────────────────────
const CAMERAS = [
  { cameraId: "CAM-PUNE-001", name: "University Circle Cam",       location: "University Circle, Shivajinagar", latitude: 18.5255, longitude: 73.8468, rtspUrl: "rtsp://192.168.10.101:554/stream1" },
  { cameraId: "CAM-PUNE-002", name: "Swargate Junction Cam",       location: "Swargate Bus Depot Junction",     latitude: 18.5012, longitude: 73.8630, rtspUrl: "rtsp://192.168.10.102:554/stream1" },
  { cameraId: "CAM-PUNE-003", name: "Hinjewadi IT Park Cam",       location: "Hinjewadi Phase 1 Entry",         latitude: 18.5912, longitude: 73.7389, rtspUrl: "rtsp://192.168.10.103:554/stream1" },
  { cameraId: "CAM-PUNE-004", name: "Chandni Chowk Cam",           location: "Chandni Chowk Bavdhan Flyover",   latitude: 18.5130, longitude: 73.7812, rtspUrl: "rtsp://192.168.10.104:554/stream1" },
  { cameraId: "CAM-PUNE-005", name: "Magarpatta City Cam",         location: "Magarpatta City Gate",            latitude: 18.5150, longitude: 73.9340, rtspUrl: "rtsp://192.168.10.105:554/stream1" },
  { cameraId: "CAM-PUNE-006", name: "Katraj Tunnel Cam",           location: "Katraj Tunnel Entry (NH4)",       latitude: 18.4520, longitude: 73.8600, rtspUrl: "rtsp://192.168.10.106:554/stream1" },
  { cameraId: "CAM-PUNE-007", name: "Pune-Mumbai Expressway Cam",  location: "Expressway Toll Naka Kiwale",     latitude: 18.6350, longitude: 73.7350, rtspUrl: "rtsp://192.168.10.107:554/stream1" },
  { cameraId: "CAM-PUNE-008", name: "FC Road Cam",                 location: "FC Road near Garware Bridge",     latitude: 18.5280, longitude: 73.8420, rtspUrl: "rtsp://192.168.10.108:554/stream1" },
];

// ── Sample Incidents ───────────────────────────────────────────────────────
const SAMPLE_ACCIDENTS = [
  {
    latitude: 18.5255,
    longitude: 73.8468,
    severity: "HIGH",
    detectedBy: "CAMERA",
    confidence: 0.92,
    cameraId: "CAM-PUNE-001",
    emergencyType: "ACCIDENT",
    description: "Multi-vehicle collision near University Circle",
  },
  {
    latitude: 18.5130,
    longitude: 73.7812,
    severity: "MEDIUM",
    detectedBy: "CAMERA",
    confidence: 0.85,
    cameraId: "CAM-PUNE-004",
    emergencyType: "ACCIDENT",
    description: "Two-wheeler accident at Chandni Chowk",
  },
];

const SAMPLE_FIRE_INCIDENTS = [
  {
    latitude: 18.6298,
    longitude: 73.7980,
    severity: "HIGH",
    detectedBy: "CAMERA",
    confidence: 0.88,
    cameraId: "CAM-PUNE-007",
    description: "Industrial fire near Pimpri MIDC area",
  },
];

const SAMPLE_SOS_EVENTS = [
  {
    latitude: 18.5280,
    longitude: 73.8420,
    emergencyType: "SAFETY",
    severity: "HIGH",
    status: "PENDING",
    description: "Suspicious activity reported near FC Road",
  },
  {
    latitude: 18.5012,
    longitude: 73.8630,
    emergencyType: "MEDICAL",
    severity: "MEDIUM",
    status: "PENDING",
    description: "Person collapsed near Swargate bus stand",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS — haversine + nearest entity + best hospital (inline so seed
//            runs without requiring the server's service layer)
// ═══════════════════════════════════════════════════════════════════════════

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestEntity(entities, lat, lng) {
  if (entities.length === 0) return null;
  let best = entities[0];
  let bestDist = haversineKm(lat, lng, best.latitude, best.longitude);
  for (const e of entities) {
    const d = haversineKm(lat, lng, e.latitude, e.longitude);
    if (d < bestDist) { bestDist = d; best = e; }
  }
  return best;
}

function findBestHospital(hospitals, lat, lng) {
  const withBeds = hospitals.filter((h) => h.beds > 0);
  if (withBeds.length === 0) return null;
  let best = withBeds[0];
  let bestScore = Infinity;
  for (const h of withBeds) {
    const d = haversineKm(lat, lng, h.latitude, h.longitude);
    const score = d - h.beds * 0.01; // same scoring as hospitalSelector.js
    if (score < bestScore) { bestScore = score; best = h; }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════════════
//  SEED LOGIC
// ═══════════════════════════════════════════════════════════════════════════

async function seedPune() {
  console.log("═".repeat(60));
  console.log("  EMERGE-AI  ·  Pune City Seed");
  console.log("═".repeat(60));

  const defaultPassword = await bcrypt.hash("emerge123", 10);

  // ── 1. Hospitals ──────────────────────────────────────────────────────
  console.log("\n🏥 Hospitals");
  const hospitalRecords = [];
  for (const h of HOSPITALS) {
    const rec = await prisma.hospital.upsert({
      where: { id: h.name.replace(/\s+/g, "-").toLowerCase() },
      update: { latitude: h.latitude, longitude: h.longitude, beds: h.beds },
      create: { name: h.name, latitude: h.latitude, longitude: h.longitude, beds: h.beds },
    });
    hospitalRecords.push(rec);
    console.log(`   ✓ ${rec.name}  (${rec.beds} beds)  [${rec.latitude}, ${rec.longitude}]`);
  }

  // ── 2. Ambulances ────────────────────────────────────────────────────
  console.log("\n🚑 Ambulances");
  const ambulanceRecords = [];
  for (const a of AMBULANCES) {
    const rec = await prisma.ambulance.upsert({
      where: { vehicleNo: a.vehicleNo },
      update: { latitude: a.latitude, longitude: a.longitude, status: "AVAILABLE" },
      create: { vehicleNo: a.vehicleNo, latitude: a.latitude, longitude: a.longitude, status: "AVAILABLE" },
    });
    ambulanceRecords.push({ ...rec, zone: a.zone, driver: a.driver });
    console.log(`   ✓ ${rec.vehicleNo}  →  ${a.zone}  (${a.driver})`);
  }

  // ── 3. Fire Brigades ─────────────────────────────────────────────────
  console.log("\n🚒 Fire Brigades");
  const fireBrigadeRecords = [];
  for (const fb of FIRE_BRIGADES) {
    const rec = await prisma.fireBrigade.upsert({
      where: { vehicleNo: fb.vehicleNo },
      update: { latitude: fb.latitude, longitude: fb.longitude, status: "AVAILABLE" },
      create: { vehicleNo: fb.vehicleNo, latitude: fb.latitude, longitude: fb.longitude, status: "AVAILABLE" },
    });
    fireBrigadeRecords.push({ ...rec, zone: fb.zone, driver: fb.driver });
    console.log(`   ✓ ${rec.vehicleNo}  →  ${fb.zone}  (${fb.driver})`);
  }

  // ── 4. Police Units ──────────────────────────────────────────────────
  console.log("\n👮 Police Units");
  const policeUnitRecords = [];
  for (const pu of POLICE_UNITS) {
    const rec = await prisma.policeUnit.upsert({
      where: { vehicleNo: pu.vehicleNo },
      update: { latitude: pu.latitude, longitude: pu.longitude, status: "AVAILABLE" },
      create: { vehicleNo: pu.vehicleNo, latitude: pu.latitude, longitude: pu.longitude, status: "AVAILABLE" },
    });
    policeUnitRecords.push({ ...rec, zone: pu.zone, officer: pu.officer });
    console.log(`   ✓ ${rec.vehicleNo}  →  ${pu.zone}  (${pu.officer})`);
  }

  // ── 5. Traffic Signals ───────────────────────────────────────────────
  console.log("\n🚦 Traffic Signals");
  for (const sig of TRAFFIC_SIGNALS) {
    await prisma.trafficSignal.upsert({
      where: { junctionId: sig.junctionId },
      update: { latitude: sig.latitude, longitude: sig.longitude, state: "NORMAL" },
      create: { junctionId: sig.junctionId, latitude: sig.latitude, longitude: sig.longitude, state: "NORMAL" },
    });
    console.log(`   ✓ ${sig.junctionId}  →  ${sig.name}`);
  }

  // ── 6. Cameras ───────────────────────────────────────────────────────
  console.log("\n📷 Cameras");
  for (const cam of CAMERAS) {
    await prisma.camera.upsert({
      where: { cameraId: cam.cameraId },
      update: { name: cam.name, location: cam.location, latitude: cam.latitude, longitude: cam.longitude, rtspUrl: cam.rtspUrl },
      create: {
        cameraId: cam.cameraId,
        name: cam.name,
        location: cam.location,
        latitude: cam.latitude,
        longitude: cam.longitude,
        rtspUrl: cam.rtspUrl,
        streamType: "RTSP",
        isActive: true,
      },
    });
    console.log(`   ✓ ${cam.cameraId}  →  ${cam.name}`);
  }

  // ── 7. Operators (credentials) ──────────────────────────────────────
  console.log("\n🔐 Operator Credentials  (password: emerge123)");

  // Admin operator
  await prisma.operator.upsert({
    where: { operatorId: "ADMIN-001" },
    update: { password: defaultPassword, name: "System Admin", role: "ADMIN" },
    create: { operatorId: "ADMIN-001", password: defaultPassword, name: "System Admin", role: "ADMIN" },
  });
  console.log("   ✓ ADMIN-001  →  System Admin");

  // Ambulance operators
  for (let i = 0; i < ambulanceRecords.length; i++) {
    const a = ambulanceRecords[i];
    const opId = `AMB-${String(i + 1).padStart(3, "0")}`;
    await prisma.operator.upsert({
      where: { operatorId: opId },
      update: { password: defaultPassword, name: a.driver, role: "AMBULANCE", vehicleId: a.id },
      create: { operatorId: opId, password: defaultPassword, name: a.driver, role: "AMBULANCE", vehicleId: a.id },
    });
    console.log(`   ✓ ${opId}  →  ${a.driver}  (${a.vehicleNo})`);
  }

  // Fire brigade operators
  for (let i = 0; i < fireBrigadeRecords.length; i++) {
    const fb = fireBrigadeRecords[i];
    const opId = `FB-${String(i + 1).padStart(3, "0")}`;
    await prisma.operator.upsert({
      where: { operatorId: opId },
      update: { password: defaultPassword, name: fb.driver, role: "FIRE_BRIGADE", vehicleId: fb.id },
      create: { operatorId: opId, password: defaultPassword, name: fb.driver, role: "FIRE_BRIGADE", vehicleId: fb.id },
    });
    console.log(`   ✓ ${opId}  →  ${fb.driver}  (${fb.vehicleNo})`);
  }

  // Police operators
  for (let i = 0; i < policeUnitRecords.length; i++) {
    const pu = policeUnitRecords[i];
    const opId = `PU-${String(i + 1).padStart(3, "0")}`;
    await prisma.operator.upsert({
      where: { operatorId: opId },
      update: { password: defaultPassword, name: pu.officer, role: "POLICE", vehicleId: pu.id },
      create: { operatorId: opId, password: defaultPassword, name: pu.officer, role: "POLICE", vehicleId: pu.id },
    });
    console.log(`   ✓ ${opId}  →  ${pu.officer}  (${pu.vehicleNo})`);
  }

  // Hospital operators
  for (let i = 0; i < hospitalRecords.length; i++) {
    const h = hospitalRecords[i];
    const opId = `HOSP-${String(i + 1).padStart(3, "0")}`;
    await prisma.operator.upsert({
      where: { operatorId: opId },
      update: { password: defaultPassword, name: `${h.name} Operator`, role: "HOSPITAL", hospitalId: h.id },
      create: { operatorId: opId, password: defaultPassword, name: `${h.name} Operator`, role: "HOSPITAL", hospitalId: h.id },
    });
    console.log(`   ✓ ${opId}  →  ${h.name}`);
  }

  // ── 8. Sample Incidents + Auto-Dispatch ─────────────────────────────
  console.log("\n🚨 Sample Incidents + Dispatch");

  const existingAccidents = await prisma.accident.count();
  const existingFires = await prisma.fireIncident.count();
  const existingSOS = await prisma.sOSEvent.count();

  // Track which vehicles get assigned so we don't double-assign
  const busyAmbulanceIds = new Set();
  const busyFireBrigadeIds = new Set();
  const busyPoliceIds = new Set();

  let dispatchCount = 0;

  // ── Accidents → Ambulance + Hospital dispatch ──
  if (existingAccidents === 0) {
    for (const acc of SAMPLE_ACCIDENTS) {
      const { description, ...data } = acc;
      const rec = await prisma.accident.create({ data });
      console.log(`   ✓ Accident  ${rec.id.slice(0, 8)}…  →  ${description}`);

      // Find nearest AVAILABLE ambulance (not already assigned in this seed)
      const availAmbs = ambulanceRecords.filter((a) => !busyAmbulanceIds.has(a.id));
      if (availAmbs.length > 0) {
        const nearest = findNearestEntity(availAmbs, rec.latitude, rec.longitude);
        const hospital = findBestHospital(hospitalRecords, rec.latitude, rec.longitude);

        if (nearest && hospital) {
          const dist = haversineKm(nearest.latitude, nearest.longitude, rec.latitude, rec.longitude);
          await prisma.$transaction(async (tx) => {
            await tx.ambulance.updateMany({ where: { id: nearest.id, status: "AVAILABLE" }, data: { status: "BUSY" } });
            await tx.hospital.updateMany({ where: { id: hospital.id, beds: { gt: 0 } }, data: { beds: { decrement: 1 } } });
            await tx.dispatch.create({
              data: {
                accidentId: rec.id,
                ambulanceId: nearest.id,
                hospitalId: hospital.id,
                routeProvider: "STRAIGHT_LINE",
                routeDistanceKm: dist,
                routeDurationSec: Math.round((dist / 40) * 3600), // ~40 km/h estimate
              },
            });
          });
          busyAmbulanceIds.add(nearest.id);
          dispatchCount++;
          console.log(`     ↳ Dispatched ${nearest.vehicleNo} → ${hospital.name}  (${dist.toFixed(2)} km)`);
        }
      }
    }
  } else {
    console.log(`   ⊘ Accidents skipped (${existingAccidents} already exist)`);
  }

  // ── Fire incidents → Fire Brigade dispatch ──
  if (existingFires === 0) {
    for (const fire of SAMPLE_FIRE_INCIDENTS) {
      const { description, ...data } = fire;
      const rec = await prisma.fireIncident.create({ data });
      console.log(`   ✓ Fire      ${rec.id.slice(0, 8)}…  →  ${description}`);

      const availFBs = fireBrigadeRecords.filter((fb) => !busyFireBrigadeIds.has(fb.id));
      if (availFBs.length > 0) {
        const nearest = findNearestEntity(availFBs, rec.latitude, rec.longitude);
        if (nearest) {
          const dist = haversineKm(nearest.latitude, nearest.longitude, rec.latitude, rec.longitude);
          await prisma.$transaction(async (tx) => {
            await tx.fireBrigade.updateMany({ where: { id: nearest.id, status: "AVAILABLE" }, data: { status: "BUSY" } });
            await tx.fireDispatch.create({
              data: {
                fireIncidentId: rec.id,
                fireBrigadeId: nearest.id,
                routeProvider: "STRAIGHT_LINE",
                routeDistanceKm: dist,
                routeDurationSec: Math.round((dist / 40) * 3600),
              },
            });
          });
          busyFireBrigadeIds.add(nearest.id);
          dispatchCount++;
          console.log(`     ↳ Dispatched ${nearest.vehicleNo}  (${dist.toFixed(2)} km)`);
        }
      }
    }
  } else {
    console.log(`   ⊘ Fires skipped (${existingFires} already exist)`);
  }

  // ── SOS events → Police dispatch (for SAFETY type) ──
  if (existingSOS === 0) {
    for (const sos of SAMPLE_SOS_EVENTS) {
      const { description, ...data } = sos;
      const rec = await prisma.sOSEvent.create({ data });
      console.log(`   ✓ SOS       ${rec.id.slice(0, 8)}…  →  ${description}`);

      // Dispatch police for SAFETY, ambulance for MEDICAL
      if (rec.emergencyType === "SAFETY") {
        const availPUs = policeUnitRecords.filter((pu) => !busyPoliceIds.has(pu.id));
        if (availPUs.length > 0) {
          const nearest = findNearestEntity(availPUs, rec.latitude, rec.longitude);
          if (nearest) {
            const dist = haversineKm(nearest.latitude, nearest.longitude, rec.latitude, rec.longitude);
            await prisma.$transaction(async (tx) => {
              await tx.policeUnit.updateMany({ where: { id: nearest.id, status: "AVAILABLE" }, data: { status: "BUSY" } });
              await tx.policeDispatch.create({
                data: {
                  sosEventId: rec.id,
                  policeUnitId: nearest.id,
                  routeProvider: "STRAIGHT_LINE",
                  routeDistanceKm: dist,
                  routeDurationSec: Math.round((dist / 40) * 3600),
                },
              });
            });
            busyPoliceIds.add(nearest.id);
            dispatchCount++;
            console.log(`     ↳ Dispatched ${nearest.vehicleNo}  (${dist.toFixed(2)} km)`);
          }
        }
      } else if (rec.emergencyType === "MEDICAL") {
        // Medical SOS → dispatch ambulance
        const availAmbs = ambulanceRecords.filter((a) => !busyAmbulanceIds.has(a.id));
        if (availAmbs.length > 0) {
          const nearest = findNearestEntity(availAmbs, rec.latitude, rec.longitude);
          const hospital = findBestHospital(hospitalRecords, rec.latitude, rec.longitude);
          if (nearest && hospital) {
            const dist = haversineKm(nearest.latitude, nearest.longitude, rec.latitude, rec.longitude);
            // Create an accident record for the medical SOS so Dispatch FK works
            const medAccident = await prisma.accident.create({
              data: {
                latitude: rec.latitude,
                longitude: rec.longitude,
                severity: rec.severity,
                detectedBy: "SOS",
                confidence: 0.9,
                emergencyType: "MEDICAL",
              },
            });
            await prisma.$transaction(async (tx) => {
              await tx.ambulance.updateMany({ where: { id: nearest.id, status: "AVAILABLE" }, data: { status: "BUSY" } });
              await tx.hospital.updateMany({ where: { id: hospital.id, beds: { gt: 0 } }, data: { beds: { decrement: 1 } } });
              await tx.dispatch.create({
                data: {
                  accidentId: medAccident.id,
                  ambulanceId: nearest.id,
                  hospitalId: hospital.id,
                  routeProvider: "STRAIGHT_LINE",
                  routeDistanceKm: dist,
                  routeDurationSec: Math.round((dist / 40) * 3600),
                },
              });
            });
            busyAmbulanceIds.add(nearest.id);
            dispatchCount++;
            console.log(`     ↳ Dispatched ${nearest.vehicleNo} → ${hospital.name}  (${dist.toFixed(2)} km)`);
          }
        }
      }
    }
  } else {
    console.log(`   ⊘ SOS events skipped (${existingSOS} already exist)`);
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("  SEED SUMMARY");
  console.log("─".repeat(60));
  console.log(`  Hospitals       : ${hospitalRecords.length}`);
  console.log(`  Ambulances      : ${ambulanceRecords.length}`);
  console.log(`  Fire Brigades   : ${fireBrigadeRecords.length}`);
  console.log(`  Police Units    : ${policeUnitRecords.length}`);
  console.log(`  Traffic Signals : ${TRAFFIC_SIGNALS.length}`);
  console.log(`  Cameras         : ${CAMERAS.length}`);
  console.log(`  Operators       : ${1 + ambulanceRecords.length + fireBrigadeRecords.length + policeUnitRecords.length + hospitalRecords.length}`);
  console.log(`  Sample Accidents: ${SAMPLE_ACCIDENTS.length}`);
  console.log(`  Sample Fires    : ${SAMPLE_FIRE_INCIDENTS.length}`);
  console.log(`  Sample SOS      : ${SAMPLE_SOS_EVENTS.length}`);
  console.log(`  Dispatches      : ${dispatchCount}`);
  console.log("─".repeat(60));
  console.log("  All operator passwords: emerge123");
  console.log("═".repeat(60));
}

seedPune()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
