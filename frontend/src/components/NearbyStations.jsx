export default function NearbyStations({
    incident,
    stations,
    loading
}) {

    if (!incident) {
        return (
            <div className="nearby-panel empty-panel">

                <div className="section-title">
                    NEAREST FIRE STATIONS
                </div>

                <p>
                    Select an incident from the map
                    or incident list to view nearby
                    fire stations.
                </p>

            </div>
        );
    }


    return (
        <div className="nearby-panel">

            <div className="section-title">
                NEAREST FIRE STATIONS
            </div>


            <div className="selected-incident">

                <div>
                    <strong>
                        {incident.incident_id}
                    </strong>

                    <span
                        className={`severity-badge ${incident.severity.toLowerCase()}`}
                    >
                        {incident.severity}
                    </span>
                </div>

                <div>
                    {incident.incident_type}
                </div>

            </div>


            {loading ? (

                <div className="loading">
                    Finding nearest stations...
                </div>

            ) : stations.length === 0 ? (

                <div className="empty-message">
                    No nearby stations found.
                </div>

            ) : (

                <div className="station-results">

                    {stations.map(
                        (station, index) => (

                            <div
                                className="station-result"
                                key={
                                    station.station_id
                                }
                            >

                                <div className="station-rank">
                                    {index + 1}
                                </div>


                                <div className="station-info">

                                    <strong>
                                        {
                                            station.fire_station_name
                                        }
                                    </strong>

                                    <span>
                                        {
                                            station.division_name
                                        }
                                    </span>

                                </div>


                                <div className="station-distance">

                                    <strong>
                                        {
                                            station.distance_km
                                        } km
                                    </strong>

                                    <span>
                                        Nearest
                                    </span>

                                </div>

                            </div>
                        )
                    )}

                </div>
            )}

        </div>
    );
}

