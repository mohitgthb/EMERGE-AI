const express = require("express");
const { addSignal } = require("../controllers/signal.controller");

const router = express.Router();

router.post("/", addSignal);

module.exports = router;