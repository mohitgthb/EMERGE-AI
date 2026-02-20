const express = require("express");
const {
  dispatchAmbulance,
  listDispatches,
  getAnalytics,
  getDispatch,
  getRouteInfo,
  getNearestHospital,
  activateGreenCorridor,
  deactivateGreenCorridor,
  updateVehicleStatus,
  getStatusTimeline,
  getDualRoutes,
  getCluster,
  getClusterEvents,
  updateVehicleLocation,
} = require("../controllers/dispatch.controller");
const { optionalAuth, authenticate, requireVehicleOwnership } = require("../middleware/auth");

const router = express.Router();

router.get("/", optionalAuth, listDispatches);
router.get("/analytics", getAnalytics);
router.get("/route", getRouteInfo);
router.get("/nearest-hospital", getNearestHospital);
router.get("/:id", optionalAuth, getDispatch);
router.get("/:id/timeline", optionalAuth, getStatusTimeline);
router.get("/:id/dual-routes", optionalAuth, getDualRoutes);
router.get("/cluster/:eventId", getCluster);
router.get("/cluster/:clusterId/events", getClusterEvents);
router.post("/", dispatchAmbulance);
router.post("/green-corridor/activate", activateGreenCorridor);
router.post("/green-corridor/deactivate", deactivateGreenCorridor);
router.post("/vehicle-status", authenticate, requireVehicleOwnership, updateVehicleStatus);
router.post("/vehicle-location", authenticate, requireVehicleOwnership, updateVehicleLocation);

module.exports = router;