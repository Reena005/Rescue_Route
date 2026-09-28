-- ============================================================
-- RescueRoute - Hive Tables
-- Module 5: Historical Analytics
--
-- External tables over the files written by the backend export
-- (POST /api/analytics/export) to HDFS:
--
--   /rescueroute/warehouse/incidents/dt=YYYY-MM-DD/*.json
--   /rescueroute/warehouse/dispatch_facts/dt=YYYY-MM-DD/*.json
--   /rescueroute/warehouse/truck_gps/dt=YYYY-MM-DD/*.json
--
-- Files are JSON Lines (one JSON object per line). Timestamps are
-- local time "YYYY-MM-DD HH:MM:SS".
--
-- Run with:
--   beeline -u jdbc:hive2://localhost:10000 -f database/hive/create_tables.hql
--
-- If HDFS_BASE_PATH was changed in backend/.env, change the
-- LOCATION paths below to match.
--
-- The JSON SerDe ships with Hive (hive-hcatalog-core). On older
-- installations you may need:
--   ADD JAR /path/to/hive-hcatalog-core.jar;
-- ============================================================

CREATE DATABASE IF NOT EXISTS rescueroute;

USE rescueroute;


-- ============================================================
-- 1. INCIDENTS
-- ============================================================

CREATE EXTERNAL TABLE IF NOT EXISTS incidents (
    incident_id     STRING,
    source_dataset  STRING,
    incident_type   STRING,
    severity        STRING,
    description     STRING,
    latitude        DOUBLE,
    longitude       DOUBLE,
    reported_at     TIMESTAMP,
    status          STRING
)
PARTITIONED BY (dt STRING)
ROW FORMAT SERDE 'org.apache.hive.hcatalog.data.JsonSerDe'
STORED AS TEXTFILE
LOCATION '/rescueroute/warehouse/incidents';


-- ============================================================
-- 2. DISPATCH FACTS
-- ============================================================

-- One row per dispatch, from the v_dispatch_facts view in
-- PostgreSQL (see database/postgis/module5_schema.sql for the
-- meaning of each *_min column)

CREATE EXTERNAL TABLE IF NOT EXISTS dispatch_facts (
    dispatch_id           INT,
    incident_id           STRING,
    incident_type         STRING,
    severity              STRING,
    source_dataset        STRING,
    reported_at           TIMESTAMP,
    truck_id              STRING,
    truck_type            STRING,
    station_id            STRING,
    fire_station_name     STRING,
    division_name         STRING,
    status                STRING,
    dispatched_at         TIMESTAMP,
    en_route_at           TIMESTAMP,
    arrived_at            TIMESTAMP,
    completed_at          TIMESTAMP,
    straight_distance_km  DOUBLE,
    road_distance_km      DOUBLE,
    eta_minutes           DOUBLE,
    route_source          STRING,
    dispatch_delay_min    DOUBLE,
    travel_min            DOUBLE,
    response_min          DOUBLE,
    eta_error_min         DOUBLE,
    on_scene_min          DOUBLE,
    busy_min              DOUBLE
)
PARTITIONED BY (dt STRING)
ROW FORMAT SERDE 'org.apache.hive.hcatalog.data.JsonSerDe'
STORED AS TEXTFILE
LOCATION '/rescueroute/warehouse/dispatch_facts';


-- ============================================================
-- 3. TRUCK GPS HISTORY
-- ============================================================

-- GPS points collected by Module 4 (simulator or real devices)

CREATE EXTERNAL TABLE IF NOT EXISTS truck_gps (
    truck_id     STRING,
    latitude     DOUBLE,
    longitude    DOUBLE,
    speed_kmh    DOUBLE,
    status       STRING,
    dispatch_id  INT,
    recorded_at  TIMESTAMP
)
PARTITIONED BY (dt STRING)
ROW FORMAT SERDE 'org.apache.hive.hcatalog.data.JsonSerDe'
STORED AS TEXTFILE
LOCATION '/rescueroute/warehouse/truck_gps';


-- ============================================================
-- 4. REGISTER PARTITIONS
-- ============================================================

-- Re-run these after each export so Hive sees new dt=... folders

MSCK REPAIR TABLE incidents;
MSCK REPAIR TABLE dispatch_facts;
MSCK REPAIR TABLE truck_gps;
