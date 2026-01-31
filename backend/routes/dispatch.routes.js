const express = require("express");
const { dispatchAmbulance } = require("../controllers/dispatch.controller");

const router = express.Router();

router.post("/", dispatchAmbulance);

module.exports = router;