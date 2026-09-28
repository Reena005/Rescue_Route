# RescueRoute — Intelligent Firefighter Dispatch and Emergency Routing System

RescueRoute is a database-driven emergency response system designed to support faster and more informed fire-response decisions.

The system manages fire incidents, fire stations and fire trucks, dispatches the fastest available trucks using road routing, tracks trucks live on a map, and analyses response history. It uses PostgreSQL and PostGIS for spatial data, OSRM for road routing, Redis for real-time tracking, and HDFS + Hive for historical analytics.

---

## 1. Project Overview

During a fire emergency, selecting an appropriate fire station and response vehicle quickly is important.

RescueRoute provides a centralized system that:

* Records fire incidents with coordinates, severity and timestamps
* Maintains fire-station and fire-truck information
* Uses PostGIS for spatial processing
* Identifies nearby fire stations and their truck availability
* Recommends the fastest available trucks by road travel time
* Dispatches trucks and keeps truck and incident statuses in sync
* Calculates road routes and ETAs and draws them on the map
* Tracks trucks live and detects arrival automatically
* Analyses response times, station workload, truck utilization, trends and hotspots
* Exports history to HDFS as Hive tables
* Provides REST APIs for all of the above

### Current Implementation

| Module | Name | Status |
|---|---|---|
| 1 | Incident Management & Spatial Processing | ✅ Completed |
| 2 | Fire Truck & Dispatch Management | ✅ Completed |
| 3 | Intelligent Routing & ETA | ✅ Completed |
| 4 | Real-Time Tracking | ✅ Completed |
| 5 | Historical Analytics | ✅ Completed |

---

# 2. Technology Stack

## Frontend

* React
* Vite
* React-Leaflet
* Leaflet
* OpenStreetMap
* Server-Sent Events (live tracking updates)

## Backend

* Node.js
* Express.js
* PostgreSQL client (`pg`)
* Redis client (`redis`)
* CORS
* dotenv
* Nodemon

## Database and Services

* PostgreSQL — incidents, stations, trucks, dispatches, routes
* PostGIS — spatial points, nearest-station search, route paths
* OSRM — road routing and travel times (Module 3)
* Redis — live truck positions, GPS history and live updates (Module 4, optional during development)
* Hadoop HDFS — historical data storage, written through WebHDFS (Module 5, optional during development)
* Hive — batch historical analytics over the HDFS files (Module 5)

## Planned Technologies

* CockroachDB — operational distributed data

---

# 3. Project Structure

```text
RescueRoute/
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js
│   │   │
│   │   ├── controllers/
│   │   │   ├── incidentController.js      (Module 1)
│   │   │   ├── stationController.js       (Module 1)
│   │   │   ├── truckController.js         (Module 2)
│   │   │   ├── dispatchController.js      (Module 2)
│   │   │   ├── routeController.js         (Module 3)
│   │   │   ├── trackingController.js      (Module 4)
│   │   │   └── analyticsController.js     (Module 5)
│   │   │
│   │   ├── routes/
│   │   │   ├── incidentRoutes.js
│   │   │   ├── stationRoutes.js
│   │   │   ├── truckRoutes.js
│   │   │   ├── dispatchRoutes.js
│   │   │   ├── routeRoutes.js
│   │   │   ├── trackingRoutes.js
│   │   │   └── analyticsRoutes.js
│   │   │
│   │   ├── services/
│   │   │   ├── routingService.js          (Module 3 — OSRM)
│   │   │   ├── trackingStore.js           (Module 4 — Redis / in-memory)
│   │   │   ├── trackingService.js         (Module 4)
│   │   │   ├── truckSimulator.js          (Module 4)
│   │   │   ├── historyExporter.js         (Module 5)
│   │   │   └── dataLakeStorage.js         (Module 5 — HDFS / local)
│   │   │
│   │   └── server.js
│   │
│   ├── .env                               (not committed)
│   ├── .gitignore
│   ├── package.json
│   └── package-lock.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── MapView.jsx
│   │   │   ├── IncidentForm.jsx
│   │   │   ├── NearbyStations.jsx
│   │   │   ├── DispatchPanel.jsx          (Modules 2–4)
│   │   │   ├── AnalyticsView.jsx          (Module 5)
│   │   │   └── analytics/charts.jsx       (Module 5)
│   │   │
│   │   ├── hooks/
│   │   │   └── useTruckTracking.js        (Module 4)
│   │   │
│   │   ├── services/
│   │   │   └── api.js
│   │   │
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   │
│   ├── package.json
│   └── ...
│
├── database/
│   ├── postgis/
│   │   ├── schema.sql                     (Module 1)
│   │   ├── module2_schema.sql             (Module 2)
│   │   ├── module3_schema.sql             (Module 3)
│   │   ├── module5_schema.sql             (Module 5)
│   │   └── seed/
│   │       ├── fire_stations.sql
│   │       ├── incidents.sql
│   │       ├── fire_trucks.sql            (Module 2)
│   │       └── history.sql                (Module 5 — synthetic history)
│   │
│   └── hive/                              (Module 5)
│       ├── create_tables.hql
│       └── analytics_queries.hql
│
├── datasets/
│   └── module1/
│
├── datalake/                              (Module 5 local exports, not committed)
│
└── README.md
```

---

# 4. Prerequisites

Before running RescueRoute, install the following software.

## Required

### 4.1 Node.js

Install Node.js 18 or newer from:

