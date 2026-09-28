const express = require("express");

const {
    previewRoute
} = require("../controllers/routeController");

const router = express.Router();

// GET /api/routes/preview?incident_id=...&truck_id=...
router.get("/preview", previewRoute);

module.exports = router;
