const pool = require("../config/db");

const store = require("../services/trackingStore");
const tracker = require("../services/trackingService");
const simulator = require("../services/truckSimulator");

const {
    changeDispatchStatus,
    DispatchError
} = require("./dispatchController");


// A truck this close to its incident is considered on scene
const ARRIVAL_RADIUS_KM = 0.1;

const DEPLOYED_STATUSES = ["DISPATCHED", "EN_ROUTE", "ON_SCENE"];

const SSE_HEARTBEAT_MS = 25000;


// Fleet from the database merged with live positions
const loadTrackedTrucks = async (truckId = null) => {
    const [result, locations] = await Promise.all([
        pool.query(`
            SELECT
                ft.truck_id,
                ft.truck_type,
                ft.registration_number,
                ft.status,
                ft.station_id,
                fs.fire_station_name,
                fs.latitude AS station_latitude,
                fs.longitude AS station_longitude
            FROM fire_trucks ft
            JOIN fire_stations fs ON fs.station_id = ft.station_id
            WHERE ($1::varchar IS NULL OR ft.truck_id = $1)
            ORDER BY ft.truck_id;
        `, [truckId]),

        truckId
            ? store.getLocation(truckId).then((loc) => (loc ? [loc] : []))
            : store.getAllLocations()
    ]);

    const byTruck = new Map(
        locations.map((loc) => [loc.truck_id, loc])
    );

    return result.rows.map((truck) => {
        const {
            station_latitude,
            station_longitude,
            ...details
        } = truck;

        const live = byTruck.get(truck.truck_id);

        return {
            ...details,
            latitude: live?.latitude ?? station_latitude,
            longitude: live?.longitude ?? station_longitude,
            speed_kmh: live?.speed_kmh ?? 0,
            heading: live?.heading ?? null,
            dispatch_id: live?.dispatch_id ?? null,
            incident_id: live?.incident_id ?? null,
            remaining_km: live?.remaining_km ?? null,
            remaining_eta_min: live?.remaining_eta_min ?? null,
            source: live?.source ?? "STATION",
            updated_at: live?.updated_at ?? null,
            // Status from the database is authoritative
            status: truck.status
        };
    });
};


// GET /api/tracking/trucks?deployed=true
const getTrackedTrucks = async (req, res) => {
    try {
        let trucks = await loadTrackedTrucks();

        if (req.query.deployed === "true") {
            trucks = trucks.filter((truck) =>
                DEPLOYED_STATUSES.includes(truck.status)
            );
        }

        res.json({
            tracking_backend: store.getBackend(),
            count: trucks.length,
            trucks
        });

    } catch (error) {
        console.error("Error fetching tracked trucks:", error);

        res.status(500).json({
            message: "Failed to fetch truck positions",
            error: error.message
        });
    }
};


// GET /api/tracking/trucks/:truckId
const getTrackedTruck = async (req, res) => {
    try {
        const [truck] = await loadTrackedTrucks(req.params.truckId);

        if (!truck) {
            return res.status(404).json({
                message: "Fire truck not found"
            });
        }

        res.json(truck);

    } catch (error) {
        console.error("Error fetching tracked truck:", error);

        res.status(500).json({
            message: "Failed to fetch truck position",
            error: error.message
        });
    }
};


