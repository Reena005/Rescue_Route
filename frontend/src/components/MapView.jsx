import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    CircleMarker,
    useMapEvents
} from "react-leaflet";

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
    selectedLocation,
    onLocationSelect,
    onIncidentSelect
}) {
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

            </div>

        </div>
    );
}

