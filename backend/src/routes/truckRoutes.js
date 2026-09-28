const express = require("express");

const {
    getAllTrucks,
    getTruckById,
    createTruck,
    updateTruckStatus
} = require("../controllers/truckController");

const router = express.Router();

router.get("/", getAllTrucks);

router.post("/", createTruck);

router.get("/:truckId", getTruckById);

router.patch("/:truckId/status", updateTruckStatus);

module.exports = router;
