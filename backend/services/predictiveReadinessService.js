/**
 * Predictive Emergency Readiness Service
 *
 * Analyzes real incident history + YOLO vehicle-density data to compute per-zone
 * risk scores and generate proactive vehicle-reposition suggestions.
 *
 * Grid system: ~0.01° cells (≈1.1 km) for deterministic, stable zone clustering.
 *
 * Risk formula per zone:
 *   risk_score = incident_score + density_score + time_score
 *
 * Reliability:
 *   - Never overrides vehicles with active dispatches.
 *   - Ignores zones with < MIN_INCIDENTS data points.
 *   - Debounces recalculation (MIN_RECALC_INTERVAL_MS).
 *   - Suggestions expire after SUGGESTION_TTL_MIN minutes.
 */

const prisma = require("../config/db");
const { distanceKm } = require("../utils/geo");
const socket = require("../socket");

// ─── Config ──────────────────────────────────────────────────────────────────
const GRID_SIZE = 0.01; // ~1.1 km cell side
const LOOKBACK_DAYS = 14;
const MIN_INCIDENTS = 2; // zones below this are ignored
const SEVERITY_WEIGHTS = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
const MIN_RECALC_INTERVAL_MS = 5 * 60 * 1000; // 5 min debounce
const SUGGESTION_TTL_MIN = 30; // suggestions expire after 30 min
const TOP_ZONES_COUNT = 3;
const AVG_SPEED_KMH = 40; // assumed avg emergency vehicle speed

// ─── Internal State ──────────────────────────────────────────────────────────
let _lastRecalcAt = 0;
let _recalcTimer = null;
let _riskCache = null; // { zones, timestamp }

// ─── Grid Helpers ────────────────────────────────────────────────────────────
const toGridKey = (lat, lng) => {
  const gLat = (Math.floor(lat / GRID_SIZE) * GRID_SIZE).toFixed(4);
  const gLng = (Math.floor(lng / GRID_SIZE) * GRID_SIZE).toFixed(4);
  return `${gLat}_${gLng}`;
};

const gridCenter = (gridKey) => {
  const [lat, lng] = gridKey.split("_").map(Number);
  return { lat: lat + GRID_SIZE / 2, lng: lng + GRID_SIZE / 2 };
};

// ─── Data Fetchers ───────────────────────────────────────────────────────────

/** Fetch incidents from the last LOOKBACK_DAYS across all tables. */
async function fetchRecentIncidents() {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [accidents, fires, sos] = await Promise.all([
    prisma.accident.findMany({
      where: { createdAt: { gte: since } },
      select: { latitude: true, longitude: true, severity: true, createdAt: true },
    }),
    prisma.fireIncident.findMany({
      where: { createdAt: { gte: since } },
      select: { latitude: true, longitude: true, severity: true, createdAt: true },
    }),
    prisma.sOSEvent.findMany({
      where: { createdAt: { gte: since }, status: { not: "REJECTED" } },
      select: { latitude: true, longitude: true, severity: true, createdAt: true },
    }),
  ]);

  return [
    ...accidents.map((a) => ({ ...a, type: "ACCIDENT" })),
    ...fires.map((f) => ({ ...f, type: "FIRE" })),
    ...sos.map((s) => ({ ...s, type: "SOS" })),
  ];
}

/** Fetch YOLO density summaries from the last LOOKBACK_DAYS. */
async function fetchDensitySummaries() {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  return prisma.densitySummary.findMany({
    where: { windowStart: { gte: since } },
  });
}

// ─── Risk Score Computation ──────────────────────────────────────────────────

