const pool = require("../config/db");

const { getTravelTimes } = require("../services/routingService");

const { saveDispatchRoutes } = require("./routeController");

const tracker = require("../services/trackingService");

const simulator = require("../services/truckSimulator");


// How many trucks to send by default for each severity
const TRUCKS_BY_SEVERITY = {
    LOW: 1,
    MEDIUM: 1,
    HIGH: 2,
    CRITICAL: 3
};

const OPEN_DISPATCH_STATUSES = [
    "DISPATCHED",
    "EN_ROUTE",
    "ON_SCENE"
];

// How many nearest trucks (by straight line) are re-ranked by
// road travel time (Module 3)
const CANDIDATE_POOL_SIZE = 10;

// Allowed dispatch status transitions
const NEXT_STATUSES = {
    DISPATCHED: ["EN_ROUTE", "ON_SCENE", "CANCELLED"],
    EN_ROUTE: ["ON_SCENE", "CANCELLED"],
    ON_SCENE: ["COMPLETED"],
    COMPLETED: [],
    CANCELLED: []
};

// Timestamp column to fill when a dispatch enters a status
const STATUS_TIMESTAMP = {
    EN_ROUTE: "en_route_at",
    ON_SCENE: "arrived_at",
    COMPLETED: "completed_at",
    CANCELLED: "completed_at"
};

const DISPATCH_COLUMNS = `
    d.dispatch_id,
    d.incident_id,
    i.incident_type,
    i.severity,
    d.truck_id,
    ft.truck_type,
    ft.registration_number,
    d.station_id,
    fs.fire_station_name,
    fs.latitude AS station_latitude,
    fs.longitude AS station_longitude,
    d.distance_km,
    d.status,
    d.dispatched_at,
    d.en_route_at,
    d.arrived_at,
    d.completed_at,
    d.notes,
    dr.road_distance_km,
    dr.eta_minutes,
    dr.route_source,
    d.dispatched_at + dr.eta_minutes * INTERVAL '1 minute'
        AS expected_arrival_at,
    ROUND(
        (EXTRACT(EPOCH FROM (d.arrived_at - d.dispatched_at)) / 60)::numeric,
        1
    ) AS actual_travel_minutes
`;

const DISPATCH_FROM = `
    FROM dispatches d
    JOIN incidents i ON i.incident_id = d.incident_id
    JOIN fire_trucks ft ON ft.truck_id = d.truck_id
    JOIN fire_stations fs ON fs.station_id = d.station_id
    LEFT JOIN dispatch_routes dr ON dr.dispatch_id = d.dispatch_id
`;


const getRecommendedCount = (severity) =>
    TRUCKS_BY_SEVERITY[severity] || 1;


// Available trucks for an incident, ranked by road travel time.
// PostGIS narrows the fleet to the nearest candidates by straight
// line (Module 1), then OSRM re-ranks them by actual driving time
// from their station (Module 3).
const findRankedAvailableTrucks = async (incidentId) => {
    const result = await pool.query(`
        SELECT
            ft.truck_id,
            ft.truck_type,
            ft.registration_number,
            ft.water_capacity_liters,
            ft.crew_capacity,
            fs.station_id,
            fs.fire_station_name,
            fs.division_name,
            fs.latitude AS station_latitude,
            fs.longitude AS station_longitude,
            i.latitude AS incident_latitude,
            i.longitude AS incident_longitude,
            ROUND(
                (ST_Distance(i.location, fs.location) / 1000)::numeric,
                2
            ) AS distance_km
        FROM incidents i
        JOIN fire_stations fs
            ON fs.location IS NOT NULL
        JOIN fire_trucks ft
            ON ft.station_id = fs.station_id
        WHERE i.incident_id = $1
          AND ft.status = 'AVAILABLE'
        ORDER BY ST_Distance(i.location, fs.location), ft.truck_id
        LIMIT $2;
    `, [incidentId, CANDIDATE_POOL_SIZE]);

    if (result.rows.length === 0) {
        return [];
    }

    const incidentPoint = {
        latitude: result.rows[0].incident_latitude,
        longitude: result.rows[0].incident_longitude
    };


    // One travel-time lookup per station, not per truck
    const stations = [
        ...new Map(
            result.rows.map((row) => [
                row.station_id,
                {
                    station_id: row.station_id,
                    latitude: row.station_latitude,
                    longitude: row.station_longitude
                }
            ])
        ).values()
    ];

    const travelTimes =
        await getTravelTimes(stations, incidentPoint);

    const travelByStation = new Map(
        stations.map((station, index) => [
            station.station_id,
            travelTimes[index]
        ])
    );


    return result.rows
        .map((row) => {
            const {
                station_latitude,
                station_longitude,
                incident_latitude,
                incident_longitude,
                ...truck
            } = row;

            const travel = travelByStation.get(row.station_id);

            return {
                ...truck,
                road_distance_km: travel.distance_km,
                eta_minutes: travel.duration_min,
                route_source: travel.source
            };
        })
        .sort((a, b) =>
            a.eta_minutes - b.eta_minutes ||
            Number(a.distance_km) - Number(b.distance_km) ||
            a.truck_id.localeCompare(b.truck_id)
        );
};


