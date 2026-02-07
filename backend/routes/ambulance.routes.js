const express = require("express");
const { addAmbulance, updateAmbulanceStatus } = require("../controllers/ambulance.controller");

const router = express.Router();

router.post("/", addAmbulance);
router.put("/status", updateAmbulanceStatus);

module.exports = router;
