const express = require("express");
const {
  getStatus,
  toggleDemoMode,
  startSimulation,
  startAllSimulations,
  stopSimulation,
  stopAllSimulations,
  overrideStatus,
} = require("../controllers/demo.controller");

const router = express.Router();

router.get("/status", getStatus);
router.post("/toggle", toggleDemoMode);
router.post("/simulate/:dispatchId", startSimulation);
router.post("/simulate-all", startAllSimulations);
router.post("/stop/:dispatchId", stopSimulation);
router.post("/stop-all", stopAllSimulations);
router.post("/override-status/:dispatchId", overrideStatus);

module.exports = router;