function computeRiskZones(incidents, densities) {
  const gridMap = new Map(); // gridKey → { incidents:[], densities:[] }

  // Bucket incidents
  for (const inc of incidents) {
    const key = toGridKey(inc.latitude, inc.longitude);
    if (!gridMap.has(key)) gridMap.set(key, { incidents: [], densities: [] });
    gridMap.get(key).incidents.push(inc);
  }

  // Bucket densities
  for (const d of densities) {
    const key = toGridKey(d.latitude, d.longitude);
    if (!gridMap.has(key)) gridMap.set(key, { incidents: [], densities: [] });
    gridMap.get(key).densities.push(d);
  }

  // ─── Normalisation ranges ────
  let maxWeightedCount = 1;
  let maxDensity = 1;
  let maxTimeCount = 1;

  const rawEntries = [];

  for (const [key, { incidents: cellIncidents, densities: cellDensities }] of gridMap) {
    if (cellIncidents.length < MIN_INCIDENTS && cellDensities.length === 0) continue;

    // incident_score = severity-weighted count
    let weightedCount = 0;
    const hourBuckets = new Array(24).fill(0);
    for (const inc of cellIncidents) {
      weightedCount += SEVERITY_WEIGHTS[inc.severity] || 1;
      hourBuckets[new Date(inc.createdAt).getHours()]++;
    }

    // density_score = average vehicle count across summaries
    const avgDens =
      cellDensities.length > 0
        ? cellDensities.reduce((s, d) => s + d.avgDensity, 0) / cellDensities.length
        : 0;

    // time_score = incidents in current-hour bucket
    const currentHour = new Date().getHours();
    const timeCount = hourBuckets[currentHour] || 0;

    // Peak hour
    let peakHour = 0;
    let peakVal = 0;
    for (let h = 0; h < 24; h++) {
      if (hourBuckets[h] > peakVal) {
        peakVal = hourBuckets[h];
        peakHour = h;
      }
    }

    if (weightedCount > maxWeightedCount) maxWeightedCount = weightedCount;
    if (avgDens > maxDensity) maxDensity = avgDens;
    if (timeCount > maxTimeCount) maxTimeCount = timeCount;

    rawEntries.push({ key, weightedCount, avgDens, timeCount, peakHour, incidentCount: cellIncidents.length });
  }

  // Normalise & compute final scores
  const zones = rawEntries.map((e) => {
    const center = gridCenter(e.key);
    const incidentScore = (e.weightedCount / maxWeightedCount) * 40; // max 40
    const densityScore = (e.avgDens / maxDensity) * 30; // max 30
    const timeScore = (e.timeCount / maxTimeCount) * 30; // max 30
    const riskScore = Math.round((incidentScore + densityScore + timeScore) * 100) / 100;

    // Build human-readable reasons
    const reasons = [];
    if (incidentScore >= 20) reasons.push("High past accidents");
    if (densityScore >= 15) reasons.push("High vehicle density");
    if (timeScore >= 15) reasons.push("Peak time pattern");
    if (reasons.length === 0 && riskScore > 0) reasons.push("Moderate risk pattern");

    return {
      gridKey: e.key,
      centerLat: center.lat,
      centerLng: center.lng,
      riskScore,
      incidentScore: Math.round(incidentScore * 100) / 100,
      densityScore: Math.round(densityScore * 100) / 100,
      timeScore: Math.round(timeScore * 100) / 100,
      incidentCount: e.incidentCount,
      avgDensity: Math.round(e.avgDens * 100) / 100,
      peakHour: e.peakHour,
      reasons,
    };
  });

  // Sort descending by riskScore
  zones.sort((a, b) => b.riskScore - a.riskScore);

  return zones;
}

// ─── Persist Risk Zones ──────────────────────────────────────────────────────

async function persistZones(zones) {
  // Upsert each zone (Prisma upsert for idempotence)
  const ops = zones.map((z) =>
    prisma.riskZone.upsert({
      where: { gridKey: z.gridKey },
      update: {
        riskScore: z.riskScore,
        incidentScore: z.incidentScore,
        densityScore: z.densityScore,
        timeScore: z.timeScore,
        incidentCount: z.incidentCount,
        avgDensity: z.avgDensity,
        peakHour: z.peakHour,
        reasons: z.reasons,
      },
      create: {
        gridKey: z.gridKey,
        centerLat: z.centerLat,
        centerLng: z.centerLng,
        riskScore: z.riskScore,
        incidentScore: z.incidentScore,
        densityScore: z.densityScore,
        timeScore: z.timeScore,
        incidentCount: z.incidentCount,
        avgDensity: z.avgDensity,
        peakHour: z.peakHour,
        reasons: z.reasons,
      },
    })
  );

  await prisma.$transaction(ops);
}

// ─── Vehicle Suggestion Logic ────────────────────────────────────────────────

/**
 * For the top N risk zones, find nearest AVAILABLE vehicle and suggest standby.
 * Never selects vehicles with active dispatches.
 */
