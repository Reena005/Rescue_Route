const pool = require("../config/db");

const { getRoute } = require("../services/routingService");


const ROUTE_COLUMNS = `
    d.dispatch_id,
    d.incident_id,
    d.truck_id,
    ft.truck_type,
    d.station_id,
    fs.fire_station_name,
    d.status,
    d.dispatched_at,
    dr.road_distance_km,
    dr.eta_minutes,
    dr.route_source,
    d.dispatched_at + dr.eta_minutes * INTERVAL '1 minute'
        AS expected_arrival_at,
    dr.computed_at,
    ST_AsGeoJSON(dr.path)::json AS path_geojson
`;

const ROUTE_FROM = `
    FROM dispatches d
    JOIN fire_trucks ft ON ft.truck_id = d.truck_id
    JOIN fire_stations fs ON fs.station_id = d.station_id
    LEFT JOIN dispatch_routes dr ON dr.dispatch_id = d.dispatch_id
`;


// GeoJSON [lng, lat] -> Leaflet [lat, lng]
const toLatLngPath = (coordinates) =>
    coordinates.map(([lng, lat]) => [lat, lng]);


const formatRouteRow = (row) => {
    const { path_geojson, ...rest } = row;

    return {
        ...rest,
        path: path_geojson
            ? toLatLngPath(path_geojson.coordinates)
            : []
    };
};


// Calculate and store the road route for one dispatch, from its
// station to the incident. Used right after a dispatch is created
// and whenever a stored route is missing.
const saveDispatchRoute = async (dispatchId) => {
    const result = await pool.query(`
        SELECT
            fs.latitude AS from_latitude,
            fs.longitude AS from_longitude,
            i.latitude AS to_latitude,
            i.longitude AS to_longitude
        FROM dispatches d
        JOIN fire_stations fs ON fs.station_id = d.station_id
        JOIN incidents i ON i.incident_id = d.incident_id
        WHERE d.dispatch_id = $1;
    `, [dispatchId]);

    if (result.rows.length === 0) {
        return null;
    }

    const points = result.rows[0];

    const from = {
        latitude: points.from_latitude,
        longitude: points.from_longitude
    };

    const to = {
        latitude: points.to_latitude,
        longitude: points.to_longitude
    };

    const route = await getRoute(from, to);

    await pool.query(`
        INSERT INTO dispatch_routes (
            dispatch_id,
            origin_latitude,
            origin_longitude,
            destination_latitude,
            destination_longitude,
            road_distance_km,
            eta_minutes,
            route_source,
            path,
            computed_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            ST_GeomFromGeoJSON($9)::geography,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (dispatch_id) DO UPDATE SET
            origin_latitude = EXCLUDED.origin_latitude,
            origin_longitude = EXCLUDED.origin_longitude,
            destination_latitude = EXCLUDED.destination_latitude,
            destination_longitude = EXCLUDED.destination_longitude,
            road_distance_km = EXCLUDED.road_distance_km,
            eta_minutes = EXCLUDED.eta_minutes,
            route_source = EXCLUDED.route_source,
            path = EXCLUDED.path,
            computed_at = EXCLUDED.computed_at;
    `, [
        dispatchId,
        from.latitude,
        from.longitude,
        to.latitude,
        to.longitude,
        route.distance_km,
        route.duration_min,
        route.source,
        JSON.stringify({
            type: "LineString",
            coordinates: route.coordinates
        })
    ]);

    return route;
};


// Store routes for several dispatches. Routing problems are
// logged, never thrown, so a dispatch is never undone because
// the routing engine was unavailable.
const saveDispatchRoutes = async (dispatchIds) => {
    await Promise.all(
        dispatchIds.map((dispatchId) =>
            saveDispatchRoute(dispatchId).catch((error) => {
                console.error(
                    `Failed to save route for dispatch ${dispatchId}:`,
                    error
                );
            })
        )
    );
};


