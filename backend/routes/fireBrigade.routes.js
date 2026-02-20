const express = require("express");
const router = express.Router();
const fireBrigadeController = require("../controllers/fireBrigade.controller");

router.get("/", fireBrigadeController.listFireBrigades);
router.post("/", fireBrigadeController.createFireBrigade);
router.put("/:id/status", fireBrigadeController.updateFireBrigadeStatus);

module.exports = router;
