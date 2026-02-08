const express = require("express");
const { getAllAmbulances, addAmbulance, updateAmbulanceStatus } = require("../controllers/ambulance.controller");

const router = express.Router();

router.get("/", getAllAmbulances);
router.post("/", addAmbulance);
router.put("/status", updateAmbulanceStatus);

// Alias route to match the flow documentation: POST /api/ambulance-status
router.post("/status", updateAmbulanceStatus);

module.exports = router;
