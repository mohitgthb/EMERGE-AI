const express = require("express");
const { addHospital, listHospitals } = require("../controllers/hospital.controller");

const router = express.Router();

router.get("/", listHospitals);
router.post("/", addHospital);

module.exports = router;
