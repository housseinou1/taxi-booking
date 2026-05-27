import React from "react";
import {
  GoogleMap,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
const GOOGLE_MAP_LIBRARIES = ["places"];

const toLatLng = (point) => {
  if (!point) return null;

  if (Array.isArray(point)) {
    const lat = Number(point[0]);
    const lng = Number(point[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  const lat = Number(point.lat);
  const lng = Number(point.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

function FitBounds({ points }) {
  const map = React.useContext(GoogleMapContext);
  const validPoints = points.map(toLatLng).filter(Boolean);

  React.useEffect(() => {
    if (!map || validPoints.length === 0 || !window.google?.maps) return;

    if (validPoints.length === 1) {
      map.setCenter(validPoints[0]);
      map.setZoom(14);
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    validPoints.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, 54);
  }, [map, validPoints]);

  return null;
}

const GoogleMapContext = React.createContext(null);

function MapPolyline({ line }) {
  const map = React.useContext(GoogleMapContext);
  const path = React.useMemo(
    () => (line.path || []).map(toLatLng).filter(Boolean),
    [line.path]
  );
  const pathKey = path.map((point) => `${point.lat},${point.lng}`).join("|");

  React.useEffect(() => {
    if (!map || !window.google?.maps || path.length < 2) return undefined;

    const polyline = new window.google.maps.Polyline({
      path,
      strokeColor: line.color || "#111827",
      strokeOpacity: line.opacity ?? 0.78,
      strokeWeight: line.weight || 5,
      clickable: false,
      geodesic: true,
      map,
    });

    return () => {
      polyline.setMap(null);
    };
  }, [line.color, line.opacity, line.weight, map, path, pathKey]);

  return null;
}

export default function GoogleTripMap({
  center,
  zoom = 13,
  markers = [],
  polylines = [],
  fitPoints = [],
  style,
}) {
  const [map, setMap] = React.useState(null);
  const { isLoaded, loadError } = useJsApiLoader({
    id: "sakho-express-google-map",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAP_LIBRARIES,
  });

  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY.includes("your_")) {
    return (
      <div style={{ ...missingMapStyle, ...style }}>
        Google Maps key is not configured.
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ ...missingMapStyle, ...style }}>
        Google Maps could not load. Check key restrictions and enabled APIs.
      </div>
    );
  }

  if (!isLoaded) {
    return <div style={{ ...missingMapStyle, ...style }}>Loading Google Map...</div>;
  }

  const mapCenter = toLatLng(center) || { lat: 18.0735, lng: -15.9582 };

  return (
    <GoogleMapContext.Provider value={map}>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%", ...style }}
        center={mapCenter}
        zoom={zoom}
        onLoad={setMap}
        options={{
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          gestureHandling: "greedy",
        }}
      >
        <FitBounds points={fitPoints.length ? fitPoints : markers.map((marker) => marker.position)} />

        {polylines.map((line) => (
          <MapPolyline key={line.id} line={line} />
        ))}

        {markers.map((marker) => {
          const position = toLatLng(marker.position);
          if (!position) return null;

          const markerIcon =
            marker.type === "driver" && window.google?.maps
              ? {
                  path: window.google.maps.SymbolPath.CIRCLE,
                  fillColor: "#2563eb",
                  fillOpacity: 1,
                  strokeColor: "#ffffff",
                  strokeWeight: 4,
                  scale: 11,
                }
              : undefined;

          return (
            <Marker
              key={marker.id}
              position={position}
              title={marker.title}
              icon={markerIcon}
              zIndex={marker.type === "driver" ? 999 : undefined}
              label={
                marker.label
                  ? {
                      text: marker.label,
                      color: "#ffffff",
                      fontWeight: "900",
                    }
                  : undefined
              }
            />
          );
        })}
      </GoogleMap>
    </GoogleMapContext.Provider>
  );
}

const missingMapStyle = {
  width: "100%",
  height: "100%",
  minHeight: "220px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f8fafc",
  color: "#475467",
  fontWeight: 900,
  textAlign: "center",
  padding: "18px",
  boxSizing: "border-box",
};
