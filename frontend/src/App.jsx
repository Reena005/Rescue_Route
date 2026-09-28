import { useEffect, useRef, useState } from "react";

import MapView from "./components/MapView";
import IncidentForm from "./components/IncidentForm";
import NearbyStations from "./components/NearbyStations";
import DispatchPanel from "./components/DispatchPanel";
import AnalyticsView from "./components/AnalyticsView";

import useTruckTracking from "./hooks/useTruckTracking";

import {
    getIncidents,
    getStations,
    getNearbyStations,
    getTrucks,
    getIncidentRoutes,
    previewRoute
} from "./services/api";

import "./App.css";


function App() {

    // "operations" (Modules 1-4) or "analytics" (Module 5).
    // The URL hash (#analytics) keeps the view bookmarkable.
    const [view, setViewState] =
        useState(() =>
            window.location.hash === "#analytics"
                ? "analytics"
                : "operations"
        );

    const setView = (next) => {
        setViewState(next);
        window.history.replaceState(null, "", `#${next}`);
    };

    const [incidents, setIncidents] =
        useState([]);

    const [stations, setStations] =
        useState([]);

    const [trucks, setTrucks] =
        useState([]);

    const [selectedIncident, setSelectedIncident] =
        useState(null);

    const [nearbyStations, setNearbyStations] =
        useState([]);

    // Module 3: routes of assigned trucks + one previewed route
    const [routes, setRoutes] =
        useState([]);

    const [routePreview, setRoutePreview] =
        useState(null);

    // Module 4: live truck positions and server-pushed
    // dispatch changes (e.g. a truck arriving on scene)
    const {
        liveTrucks,
        connected: trackingConnected,
        dispatchEvent
    } = useTruckTracking();

    const [dispatchRefreshKey, setDispatchRefreshKey] =
        useState(0);

    const handleDispatchChangedRef =
        useRef(null);

    // Guards against a slow response for a previously
    // selected incident overwriting the current one
    const selectedIncidentIdRef =
        useRef(null);

    const [selectedLocation, setSelectedLocation] =
        useState(null);

    const [loadingNearby, setLoadingNearby] =
        useState(false);

    const [loadingData, setLoadingData] =
        useState(true);

    const [error, setError] =
        useState("");


    const loadData = async () => {

        try {

            setLoadingData(true);

            const [
                incidentsData,
                stationsData,
                trucksData
            ] = await Promise.all([
                getIncidents(),
                getStations(),
                getTrucks()
            ]);

            setIncidents(
                incidentsData.incidents
            );

            setStations(
                stationsData.stations
            );

            setTrucks(
                trucksData.trucks
            );

            return incidentsData.incidents;

        } catch (err) {

            setError(
                "Unable to connect to RescueRoute backend."
            );

            console.error(err);

        } finally {

            setLoadingData(false);
        }
    };


    useEffect(() => {
        loadData();
    }, []);


    const loadRoutes =
        async (incidentId) => {

            try {

                const data =
                    await getIncidentRoutes(
                        incidentId
                    );

                if (
                    selectedIncidentIdRef.current ===
                    incidentId
                ) {
                    setRoutes(data.routes);
                }

            } catch (err) {

                console.error(err);
            }
        };


    const handleIncidentSelect =
        async (incident) => {

            selectedIncidentIdRef.current =
                incident.incident_id;

            setSelectedIncident(incident);

            setNearbyStations([]);

            setRoutes([]);

            setRoutePreview(null);

            setLoadingNearby(true);

            loadRoutes(incident.incident_id);


            try {

                const data =
                    await getNearbyStations(
                        incident.incident_id
                    );

                setNearbyStations(
                    data.nearbyStations
                );

            } catch (err) {

                console.error(err);

            } finally {

                setLoadingNearby(false);
            }
        };


    const handleIncidentCreated =
        async (incident) => {

            await loadData();

            handleIncidentSelect(
                incident
            );
        };


    // Module 2: after a dispatch change, refresh incident
    // statuses, station truck counts and the selected incident
    const handleDispatchChanged =
        async () => {

            const updatedIncidents =
                await loadData();

            if (!selectedIncident || !updatedIncidents) {
                return;
            }

            const updated =
                updatedIncidents.find(
                    (incident) =>
                        incident.incident_id ===
                        selectedIncident.incident_id
                );

            if (updated) {
                setSelectedIncident(updated);
            }

            setRoutePreview(null);

            loadRoutes(selectedIncident.incident_id);

            try {

                const data =
                    await getNearbyStations(
                        selectedIncident.incident_id
                    );

                setNearbyStations(
                    data.nearbyStations
                );

            } catch (err) {

                console.error(err);
            }
        };


    useEffect(() => {
        handleDispatchChangedRef.current =
            handleDispatchChanged;
    });


    // Module 4: refresh when the server reports a dispatch
    // change. Debounced, because one auto-dispatch sends an
    // event per truck.
    useEffect(() => {

        if (!dispatchEvent) {
            return;
        }

        const timer = setTimeout(() => {
            handleDispatchChangedRef.current?.();

            setDispatchRefreshKey(
                (key) => key + 1
            );
        }, 300);

        return () => clearTimeout(timer);

    }, [dispatchEvent]);


    const deployedTruckCount =
        [...liveTrucks.values()].filter(
            (truck) =>
                ["DISPATCHED", "EN_ROUTE", "ON_SCENE"]
                    .includes(truck.status)
        ).length;


    // Module 3: show / hide the road route a truck would take
    const handlePreviewRoute =
        async (truck) => {

            if (
                routePreview?.truck_id ===
                truck.truck_id
            ) {
                setRoutePreview(null);
                return;
            }

            try {

                const data =
                    await previewRoute(
                        selectedIncident.incident_id,
                        truck.truck_id
                    );

                setRoutePreview({
                    ...data,
                    truck_id: truck.truck_id
                });

            } catch (err) {

                console.error(err);
            }
        };


    const activeCount =
        incidents.filter(
            (incident) =>
                incident.status !== "RESOLVED"
        ).length;


    const criticalCount =
        incidents.filter(
            (incident) =>
                incident.severity === "CRITICAL"
        ).length;


    const availableTruckCount =
        trucks.filter(
            (truck) =>
                truck.status === "AVAILABLE"
        ).length;


    return (

        <div className="app">

            {/* Header */}

            <header className="topbar">

                <div className="brand">

                    <div className="brand-icon">
                        R
                    </div>

                    <div>

                        <h1>
                            RESCUEROUTE
                        </h1>

                        <p>
                            Intelligent Emergency
                            Dispatch System
                        </p>

                    </div>

                </div>


                <nav className="view-tabs" aria-label="View">

                    <button
                        type="button"
                        className={view === "operations" ? "active" : ""}
                        onClick={() => setView("operations")}
                    >
                        OPERATIONS
                    </button>

                    <button
                        type="button"
                        className={view === "analytics" ? "active" : ""}
                        onClick={() => setView("analytics")}
                    >
                        ANALYTICS
                    </button>

                </nav>


                <div className="system-status">

                    <span className="status-dot"></span>

                    SYSTEM ONLINE

                    <span
                        className={`tracking-status ${
                            trackingConnected
                                ? "live"
                                : "offline"
                        }`}
                    >
                        {trackingConnected
                            ? "● LIVE TRACKING"
                            : "○ TRACKING OFFLINE"}
                    </span>

                </div>

            </header>


            {error && (
                <div className="connection-error">
                    {error}
                </div>
            )}


            {view === "analytics" ? (

                <AnalyticsView />

            ) : (

            <main className="dashboard">

                {/* LEFT SIDEBAR */}

                <aside className="sidebar">


                    <div className="dashboard-title">

                        <span>
                            INCIDENT CONTROL
                        </span>

                        <small>
                            CHENNAI
                        </small>

                    </div>


                    {/* Statistics */}

                    <div className="stats">

                        <div className="stat-card">

                            <span>
                                ACTIVE
                            </span>

                            <strong>
                                {activeCount}
                            </strong>

                        </div>


                        <div className="stat-card">

                            <span>
                                STATIONS
                            </span>

                            <strong>
                                {stations.length}
                            </strong>

                        </div>


                        <div className="stat-card">

                            <span>
                                TRUCKS READY
                            </span>

                            <strong>
                                {availableTruckCount}
                                <small>
                                    /{trucks.length}
                                </small>
                            </strong>

                        </div>


                        <div className="stat-card critical-stat">

                            <span>
                                CRITICAL
                            </span>

                            <strong>
                                {criticalCount}
                            </strong>

                        </div>

                    </div>


                    {/* Incident Form */}

                    <IncidentForm
                        selectedLocation={
                            selectedLocation
                        }
                        onIncidentCreated={
                            handleIncidentCreated
                        }
                    />


                    {/* Incident list */}

                    <div className="incident-list">

                        <div className="section-title">
                            RECENT INCIDENTS
                        </div>


                        {loadingData ? (

                            <div className="loading">
                                Loading incidents...
                            </div>

                        ) : incidents.length === 0 ? (

                            <div className="empty-message">
                                No incidents found.
                            </div>

                        ) : (

                            incidents
                                .slice(0, 8)
                                .map((incident) => (

                                    <button
                                        className={`incident-item ${
                                            selectedIncident?.incident_id ===
                                            incident.incident_id
                                                ? "selected"
                                                : ""
                                        }`}
                                        key={
                                            incident.incident_id
                                        }
                                        onClick={() =>
                                            handleIncidentSelect(
                                                incident
                                            )
                                        }
                                    >

                                        <div className="incident-main">

                                            <strong>
                                                {
                                                    incident.incident_id
                                                }
                                            </strong>

                                            <span>
                                                {
                                                    incident.incident_type
                                                }
                                            </span>

                                        </div>


                                        <div className="incident-meta">

                                            <span
                                                className={`severity-badge ${incident.severity.toLowerCase()}`}
                                            >
                                                {
                                                    incident.severity
                                                }
                                            </span>

                                            <span>
                                                {
                                                    incident.status
                                                }
                                            </span>

                                        </div>

                                    </button>

                                ))
                        )}

                    </div>

                </aside>


                {/* MAIN CONTENT */}

                <section className="main-content">


                    <div className="map-header">

                        <div>

                            <h2>
                                Chennai Emergency Map
                            </h2>

                            <p>
                                Real-time incident and
                                fire-station spatial view
                            </p>

                        </div>


                        <div className="map-info">

                            <span>
                                ● {incidents.length}
                                {" "}incidents
                            </span>

                            <span>
                                ● {stations.length}
                                {" "}stations
                            </span>

                            <span>
                                ● {deployedTruckCount}
                                {" "}trucks deployed
                            </span>

                        </div>

                    </div>


                    <MapView
                        incidents={incidents}
                        stations={stations}
                        selectedIncident={
                            selectedIncident
                        }
                        routes={routes}
                        routePreview={
                            routePreview
                        }
                        liveTrucks={
                            liveTrucks
                        }
                        selectedLocation={
                            selectedLocation
                        }
                        onLocationSelect={
                            setSelectedLocation
                        }
                        onIncidentSelect={
                            handleIncidentSelect
                        }
                    />


                    <NearbyStations
                        incident={
                            selectedIncident
                        }
                        stations={
                            nearbyStations
                        }
                        loading={
                            loadingNearby
                        }
                    />


                    <DispatchPanel
                        incident={
                            selectedIncident
                        }
                        onDispatchChanged={
                            handleDispatchChanged
                        }
                        routePreview={
                            routePreview
                        }
                        onPreviewRoute={
                            handlePreviewRoute
                        }
                        liveTrucks={
                            liveTrucks
                        }
                        refreshKey={
                            dispatchRefreshKey
                        }
                    />

                </section>

            </main>

            )}

        </div>
    );
}


export default App;

