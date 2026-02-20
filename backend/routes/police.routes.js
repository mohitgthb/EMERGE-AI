const express = require("express");
const router = express.Router();
const policeController = require("../controllers/police.controller");

router.get("/", policeController.listPoliceUnits);
router.post("/", policeController.createPoliceUnit);
router.put("/:id/status", policeController.updatePoliceUnitStatus);

module.exports = router;
