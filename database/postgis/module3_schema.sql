-- ============================================================
-- RescueRoute - Routing Database Schema
-- Module 3: Intelligent Routing & ETA
--
-- Run AFTER module2_schema.sql, because routes belong to
-- dispatches.
-- ============================================================


-- ============================================================
-- 1. DISPATCH ROUTES
-- ============================================================

-- One road route per dispatch: from where the truck started
-- (its station, or a live position once Module 4 exists) to
-- the incident.

DROP TABLE IF EXISTS dispatch_routes CASCADE;

CREATE TABLE dispatch_routes (
    dispatch_id INTEGER PRIMARY KEY
        REFERENCES dispatches(dispatch_id)
        ON DELETE CASCADE,

    origin_latitude DOUBLE PRECISION NOT NULL,
    origin_longitude DOUBLE PRECISION NOT NULL,

    destination_latitude DOUBLE PRECISION NOT NULL,
    destination_longitude DOUBLE PRECISION NOT NULL,

    road_distance_km NUMERIC(8, 2) NOT NULL,

    eta_minutes NUMERIC(6, 1) NOT NULL,

    -- OSRM     : road route from the OSRM routing engine
    -- ESTIMATE : straight-line fallback when OSRM is unreachable
    route_source VARCHAR(20) NOT NULL
        CHECK (route_source IN ('OSRM', 'ESTIMATE')),

    path GEOGRAPHY(LINESTRING, 4326),

    computed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- Spatial index on route paths
CREATE INDEX idx_dispatch_routes_path
ON dispatch_routes
USING GIST (path);


-- ============================================================
-- 2. EXAMPLE: ETA vs ACTUAL TRAVEL TIME
-- ============================================================

-- SELECT
--     d.dispatch_id,
--     d.truck_id,
--     dr.eta_minutes,
--     ROUND(
--         (EXTRACT(EPOCH FROM (d.arrived_at - d.dispatched_at)) / 60)::numeric,
--         1
--     ) AS actual_minutes
-- FROM dispatches d
-- JOIN dispatch_routes dr ON dr.dispatch_id = d.dispatch_id
-- WHERE d.arrived_at IS NOT NULL;


-- ============================================================
-- END OF MODULE 3 SCHEMA
-- ============================================================
