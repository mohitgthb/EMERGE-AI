const express = require("express");
const sosController = require("../controllers/sos.controller");
const { captureDeviceInfo } = require("../middleware/sosValidation");

const router = express.Router();

router.post("/", sosController.uploadMiddleware, captureDeviceInfo, sosController.triggerSOS);
router.post("/verify", sosController.uploadMiddleware, sosController.verifySOSWithImage);
router.post("/:sosEventId/verify", sosController.verifySOSEvent);
router.post("/:sosEventId/escalate", sosController.escalateSOSEvent);
router.get("/", sosController.listSOSEvents);

module.exports = router;