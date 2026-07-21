import { subscribeRideUpdates } from "../../socket";

let opsListeners = new Set();

export function subscribeOperationsUpdates(onMessage) {
  opsListeners.add(onMessage);
  const unsubscribe = subscribeRideUpdates((data) => {
    opsListeners.forEach((fn) => {
      try {
        fn(data);
      } catch (error) {
        /* listener error */
      }
    });
  });
  return () => {
    opsListeners.delete(onMessage);
    unsubscribe();
  };
}
