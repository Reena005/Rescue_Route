const express = require("express");

const {
    getAllIncidents,
    getIncidentById,
    createIncident
} = require("../controllers/incidentController");

const {
    getIncidentDispatches
} = require("../controllers/dispatchController");

const router = express.Router();


// GET /api/incidents
router.get("/", getAllIncidents);


// POST /api/incidents
router.post("/", createIncident);


// GET /api/incidents/:id
router.get("/:id", getIncidentById);


// GET /api/incidents/:id/dispatches (Module 2)
router.get("/:id/dispatches", getIncidentDispatches);


module.exports = router;