// Recompute incident status from its dispatches.
//   any truck on scene        -> ACTIVE
//   any other open dispatch   -> DISPATCHED
//   none open, some completed -> RESOLVED
//   none open, none completed -> PENDING
const syncIncidentStatus = async (client, incidentId) => {
    const result = await client.query(`
        SELECT
            COUNT(*) FILTER (WHERE status = 'ON_SCENE') AS on_scene,
            COUNT(*) FILTER (
                WHERE status IN ('DISPATCHED', 'EN_ROUTE')
            ) AS travelling,
            COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed
        FROM dispatches
        WHERE incident_id = $1;
    `, [incidentId]);

    const counts = result.rows[0];

    let status = "PENDING";

    if (Number(counts.on_scene) > 0) {
        status = "ACTIVE";
    } else if (Number(counts.travelling) > 0) {
        status = "DISPATCHED";
    } else if (Number(counts.completed) > 0) {
        status = "RESOLVED";
    }

    await client.query(
        "UPDATE incidents SET status = $2 WHERE incident_id = $1",
        [incidentId, status]
    );

    return status;
};


// GET /api/dispatches?status=EN_ROUTE&incident_id=INC1001
const getAllDispatches = async (req, res) => {
    try {
        const { status, incident_id } = req.query;

        const result = await pool.query(`
            SELECT ${DISPATCH_COLUMNS}
            ${DISPATCH_FROM}
            WHERE ($1::varchar IS NULL OR d.status = $1)
              AND ($2::varchar IS NULL OR d.incident_id = $2)
            ORDER BY d.dispatched_at DESC, d.dispatch_id DESC;
        `, [
            status ? status.toUpperCase() : null,
            incident_id || null
        ]);

        res.json({
            count: result.rows.length,
            dispatches: result.rows
        });

    } catch (error) {
        console.error("Error fetching dispatches:", error);

        res.status(500).json({
            message: "Failed to fetch dispatches",
            error: error.message
        });
    }
};


