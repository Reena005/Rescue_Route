-- ============================================================
-- RescueRoute - PostGIS Spatial Database Schema
-- Module 1: Incident Management & Spatial Processing
-- ============================================================

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;


-- ============================================================
-- 1. FIRE STATIONS
-- ============================================================

DROP TABLE IF EXISTS fire_stations CASCADE;

CREATE TABLE fire_stations (
    station_id VARCHAR(20) PRIMARY KEY,

    source_dataset VARCHAR(100) NOT NULL,

    division_name VARCHAR(100),
    district VARCHAR(100),

    fire_station_name VARCHAR(150) NOT NULL,

    fire_station_phone_number VARCHAR(50),
    fire_station_officer_mobile VARCHAR(50),

    tab_number VARCHAR(50),
    landline_number VARCHAR(50),
    cug_number VARCHAR(50),
    fire_station_mail_id VARCHAR(150),

    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,

    location GEOGRAPHY(POINT, 4326),

    spatial_source VARCHAR(150),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Spatial index for nearest-station queries
CREATE INDEX idx_fire_stations_location
ON fire_stations
USING GIST (location);


-- ============================================================
-- 2. INCIDENTS
-- ============================================================

DROP TABLE IF EXISTS incidents CASCADE;

CREATE TABLE incidents (
    incident_id VARCHAR(20) PRIMARY KEY,

    source_dataset VARCHAR(100) NOT NULL,

    incident_type VARCHAR(50) NOT NULL,

    severity VARCHAR(20) NOT NULL,

    description TEXT,

    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,

    location GEOGRAPHY(POINT, 4326) NOT NULL,

    reported_at TIMESTAMP NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Spatial index for incident-location queries
CREATE INDEX idx_incidents_location
ON incidents
USING GIST (location);


-- Temporal index
CREATE INDEX idx_incidents_reported_at
ON incidents(reported_at);


-- Status filtering
CREATE INDEX idx_incidents_status
ON incidents(status);


-- ============================================================
-- 3. INCIDENT - FIRE STATION SPATIAL PROCESSING
-- ============================================================

-- Find nearby stations for an incident.
-- Actual dispatch assignment will be handled by the
-- dispatch module.

-- Example:
--
-- SELECT
--     i.incident_id,
--     fs.station_id,
--     fs.fire_station_name,
--     ROUND(
--         (
--             ST_Distance(
--                 i.location,
--                 fs.location
--             ) / 1000
--         )::numeric,
--         2
--     ) AS distance_km
-- FROM incidents i
-- CROSS JOIN LATERAL (
--     SELECT
--         station_id,
--         fire_station_name,
--         location
--     FROM fire_stations
--     WHERE location IS NOT NULL
--     ORDER BY location <-> i.location
--     LIMIT 3
-- ) fs
-- WHERE i.incident_id = 'INC1001';


-- ============================================================
-- 4. SPATIAL VALIDATION
-- ============================================================

-- Make sure station coordinates are converted into
-- PostGIS geography points.

UPDATE fire_stations
SET location = ST_SetSRID(
    ST_MakePoint(longitude, latitude),
    4326
)::geography
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL;


-- Make sure incident coordinates are converted into
-- PostGIS geography points.

UPDATE incidents
SET location = ST_SetSRID(
    ST_MakePoint(longitude, latitude),
    4326
)::geography
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL;


-- ============================================================
-- 5. BASIC SPATIAL VALIDATION QUERIES
-- ============================================================

-- Count stations with spatial coordinates
-- SELECT
--     COUNT(*) AS total_stations,
--     COUNT(location) AS stations_with_location,
--     COUNT(*) - COUNT(location) AS stations_without_location
-- FROM fire_stations;


-- Count incidents
-- SELECT COUNT(*) AS total_incidents
-- FROM incidents;


-- Check incident coordinates
-- SELECT
--     incident_id,
--     latitude,
--     longitude,
--     location
-- FROM incidents;


-- ============================================================
-- END OF SCHEMA
-- ============================================================