async function generateSuggestions(topZones) {
  // Get all active dispatch vehicle IDs to exclude
  const [activeAmbulance, activeFire] = await Promise.all([
    prisma.dispatch.findMany({
      where: { status: { in: ["ACTIVE", "EN_ROUTE", "ARRIVED"] } },
      select: { ambulanceId: true },
    }),
    prisma.fireDispatch.findMany({
      where: { status: { in: ["ACTIVE", "EN_ROUTE", "ARRIVED"] } },
      select: { fireBrigadeId: true },
    }),
  ]);

  const busyAmbulanceIds = new Set(activeAmbulance.map((d) => d.ambulanceId));
  const busyFireIds = new Set(activeFire.map((d) => d.fireBrigadeId));

  const [ambulances, fireBrigades] = await Promise.all([
    prisma.ambulance.findMany({ where: { status: "AVAILABLE" } }),
    prisma.fireBrigade.findMany({ where: { status: "AVAILABLE" } }),
  ]);

  const availableAmbulances = ambulances.filter((a) => !busyAmbulanceIds.has(a.id));
  const availableFireBrigades = fireBrigades.filter((f) => !busyFireIds.has(f.id));

  // Expire old pending suggestions
  await prisma.standbySuggestion.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });

  const suggestions = [];
  const expiresAt = new Date(Date.now() + SUGGESTION_TTL_MIN * 60 * 1000);
  const usedVehicleIds = new Set();

  for (const zone of topZones) {
    // Find nearest ambulance not already used
    let bestAmb = null;
    let bestAmbDist = Infinity;
    for (const amb of availableAmbulances) {
      if (usedVehicleIds.has(amb.id)) continue;
      const d = distanceKm(zone.centerLat, zone.centerLng, amb.latitude, amb.longitude);
      if (d < bestAmbDist) {
        bestAmbDist = d;
        bestAmb = amb;
      }
    }

    if (bestAmb && bestAmbDist > 0.5) {
      // Only suggest if vehicle is >0.5km away (avoid trivial moves)
      const currentResponseTime = (bestAmbDist / AVG_SPEED_KMH) * 3600; // seconds
      const improvedResponseTime = (0.5 / AVG_SPEED_KMH) * 3600; // ≈45s if near zone center
      const improvement = Math.max(0, currentResponseTime - improvedResponseTime);

      usedVehicleIds.add(bestAmb.id);
      suggestions.push({
        riskZoneId: zone.id, // will be set after DB upsert
        vehicleId: bestAmb.id,
        vehicleType: "AMBULANCE",
        vehicleNo: bestAmb.vehicleNo,
        currentLat: bestAmb.latitude,
        currentLng: bestAmb.longitude,
        suggestedLat: zone.centerLat,
        suggestedLng: zone.centerLng,
        distanceKm: Math.round(bestAmbDist * 100) / 100,
        responseTimeImprove: Math.round(improvement),
        status: "PENDING",
        expiresAt,
        _gridKey: zone.gridKey,
      });
    }

    // Find nearest fire brigade
    let bestFB = null;
    let bestFBDist = Infinity;
    for (const fb of availableFireBrigades) {
      if (usedVehicleIds.has(fb.id)) continue;
      const d = distanceKm(zone.centerLat, zone.centerLng, fb.latitude, fb.longitude);
      if (d < bestFBDist) {
        bestFBDist = d;
        bestFB = fb;
      }
    }

    if (bestFB && bestFBDist > 0.5) {
      const currentResponseTime = (bestFBDist / AVG_SPEED_KMH) * 3600;
      const improvedResponseTime = (0.5 / AVG_SPEED_KMH) * 3600;
      const improvement = Math.max(0, currentResponseTime - improvedResponseTime);

      usedVehicleIds.add(bestFB.id);
      suggestions.push({
        riskZoneId: null,
        vehicleId: bestFB.id,
        vehicleType: "FIRE_BRIGADE",
        vehicleNo: bestFB.vehicleNo,
        currentLat: bestFB.latitude,
        currentLng: bestFB.longitude,
        suggestedLat: zone.centerLat,
        suggestedLng: zone.centerLng,
        distanceKm: Math.round(bestFBDist * 100) / 100,
        responseTimeImprove: Math.round(improvement),
        status: "PENDING",
        expiresAt,
        _gridKey: zone.gridKey,
      });
    }
  }

  return suggestions;
}

async function persistSuggestions(suggestions) {
  // Resolve gridKey → zone.id
  const gridKeys = [...new Set(suggestions.map((s) => s._gridKey))];
  const zones = await prisma.riskZone.findMany({
    where: { gridKey: { in: gridKeys } },
    select: { id: true, gridKey: true },
  });
  const keyToId = Object.fromEntries(zones.map((z) => [z.gridKey, z.id]));

  const creates = [];
  for (const s of suggestions) {
    const zoneId = keyToId[s._gridKey];
    if (!zoneId) continue;
    const { _gridKey, ...data } = s;
    creates.push(
      prisma.standbySuggestion.create({
        data: { ...data, riskZoneId: zoneId },
      })
    );
  }

  if (creates.length > 0) {
    await prisma.$transaction(creates);
  }
}

