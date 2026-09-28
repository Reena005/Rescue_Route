import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    CircleMarker,
    Polyline,
    useMap,
    useMapEvents
} from "react-leaflet";

import { useEffect } from "react";

import L from "leaflet";

import "leaflet/dist/leaflet.css";


// Fix default Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
    iconRetinaUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",

    iconUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",

    shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png"
});


// Chennai center
const CHENNAI_CENTER = [13.0827, 80.2707];


// Module 4: only trucks out on a job are drawn live
const DEPLOYED_STATUSES = ["DISPATCHED", "EN_ROUTE", "ON_SCENE"];

// One icon per truck status, created once
const TRUCK_ICONS = Object.fromEntries(
    DEPLOYED_STATUSES.map((status) => [
        status,
        L.divIcon({
            className: "truck-marker-wrapper",
            html:
                `<div class="truck-marker ${status.toLowerCase()}">` +
                "&#128658;</div>",
            iconSize: [30, 30],
            iconAnchor: [15, 15],
            popupAnchor: [0, -14]
        })
    ])
);


// Component for selecting an incident location
function LocationSelector({ onLocationSelect }) {
    useMapEvents({
        click(event) {
            onLocationSelect({
                latitude: event.latlng.lat.toFixed(6),
                longitude: event.latlng.lng.toFixed(6)
            });
        }
    });

    return null;
}


// Module 3: route line colour by dispatch status
const ROUTE_COLORS = {
    DISPATCHED: "#276ef1",
    EN_ROUTE: "#276ef1",
    ON_SCENE: "#19733e"
};