// GET /api/incidents/:id/dispatches
const getIncidentDispatches = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT ${DISPATCH_COLUMNS}
            ${DISPATCH_FROM}
            WHERE d.incident_id = $1
            ORDER BY d.dispatched_at, d.dispatch_id;
        `, [id]);

        res.json({
            incident_id: id,
            count: result.rows.length,
            dispatches: result.rows
        });

    } catch (error) {
        console.error("Error fetching incident dispatches:", error);

        res.status(500).json({
            message: "Failed to fetch incident dispatches",
            error: error.message
        });
    }
};


// GET /api/dispatches/recommend/:incidentId
// AVAILABLE trucks for an incident, fastest first (Module 1
// spatial lookup + Module 2 availability + Module 3 road ETA).
const getDispatchRecommendations = async (req, res) => {
    try {
        const { incidentId } = req.params;

        const incidentResult = await pool.query(`
            SELECT
                incident_id,
                incident_type,
                severity,
                status,
                latitude,
                longitude
            FROM incidents
            WHERE incident_id = $1;
        `, [incidentId]);

        if (incidentResult.rows.length === 0) {
            return res.status(404).json({
                message: "Incident not found"
            });
        }

        const incident = incidentResult.rows[0];

        const availableTrucks =
            await findRankedAvailableTrucks(incidentId);

        res.json({
            incident,
            recommended_count: getRecommendedCount(incident.severity),
            ranked_by: "road_eta",
            count: availableTrucks.length,
            availableTrucks
        });

    } catch (error) {
        console.error("Error building dispatch recommendations:", error);

        res.status(500).json({
            message: "Failed to recommend trucks",
            error: error.message
        });
    }
};


// POST /api/dispatches
// Body:
//   { incident_id, truck_ids: ["TRK-CHN001-WT"] }  -> dispatch these trucks
//   { incident_id, count: 2 }                      -> fastest N available
//   { incident_id }                                -> fastest N by severity
const createDispatch = async (req, res) => {
    const { incident_id, truck_ids, count, notes } = req.body;

    if (!incident_id) {
        return res.status(400).json({
            message: "incident_id is required"
        });
    }

    if (
        truck_ids !== undefined &&
        (!Array.isArray(truck_ids) || truck_ids.length === 0)
    ) {
        return res.status(400).json({
            message: "truck_ids must be a non-empty array"
        });
    }

    if (
        count !== undefined &&
        (!Number.isInteger(count) || count < 1 || count > 10)
    ) {
        return res.status(400).json({
            message: "count must be a whole number between 1 and 10"
        });
    }

    // Rank candidates by road ETA before opening the transaction,
    // so no locks are held while waiting on the routing engine
    let rankedTruckIds = [];

    if (!truck_ids) {
        try {
            rankedTruckIds = (
                await findRankedAvailableTrucks(incident_id)
            ).map((truck) => truck.truck_id);

        } catch (error) {
            console.error("Error ranking trucks:", error);

            return res.status(500).json({
                message: "Failed to rank available trucks",
                error: error.message
            });
        }
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Lock the incident so concurrent dispatches serialize
        const incidentResult = await client.query(`
            SELECT incident_id, severity, status
            FROM incidents
            WHERE incident_id = $1
            FOR UPDATE;
        `, [incident_id]);

        if (incidentResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "Incident not found"
            });
        }

        const incident = incidentResult.rows[0];

        if (incident.status === "RESOLVED") {
            await client.query("ROLLBACK");

            return res.status(409).json({
                message: "Incident is already resolved"
            });
        }


        // Pick and lock the trucks
        let trucks;

        if (truck_ids) {
            const result = await client.query(`
                SELECT
                    ft.truck_id,
                    ft.station_id,
                    ft.status,
                    ROUND(
                        (ST_Distance(i.location, fs.location) / 1000)::numeric,
                        2
                    ) AS distance_km
                FROM fire_trucks ft
                JOIN fire_stations fs
                    ON fs.station_id = ft.station_id
                JOIN incidents i
                    ON i.incident_id = $1
                WHERE ft.truck_id = ANY($2::varchar[])
                FOR UPDATE OF ft;
            `, [incident_id, truck_ids]);

            const found = result.rows.map((t) => t.truck_id);
            const missing = truck_ids.filter((id) => !found.includes(id));

            if (missing.length > 0) {
                await client.query("ROLLBACK");

                return res.status(404).json({
                    message: `Fire truck not found: ${missing.join(", ")}`
                });
            }

            const busy = result.rows.filter(
                (t) => t.status !== "AVAILABLE"
            );

            if (busy.length > 0) {
                await client.query("ROLLBACK");

                return res.status(409).json({
                    message: `Truck not available: ${busy
                        .map((t) => `${t.truck_id} (${t.status})`)
                        .join(", ")}`
                });
            }

            trucks = result.rows;

        } else {
            const wanted = count || getRecommendedCount(incident.severity);

            // Take the fastest candidates that are still available,
            // skipping any another dispatcher has just locked
            const result = await client.query(`
                SELECT
                    ft.truck_id,
                    ft.station_id,
                    ROUND(
                        (ST_Distance(i.location, fs.location) / 1000)::numeric,
                        2
                    ) AS distance_km
                FROM fire_trucks ft
                JOIN fire_stations fs
                    ON fs.station_id = ft.station_id
                JOIN incidents i
                    ON i.incident_id = $1
                WHERE ft.truck_id = ANY($2::varchar[])
                  AND ft.status = 'AVAILABLE'
                ORDER BY array_position($2::varchar[], ft.truck_id)
                LIMIT $3
                FOR UPDATE OF ft SKIP LOCKED;
            `, [incident_id, rankedTruckIds, wanted]);

            if (result.rows.length === 0) {
                await client.query("ROLLBACK");

                return res.status(409).json({
                    message: "No fire trucks are currently available"
                });
            }

            trucks = result.rows;
        }


        // Create dispatch records and mark trucks as dispatched
        const dispatchIds = [];

        for (const truck of trucks) {
            const inserted = await client.query(`
                INSERT INTO dispatches (
                    incident_id,
                    truck_id,
                    station_id,
                    distance_km,
                    status,
                    notes
                )
                VALUES ($1, $2, $3, $4, 'DISPATCHED', $5)
                RETURNING dispatch_id;
            `, [
                incident_id,
                truck.truck_id,
                truck.station_id,
                truck.distance_km,
                notes || null
            ]);

            dispatchIds.push(inserted.rows[0].dispatch_id);

            await client.query(`
                UPDATE fire_trucks
                SET status = 'DISPATCHED',
                    updated_at = CURRENT_TIMESTAMP
                WHERE truck_id = $1;
            `, [truck.truck_id]);
        }

        const incidentStatus =
            await syncIncidentStatus(client, incident_id);

        await client.query("COMMIT");


        // Module 3: calculate and store each truck's road route
        await saveDispatchRoutes(dispatchIds);

        const created = await pool.query(`
            SELECT ${DISPATCH_COLUMNS}
            ${DISPATCH_FROM}
            WHERE d.dispatch_id = ANY($1::int[])
            ORDER BY dr.eta_minutes NULLS LAST, d.dispatch_id;
        `, [dispatchIds]);

        // Module 4: trucks are now committed at their station
        await Promise.all(
            created.rows.map((d) =>
                afterStatusChange(d, "DISPATCHED", incidentStatus, "api")
            )
        );

        const requested = truck_ids
            ? truck_ids.length
            : count || getRecommendedCount(incident.severity);

        res.status(201).json({
            message:
                trucks.length < requested
                    ? `Only ${trucks.length} of ${requested} requested trucks were available`
                    : "Trucks dispatched successfully",
            incident_status: incidentStatus,
            count: created.rows.length,
            dispatches: created.rows
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Error creating dispatch:", error);

        // Open-dispatch-per-truck unique index
        if (error.code === "23505") {
            return res.status(409).json({
                message: "Truck is already on an open dispatch"
            });
        }

        res.status(500).json({
            message: "Failed to dispatch trucks",
            error: error.message
        });

    } finally {
        client.release();
    }
};


class DispatchError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}


// Module 4: keep live tracking in step with a dispatch change.
// Tracking problems are logged, never thrown, so they can never
// undo or fail a dispatch update.
const afterStatusChange = async (dispatch, status, incidentStatus, source) => {
    try {
        if (status === "DISPATCHED") {
            await tracker.placeAtStation(dispatch.truck_id, "DISPATCHED");

        } else if (status === "EN_ROUTE") {
            await simulator.startTrip(dispatch.dispatch_id);

        } else if (status === "ON_SCENE") {
            simulator.stopTrip(dispatch.dispatch_id);

            await tracker.placeAtIncident(
                dispatch.truck_id,
                dispatch.dispatch_id,
                dispatch.incident_id
            );

        } else {
            // COMPLETED / CANCELLED: truck returns to its station
            simulator.stopTrip(dispatch.dispatch_id);

            await tracker.placeAtStation(dispatch.truck_id, "AVAILABLE");
        }

        await tracker.publishDispatchChange({
            dispatch_id: dispatch.dispatch_id,
            incident_id: dispatch.incident_id,
            truck_id: dispatch.truck_id,
            status,
            incident_status: incidentStatus,
            source
        });

    } catch (error) {
        console.error(
            `Tracking update failed for dispatch ${dispatch.dispatch_id}:`,
            error
        );
    }
};


// Move a dispatch to a new status and keep the truck, incident
// and live tracking in step. Used by the API and by Module 4
// when a truck arrives on its own (source = "tracking").
// Throws DispatchError for invalid requests.
const changeDispatchStatus = async (dispatchId, status, source = "api") => {
    if (!STATUS_TIMESTAMP[status]) {
        throw new DispatchError(
            400,
            "Status must be EN_ROUTE, ON_SCENE, COMPLETED or CANCELLED"
        );
    }

    const client = await pool.connect();

    let dispatch;
    let incidentStatus;

    try {
        await client.query("BEGIN");

        const current = await client.query(`
            SELECT dispatch_id, incident_id, truck_id, status
            FROM dispatches
            WHERE dispatch_id = $1
            FOR UPDATE;
        `, [dispatchId]);

        if (current.rows.length === 0) {
            throw new DispatchError(404, "Dispatch not found");
        }

        dispatch = current.rows[0];

        if (!NEXT_STATUSES[dispatch.status].includes(status)) {
            throw new DispatchError(
                409,
                `Cannot change dispatch from ${dispatch.status} to ${status}`
            );
        }


        // Timestamp column comes from a fixed whitelist above
        const timestampColumn = STATUS_TIMESTAMP[status];

        await client.query(`
            UPDATE dispatches
            SET status = $2,
                ${timestampColumn} = CURRENT_TIMESTAMP
            WHERE dispatch_id = $1;
        `, [dispatchId, status]);


        // Keep truck status in step with its dispatch
        const truckStatus = OPEN_DISPATCH_STATUSES.includes(status)
            ? status
            : "AVAILABLE";

        await client.query(`
            UPDATE fire_trucks
            SET status = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE truck_id = $1;
        `, [dispatch.truck_id, truckStatus]);


        incidentStatus =
            await syncIncidentStatus(client, dispatch.incident_id);

        await client.query("COMMIT");

    } catch (error) {
        await client.query("ROLLBACK");
        throw error;

    } finally {
        client.release();
    }


    await afterStatusChange(dispatch, status, incidentStatus, source);

    const updated = await pool.query(`
        SELECT ${DISPATCH_COLUMNS}
        ${DISPATCH_FROM}
        WHERE d.dispatch_id = $1;
    `, [dispatchId]);

    return {
        incident_status: incidentStatus,
        dispatch: updated.rows[0]
    };
};


// Module 4: a simulated truck reached its incident
simulator.onArrival(async (dispatchId) => {
    try {
        await changeDispatchStatus(dispatchId, "ON_SCENE", "tracking");

    } catch (error) {
        // Already moved on (e.g. cancelled) - nothing to do
        if (!(error instanceof DispatchError)) {
            console.error(`Arrival update failed for dispatch ${dispatchId}:`, error);
        }
    }
});


// PATCH /api/dispatches/:dispatchId/status
// Body: { status: "EN_ROUTE" | "ON_SCENE" | "COMPLETED" | "CANCELLED" }
const updateDispatchStatus = async (req, res) => {
    try {
        const result = await changeDispatchStatus(
            req.params.dispatchId,
            req.body.status?.toUpperCase()
        );

        res.json({
            message: "Dispatch status updated",
            ...result
        });

    } catch (error) {
        if (error instanceof DispatchError) {
            return res.status(error.statusCode).json({
                message: error.message
            });
        }

        console.error("Error updating dispatch status:", error);

        res.status(500).json({
            message: "Failed to update dispatch status",
            error: error.message
        });
    }
};


module.exports = {
    getAllDispatches,
    getIncidentDispatches,
    getDispatchRecommendations,
    createDispatch,
    updateDispatchStatus,
    changeDispatchStatus,
    DispatchError
};
