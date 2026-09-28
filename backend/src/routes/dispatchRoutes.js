const express = require("express");

const {
    getAllDispatches,
    getDispatchRecommendations,
    createDispatch,
    updateDispatchStatus
} = require("../controllers/dispatchController");

const {
    getDispatchRoute
} = require("../controllers/routeController");

const router = express.Router();

router.get("/", getAllDispatches);

router.post("/", createDispatch);

router.get("/recommend/:incidentId", getDispatchRecommendations);

router.patch("/:dispatchId/status", updateDispatchStatus);

// Module 3: road route + ETA for one dispatch
router.get("/:dispatchId/route", getDispatchRoute);

module.exports = router;
