const express = require("express");
const { addHospital } = require("../controllers/hospital.controller");

const router = express.Router();

router.post("/", addHospital);

module.exports = router;
