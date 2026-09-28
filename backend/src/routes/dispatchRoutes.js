const express = require("express");

const {
    getAllDispatches,
    getDispatchRecommendations,
    createDispatch,
    updateDispatchStatus
} = require("../controllers/dispatchController");

const router = express.Router();

router.get("/", getAllDispatches);

router.post("/", createDispatch);

router.get("/recommend/:incidentId", getDispatchRecommendations);

router.patch("/:dispatchId/status", updateDispatchStatus);

module.exports = router;
