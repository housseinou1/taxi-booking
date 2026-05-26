const browserHost =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "127.0.0.1";

const browserProtocol =
  typeof window !== "undefined" && window.location.protocol === "https:"
    ? "https"
    : "http";

export const API_URL =
  process.env.REACT_APP_API_URL || `${browserProtocol}://${browserHost}:8000`;

export const WS_URL =
  process.env.REACT_APP_WS_URL ||
  `${browserProtocol === "https" ? "wss" : "ws"}://${browserHost}:8000/ws/rides/`;
