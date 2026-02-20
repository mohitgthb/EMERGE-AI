const express = require("express");
const router = express.Router();
const emergencyQueueController = require("../controllers/emergencyQueue.controller");

router.get("/", emergencyQueueController.listQueue);
router.post("/:id/review", emergencyQueueController.reviewEmergency);
router.get("/stats", emergencyQueueController.getQueueStats);

module.exports = router;