// ─── Public: Full Recalculation ──────────────────────────────────────────────

async function recalculate(force = false) {
  const now = Date.now();
  if (!force && now - _lastRecalcAt < MIN_RECALC_INTERVAL_MS) {
    console.log("[Predictive] Skipped — recalc debounce active");
    return _riskCache;
  }

  console.log("[Predictive] Recalculating risk zones...");
  _lastRecalcAt = now;

  try {
    const [incidents, densities] = await Promise.all([
      fetchRecentIncidents(),
      fetchDensitySummaries(),
    ]);

    const zones = computeRiskZones(incidents, densities);

    if (zones.length === 0) {
      console.log("[Predictive] No zones with sufficient data");
      _riskCache = { zones: [], topZones: [], suggestions: [], timestamp: new Date().toISOString() };
      return _riskCache;
    }

    await persistZones(zones);

    // Re-fetch persisted zones (to get IDs)
    const topZonesFromDB = await prisma.riskZone.findMany({
      orderBy: { riskScore: "desc" },
      take: TOP_ZONES_COUNT,
    });

    const topZones = topZonesFromDB.map((z) => ({
      ...z,
      centerLat: z.centerLat,
      centerLng: z.centerLng,
    }));

    const suggestions = await generateSuggestions(topZones);
    await persistSuggestions(suggestions);

    // Re-fetch active suggestions
    const activeSuggestions = await prisma.standbySuggestion.findMany({
      where: { status: "PENDING" },
      include: { riskZone: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    _riskCache = {
      zones,
      topZones,
      suggestions: activeSuggestions,
      timestamp: new Date().toISOString(),
    };

    // Emit socket events
    try {
      const io = socket.getIO();
      io.emit("RISK_ZONE_UPDATED", {
        zones: topZones,
        allZones: zones,
        timestamp: _riskCache.timestamp,
      });

      if (activeSuggestions.length > 0) {
        io.emit("STANDBY_SUGGESTION", {
          suggestions: activeSuggestions,
          timestamp: _riskCache.timestamp,
        });

        // Emit targeted notification to each vehicle's room
        for (const s of activeSuggestions) {
          const payload = {
            suggestionId: s.id,
            vehicleId: s.vehicleId,
            vehicleType: s.vehicleType,
            vehicleNo: s.vehicleNo,
            currentLat: s.currentLat,
            currentLng: s.currentLng,
            suggestedLat: s.suggestedLat,
            suggestedLng: s.suggestedLng,
            distanceKm: s.distanceKm,
            responseTimeImprove: s.responseTimeImprove,
            expiresAt: s.expiresAt,
            riskZone: s.riskZone || null,
            timestamp: _riskCache.timestamp,
          };
          // Send to vehicle-specific room (operators listening)
          io.to(`vehicle:${s.vehicleId}`).emit("STANDBY_NOTIFICATION", payload);
          // Also broadcast globally for demo/admin dashboards
          io.emit("STANDBY_NOTIFICATION", payload);
        }
      }
    } catch (socketErr) {
      console.warn("[Predictive] Socket emit failed:", socketErr.message);
    }

    console.log(`[Predictive] Done — ${zones.length} zones, top score: ${zones[0]?.riskScore ?? 0}, ${activeSuggestions.length} suggestions`);
    return _riskCache;
  } catch (err) {
    console.error("[Predictive] Recalculation failed:", err.message);
    throw err;
  }
}

// ─── Public: Accept Standby Move ─────────────────────────────────────────────

async function acceptStandby(suggestionId) {
  const suggestion = await prisma.standbySuggestion.findUnique({ where: { id: suggestionId } });

  if (!suggestion || suggestion.status !== "PENDING") {
    throw new Error("Suggestion not found or not pending");
  }

  // Check expiry
  if (new Date() > suggestion.expiresAt) {
    await prisma.standbySuggestion.update({ where: { id: suggestionId }, data: { status: "EXPIRED" } });
    throw new Error("Suggestion has expired");
  }

  // Verify vehicle is still available (race condition guard)
  if (suggestion.vehicleType === "AMBULANCE") {
    const amb = await prisma.ambulance.findUnique({ where: { id: suggestion.vehicleId } });
    if (!amb || amb.status !== "AVAILABLE") throw new Error("Vehicle is no longer available");

    await prisma.ambulance.update({
      where: { id: suggestion.vehicleId },
      data: {
        latitude: suggestion.suggestedLat,
        longitude: suggestion.suggestedLng,
      },
    });
  } else if (suggestion.vehicleType === "FIRE_BRIGADE") {
    const fb = await prisma.fireBrigade.findUnique({ where: { id: suggestion.vehicleId } });
    if (!fb || fb.status !== "AVAILABLE") throw new Error("Vehicle is no longer available");

    await prisma.fireBrigade.update({
      where: { id: suggestion.vehicleId },
      data: {
        latitude: suggestion.suggestedLat,
        longitude: suggestion.suggestedLng,
      },
    });
  }

  await prisma.standbySuggestion.update({ where: { id: suggestionId }, data: { status: "ACCEPTED" } });

  // Emit socket
  try {
    const io = socket.getIO();
    io.emit("VEHICLE_LOCATION_UPDATE", {
      vehicleId: suggestion.vehicleId,
      vehicleType: suggestion.vehicleType,
      vehicleNo: suggestion.vehicleNo,
      status: "AVAILABLE",
      latitude: suggestion.suggestedLat,
      longitude: suggestion.suggestedLng,
      timestamp: new Date().toISOString(),
    });
    io.emit("STANDBY_ACCEPTED", {
      suggestionId,
      vehicleId: suggestion.vehicleId,
      vehicleNo: suggestion.vehicleNo,
      vehicleType: suggestion.vehicleType,
      timestamp: new Date().toISOString(),
    });
  } catch (socketErr) {
    console.warn("[Predictive] Socket emit failed:", socketErr.message);
  }

  return { message: "Vehicle repositioned", suggestion };
}

// ─── Public: Dismiss Suggestion ──────────────────────────────────────────────

async function dismissSuggestion(suggestionId) {
  await prisma.standbySuggestion.update({
    where: { id: suggestionId },
    data: { status: "DISMISSED" },
  });
  return { message: "Suggestion dismissed" };
}

// ─── Public: Get Cached / Fresh Data ─────────────────────────────────────────

async function getRiskData() {
  if (_riskCache && Date.now() - new Date(_riskCache.timestamp).getTime() < MIN_RECALC_INTERVAL_MS) {
    return _riskCache;
  }
  return recalculate();
}

async function getTopZones() {
  return prisma.riskZone.findMany({
    orderBy: { riskScore: "desc" },
    take: TOP_ZONES_COUNT,
    include: { suggestions: { where: { status: "PENDING" } } },
  });
}

async function getAllZones() {
  return prisma.riskZone.findMany({
    orderBy: { riskScore: "desc" },
  });
}

async function getActiveSuggestions() {
  return prisma.standbySuggestion.findMany({
    where: { status: "PENDING", expiresAt: { gt: new Date() } },
    include: { riskZone: true },
    orderBy: { responseTimeImprove: "desc" },
  });
}

// ─── Public: Ingest YOLO Density Data ────────────────────────────────────────

async function ingestDensity({ cameraId, latitude, longitude, vehicleCount, avgDensity, windowStart, windowEnd }) {
  await prisma.densitySummary.create({
    data: {
      cameraId,
      latitude,
      longitude,
      vehicleCount,
      avgDensity,
      windowStart: new Date(windowStart),
      windowEnd: new Date(windowEnd),
    },
  });

  // If density is high, trigger recalc
  if (avgDensity > 15) {
    scheduleRecalc();
  }
}

// ─── Scheduled / Triggered Recalculations ────────────────────────────────────

function scheduleRecalc() {
  if (_recalcTimer) return; // already scheduled
  _recalcTimer = setTimeout(async () => {
    _recalcTimer = null;
    try {
      await recalculate();
    } catch (err) {
      console.error("[Predictive] Scheduled recalc failed:", err.message);
    }
  }, 2000); // 2s debounce
}

/** Called when a new incident is created — trigger re-score. */
function onNewIncident() {
  scheduleRecalc();
}

/** Start periodic recalculation (every 10 minutes). */
let _periodicInterval = null;
function startPeriodicRecalc() {
  if (_periodicInterval) return;
  _periodicInterval = setInterval(async () => {
    try {
      await recalculate();
    } catch (err) {
      console.error("[Predictive] Periodic recalc failed:", err.message);
    }
  }, 10 * 60 * 1000); // 10 minutes
  console.log("[Predictive] Periodic recalculation started (every 10 min)");
}

function stopPeriodicRecalc() {
  if (_periodicInterval) {
    clearInterval(_periodicInterval);
    _periodicInterval = null;
  }
}

module.exports = {
  recalculate,
  getRiskData,
  getTopZones,
  getAllZones,
  getActiveSuggestions,
  acceptStandby,
  dismissSuggestion,
  ingestDensity,
  onNewIncident,
  startPeriodicRecalc,
  stopPeriodicRecalc,
};
