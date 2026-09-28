// ============================================================
// Tracking service (Module 4)
//
// Business logic on top of the tracking store: recording a
// truck position, placing trucks at their station or incident,
// and broadcasting dispatch changes to live clients.
// ============================================================

const pool = require("../config/db");

const store = require("./trackingStore");


// Distance between two [lat, lng] points
const distanceKm = (a, b) =>
    store.haversineKm(a[0], a[1], b[0], b[1]);


// Record a position: latest location, GPS history, live broadcast
const reportPosition = async (location) => {
    const record = await store.setLocation(location);

    await store.appendHistory(record);

    await store.publish({
        type: "location",
        truck: record
    });

    return record;
};


const getLocation = (truckId) =>
    store.getLocation(truckId);


// Put a truck back at its home station (after a trip ends, or
// when it has never reported a position)
const placeAtStation = async (truckId, status = "AVAILABLE") => {
    const result = await pool.query(`
        SELECT fs.latitude, fs.longitude
        FROM fire_trucks ft
        JOIN fire_stations fs ON fs.station_id = ft.station_id
        WHERE ft.truck_id = $1;
    `, [truckId]);

    if (result.rows.length === 0) {
        return null;
    }

    return reportPosition({
        truck_id: truckId,
        latitude: result.rows[0].latitude,
        longitude: result.rows[0].longitude,
        speed_kmh: 0,
        heading: null,
        status,
        dispatch_id: null,
        incident_id: null,
        remaining_km: null,
        remaining_eta_min: null,
        source: "STATION"
    });
};


// Truck has reached the incident
const placeAtIncident = async (truckId, dispatchId, incidentId) => {
    const result = await pool.query(`
        SELECT latitude, longitude
        FROM incidents
        WHERE incident_id = $1;
    `, [incidentId]);

    if (result.rows.length === 0) {
        return null;
    }

    const last = await store.getLocation(truckId);

    return reportPosition({
        truck_id: truckId,
        latitude: result.rows[0].latitude,
        longitude: result.rows[0].longitude,
        speed_kmh: 0,
        heading: last?.heading ?? null,
        status: "ON_SCENE",
        dispatch_id: Number(dispatchId),
        incident_id: incidentId,
        remaining_km: 0,
        remaining_eta_min: 0,
        source: last?.source === "GPS" ? "GPS" : "SIMULATOR"
    });
};


// Tell live clients a dispatch changed status
const publishDispatchChange = (change) =>
    store.publish({
        type: "dispatch",
        ...change
    });


// Give every truck without a live position its station position,
// so radius searches and the live map cover the whole fleet
const seedStationPositions = async () => {
    const result = await pool.query(`
        SELECT
            ft.truck_id,
            ft.status,
            fs.latitude,
            fs.longitude
        FROM fire_trucks ft
        JOIN fire_stations fs ON fs.station_id = ft.station_id
        WHERE fs.latitude IS NOT NULL
          AND fs.longitude IS NOT NULL;
    `);

    let seeded = 0;

    for (const truck of result.rows) {
        const added = await store.setLocationIfMissing({
            truck_id: truck.truck_id,
            latitude: truck.latitude,
            longitude: truck.longitude,
            speed_kmh: 0,
            heading: null,
            status: truck.status,
            dispatch_id: null,
            incident_id: null,
            remaining_km: null,
            remaining_eta_min: null,
            source: "STATION"
        });

        if (added) {
            seeded++;
        }
    }

    return seeded;
};


module.exports = {
    distanceKm,
    reportPosition,
    getLocation,
    placeAtStation,
    placeAtIncident,
    publishDispatchChange,
    seedStationPositions
};
