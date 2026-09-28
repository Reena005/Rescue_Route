// ============================================================
// Truck movement simulator (Module 4)
//
// There are no GPS units on real trucks yet, so when a dispatch
// goes EN_ROUTE this drives the truck along its stored road
// route (Module 3) and reports positions exactly like a GPS
// device would. Real devices can instead POST positions to
// /api/tracking/trucks/:truckId/location.
//
// Environment:
//   TRUCK_SIMULATION=false      disable the simulator
//   SIMULATION_SPEEDUP=10       run trips N times faster than real
//                               time (default 10, so a 9 minute
//                               trip takes about a minute)
// ============================================================

const pool = require("../config/db");

const tracker = require("./trackingService");

const TICK_MS = 1000;

const SPEEDUP = Math.max(
    Number(process.env.SIMULATION_SPEEDUP) || 10,
    1
);

// Used only if a route has no usable ETA
const DEFAULT_SPEED_KMH = 30;


// dispatchId -> interval handle
const activeTrips = new Map();

let arrivalHandler = null;


const isEnabled = () =>
    process.env.TRUCK_SIMULATION !== "false";


// Called with (dispatchId) when a simulated truck reaches the
// incident. Registered by the dispatch controller so this module
// does not depend on it.
const onArrival = (handler) => {
    arrivalHandler = handler;
};


const bearing = (from, to) => {
    const toRad = (deg) => (deg * Math.PI) / 180;

    const dLng = toRad(to[1] - from[1]);
    const lat1 = toRad(from[0]);
    const lat2 = toRad(to[0]);

    const y = Math.sin(dLng) * Math.cos(lat2);
    const x =
        Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

    return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
};


// Position that is `distanceKm` along a [lat, lng] path
const pointAlong = (path, cumulative, distanceKm) => {
    let index = cumulative.findIndex((d) => d >= distanceKm);

    if (index <= 0) {
        index = index === 0 ? 1 : path.length - 1;
    }

    const segmentStart = cumulative[index - 1];
    const segmentLength = cumulative[index] - segmentStart;

    const t = segmentLength > 0
        ? Math.min((distanceKm - segmentStart) / segmentLength, 1)
        : 1;

    const from = path[index - 1];
    const to = path[index];

    return {
        position: [
            from[0] + (to[0] - from[0]) * t,
            from[1] + (to[1] - from[1]) * t
        ],
        heading: bearing(from, to)
    };
};


const loadTrip = async (dispatchId) => {
    const result = await pool.query(`
        SELECT
            d.dispatch_id,
            d.truck_id,
            d.incident_id,
            d.status,
            dr.eta_minutes,
            ST_AsGeoJSON(dr.path)::json AS path_geojson
        FROM dispatches d
        LEFT JOIN dispatch_routes dr ON dr.dispatch_id = d.dispatch_id
        WHERE d.dispatch_id = $1;
    `, [dispatchId]);

    return result.rows[0] || null;
};


const stopTrip = (dispatchId) => {
    const handle = activeTrips.get(Number(dispatchId));

    if (handle) {
        clearInterval(handle);
        activeTrips.delete(Number(dispatchId));
    }
};


// Start driving a dispatch's truck along its route.
// With resume = true, continue from the truck's last known
// position instead of the start (used after a server restart).
const startTrip = async (dispatchId, { resume = false } = {}) => {
    if (!isEnabled()) {
        return false;
    }

    dispatchId = Number(dispatchId);

    stopTrip(dispatchId);

    const trip = await loadTrip(dispatchId);

    if (!trip || !trip.path_geojson) {
        console.warn(`Simulator: no route for dispatch ${dispatchId}`);
        return false;
    }

    // GeoJSON [lng, lat] -> [lat, lng]
    const path = trip.path_geojson.coordinates.map(
        ([lng, lat]) => [lat, lng]
    );

    if (path.length < 2) {
        return false;
    }

    const cumulative = [0];

    for (let i = 1; i < path.length; i++) {
        cumulative.push(
            cumulative[i - 1] +
            tracker.distanceKm(path[i - 1], path[i])
        );
    }

    const totalKm = cumulative[cumulative.length - 1];

    const etaMinutes = Number(trip.eta_minutes);

    const speedKmh = etaMinutes > 0
        ? (totalKm / etaMinutes) * 60
        : DEFAULT_SPEED_KMH;


    let travelledKm = 0;

    if (resume) {
        const last = await tracker.getLocation(trip.truck_id);

        if (last && last.dispatch_id === dispatchId) {
            // Continue from the path vertex closest to the last fix
            let closest = 0;
            let best = Infinity;

            path.forEach((point, index) => {
                const d = tracker.distanceKm(
                    point,
                    [last.latitude, last.longitude]
                );

                if (d < best) {
                    best = d;
                    closest = index;
                }
            });

            travelledKm = cumulative[closest];
        }
    }


    const step = async () => {
        travelledKm = Math.min(
            travelledKm + (speedKmh * SPEEDUP * TICK_MS) / 3600000,
            totalKm
        );

        const arrived = travelledKm >= totalKm;

        const { position, heading } =
            pointAlong(path, cumulative, travelledKm);

        const remainingKm = totalKm - travelledKm;

        await tracker.reportPosition({
            truck_id: trip.truck_id,
            latitude: position[0],
            longitude: position[1],
            speed_kmh: arrived ? 0 : Math.round(speedKmh),
            heading,
            status: "EN_ROUTE",
            dispatch_id: dispatchId,
            incident_id: trip.incident_id,
            remaining_km: Math.round(remainingKm * 100) / 100,
            remaining_eta_min:
                Math.round((remainingKm / speedKmh) * 60 * 10) / 10,
            source: "SIMULATOR"
        });

        if (arrived) {
            stopTrip(dispatchId);

            if (arrivalHandler) {
                await arrivalHandler(dispatchId);
            }
        }
    };


    const handle = setInterval(() => {
        step().catch((error) => {
            console.error(`Simulator error on dispatch ${dispatchId}:`, error);
            stopTrip(dispatchId);
        });
    }, TICK_MS);

    activeTrips.set(dispatchId, handle);

    console.log(
        `Simulator: dispatch ${dispatchId} (${trip.truck_id}) ` +
        `${totalKm.toFixed(2)} km at ${Math.round(speedKmh)} km/h, x${SPEEDUP}` +
        (resume ? " (resumed)" : "")
    );

    return true;
};


// After a restart, pick up trucks that were mid-trip
const resumeActiveTrips = async () => {
    if (!isEnabled()) {
        return 0;
    }

    const result = await pool.query(`
        SELECT dispatch_id
        FROM dispatches
        WHERE status = 'EN_ROUTE';
    `);

    for (const row of result.rows) {
        await startTrip(row.dispatch_id, { resume: true });
    }

    return result.rows.length;
};


const getActiveTripCount = () => activeTrips.size;


module.exports = {
    isEnabled,
    onArrival,
    startTrip,
    stopTrip,
    resumeActiveTrips,
    getActiveTripCount,
    SPEEDUP
};
