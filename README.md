# RescueRoute — Intelligent Firefighter Dispatch and Emergency Routing System

RescueRoute is a database-driven emergency response system designed to support faster and more informed fire-response decisions.

The system manages fire incidents, fire stations, spatial locations, and nearby-station identification using PostgreSQL and PostGIS. The project is designed to be extended with fire-truck dispatch, intelligent routing, real-time tracking, and historical analytics.

---

## 1. Project Overview

During a fire emergency, selecting an appropriate fire station and response vehicle quickly is important.

RescueRoute provides a centralized system that:

* Records fire incidents
* Stores incident coordinates and timestamps
* Maintains fire-station information
* Uses PostGIS for spatial processing
* Identifies nearby fire stations
* Calculates the distance between incidents and stations
* Displays incidents and stations on a map
* Provides REST APIs for incident and station management
* Provides a foundation for intelligent truck dispatch and routing

### Current Implementation

The current implementation focuses on:

**Module 1 — Incident Management & Spatial Processing**

Future modules will extend the system with:

* Fire Truck & Dispatch Management
* Intelligent Routing & ETA
* Real-Time Truck Tracking
* Historical Analytics

---

# 2. Technology Stack

## Frontend

* React
* Vite
* React-Leaflet
* Leaflet
* OpenStreetMap

## Backend

* Node.js
* Express.js
* PostgreSQL client (`pg`)
* CORS
* dotenv
* Nodemon

## Database

* PostgreSQL
* PostGIS

## Planned Technologies

* Redis — real-time truck location and availability
* CockroachDB — operational distributed data
* Hadoop/HDFS — historical data storage
* Hive — historical analytics

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
│   │   │   ├── incidentController.js
│   │   │   └── stationController.js
│   │   │
│   │   ├── routes/
│   │   │   ├── incidentRoutes.js
│   │   │   └── stationRoutes.js
│   │   │
│   │   └── server.js
│   │
│   ├── .env
│   ├── .gitignore
│   ├── package.json
│   └── package-lock.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── services/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   │
│   ├── package.json
│   └── ...
│
├── database/
│   └── postgis/
│       ├── schema.sql
│       └── seed/
│           ├── fire_stations.sql
│           └── incidents.sql
│
├── datasets/
│   └── module1/
│
├── docs/
│
└── README.md
```

---

# 4. Prerequisites

Before running RescueRoute, install the following software.

## Required

### 4.1 Node.js

Install Node.js from:

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

The project requires PostGIS because incident and station locations are stored as geographic points.

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

# 5. Clone the Repository

Clone the repository:

```powershell
git clone https://github.com/Reena005/Rescue_Route.git
```

Move into the project:

```powershell
cd Rescue_Route
```

To use the Module 1 implementation:

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

# 8. Create the Database Schema

The database schema is stored in:

```text
database/postgis/schema.sql
```

From the PostgreSQL prompt, run:

```sql
\i 'C:/path/to/Rescue_Route/database/postgis/schema.sql'
```

Replace the path with the actual location of your cloned project.

For example:

```sql
\i 'C:/Users/YourName/Rescue_Route/database/postgis/schema.sql'
```

The schema creates the Module 1 tables and spatial indexes.

---

# 9. Load Module 1 Seed Data

The repository contains SQL seed files so collaborators do not have to manually recreate the database data.

## Fire Stations

Run:

```sql
\i 'C:/path/to/Rescue_Route/database/postgis/seed/fire_stations.sql'
```

This loads the Chennai fire-station records.

Verify:

```sql
SELECT COUNT(*) FROM fire_stations;
```

The Module 1 dataset contains **33 Chennai fire stations**.

---

## Incidents

Run:

```sql
\i 'C:/path/to/Rescue_Route/database/postgis/seed/incidents.sql'
```

Verify:

```sql
SELECT COUNT(*) FROM incidents;
```

The seed file contains the incident records used by the Module 1 implementation.

---

# 10. Verify the Spatial Data

Check station coordinates:

```sql
SELECT
    station_id,
    fire_station_name,
    latitude,
    longitude
