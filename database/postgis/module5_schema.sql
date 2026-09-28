-- ============================================================
-- RescueRoute - Analytics Database Schema
-- Module 5: Historical Analytics
--
-- Run AFTER module3_schema.sql.
-- ============================================================


-- ============================================================
-- 1. DISPATCH FACTS VIEW
-- ============================================================

-- One row per dispatch with every timing and distance measure
-- used by the analytics APIs and exported to HDFS for Hive.
--
--   dispatch_delay_min : incident reported  -> truck dispatched
--   travel_min         : truck dispatched   -> truck arrived
--   response_min       : incident reported  -> truck arrived
--   eta_error_min      : actual travel time -  estimated ETA
--   on_scene_min       : truck arrived      -> dispatch completed
--   busy_min           : truck dispatched   -> dispatch finished
--                        (or now, if still open)

CREATE OR REPLACE VIEW v_dispatch_facts AS
SELECT
    d.dispatch_id,
    d.incident_id,
    i.incident_type,
    i.severity,
    i.source_dataset,
    i.reported_at,

    d.truck_id,
    ft.truck_type,
    d.station_id,
    fs.fire_station_name,
    fs.division_name,

    d.status,
    d.dispatched_at,
    d.en_route_at,
    d.arrived_at,
    d.completed_at,

    d.distance_km AS straight_distance_km,
    dr.road_distance_km,
    dr.eta_minutes,
    dr.route_source,

    ROUND(
        (EXTRACT(EPOCH FROM (d.dispatched_at - i.reported_at)) / 60)::numeric,
        1
    ) AS dispatch_delay_min,

    ROUND(
        (EXTRACT(EPOCH FROM (d.arrived_at - d.dispatched_at)) / 60)::numeric,
        1
    ) AS travel_min,

    ROUND(
        (EXTRACT(EPOCH FROM (d.arrived_at - i.reported_at)) / 60)::numeric,
        1
    ) AS response_min,

    ROUND(
        (EXTRACT(EPOCH FROM (d.arrived_at - d.dispatched_at)) / 60
            - dr.eta_minutes)::numeric,
        1
    ) AS eta_error_min,

    ROUND(
        (EXTRACT(EPOCH FROM (d.completed_at - d.arrived_at)) / 60)::numeric,
        1
    ) AS on_scene_min,

    ROUND(
        (EXTRACT(EPOCH FROM (
            COALESCE(d.completed_at, LOCALTIMESTAMP)
            - d.dispatched_at
        )) / 60)::numeric,
        1
    ) AS busy_min

FROM dispatches d
JOIN incidents i ON i.incident_id = d.incident_id
JOIN fire_trucks ft ON ft.truck_id = d.truck_id
JOIN fire_stations fs ON fs.station_id = d.station_id
LEFT JOIN dispatch_routes dr ON dr.dispatch_id = d.dispatch_id;


-- ============================================================
-- 2. EXPORT LOG
-- ============================================================

-- Every file written to HDFS (or the local data lake)

DROP TABLE IF EXISTS analytics_exports CASCADE;

CREATE TABLE analytics_exports (
    export_id SERIAL PRIMARY KEY,

    run_id VARCHAR(40) NOT NULL,

    -- incidents | dispatch_facts | truck_gps
    dataset VARCHAR(40) NOT NULL,

    partition_date DATE NOT NULL,

    storage VARCHAR(10) NOT NULL
        CHECK (storage IN ('HDFS', 'LOCAL')),

    path TEXT NOT NULL,

    row_count INTEGER NOT NULL,

    exported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX idx_analytics_exports_run
ON analytics_exports(run_id);


CREATE INDEX idx_analytics_exports_exported_at
ON analytics_exports(exported_at);


-- ============================================================
-- 3. GPS EXPORT CURSORS
-- ============================================================

-- Last GPS history entry exported per truck, so each export only
-- sends new points (Module 4 keeps just the latest 500 per truck)

DROP TABLE IF EXISTS gps_export_cursors CASCADE;

CREATE TABLE gps_export_cursors (
    truck_id VARCHAR(20) PRIMARY KEY
        REFERENCES fire_trucks(truck_id)
        ON DELETE CASCADE,

    last_entry_id VARCHAR(60) NOT NULL,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- 4. SUPPORTING INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_dispatches_dispatched_at
ON dispatches(dispatched_at);


CREATE INDEX IF NOT EXISTS idx_dispatches_station
ON dispatches(station_id);


CREATE INDEX IF NOT EXISTS idx_dispatches_truck
ON dispatches(truck_id);


-- ============================================================
-- END OF MODULE 5 SCHEMA
-- ============================================================
