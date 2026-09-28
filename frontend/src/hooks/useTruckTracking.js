import { useEffect, useState } from "react";

import {
    getTrackedTrucks,
    openTrackingStream
} from "../services/api";


// Module 4: live positions of deployed trucks.
// Returns:
//   liveTrucks    Map truck_id -> latest position
//   connected     whether the live stream is open
//   dispatchEvent latest dispatch change pushed by the server
export default function useTruckTracking() {

    const [liveTrucks, setLiveTrucks] =
        useState(() => new Map());

    const [connected, setConnected] =
        useState(false);

    const [dispatchEvent, setDispatchEvent] =
        useState(null);


    useEffect(() => {

        let closed = false;

        const upsert = (truck) => {
            setLiveTrucks((current) => {
                const next = new Map(current);

                next.set(truck.truck_id, {
                    ...current.get(truck.truck_id),
                    ...truck
                });

                return next;
            });
        };


        getTrackedTrucks()
            .then((data) => {
                if (!closed) {
                    data.trucks.forEach(upsert);
                }
            })
            .catch((err) => console.error(err));


        const stream = openTrackingStream();

        stream.addEventListener("ready", () => {
            setConnected(true);
        });

        stream.addEventListener("location", (event) => {
            upsert(JSON.parse(event.data).truck);
        });

        stream.addEventListener("dispatch", (event) => {
            setDispatchEvent({
                ...JSON.parse(event.data),
                received_at: Date.now()
            });
        });

        // EventSource reconnects on its own after errors
        stream.onerror = () => {
            setConnected(false);
        };


        return () => {
            closed = true;
            stream.close();
        };

    }, []);


    return {
        liveTrucks,
        connected,
        dispatchEvent
    };
}
