const express = require("express");
const { updateAmbulanceStatus } = require("../controllers/ambulance.controller");

const router = express.Router();

// Flow endpoint: POST /api/ambulance-status
router.post("/", updateAmbulanceStatus);

module.exports = router;
