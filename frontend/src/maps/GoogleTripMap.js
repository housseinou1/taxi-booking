import React from "react";
import {
  GoogleMap,
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

const professionalMapStyles = [
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }, { weight: 1.4 }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#f8fafc" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#e2e8f0" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#bfdbfe" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#f1f5f9" }],
  },
  {
    featureType: "administrative",
    elementType: "labels.text.fill",
    stylers: [{ color: "#475569" }],
  },
];

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
      icons: line.animated
        ? [
            {
              icon: {
                path: "M 0,-1 0,1",
                strokeOpacity: 1,
                strokeWeight: line.weight || 5,
                scale: 3,
              },
              offset: "0",
              repeat: "18px",
            },
          ]
        : undefined,
      map,
    });

    let animationFrame = null;

    if (line.animated) {
      let count = 0;
      const animate = () => {
        count = (count + 1) % 200;
        const icons = polyline.get("icons");
        if (icons?.[0]) {
          icons[0].offset = `${count / 2}%`;
          polyline.set("icons", icons);
        }
        animationFrame = window.requestAnimationFrame(animate);
      };

      animationFrame = window.requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      polyline.setMap(null);
    };
  }, [line.animated, line.color, line.opacity, line.weight, map, path, pathKey]);

  return null;
}

function SmoothMarker({ marker }) {
  const map = React.useContext(GoogleMapContext);
  const markerRef = React.useRef(null);
  const animationRef = React.useRef(null);
  const position = toLatLng(marker.position);
  const positionKey = position ? `${position.lat},${position.lng}` : "";
  const latestPositionRef = React.useRef(position);
  const latestTitleRef = React.useRef(marker.title);
  const latestLabelRef = React.useRef(marker.label);
  const markerType =
    marker.type ||
    (String(marker.id || "").toLowerCase().includes("drop") ||
    String(marker.id || "").toLowerCase().includes("destination")
      ? "destination"
      : "pickup");

  latestPositionRef.current = position;
  latestTitleRef.current = marker.title;
  latestLabelRef.current = marker.label;

  React.useEffect(() => {
    const initialPosition = latestPositionRef.current;
    const initialTitle = latestTitleRef.current;
    const initialLabel = latestLabelRef.current;

    if (!map || !window.google?.maps || !initialPosition) return undefined;

    const icon =
      markerType === "driver"
        ? {
            path:
              "M38 20.5 35.8 13.8C35.1 11.5 33 10 30.6 10H9.4C7 10 4.9 11.5 4.2 13.8L2 20.5V31h5v-4h26v4h5V20.5ZM10.2 14h19.6c.7 0 1.3.4 1.5 1.1l1.3 3.9H7.4l1.3-3.9c.2-.7.8-1.1 1.5-1.1ZM10 24.5A2.5 2.5 0 1 1 10 19.5a2.5 2.5 0 0 1 0 5Zm20 0a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z",
            fillColor: "#111827",
            fillOpacity: 1,
            strokeColor: "#facc15",
            strokeWeight: 2.5,
            scale: 0.92,
            anchor: new window.google.maps.Point(20, 20),
          }
        : {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: markerType === "destination" ? "#dc2626" : "#16a34a",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 4,
            scale: 10,
          };

    markerRef.current = new window.google.maps.Marker({
      map,
      position: initialPosition,
      title: initialTitle,
      zIndex: markerType === "driver" ? 999 : undefined,
      icon,
      label:
        initialLabel && markerType !== "driver"
          ? {
              text: initialLabel,
              color: "#ffffff",
              fontWeight: "900",
            }
          : undefined,
    });

    return () => {
      markerRef.current?.setMap(null);
      markerRef.current = null;
    };
  }, [map, marker.id, markerType]);

  React.useEffect(() => {
    const nextPosition = latestPositionRef.current;

    if (!markerRef.current || !nextPosition) return;

    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
    }

    const current = markerRef.current.getPosition();
    const start = current
      ? { lat: current.lat(), lng: current.lng() }
      : nextPosition;
    const startTime = performance.now();
    const duration = markerType === "driver" ? 900 : 220;

    const step = (timestamp) => {
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = {
        lat: start.lat + (nextPosition.lat - start.lat) * eased,
        lng: start.lng + (nextPosition.lng - start.lng) * eased,
      };

      markerRef.current?.setPosition(next);

      if (progress < 1) {
        animationRef.current = window.requestAnimationFrame(step);
      }
    };

    animationRef.current = window.requestAnimationFrame(step);

    return () => {
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
      }
    };
  }, [markerType, positionKey]);

  React.useEffect(() => {
    if (!markerRef.current) return;
    markerRef.current.setTitle(marker.title || "");
  }, [marker.title]);

  React.useEffect(() => {
    if (!markerRef.current || markerType === "driver") return;
    markerRef.current.setLabel(
      marker.label
        ? {
            text: marker.label,
            color: "#ffffff",
            fontWeight: "900",
          }
        : null
    );
  }, [marker.label, markerType]);

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
          rotateControl: false,
          scaleControl: false,
          streetViewControl: false,
          gestureHandling: "greedy",
          styles: professionalMapStyles,
          backgroundColor: "#f1f5f9",
        }}
      >
        <FitBounds points={fitPoints.length ? fitPoints : markers.map((marker) => marker.position)} />

        {polylines.map((line) => (
          <MapPolyline key={line.id} line={line} />
        ))}

        {markers.map((marker) => (
          <SmoothMarker key={marker.id} marker={marker} />
        ))}
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
