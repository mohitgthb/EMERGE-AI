const express = require("express");
const { getAllSignals, addSignal } = require("../controllers/signal.controller");

const router = express.Router();

router.get("/", getAllSignals);
router.post("/", addSignal);

module.exports = router;