// POST /api/tracking/trucks/:truckId/location
// Body: { latitude, longitude, speed_kmh?, heading? }
// Endpoint for GPS devices / crew mobile app
const reportTruckLocation = async (req, res) => {
    try {
        const { truckId } = req.params;

        const latitude = Number(req.body.latitude);
        const longitude = Number(req.body.longitude);

        if (
            req.body.latitude === undefined ||
            req.body.longitude === undefined ||
            Number.isNaN(latitude) ||
            Number.isNaN(longitude) ||
            Math.abs(latitude) > 90 ||
            Math.abs(longitude) > 180
        ) {
            return res.status(400).json({
                message: "Valid latitude and longitude are required"
            });
        }

        const speedKmh = req.body.speed_kmh !== undefined
            ? Number(req.body.speed_kmh)
            : null;

        // Truck and its open dispatch, if any
        const result = await pool.query(`
            SELECT
                ft.truck_id,
                ft.status AS truck_status,
                d.dispatch_id,
                d.status AS dispatch_status,
                d.incident_id,
                i.latitude AS incident_latitude,
                i.longitude AS incident_longitude
            FROM fire_trucks ft
            LEFT JOIN dispatches d
                ON d.truck_id = ft.truck_id
               AND d.status IN ('DISPATCHED', 'EN_ROUTE', 'ON_SCENE')
            LEFT JOIN incidents i
                ON i.incident_id = d.incident_id
            WHERE ft.truck_id = $1;
        `, [truckId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Fire truck not found"
            });
        }

        const truck = result.rows[0];


        // Real GPS takes over from the simulator
        if (truck.dispatch_id) {
            simulator.stopTrip(truck.dispatch_id);
        }

        let remainingKm = null;

        if (truck.dispatch_id) {
            remainingKm = Math.round(
                tracker.distanceKm(
                    [latitude, longitude],
                    [truck.incident_latitude, truck.incident_longitude]
                ) * 100
            ) / 100;
        }

        const location = await tracker.reportPosition({
            truck_id: truckId,
            latitude,
            longitude,
            speed_kmh: speedKmh,
            heading: req.body.heading !== undefined
                ? Number(req.body.heading)
                : null,
            status: truck.dispatch_status || truck.truck_status,
            dispatch_id: truck.dispatch_id,
            incident_id: truck.incident_id,
            remaining_km: remainingKm,
            remaining_eta_min:
                remainingKm !== null && speedKmh > 0
                    ? Math.round((remainingKm / speedKmh) * 60 * 10) / 10
                    : null,
            source: "GPS"
        });


        // Automatic arrival detection
        let arrived = false;

        if (
            remainingKm !== null &&
            remainingKm <= ARRIVAL_RADIUS_KM &&
            ["DISPATCHED", "EN_ROUTE"].includes(truck.dispatch_status)
        ) {
            try {
                await changeDispatchStatus(
                    truck.dispatch_id,
                    "ON_SCENE",
                    "tracking"
                );

                arrived = true;

            } catch (error) {
                if (!(error instanceof DispatchError)) {
                    throw error;
                }
            }
        }

        res.json({
            message: arrived
                ? "Location recorded - truck marked ON_SCENE"
                : "Location recorded",
            location
        });

    } catch (error) {
        console.error("Error recording truck location:", error);

        res.status(500).json({
            message: "Failed to record truck location",
            error: error.message
        });
    }
};


// GET /api/tracking/trucks/:truckId/history?limit=100
const getTruckHistory = async (req, res) => {
    try {
        const limit = Math.min(
            Math.max(Number(req.query.limit) || 100, 1),
            500
        );

        const points = await store.getHistory(req.params.truckId, limit);

        res.json({
            truck_id: req.params.truckId,
            count: points.length,
            history: points
        });

    } catch (error) {
        console.error("Error fetching truck history:", error);

        res.status(500).json({
            message: "Failed to fetch truck history",
            error: error.message
        });
    }
};


// GET /api/tracking/nearby?latitude=13.08&longitude=80.27&radius_km=5&status=AVAILABLE
// Trucks near a point by their live position
const getNearbyTrucks = async (req, res) => {
    try {
        const latitude = Number(req.query.latitude);
        const longitude = Number(req.query.longitude);
        const radiusKm = Math.min(Number(req.query.radius_km) || 5, 50);

        if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
            return res.status(400).json({
                message: "latitude and longitude are required"
            });
        }

        const [nearby, trucks] = await Promise.all([
            store.findNearby(latitude, longitude, radiusKm),
            loadTrackedTrucks()
        ]);

        const byTruck = new Map(
            trucks.map((truck) => [truck.truck_id, truck])
        );

        const status = req.query.status?.toUpperCase();

        const results = nearby
            .filter((item) => byTruck.has(item.truck_id))
            .map((item) => ({
                ...byTruck.get(item.truck_id),
                distance_km: item.distance_km
            }))
            .filter((truck) => !status || truck.status === status);

        res.json({
            count: results.length,
            trucks: results
        });

    } catch (error) {
        console.error("Error finding nearby trucks:", error);

        res.status(500).json({
            message: "Failed to find nearby trucks",
            error: error.message
        });
    }
};


// GET /api/tracking/status
const getTrackingStatus = (req, res) => {
    res.json({
        tracking_backend: store.getBackend(),
        simulation_enabled: simulator.isEnabled(),
        simulation_speedup: simulator.SPEEDUP,
        active_simulated_trips: simulator.getActiveTripCount()
    });
};


// GET /api/tracking/stream
// Server-Sent Events: "location" and "dispatch" events
const streamTracking = (req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
    });

    res.write(`event: ready\ndata: ${JSON.stringify({
        tracking_backend: store.getBackend()
    })}\n\n`);

    const unsubscribe = store.subscribe((event) => {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });

    // Keeps proxies from closing an idle connection
    const heartbeat = setInterval(() => {
        res.write(": heartbeat\n\n");
    }, SSE_HEARTBEAT_MS);

    req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
    });
};


module.exports = {
    getTrackedTrucks,
    getTrackedTruck,
    reportTruckLocation,
    getTruckHistory,
    getNearbyTrucks,
    getTrackingStatus,
    streamTracking
};