// Zoom the map to fit the routes whenever they change
function FitToRoutes({ paths }) {
    const map = useMap();

    const key = paths
        .map((path) => path.length)
        .join(",");

    useEffect(() => {
        const points = paths.flat();

        if (points.length > 1) {
            map.fitBounds(points, {
                padding: [40, 40],
                maxZoom: 15
            });
        }
        // Refit only when the set of routes changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, map]);

    return null;
}


function getSeverityClass(severity) {
    switch (severity) {
        case "CRITICAL":
            return "critical";

        case "HIGH":
            return "high";

        case "MEDIUM":
            return "medium";

        case "LOW":
            return "low";

        default:
            return "normal";
    }
}


export default function MapView({
    incidents,
    stations,
    selectedIncident,
    routes = [],
    routePreview,
    liveTrucks,
    selectedLocation,
    onLocationSelect,
    onIncidentSelect
}) {

    const routePaths = [
        ...routes.map((route) => route.path),
        ...(routePreview ? [routePreview.path] : [])
    ].filter((path) => path.length > 1);


    return (
        <div className="map-wrapper">

            <MapContainer
                center={CHENNAI_CENTER}
                zoom={11}
                scrollWheelZoom={true}
                className="main-map"
            >

                <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />


                <LocationSelector
                    onLocationSelect={onLocationSelect}
                />


                {/* Fire stations */}
                {stations.map((station) => {

                    if (
                        station.latitude === null ||
                        station.longitude === null
                    ) {
                        return null;
                    }

                    return (
                        <Marker
                            key={station.station_id}
                            position={[
                                Number(station.latitude),
                                Number(station.longitude)
                            ]}
                        >
                            <Popup>

                                <div className="popup">

                                    <h3>
                                        {station.fire_station_name}
                                    </h3>

                                    <p>
                                        <strong>
                                            Station ID:
                                        </strong>{" "}
                                        {station.station_id}
                                    </p>

                                    <p>
                                        {station.division_name}
                                    </p>

                                    <p>
                                        {station.fire_station_phone_number}
                                    </p>

                                    <p>
                                        <strong>
                                            Trucks ready:
                                        </strong>{" "}
                                        {station.available_trucks ?? 0}
                                        {" / "}
                                        {station.total_trucks ?? 0}
                                    </p>

                                </div>

                            </Popup>
                        </Marker>
                    );
                })}


                {/* Incidents */}
                {incidents.map((incident) => {

                    if (
                        incident.latitude === null ||
                        incident.longitude === null
                    ) {
                        return null;
                    }

                    return (
                        <CircleMarker
                            key={incident.incident_id}
                            center={[
                                Number(incident.latitude),
                                Number(incident.longitude)
                            ]}
                            radius={
                                selectedIncident?.incident_id ===
                                incident.incident_id
                                    ? 13
                                    : 9
                            }
                            className={`incident-marker ${getSeverityClass(
                                incident.severity
                            )}`}
                            eventHandlers={{
                                click: () =>
                                    onIncidentSelect(incident)
                            }}
                        >
                            <Popup>

                                <div className="popup">

                                    <h3>
                                        {incident.incident_id}
                                    </h3>

                                    <p>
                                        <strong>
                                            Type:
                                        </strong>{" "}
                                        {incident.incident_type}
                                    </p>

                                    <p>
                                        <strong>
                                            Severity:
                                        </strong>{" "}
                                        {incident.severity}
                                    </p>

                                    <p>
                                        <strong>
                                            Status:
                                        </strong>{" "}
                                        {incident.status}
                                    </p>

                                    <p>
                                        {incident.description}
                                    </p>

                                </div>

                            </Popup>
                        </CircleMarker>
                    );
                })}


                {/* Module 3: routes of assigned trucks */}
                {routes
                    .filter((route) => route.path.length > 1)
                    .map((route) => (
                        <Polyline
                            key={route.dispatch_id}
                            positions={route.path}
                            pathOptions={{
                                color:
                                    ROUTE_COLORS[route.status] ||
                                    "#276ef1",
                                weight: 5,
                                opacity: 0.8,
                                dashArray:
                                    route.route_source === "ESTIMATE"
                                        ? "4 8"
                                        : null
                            }}
                        >
                            <Popup>

                                <div className="popup">

                                    <h3>
                                        {route.truck_id}
                                    </h3>

                                    <p>
                                        {route.truck_type} from{" "}
                                        {route.fire_station_name}
                                    </p>

                                    <p>
                                        <strong>
                                            Road distance:
                                        </strong>{" "}
                                        {route.road_distance_km} km
                                    </p>

                                    <p>
                                        <strong>
                                            ETA:
                                        </strong>{" "}
                                        {route.eta_minutes} min
                                        {route.route_source === "ESTIMATE" &&
                                            " (estimate)"}
                                    </p>

                                </div>

                            </Popup>
                        </Polyline>
                    ))}


                {/* Module 3: previewed route for a recommended truck */}
                {routePreview && routePreview.path.length > 1 && (
                    <Polyline
                        positions={routePreview.path}
                        pathOptions={{
                            color: "#f79009",
                            weight: 5,
                            opacity: 0.9,
                            dashArray: "10 8"
                        }}
                    />
                )}


                <FitToRoutes paths={routePaths} />


                {/* Module 4: live positions of deployed trucks */}
                {[...(liveTrucks?.values() || [])]
                    .filter((truck) =>
                        DEPLOYED_STATUSES.includes(truck.status)
                    )
                    .map((truck) => (
                        <Marker
                            key={truck.truck_id}
                            position={[
                                Number(truck.latitude),
                                Number(truck.longitude)
                            ]}
                            icon={TRUCK_ICONS[truck.status]}
                            zIndexOffset={1000}
                        >
                            <Popup>

                                <div className="popup">

                                    <h3>
                                        {truck.truck_id}
                                    </h3>

                                    <p>
                                        <strong>
                                            Status:
                                        </strong>{" "}
                                        {truck.status.replace("_", " ")}
                                    </p>

                                    {truck.incident_id && (
                                        <p>
                                            <strong>
                                                Incident:
                                            </strong>{" "}
                                            {truck.incident_id}
                                        </p>
                                    )}

                                    {truck.speed_kmh > 0 && (
                                        <p>
                                            <strong>
                                                Speed:
                                            </strong>{" "}
                                            {truck.speed_kmh} km/h
                                        </p>
                                    )}

                                    {truck.remaining_km > 0 && (
                                        <p>
                                            <strong>
                                                Remaining:
                                            </strong>{" "}
                                            {truck.remaining_km} km
                                            {truck.remaining_eta_min !== null &&
                                                ` (~${truck.remaining_eta_min} min)`}
                                        </p>
                                    )}

                                    <p>
                                        Source: {truck.source}
                                    </p>

                                </div>

                            </Popup>
                        </Marker>
                    ))}


                {/* New incident location */}
                {selectedLocation && (
                    <Marker
                        position={[
                            Number(selectedLocation.latitude),
                            Number(selectedLocation.longitude)
                        ]}
                    >
                        <Popup>
                            <strong>
                                New incident location
                            </strong>

                            <br />

                            {selectedLocation.latitude},{" "}
                            {selectedLocation.longitude}
                        </Popup>
                    </Marker>
                )}

            </MapContainer>


            <div className="map-legend">

                <div>
                    <span className="legend-dot station-dot"></span>
                    Fire Station
                </div>

                <div>
                    <span className="legend-dot incident-dot"></span>
                    Fire Incident
                </div>

                <div>
                    <span className="legend-dot selected-dot"></span>
                    Selected Location
                </div>

                <div>
                    <span className="legend-line route-line"></span>
                    Truck Route
                </div>

                <div>
                    <span className="legend-line preview-line"></span>
                    Route Preview
                </div>

                <div>
                    <span className="legend-truck">&#128658;</span>
                    Live Truck
                </div>

            </div>

        </div>
    );
}