FROM fire_stations
ORDER BY station_id;
```

Check incident coordinates:

```sql
SELECT
    incident_id,
    incident_type,
    severity,
    latitude,
    longitude
FROM incidents
ORDER BY incident_id;
```

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

---

# 11. Backend Setup

Open a terminal and navigate to:

```powershell
cd backend
```

Install dependencies:

```powershell
npm install
```

---

# 12. Backend Environment Configuration

Create:

```text
backend/.env
```

Add:

```env
PORT=4000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=rescueroute_spatial
DB_USER=postgres
DB_PASSWORD=YOUR_POSTGRES_PASSWORD
```

Replace:

```text
YOUR_POSTGRES_PASSWORD
```

with the password of the local PostgreSQL user.

Do not commit `.env` to GitHub.

The project already contains `.gitignore` rules for:

```text
node_modules/
.env
```

---

# 13. Start the Backend

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
```

---

# 14. Test Backend Health

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

---

# 15. Backend API Endpoints

## Incident APIs

### Get all incidents

```http
GET /api/incidents
```

Example:

```text
http://localhost:4000/api/incidents
```

---

### Get one incident

```http
GET /api/incidents/:id
```

Example:

```text
http://localhost:4000/api/incidents/INC1001
```

---

### Create an incident

```http
POST /api/incidents
```

Example request:

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

# 16. Fire Station APIs

### Get all stations

```http
GET /api/stations
```

Example:

```text
http://localhost:4000/api/stations
```

---

### Get a station by ID

```http
GET /api/stations/:stationId
```

Example:

```text
http://localhost:4000/api/stations/CHN001
```

---

### Find nearby stations

```http
GET /api/stations/nearby/:incidentId
```

Example:

```text
http://localhost:4000/api/stations/nearby/INC1001
```

The API returns the three nearest fire stations and their distances from the incident.

---

# 17. Start the Frontend

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

# 18. Frontend Features

The Module 1 frontend provides:

### Dashboard

Displays:

* Total incidents
* Pending incidents
* Active incidents
* Resolved incidents
* Fire stations

### Incident List

Displays:

* Incident ID
* Incident type
* Severity
* Description
* Status
* Reported time

### Interactive Map

The map displays:

* Fire-station locations
* Incident locations
* Selected incident
* Selected reporting location

The map uses Leaflet and OpenStreetMap.

### Incident Reporting

A new incident can be reported by entering:

* Incident type
* Severity
* Description
* Latitude
* Longitude

The map can also be used to select an incident location.

### Nearby Stations

After selecting an incident, the system requests:

```text
GET /api/stations/nearby/:incidentId
```

and displays the nearest three stations with their calculated distances.

---

# 19. PostGIS Spatial Processing

RescueRoute uses PostGIS to represent locations as geographic points.

Example:

```sql
ST_SetSRID(
    ST_MakePoint(longitude, latitude),
    4326
)::geography
```

The system uses spatial queries to identify nearby fire stations.

Example:

```sql
SELECT
    i.incident_id,
    fs.station_id,
    fs.fire_station_name,
    ROUND(
        (
            ST_Distance(i.location, fs.location) / 1000
        )::numeric,
        2
    ) AS distance_km
FROM incidents i
JOIN LATERAL (
    SELECT
        station_id,
        fire_station_name,
        location
    FROM fire_stations
    WHERE location IS NOT NULL
    ORDER BY location <-> i.location
    LIMIT 3
) fs ON TRUE
WHERE i.incident_id = 'INC1001'
ORDER BY distance_km;
```

This performs spatial nearest-neighbour processing.

---

# 20. Module 1

## Incident Management & Spatial Processing

### Responsibilities

* Incident creation
* Incident storage
* Incident coordinates
* Incident timestamps
* Incident severity
* Incident status
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

---

# 21. Database Seed Files

The database directory contains:

```text
database/postgis/
│
├── schema.sql
│
└── seed/
    ├── fire_stations.sql
    └── incidents.sql
```

### `schema.sql`

Contains database structure:

* Tables
* Columns
* Constraints
* Spatial indexes

### `fire_stations.sql`

Contains the fire-station records required by Module 1.

### `incidents.sql`

