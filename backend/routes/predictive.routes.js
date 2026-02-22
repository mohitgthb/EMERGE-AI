const express = require("express");
const {
  getRiskData,
  getZones,
  getTopZones,
  getSuggestions,
  recalculate,
  acceptSuggestion,
  dismissSuggestion,
  ingestDensity,
} = require("../controllers/predictive.controller");

const router = express.Router();

router.get("/risk-data", getRiskData);
router.get("/zones", getZones);
router.get("/top-zones", getTopZones);
router.get("/suggestions", getSuggestions);

router.post("/recalculate", recalculate);
router.post("/suggestions/:id/accept", acceptSuggestion);
router.post("/suggestions/:id/dismiss", dismissSuggestion);
router.post("/density", ingestDensity);

module.exports = router;