https://nodejs.org/

Check installation:

```powershell
node --version
npm --version
```

Node.js is required for both the backend and frontend.

---

### 4.2 PostgreSQL

Install PostgreSQL.

Check installation:

```powershell
psql --version
```

The project uses PostgreSQL as the primary database.

---

### 4.3 PostGIS

PostGIS must be installed and available in PostgreSQL.

Check from PostgreSQL:

```sql
SELECT PostGIS_Version();
```

The project requires PostGIS because incident, station and route locations are stored as geographic data.

On Windows, PostGIS is **not** included in the PostgreSQL installer. Install it with **Application Stack Builder** (installed with PostgreSQL: Start menu → PostgreSQL → Application Stack Builder → Spatial Extensions → PostGIS), or download the bundle for your PostgreSQL version from https://download.osgeo.org/postgis/windows/. If `CREATE EXTENSION postgis` fails with "extension is not available", PostGIS is missing.

---

### 4.4 Git

Install Git:

https://git-scm.com/

Check:

```powershell
git --version
```

Git is required to clone the project repository.

---

## Optional

### 4.5 Redis

Module 4 stores live truck positions in Redis. Redis is **optional during development**: without it, the backend automatically uses an in-memory store (live positions are then reset when the backend restarts).

On Windows, use one of:

* Portable Redis for Windows (no installer, no admin rights): `winget install taizod1024.redis-windows-fork`, then open a new terminal and run `redis-server`
* Memurai (Redis-compatible for Windows): https://www.memurai.com/
* Redis inside WSL: `sudo apt install redis-server`
* Docker: `docker run -p 6379:6379 redis`

Check:

```powershell
redis-cli ping
```

Expected:

```text
PONG
```

### 4.6 Internet access for routing

