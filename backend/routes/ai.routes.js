const express = require("express");
const { handleDetection } = require("../controllers/ai.controller");

const router = express.Router();

router.post("/ai-callback", handleDetection);

module.exports = router;
