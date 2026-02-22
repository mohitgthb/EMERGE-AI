const predictiveService = require("../services/predictiveReadinessService");

// GET /api/predictive/risk-data — full risk data (zones + suggestions)
exports.getRiskData = async (req, res) => {
  try {
    const data = await predictiveService.getRiskData();
    res.json(data);
  } catch (err) {
    console.error("[Predictive] getRiskData error:", err.message);
    res.status(500).json({ message: "Failed to get risk data", error: err.message });
  }
};

// GET /api/predictive/zones — all risk zones
exports.getZones = async (req, res) => {
  try {
    const zones = await predictiveService.getAllZones();
    res.json(zones);
  } catch (err) {
    console.error("[Predictive] getZones error:", err.message);
    res.status(500).json({ message: "Failed to get zones", error: err.message });
  }
};

// GET /api/predictive/top-zones — top N risk zones with suggestions
exports.getTopZones = async (req, res) => {
  try {
    const zones = await predictiveService.getTopZones();
    res.json(zones);
  } catch (err) {
    console.error("[Predictive] getTopZones error:", err.message);
    res.status(500).json({ message: "Failed to get top zones", error: err.message });
  }
};

// GET /api/predictive/suggestions — active standby suggestions
exports.getSuggestions = async (req, res) => {
  try {
    const suggestions = await predictiveService.getActiveSuggestions();
    res.json(suggestions);
  } catch (err) {
    console.error("[Predictive] getSuggestions error:", err.message);
    res.status(500).json({ message: "Failed to get suggestions", error: err.message });
  }
};

// POST /api/predictive/recalculate — force recalculation
exports.recalculate = async (req, res) => {
  try {
    const data = await predictiveService.recalculate(true);
    res.json(data);
  } catch (err) {
    console.error("[Predictive] recalculate error:", err.message);
    res.status(500).json({ message: "Failed to recalculate", error: err.message });
  }
};

// POST /api/predictive/suggestions/:id/accept — accept standby move
exports.acceptSuggestion = async (req, res) => {
  try {
    const result = await predictiveService.acceptStandby(req.params.id);
    res.json(result);
  } catch (err) {
    console.error("[Predictive] acceptSuggestion error:", err.message);
    res.status(400).json({ message: err.message });
  }
};

// POST /api/predictive/suggestions/:id/dismiss — dismiss suggestion
exports.dismissSuggestion = async (req, res) => {
  try {
    const result = await predictiveService.dismissSuggestion(req.params.id);
    res.json(result);
  } catch (err) {
    console.error("[Predictive] dismissSuggestion error:", err.message);
    res.status(400).json({ message: err.message });
  }
};

// POST /api/predictive/density — ingest YOLO density data
exports.ingestDensity = async (req, res) => {
  try {
    const { cameraId, latitude, longitude, vehicleCount, avgDensity, windowStart, windowEnd } = req.body;

    if (!cameraId || latitude == null || longitude == null) {
      return res.status(400).json({ message: "cameraId, latitude, longitude required" });
    }

    await predictiveService.ingestDensity({
      cameraId,
      latitude,
      longitude,
      vehicleCount: vehicleCount || 0,
      avgDensity: avgDensity || 0,
      windowStart: windowStart || new Date().toISOString(),
      windowEnd: windowEnd || new Date().toISOString(),
    });

    res.json({ message: "Density data ingested" });
  } catch (err) {
    console.error("[Predictive] ingestDensity error:", err.message);
    res.status(500).json({ message: "Failed to ingest density", error: err.message });
  }
};