Module 3 uses the public OSRM routing server by default, so the backend needs internet access for road routes. The public server allows about one request per second, so the backend spaces its requests, retries once, and reuses identical routes. If OSRM cannot be reached, the backend falls back to an estimated route and ETA (see [Troubleshooting](#27-troubleshooting)).

### 4.7 Hadoop HDFS and Hive

Module 5 exports history to HDFS for Hive. HDFS is **optional during development**: without it, exports are written to a local `datalake/` folder in exactly the same layout, which can be uploaded to HDFS later.

To use HDFS, you need a running Hadoop cluster with WebHDFS enabled (the default on the NameNode web port, usually `9870`) and Hive with HiveServer2 for the queries.

---

# 5. Clone the Repository

Clone the repository:

```powershell
git clone https://github.com/Reena005/Rescue_Route.git
```

Move into the project:

```powershell
cd Rescue_Route
```

Switch to the main project branch:

```powershell
git checkout reena-module1
```

Pull the latest version:

```powershell
git pull
```

---

# 6. Database Setup

RescueRoute uses a PostgreSQL database named:

```text
rescueroute_spatial
```

## 6.1 Create the Database

Open PostgreSQL:

```powershell
psql -U postgres
```

Create the database:

```sql
CREATE DATABASE rescueroute_spatial;
```

Connect to it:

```sql
\c rescueroute_spatial
```

---

# 7. Enable PostGIS

Inside the `rescueroute_spatial` database:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Verify:

```sql
SELECT PostGIS_Version();
```

---

# 8. Create the Database Schema and Load Seed Data

The database files must be run **in this order**, because later modules reference tables from earlier ones:

| Order | File | Module | Creates / loads |
|---|---|---|---|
| 1 | `database/postgis/schema.sql` | 1 | `fire_stations`, `incidents` tables |
| 2 | `database/postgis/seed/fire_stations.sql` | 1 | 33 Chennai fire stations |
| 3 | `database/postgis/seed/incidents.sql` | 1 | 32 demo incidents |
| 4 | `database/postgis/module2_schema.sql` | 2 | `fire_trucks`, `dispatches` tables |
| 5 | `database/postgis/seed/fire_trucks.sql` | 2 | 83 demo fire trucks |
| 6 | `database/postgis/module3_schema.sql` | 3 | `dispatch_routes` table |
| 7 | `database/postgis/module5_schema.sql` | 5 | `v_dispatch_facts` view, export log tables |
| 8 | `database/postgis/seed/history.sql` | 5 | ~360 synthetic historical incidents with dispatches (optional, recommended) |

Module 4 has no database file: live positions are stored in Redis (or in memory).

`history.sql` gives the analytics page two months of data (July–August 2026) to work with. Without it, analytics only covers dispatches made in the app.

## 8.1 Run the files from the PostgreSQL prompt

From the `rescueroute_spatial` prompt, run each file with `\i`. Replace the path with the actual location of your cloned project:

```sql
\i 'C:/Users/YourName/Rescue_Route/database/postgis/schema.sql'
\i 'C:/Users/YourName/Rescue_Route/database/postgis/seed/fire_stations.sql'
\i 'C:/Users/YourName/Rescue_Route/database/postgis/seed/incidents.sql'
\i 'C:/Users/YourName/Rescue_Route/database/postgis/module2_schema.sql'
\i 'C:/Users/YourName/Rescue_Route/database/postgis/seed/fire_trucks.sql'
\i 'C:/Users/YourName/Rescue_Route/database/postgis/module3_schema.sql'
\i 'C:/Users/YourName/Rescue_Route/database/postgis/module5_schema.sql'
\i 'C:/Users/YourName/Rescue_Route/database/postgis/seed/history.sql'
```

## 8.2 Or run them from PowerShell

If `psql` is not on your PATH, use its full location:

```powershell
$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"

& $psql -U postgres -h localhost -d rescueroute_spatial -f database/postgis/schema.sql
& $psql -U postgres -h localhost -d rescueroute_spatial -f database/postgis/seed/fire_stations.sql
& $psql -U postgres -h localhost -d rescueroute_spatial -f database/postgis/seed/incidents.sql
& $psql -U postgres -h localhost -d rescueroute_spatial -f database/postgis/module2_schema.sql
& $psql -U postgres -h localhost -d rescueroute_spatial -f database/postgis/seed/fire_trucks.sql
& $psql -U postgres -h localhost -d rescueroute_spatial -f database/postgis/module3_schema.sql
& $psql -U postgres -h localhost -d rescueroute_spatial -f database/postgis/module5_schema.sql
& $psql -U postgres -h localhost -d rescueroute_spatial -f database/postgis/seed/history.sql
```

## 8.3 Upgrading an existing database

Run only the files for the modules you do not have yet — for example, a database with Modules 1–4 needs only files 7 and 8.

Note: re-running `module2_schema.sql` or `fire_trucks.sql` deletes existing trucks and dispatches. Re-running `history.sql` only replaces the synthetic history (incident IDs `HIS00001`…).

---

# 9. Verify the Data

Check the row counts:

```sql
SELECT
    (SELECT COUNT(*) FROM fire_stations) AS stations,
    (SELECT COUNT(*) FROM incidents)     AS incidents,
    (SELECT COUNT(*) FROM fire_trucks)   AS trucks;
```

Expected (with `history.sql` loaded):

```text
 stations | incidents | trucks
----------+-----------+--------
       33 |       392 |     83
```

Without `history.sql`, incidents is 32.

Check PostGIS geometry:

```sql
SELECT
    incident_id,
    ST_AsText(location) AS spatial_location
FROM incidents
LIMIT 5;
```

A valid result should look like:

```text
POINT(80.2707 13.0827)
```

PostGIS uses:

```text
POINT(longitude latitude)
```

Check truck availability per station:

```sql
SELECT
    station_id,
    COUNT(*) FILTER (WHERE status = 'AVAILABLE') AS available,
    COUNT(*) AS total
FROM fire_trucks
GROUP BY station_id
ORDER BY station_id;
```

---

# 10. Backend Setup

Open a terminal and navigate to:

```powershell
cd backend
```

Install dependencies:

```powershell
npm install
```

---

# 11. Backend Environment Configuration

Create:

```text
backend/.env
```

The file must be in the `backend` folder (not `backend/src`).

Add:

```env
PORT=4000

# PostgreSQL + PostGIS (required)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rescueroute_spatial
DB_USER=postgres
DB_PASSWORD=YOUR_POSTGRES_PASSWORD

# Module 3 — routing (optional)
# OSRM_URL=https://router.project-osrm.org

# Module 4 — live tracking (optional)
# REDIS_URL=redis://localhost:6379
# TRUCK_SIMULATION=true
# SIMULATION_SPEEDUP=10

# Module 5 — historical analytics (optional)
# HDFS_NAMENODE_URL=http://localhost:9870
# HDFS_USER=hadoop
# HDFS_BASE_PATH=/rescueroute/warehouse
# ANALYTICS_EXPORT_INTERVAL_MIN=60
```

Replace:

```text
YOUR_POSTGRES_PASSWORD
```

with the password of the local PostgreSQL user.

| Variable | Default | Purpose |
|---|---|---|
| `OSRM_URL` | `https://router.project-osrm.org` | OSRM routing server. The public server is rate-limited; use a self-hosted OSRM for production. |
| `REDIS_URL` | not set | Redis connection. When not set or unreachable, an in-memory store is used. |
| `TRUCK_SIMULATION` | `true` | Set to `false` to disable the truck movement simulator. |
| `SIMULATION_SPEEDUP` | `10` | Simulated trips run this many times faster than real time. |
| `OSRM_MIN_INTERVAL_MS` | `1000` for the public server, else `0` | Minimum gap between routing requests. |
| `HDFS_NAMENODE_URL` | not set | HDFS NameNode web address (WebHDFS). When not set, exports go to the local `datalake/` folder. |
| `HDFS_USER` | `hadoop` | HDFS user the files are written as. |
| `HDFS_BASE_PATH` | `/rescueroute/warehouse` | HDFS folder for exports (must match the Hive table locations). |
| `ANALYTICS_LOCAL_DIR` | `<project>/datalake/warehouse` | Local export folder when HDFS is not configured. |
| `ANALYTICS_EXPORT_INTERVAL_MIN` | not set | Export automatically every N minutes. When not set, export from the Analytics page or API. |

Do not commit `.env` to GitHub.

The project already contains `.gitignore` rules for:

```text
node_modules/
.env
```

---

# 12. Start the Backend

From the `backend` folder:

```powershell
npm run dev
```

The backend should start at:

```text
http://localhost:4000
```

You should see:

```text
RescueRoute backend running on http://localhost:4000
Tracking store: in-memory (REDIS_URL not set)
Tracking ready: 83 trucks placed at stations, 0 trips resumed
```

With Redis configured, the second line reads `Tracking store: Redis`.

---

# 13. Test Backend Health

Open:

```text
http://localhost:4000/
```

Expected:

```json
{
  "message": "RescueRoute API is running"
}
```

Test database connectivity:

```text
http://localhost:4000/api/health
```

Expected response:

```json
{
  "status": "OK",
  "database": "Connected"
}
```

Test live tracking:

```text
http://localhost:4000/api/tracking/status
```

Expected response:

```json
{
  "tracking_backend": "memory",
  "simulation_enabled": true,
  "simulation_speedup": 10,
  "active_simulated_trips": 0
}
```

---

# 14. Backend API Endpoints

## 14.1 Incident APIs (Module 1)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/incidents` | All incidents |
| GET | `/api/incidents/:id` | One incident |
| POST | `/api/incidents` | Report a new incident |
| GET | `/api/incidents/:id/dispatches` | Dispatch history for an incident (Module 2) |
| GET | `/api/incidents/:id/routes` | Routes of trucks assigned to an incident (Module 3) |

Example request for creating an incident:

```json
{
  "incident_id": "INC1031",
  "incident_type": "Building Fire",
  "severity": "HIGH",
  "description": "Fire reported in a residential building",
  "latitude": 13.0600,
  "longitude": 80.2500,
  "reported_at": "2026-09-27 14:10:00"
}
```

---

## 14.2 Fire Station APIs (Module 1)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/stations` | All stations, with available / total truck counts |
| GET | `/api/stations/:stationId` | One station |
| GET | `/api/stations/nearby/:incidentId` | Three nearest stations, their distance and truck availability |

Example:

```text
http://localhost:4000/api/stations/nearby/INC1001
```

---

## 14.3 Fire Truck APIs (Module 2)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/trucks` | All trucks. Filters: `?station_id=CHN001`, `?status=AVAILABLE` |
| GET | `/api/trucks/:truckId` | One truck |
| POST | `/api/trucks` | Add a truck |
| PATCH | `/api/trucks/:truckId/status` | Take a truck in or out of service (`AVAILABLE` / `MAINTENANCE`) |

Example request for adding a truck:

```json
{
  "truck_id": "TRK-CHN001-X1",
  "station_id": "CHN001",
  "registration_number": "TN-FR-001-09",
  "truck_type": "Water Tender",
  "water_capacity_liters": 4500,
  "crew_capacity": 6
}
```

---

## 14.4 Dispatch APIs (Module 2)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dispatches` | All dispatches. Filters: `?status=EN_ROUTE`, `?incident_id=INC1001` |
| GET | `/api/dispatches/recommend/:incidentId` | Available trucks, fastest by road first |
| POST | `/api/dispatches` | Dispatch trucks to an incident |
| PATCH | `/api/dispatches/:dispatchId/status` | Move a dispatch to its next status |
| GET | `/api/dispatches/:dispatchId/route` | Road route and ETA for a dispatch (Module 3). `?refresh=true` recalculates it |

Dispatch specific trucks:

```json
{
  "incident_id": "INC1001",
  "truck_ids": ["TRK-CHN002-WT"]
}
```

Dispatch automatically (the fastest trucks; the number depends on severity — LOW/MEDIUM: 1, HIGH: 2, CRITICAL: 3):

```json
{
  "incident_id": "INC1001"
}
```

Or choose how many:

```json
{
  "incident_id": "INC1001",
  "count": 2
}
```

Update a dispatch status:

```json
{
  "status": "EN_ROUTE"
}
```

Allowed dispatch status changes:

```text
DISPATCHED ──► EN_ROUTE ──► ON_SCENE ──► COMPLETED
     │             │
     └─────────────┴──► CANCELLED
```

`DISPATCHED` can also go directly to `ON_SCENE`.

---

## 14.5 Routing APIs (Module 3)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/routes/preview?incident_id=INC1001&truck_id=TRK-CHN002-WT` | Road route and ETA for a truck without dispatching it |
| GET | `/api/routes/preview?incident_id=INC1001&from_lat=13.05&from_lng=80.24` | Road route and ETA from any point |

Example response:

```json
{
  "incident_id": "INC1001",
  "road_distance_km": 6.66,
  "eta_minutes": 9.2,
  "route_source": "OSRM",
  "path": [[13.0476, 80.2490], [13.0471, 80.2486], "..."]
}
```

`route_source` is `OSRM` for a real road route, or `ESTIMATE` when OSRM could not be reached.

---

## 14.6 Tracking APIs (Module 4)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/tracking/status` | Tracking store in use (Redis or memory) and simulator settings |
| GET | `/api/tracking/trucks` | Live positions of all trucks. `?deployed=true` for trucks out on a job only |
| GET | `/api/tracking/trucks/:truckId` | Live position of one truck |
| POST | `/api/tracking/trucks/:truckId/location` | GPS devices / crew app report a position |
| GET | `/api/tracking/trucks/:truckId/history?limit=100` | Recent GPS points (up to 500) |
| GET | `/api/tracking/nearby?latitude=13.08&longitude=80.27&radius_km=5` | Trucks near a point by live position. Optional `&status=AVAILABLE` |
| GET | `/api/tracking/stream` | Live updates (Server-Sent Events) |

Report a GPS position:

```json
{
  "latitude": 13.0701,
  "longitude": 80.2612,
  "speed_kmh": 42,
  "heading": 35
}
```

When a truck on a dispatch comes within 100 m of its incident, the dispatch automatically becomes `ON_SCENE`.

The live stream sends two event types:

* `location` — a truck's new position
* `dispatch` — a dispatch changed status

---

## 14.7 Analytics APIs (Module 5)

All GET endpoints accept `?from=YYYY-MM-DD&to=YYYY-MM-DD` (inclusive, by incident report date).

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/analytics/summary` | Totals, median / 90th-percentile response time, ETA accuracy |
| GET | `/api/analytics/response-times?group_by=severity` | Response times grouped by `severity`, `incident_type`, `station`, `division` or `hour` |
| GET | `/api/analytics/stations` | Workload per station: dispatches, share, busy hours, average travel |
| GET | `/api/analytics/trucks` | Utilization per truck: dispatches, busy hours, % of the period, estimated km |
| GET | `/api/analytics/trends?interval=week` | Incidents per `day`, `week` or `month`, by severity |
| GET | `/api/analytics/hourly` | Incidents and response time by hour of day |
| GET | `/api/analytics/hotspots?cell_km=1` | Incidents clustered on a grid (PostGIS) |
| POST | `/api/analytics/export` | Export history to HDFS / the local data lake. Body: `{ "from": "...", "to": "..." }` (optional) |
| GET | `/api/analytics/exports` | Recent export runs and the storage in use |

`GET /api/incidents?include_history=false` hides the synthetic history incidents (the Operations view uses this).

Response time is measured from the incident report to the **first** truck on scene.

---

# 15. Start the Frontend

Open another terminal.

From the project root:

```powershell
cd frontend
```

Install dependencies:

```powershell
npm install
```

Start the development server:

```powershell
npm run dev
```

Vite will provide a URL similar to:

```text
http://localhost:5173/
```

Open that URL in the browser.

---

# 16. Frontend Features

### Views

The header switches between **Operations** (Modules 1–4) and **Analytics** (Module 5). The Analytics page can be opened directly at `http://localhost:5173/#analytics`.

### Dashboard

The sidebar shows:

* Active incidents
* Fire stations
* Trucks ready (available / total)
* Critical incidents

The header shows whether live tracking is connected.

### Incident Reporting

A new incident can be reported by entering:

* Incident type
* Severity
* Description
* Latitude and longitude — or click the map and use **Use Map Location**

### Incident List

Recent incidents with ID, type, severity and status. Selecting one opens its nearest stations and dispatch panel.

### Interactive Map

The map (Leaflet + OpenStreetMap) displays:

* Fire stations, with trucks ready in the popup
* Incidents, coloured by severity
* Road routes of assigned trucks (blue while travelling, green once on scene)
* A dashed orange route preview for a recommended truck
* Live 🚒 truck markers that move along their route
* The selected reporting location

### Nearest Fire Stations

The three nearest stations to the selected incident, with distance and trucks ready.

### Truck Dispatch

For the selected incident:

* **Fastest available trucks** — ranked by road ETA, with road distance
* **Route** — preview a truck's route on the map before dispatching
* **Dispatch** — send one truck, or **Auto Dispatch** the number recommended for the severity
* **Assigned trucks** — ETA and expected arrival time; while driving, a live line with distance left, remaining time and speed; after arrival, the actual travel time
* **En Route / On Scene / Complete / Cancel** — move each dispatch along

### Analytics Page

* Date range: all time, last 90 / 30 days, or custom dates
* Headline numbers: incidents, dispatches, median response, 90th-percentile response, ETA accuracy
* Charts: incidents per week, incidents by hour of day, median response by severity and by incident type, busiest stations
* Most used trucks with utilization
* Hotspot map of incident clusters
* **Export** button with the history of export runs

Every chart has a hover tooltip, and a hidden table for screen readers.

### Demo Flow

1. Select an incident.
2. Click **Auto Dispatch**.
3. Click **En Route** on an assigned truck — the truck starts moving on the map.
4. The truck arrives on its own and becomes **On Scene**; the incident becomes **Active**.
5. Click **Complete** — the truck returns to its station and becomes available; when all trucks are done the incident becomes **Resolved**.

---

# 17. Module 1

## Incident Management & Spatial Processing

### Responsibilities

* Incident creation and storage
* Incident coordinates, timestamps, severity and status
* Fire-station data
* Spatial station lookup
* Distance calculation
* Interactive map

### Main Database Tables

```text
incidents
fire_stations
```

### Main Spatial Features

```text
Incident coordinates
        ↓
PostGIS geography point
        ↓
Spatial nearest-neighbour query
        ↓
Nearest fire stations
        ↓
Distance in kilometres
```

Example nearest-station query:

```sql
SELECT
    i.incident_id,
    fs.station_id,
    fs.fire_station_name,
    ROUND(
        (ST_Distance(i.location, fs.location) / 1000)::numeric,
        2
    ) AS distance_km
FROM incidents i
JOIN LATERAL (
    SELECT station_id, fire_station_name, location
    FROM fire_stations
    WHERE location IS NOT NULL
    ORDER BY location <-> i.location
    LIMIT 3
) fs ON TRUE
WHERE i.incident_id = 'INC1001'
ORDER BY distance_km;
```

---

# 18. Module 2

## Fire Truck & Dispatch Management

### Responsibilities

* Fire-truck records and station-to-truck relationship
* Truck availability and status
* Dispatch records
* Assigning available trucks to an incident
* Keeping truck and incident statuses in sync

### Main Database Tables

```text
fire_trucks
dispatches
```

### Truck Statuses

| Status | Meaning |
|---|---|
| `AVAILABLE` | At the station, ready to dispatch |
| `DISPATCHED` | Assigned to an incident, not yet moving |
| `EN_ROUTE` | Driving to the incident |
| `ON_SCENE` | Working at the incident |
| `MAINTENANCE` | Out of service |

### Incident Status Rules

An incident's status is updated automatically from its dispatches:

| Situation | Incident status |
|---|---|
| Any truck on scene | `ACTIVE` |
| Trucks assigned or driving | `DISPATCHED` |
| All dispatches finished, at least one completed | `RESOLVED` |
| All dispatches cancelled | `PENDING` |

### Safety Rules

* A truck can only be on one open dispatch at a time (enforced by a unique index).
* Dispatching locks the incident and the chosen trucks, so two dispatchers cannot assign the same truck.

---

# 19. Module 3

## Intelligent Routing & ETA

### Responsibilities

* Road route calculation from station to incident
* Road distance and estimated travel time
* Ranking trucks by road ETA instead of straight-line distance
* Route visualization

### Main Database Table

```text
dispatch_routes
```

### How Trucks Are Ranked

```text
PostGIS: 10 nearest available trucks (straight line)
        ↓
OSRM: road travel time from each station (one request)
        ↓
Sorted by ETA — fastest first
```

A station that looks close can be slower by road (for example across a river or railway), so ranking by road ETA picks the truck that will actually arrive first.

### Fallback

If OSRM cannot be reached, the ETA is estimated as straight-line distance × 1.4 at 25 km/h. These estimates are shown with `~` in the app and drawn as dotted lines, and dispatching is never blocked.

---

# 20. Module 4

## Real-Time Tracking

### Responsibilities

* Live truck location
* Redis-based tracking
* Truck movement
* Automatic arrival detection and availability updates
* Live map updates

### Redis Data

| Key | Type | Contents |
|---|---|---|
| `rr:truck:locations` | Hash | Latest position of each truck |
| `rr:truck:geo` | Geo set | Live positions for radius searches |
| `rr:truck:history:<truckId>` | Stream | Last 500 GPS points per truck |
| `rr:tracking` | Pub/Sub channel | Live updates shared between backend instances |

Without Redis, the same data is kept in memory.

### Truck Movement

Trucks do not have GPS devices yet, so a simulator drives each truck along its Module 3 road route once its dispatch is set to `EN_ROUTE`. Real GPS devices can post positions to `/api/tracking/trucks/:truckId/location` instead; real GPS takes over from the simulator.

### Automatic Updates

* Truck within 100 m of the incident → dispatch becomes `ON_SCENE`
* Dispatch `COMPLETED` or `CANCELLED` → truck is placed back at its station and becomes `AVAILABLE`
* Backend restart → trucks that were mid-trip continue from their last position

---

# 21. Module 5

## Historical Analytics

### Responsibilities

* Historical incidents
* Response-time analysis
* Station workload
* Truck utilization
* GPS history
* HDFS storage
* Hive-based analytics

### Two Levels of Analytics

| | Where | Used for |
|---|---|---|
| **Live analytics** | PostgreSQL (`v_dispatch_facts` view) | The Analytics page and `/api/analytics/*` — always up to date |
| **Batch analytics** | HDFS + Hive (`database/hive/`) | Long-term history and large-scale queries over exported files |

Both compute the same measures from the same dispatch facts.

### Dispatch Measures (`v_dispatch_facts`)

| Measure | Meaning |
|---|---|
| `dispatch_delay_min` | Incident reported → truck dispatched |
| `travel_min` | Truck dispatched → truck arrived |
| `response_min` | Incident reported → truck arrived |
| `eta_error_min` | Actual travel time − Module 3 ETA |
| `on_scene_min` | Truck arrived → dispatch completed |
| `busy_min` | Truck dispatched → dispatch finished |

### Export Layout (HDFS or local)

```text
/rescueroute/warehouse/
├── incidents/dt=YYYY-MM-DD/part-00000.json
├── dispatch_facts/dt=YYYY-MM-DD/part-00000.json
└── truck_gps/dt=YYYY-MM-DD/part-<run>.json
```

Files are JSON Lines, partitioned by date (`dt=`), which Hive reads as partitions.

* Incident and dispatch partitions are rewritten from PostgreSQL on every export, so exporting again is safe.
* GPS points come from Module 4, which keeps only the latest 500 per truck, so each export sends only the points recorded since the previous export. Export regularly (or set `ANALYTICS_EXPORT_INTERVAL_MIN`) to keep the full GPS history.
* HDFS is written through **WebHDFS**, the HDFS NameNode's built-in REST API — no Hadoop libraries are needed in the backend.

### Using Hive

1. Export from the Analytics page, or:

   ```powershell
   curl -X POST http://localhost:4000/api/analytics/export
   ```

2. If you exported locally, upload the folder to HDFS:

   ```bash
   hdfs dfs -mkdir -p /rescueroute
   hdfs dfs -put datalake/warehouse /rescueroute/
   ```

3. Create the Hive tables (once) and register new partitions:

   ```bash
   beeline -u jdbc:hive2://localhost:10000 -f database/hive/create_tables.hql
   ```

4. Run the analytics queries:

   ```bash
   beeline -u jdbc:hive2://localhost:10000 -f database/hive/analytics_queries.hql
   ```

After each new export, run `MSCK REPAIR TABLE` for the three tables (the last lines of `create_tables.hql`) so Hive sees new dates.

---

# 22. Database Files

```text
database/postgis/
│
├── schema.sql              Module 1 tables and spatial indexes
├── module2_schema.sql      Module 2 tables: fire_trucks, dispatches
├── module3_schema.sql      Module 3 table: dispatch_routes
├── module5_schema.sql      Module 5: v_dispatch_facts view, export log
│
└── seed/
    ├── fire_stations.sql   33 Chennai fire stations
    ├── incidents.sql       32 demo incidents
    ├── fire_trucks.sql     83 demo fire trucks
    └── history.sql         ~360 synthetic historical incidents + dispatches

database/hive/
├── create_tables.hql       Hive external tables over the HDFS exports
└── analytics_queries.hql   Response time, workload, utilization, ETA accuracy,
                            hourly pattern, trends, hotspots, GPS activity
```

This separation allows another developer to recreate the complete database after cloning the repository.

---

# 23. Dataset Information

The project uses fire-station information from the Chennai fire-station dataset.

The incident records, the fire-truck fleet and the dispatch history are **demo/synthetic data** used for development and demonstration:

* Incidents are not real historical emergency reports. Many demo incidents in `incidents.sql` sit exactly at a fire station, so dispatching to them gives a zero-length route and an instant arrival — pick one further away (e.g. `INC1008`) to see trucks drive.
* `history.sql` generates about 360 incidents (IDs `HIS00001`…, source "RescueRoute Synthetic History") for July–August 2026 with built-in patterns: more fires between 10:00 and 20:00, hotspots at Ambattur Industrial Estate and T. Nagar, slower travel in rush hours, and some extra trucks recalled before arrival.
* Every station has a Water Tender and a Foam Tender; every third station also has an Aerial Ladder Platform and every fifth a Rescue Tender. Three trucks start in maintenance.

---

# 24. Running the Complete System

Two terminals are required (plus Redis, if you use it).

## Terminal 1 — Backend

```powershell
cd Rescue_Route\backend
npm install
npm run dev
```

Backend:

```text
http://localhost:4000
```

## Terminal 2 — Frontend

```powershell
cd Rescue_Route\frontend
npm install
npm run dev
```

Frontend:

```text
http://localhost:5173
```

The overall architecture is:

```text
                          RescueRoute
                               │
                ┌──────────────┴──────────────┐
                │                             │
            Frontend  ◄── live updates ───  Backend
            React                          Express
                │                             │
                └──────────── REST ───────────┘
                                              │
              ┌───────────────────┬───────────┴───────────┬──────────────────┐
              │                   │                       │                  │
        PostgreSQL +          OSRM routing           Redis (or          HDFS (or local
          PostGIS              (Module 3)           in-memory)          datalake/)
              │                                     (Module 4)          (Module 5)
   ┌──────────┼──────────┬──────────┐                   │                  │
   │          │          │          │           Live positions,       Exported history
Incidents  Stations   Trucks    Dispatches       GPS history,               │
                                + Routes         pub/sub                  Hive
```

---

# 25. Module Integration

```text
Module 1   Incident reported
              ↓
           Nearest fire stations (PostGIS)
              ↓
Module 2   Available trucks at those stations
              ↓
Module 3   Ranked by road ETA (OSRM) → fastest trucks dispatched
              ↓                         route + ETA stored
Module 4   Truck tracked live along its route
              ↓
           Arrival detected → ON_SCENE → incident ACTIVE
              ↓
           Completed → truck back at station → incident RESOLVED
              ↓
Module 5   Response times, workload, utilization, hotspots (PostgreSQL)
              ↓
           History + GPS exported to HDFS → Hive batch analytics
```

---

# 26. Future Work

All five planned modules are complete. Possible next steps:

* **CockroachDB** for operational data (trucks and dispatches) across multiple sites, as listed under Planned Technologies
* A crew mobile app posting real GPS positions to `/api/tracking/trucks/:truckId/location`
* A self-hosted OSRM server for production routing
* Scheduled Hive jobs (e.g. nightly) feeding reports

---

# 27. Troubleshooting

## PostgreSQL connection failed

Check:

```powershell
psql -U postgres -d rescueroute_spatial -h localhost
```

Verify the database is running and the `.env` credentials are correct.

If `/api/health` shows `client password must be a string`, the backend did not find `backend/.env`. Make sure the file is in the `backend` folder, then restart the backend.

---

## `relation "fire_trucks" does not exist` (or `dispatch_routes`)

The Module 2 or Module 3 database files have not been run. Run the files in [section 8](#8-create-the-database-schema-and-load-seed-data) in order.

---

## `extension "postgis" is not available`

PostGIS is not installed for your PostgreSQL. See [section 4.3](#43-postgis).

---

## Analytics page shows empty charts

Load `database/postgis/seed/history.sql`, or dispatch and complete some incidents in the Operations view first.

---

## `relation "v_dispatch_facts" does not exist`

Run `database/postgis/module5_schema.sql`.

---

## Export fails with `WebHDFS CREATE failed`

Check `HDFS_NAMENODE_URL` (the NameNode web port, usually `9870`), that WebHDFS is enabled, and that `HDFS_USER` may write to `HDFS_BASE_PATH`. Remove `HDFS_NAMENODE_URL` to export locally instead.

---

## `invalid command \restrict` when loading seed files

The seed files were exported with a newer PostgreSQL version. The message is harmless and the data still loads.

---

## PostGIS not found

Inside PostgreSQL:

```sql
SELECT PostGIS_Version();
```

If PostGIS is unavailable, install/enable PostGIS for the PostgreSQL installation.

---

## Routes show `~` and dotted lines

The backend could not reach OSRM, so ETAs are estimates. Check internet access, or set `OSRM_URL` to a reachable OSRM server.

---

## Backend says `Redis unavailable ... using in-memory store`

`REDIS_URL` is set but Redis is not running. Start Redis, or remove `REDIS_URL` to use the in-memory store on purpose.

---

## Trucks do not move after clicking En Route

Check `http://localhost:4000/api/tracking/status`:

* `simulation_enabled` must be `true` (`TRUCK_SIMULATION` not set to `false`)
* The dispatch needs a stored route — check `GET /api/dispatches/:dispatchId/route`

---

## Header shows "TRACKING OFFLINE"

The browser cannot reach `http://localhost:4000/api/tracking/stream`. Make sure the backend is running; the browser reconnects automatically.

---

## Backend port already in use

Check whether another process is using port `4000`.

Alternatively, change:

```env
PORT=4000
```

in `.env`.

---

## Frontend cannot connect to backend

Make sure the backend is running:

```text
http://localhost:4000/api/health
```

Then start the frontend:

```powershell
npm run dev
```

---

## Map is not displayed

Make sure Leaflet is installed:

```powershell
npm install leaflet react-leaflet
```

Also ensure Leaflet CSS is imported in the frontend.

---

# 28. Important Development Rule

Database changes for this project are applied directly to the existing PostgreSQL database.

Do not use Prisma migrations for the RescueRoute database unless the project workflow is explicitly changed.

Database structure and seed data are maintained through:

```text
database/postgis/schema.sql
database/postgis/module2_schema.sql
database/postgis/module3_schema.sql
database/postgis/module5_schema.sql
database/postgis/seed/
database/hive/
```

---

# 29. Git Collaboration

The main project branch is:

```text
reena-module1
```

Each module is developed on its own branch and merged into `reena-module1` through a pull request:

| Module | Branch | Pull request |
|---|---|---|
| 2 | `module2-dispatch` | #1 (merged) |
| 3 | `module3-routing` | #2 (merged) |
| 4 | `module4-tracking` | #3 (merged) |
| 5 | `module5-analytics` | pull request into `reena-module1` |

To start new work:

```powershell
git checkout reena-module1
git pull
git checkout -b my-new-feature
```

Push the branch and open a pull request into `reena-module1`:

```powershell
git push -u origin my-new-feature
```

---

# 30. Project Status

### Module 1 — Incident Management & Spatial Processing ✅

* Incident and fire-station databases
* PostGIS integration and spatial indexes
* Incident and fire-station REST APIs
* Nearest-station processing and distance calculation
* React dashboard, interactive map and incident reporting
* Nearby-station display
* Database seed files

### Module 2 — Fire Truck & Dispatch Management ✅

* Fire-truck and dispatch tables with seed fleet
* Truck and dispatch REST APIs
* Manual and automatic dispatch by severity
* Dispatch status workflow with automatic truck and incident status updates
* Truck availability on stations and nearest-station results
* Dispatch panel in the dashboard

### Module 3 — Intelligent Routing & ETA ✅

* OSRM road routing with estimate fallback
* Truck ranking by road ETA
* Stored route, road distance and ETA per dispatch
* Expected arrival and actual travel time
* Route preview and route drawing on the map

### Module 4 — Real-Time Tracking ✅

* Redis tracking store with in-memory fallback
* Truck movement simulator along road routes
* GPS location API for real devices
* Automatic arrival detection
* GPS history and nearby-truck search
* Live map and dispatch panel updates over Server-Sent Events

### Module 5 — Historical Analytics ✅

* Dispatch facts view with response, travel, ETA-error, on-scene and busy times
* Analytics APIs: summary, response times by group, station workload, truck utilization, trends, hourly pattern, hotspots
* Analytics page with charts, tables and a hotspot map
* Export to HDFS (WebHDFS) or a local data lake as Hive-ready date partitions, including GPS history
* Hive table definitions and batch analytics queries
* Synthetic two-month history seed

---

# 31. Quick Start

For an already configured machine:

```powershell
git clone https://github.com/Reena005/Rescue_Route.git
cd Rescue_Route
git checkout reena-module1
```

Create the `rescueroute_spatial` database, enable PostGIS, then run in order:

```text
database/postgis/schema.sql
database/postgis/seed/fire_stations.sql
database/postgis/seed/incidents.sql
database/postgis/module2_schema.sql
database/postgis/seed/fire_trucks.sql
database/postgis/module3_schema.sql
database/postgis/module5_schema.sql
database/postgis/seed/history.sql
```

Create `backend/.env` (see [section 11](#11-backend-environment-configuration)).

Backend:

```powershell
cd backend
npm install
npm run dev
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173
http://localhost:5173/#analytics
```

Backend API:

```text
http://localhost:4000
```

Health check:

```text
http://localhost:4000/api/health
```

---

## RescueRoute

**Intelligent Firefighter Dispatch and Emergency Routing System**

Completed: Module 1 — Incident Management & Spatial Processing · Module 2 — Fire Truck & Dispatch Management · Module 3 — Intelligent Routing & ETA · Module 4 — Real-Time Tracking · Module 5 — Historical Analytics
