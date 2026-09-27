import { useState } from "react";


export default function IncidentForm({
    selectedLocation,
    onIncidentCreated
}) {

    const [incidentType, setIncidentType] =
        useState("Building Fire");

    const [severity, setSeverity] =
        useState("HIGH");

    const [description, setDescription] =
        useState("");

    const [latitude, setLatitude] =
        useState("");

    const [longitude, setLongitude] =
        useState("");

    const [loading, setLoading] =
        useState(false);

    const [error, setError] =
        useState("");


    const handleLocationUpdate = () => {

        if (!selectedLocation) {
            return;
        }

        setLatitude(selectedLocation.latitude);
        setLongitude(selectedLocation.longitude);
    };


    const handleSubmit = async (event) => {

        event.preventDefault();

        setError("");

        if (!latitude || !longitude) {
            setError(
                "Select an incident location on the map."
            );

            return;
        }


        setLoading(true);


        try {

            const incidentData = {

                incident_id:
                    `INC${Date.now().toString().slice(-6)}`,

                incident_type: incidentType,

                severity,

                description:
                    description ||
                    `${incidentType} reported`,

                latitude: Number(latitude),

                longitude: Number(longitude),

                reported_at:
                    new Date().toISOString()
            };


            const response = await fetch(
                "http://localhost:4000/api/incidents",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            incidentData
                        )
                }
            );


            const data =
                await response.json();


            if (!response.ok) {
                throw new Error(
                    data.message ||
                    "Failed to create incident"
                );
            }


            onIncidentCreated(
                data.incident
            );


            setDescription("");

        } catch (err) {

            setError(err.message);

        } finally {

            setLoading(false);
        }
    };


    return (
        <div className="incident-form">

            <div className="section-title">
                REPORT EMERGENCY
            </div>

            <form onSubmit={handleSubmit}>

                <label>
                    Incident Type
                </label>

                <select
                    value={incidentType}
                    onChange={(e) =>
                        setIncidentType(
                            e.target.value
                        )
                    }
                >
                    <option>
                        Building Fire
                    </option>

                    <option>
                        Residential Fire
                    </option>

                    <option>
                        Commercial Fire
                    </option>

                    <option>
                        Industrial Fire
                    </option>

                    <option>
                        Vehicle Fire
                    </option>

                    <option>
                        Electrical Fire
                    </option>
                </select>


                <label>
                    Severity
                </label>

                <select
                    value={severity}
                    onChange={(e) =>
                        setSeverity(
                            e.target.value
                        )
                    }
                >
                    <option value="LOW">
                        LOW
                    </option>

                    <option value="MEDIUM">
                        MEDIUM
                    </option>

                    <option value="HIGH">
                        HIGH
                    </option>

                    <option value="CRITICAL">
                        CRITICAL
                    </option>
                </select>


                <label>
                    Description
                </label>

                <textarea
                    value={description}
                    onChange={(e) =>
                        setDescription(
                            e.target.value
                        )
                    }
                    placeholder="Describe the emergency..."
                    rows="3"
                />


                <div className="coordinate-header">

                    <label>
                        Incident Location
                    </label>

                    {selectedLocation && (
                        <button
                            type="button"
                            className="use-map-location"
                            onClick={
                                handleLocationUpdate
                            }
                        >
                            Use Map Location
                        </button>
                    )}

                </div>


                <div className="coordinate-grid">

                    <input
                        type="number"
                        step="any"
                        placeholder="Latitude"
                        value={latitude}
                        onChange={(e) =>
                            setLatitude(
                                e.target.value
                            )
                        }
                    />

                    <input
                        type="number"
                        step="any"
                        placeholder="Longitude"
                        value={longitude}
                        onChange={(e) =>
                            setLongitude(
                                e.target.value
                            )
                        }
                    />

                </div>


                {selectedLocation && (
                    <div className="map-location-info">

                        Map location selected

                        <br />

                        {selectedLocation.latitude},{" "}
                        {selectedLocation.longitude}

                    </div>
                )}


                {error && (
                    <div className="form-error">
                        {error}
                    </div>
                )}


                <button
                    type="submit"
                    className="report-button"
                    disabled={loading}
                >
                    {loading
                        ? "REPORTING..."
                        : "REPORT INCIDENT"}
                </button>

            </form>

        </div>
    );
}

