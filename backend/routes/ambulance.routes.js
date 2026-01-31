const express = require("express");
const { addAmbulance } = require("../controllers/ambulance.controller");

const router = express.Router();

router.post("/", addAmbulance);

module.exports = router;