// GET /api/incidents/:id/routes
// Routes of trucks currently heading to or at an incident
const getIncidentRoutes = async (req, res) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT ${ROUTE_COLUMNS}
            ${ROUTE_FROM}
            WHERE d.incident_id = $1
              AND d.status IN ('DISPATCHED', 'EN_ROUTE', 'ON_SCENE')
            ORDER BY dr.eta_minutes NULLS LAST, d.dispatch_id;
        `;

        let result = await pool.query(query, [id]);


        // Fill in routes for dispatches that have none yet
        const missing = result.rows
            .filter((row) => row.route_source === null)
            .map((row) => row.dispatch_id);

        if (missing.length > 0) {
            await saveDispatchRoutes(missing);

            result = await pool.query(query, [id]);
        }

        res.json({
            incident_id: id,
            count: result.rows.length,
            routes: result.rows.map(formatRouteRow)
        });

    } catch (error) {
        console.error("Error fetching incident routes:", error);

        res.status(500).json({
            message: "Failed to fetch incident routes",
            error: error.message
        });
    }
};


// GET /api/dispatches/:dispatchId/route?refresh=true
const getDispatchRoute = async (req, res) => {
    try {
        const { dispatchId } = req.params;
        const refresh = req.query.refresh === "true";

        const query = `
            SELECT ${ROUTE_COLUMNS}
            ${ROUTE_FROM}
            WHERE d.dispatch_id = $1;
        `;

        let result = await pool.query(query, [dispatchId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Dispatch not found"
            });
        }

        if (refresh || result.rows[0].route_source === null) {
            await saveDispatchRoute(dispatchId);

            result = await pool.query(query, [dispatchId]);
        }

        res.json(formatRouteRow(result.rows[0]));

    } catch (error) {
        console.error("Error fetching dispatch route:", error);

        res.status(500).json({
            message: "Failed to fetch dispatch route",
            error: error.message
        });
    }
};


// GET /api/routes/preview?incident_id=INC1001&truck_id=TRK-CHN001-WT
// GET /api/routes/preview?incident_id=INC1001&from_lat=13.05&from_lng=80.24
// Road route to an incident without creating a dispatch
const previewRoute = async (req, res) => {
    try {
        const { incident_id, truck_id, from_lat, from_lng } = req.query;

        if (!incident_id || (!truck_id && (!from_lat || !from_lng))) {
            return res.status(400).json({
                message:
                    "incident_id and either truck_id or from_lat/from_lng are required"
            });
        }

        const incidentResult = await pool.query(`
            SELECT incident_id, latitude, longitude
            FROM incidents
            WHERE incident_id = $1;
        `, [incident_id]);

        if (incidentResult.rows.length === 0) {
            return res.status(404).json({
                message: "Incident not found"
            });
        }

        let from;
        let origin;

        if (truck_id) {
            // Trucks start from their station until Module 4
            // provides live positions
            const truckResult = await pool.query(`
                SELECT
                    ft.truck_id,
                    ft.truck_type,
                    fs.station_id,
                    fs.fire_station_name,
                    fs.latitude,
                    fs.longitude
                FROM fire_trucks ft
                JOIN fire_stations fs ON fs.station_id = ft.station_id
                WHERE ft.truck_id = $1;
            `, [truck_id]);

            if (truckResult.rows.length === 0) {
                return res.status(404).json({
                    message: "Fire truck not found"
                });
            }

            origin = truckResult.rows[0];
            from = origin;

        } else {
            from = {
                latitude: Number(from_lat),
                longitude: Number(from_lng)
            };

            if (
                Number.isNaN(from.latitude) ||
                Number.isNaN(from.longitude) ||
                Math.abs(from.latitude) > 90 ||
                Math.abs(from.longitude) > 180
            ) {
                return res.status(400).json({
                    message: "from_lat/from_lng must be valid coordinates"
                });
            }

            origin = from;
        }

        const route = await getRoute(from, incidentResult.rows[0]);

        res.json({
            incident_id,
            origin,
            road_distance_km: route.distance_km,
            eta_minutes: route.duration_min,
            route_source: route.source,
            path: toLatLngPath(route.coordinates)
        });

    } catch (error) {
        console.error("Error previewing route:", error);

        res.status(500).json({
            message: "Failed to preview route",
            error: error.message
        });
    }
};


module.exports = {
    saveDispatchRoutes,
    getIncidentRoutes,
    getDispatchRoute,
    previewRoute
};
