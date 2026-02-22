const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/vehicleCrash.controller");

// POST /api/vehicle/crash — trigger crash event
router.post("/crash", ctrl.triggerCrash);

// POST /api/vehicle/crash/:id/cancel — cancel within window
router.post("/crash/:id/cancel", ctrl.cancelCrash);

// GET /api/vehicle/crashes — list all
router.get("/crashes", ctrl.listCrashes);

// GET /api/vehicle/crash/:id — single
router.get("/crash/:id", ctrl.getCrash);

module.exports = router;
