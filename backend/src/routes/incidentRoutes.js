const express = require("express");

const {
    getAllIncidents,
    getIncidentById,
    createIncident
} = require("../controllers/incidentController");

const router = express.Router();


// GET /api/incidents
router.get("/", getAllIncidents);


// POST /api/incidents
router.post("/", createIncident);


// GET /api/incidents/:id
router.get("/:id", getIncidentById);


module.exports = router;

