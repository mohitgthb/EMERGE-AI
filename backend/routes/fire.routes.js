const express = require("express");
const router = express.Router();
const fireController = require("../controllers/fire.controller");

router.post("/", fireController.createFireIncident);
router.get("/", fireController.listFireIncidents);
router.get("/:id", fireController.getFireIncident);

module.exports = router;