Contains the incident records required by Module 1.

This separation allows another developer to recreate the Module 1 database after cloning the repository.

---

# 22. Dataset Information

The project uses fire-station information from the Chennai fire-station dataset.

The incident records included in the current Module 1 seed data are **demo/synthetic incident records** used for development and spatial-processing demonstration.

They should not be interpreted as real historical emergency reports.

---

# 23. Running the Complete System

Two terminals are required.

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

The overall flow is:

```text
                    RescueRoute
                         │
             ┌───────────┴───────────┐
             │                       │
          Frontend                Backend
          React                   Express
             │                       │
             └───────────┬───────────┘
                         │
                    PostgreSQL
                         │
                      PostGIS
                         │
              ┌──────────┴──────────┐
              │                     │
          Incidents            Fire Stations
              │                     │
              └──────────┬──────────┘
                         │
                 Spatial Processing
                         │
                  Nearby Stations
```

---

# 24. Future Modules

The project is designed to be extended beyond Module 1.

## Module 2 — Fire Truck & Dispatch Management

Planned functionality:

* Fire-truck records
* Truck availability
* Truck status
* Station-to-truck relationship
* Dispatch records
* Assigning an available truck to an incident

---

## Module 3 — Intelligent Routing & ETA

Planned functionality:

* Truck current location
* Incident location
* Route calculation
* Distance
* Estimated travel time
* Route visualization

---

## Module 4 — Real-Time Tracking

Planned functionality:

* Live truck location
* Redis-based tracking
* Truck movement
* Availability updates
* Live map updates

---

## Module 5 — Historical Analytics

Planned functionality:

* Historical incidents
* Response-time analysis
* Station workload
* Truck utilization
* GPS history
* HDFS storage
* Hive-based analytics

---

# 25. Troubleshooting

## PostgreSQL connection failed

Check:

```powershell
psql -U postgres -d rescueroute_spatial -h localhost
```

Verify the database is running and the `.env` credentials are correct.

---

## PostGIS not found

Inside PostgreSQL:

```sql
SELECT PostGIS_Version();
```

If PostGIS is unavailable, install/enable PostGIS for the PostgreSQL installation.

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

# 26. Important Development Rule

Database changes for this project are applied directly to the existing PostgreSQL database.

Do not use Prisma migrations for the RescueRoute database unless the project workflow is explicitly changed.

Database structure and seed data are maintained through:

```text
database/postgis/schema.sql
database/postgis/seed/
```

---

# 27. Git Collaboration

The Module 1 implementation is maintained on:

```text
reena-module1
```

Collaborators should create their own branches from the Module 1 branch rather than directly modifying the Module 1 branch.

Example:

```powershell
git checkout reena-module1
git pull
git checkout -b collaborator1-module2
```

Another collaborator can create:

```powershell
git checkout reena-module1
git pull
git checkout -b collaborator2-module3-5
```

This keeps Module 1 isolated while allowing other modules to be developed independently.

---

# 28. Module Integration

The planned module flow is:

```text
Module 1
Incident
   ↓
Nearest Fire Stations
   ↓
Module 2
Available Fire Truck
   ↓
Dispatch
   ↓
Module 3
Route + ETA
   ↓
Module 4
Real-Time Tracking
   ↓
Module 5
Historical Analytics
```

---

# 29. Project Status

### Module 1 — Incident Management & Spatial Processing

**Implemented**

* Incident database
* Fire-station database
* PostGIS integration
* Spatial indexes
* Incident REST APIs
* Fire-station REST APIs
* Nearest-station processing
* Distance calculation
* React dashboard
* Interactive map
* Incident reporting
* Nearby-station display
* Database seed files

### Modules 2–5

Planned / under development.

---

# 30. Quick Start

For an already configured machine:

```powershell
git clone https://github.com/Reena005/Rescue_Route.git
cd Rescue_Route
git checkout reena-module1
```

Create and configure the PostgreSQL database, then run:

```text
database/postgis/schema.sql
database/postgis/seed/fire_stations.sql
database/postgis/seed/incidents.sql
```

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

Module 1: **Incident Management & Spatial Processing**
