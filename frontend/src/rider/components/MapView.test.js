import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import MapView from "./MapView";

// Mock react-leaflet components to avoid DOM rendering issues in Jest/JSDOM
jest.mock("react-leaflet", () => {
  const ReactModule = require("react");
  return {
    MapContainer: ({ children, center, zoom, style }) => (
      <div
        data-testid="mock-map-container"
        data-center={JSON.stringify(center)}
        data-zoom={zoom}
        style={style}
      >
        {children}
      </div>
    ),
    TileLayer: ({ url }) => <div data-testid="mock-tile-layer" data-url={url} />,
    Marker: ReactModule.forwardRef(({ position, title, children }, ref) => (
      <div
        data-testid="mock-marker"
        data-position={JSON.stringify(position)}
        data-title={title}
        ref={ref}
      >
        {children}
      </div>
    )),
    Polyline: ({ positions, pathOptions }) => (
      <div
        data-testid="mock-polyline"
        data-positions={JSON.stringify(positions)}
        data-color={pathOptions?.color}
      />
    ),
    useMap: () => ({
      fitBounds: jest.fn(),
    }),
    useMapEvents: (handlers) => {
      return null;
    },
  };
});

jest.mock("leaflet", () => ({
  divIcon: ({ className, html, iconSize, iconAnchor }) => ({
    className,
    html,
    iconSize,
    iconAnchor,
  }),
  latLngBounds: (positions) => ({
    isValid: () => positions && positions.length >= 2,
  }),
}));

describe("MapView", () => {
  const defaultCenter = [18.0735, -15.9582];

  it("renders the map container with correct center and zoom", () => {
    render(<MapView center={defaultCenter} zoom={14} />);

    const container = screen.getByTestId("mapview-container");
    expect(container).toBeInTheDocument();

    const mapContainer = screen.getByTestId("mock-map-container");
    expect(mapContainer).toHaveAttribute(
      "data-center",
      JSON.stringify(defaultCenter)
    );
    expect(mapContainer).toHaveAttribute("data-zoom", "14");
  });

  it("renders with default zoom of 13 when not specified", () => {
    render(<MapView center={defaultCenter} />);

    const mapContainer = screen.getByTestId("mock-map-container");
    expect(mapContainer).toHaveAttribute("data-zoom", "13");
  });

  it("renders OpenStreetMap tile layer", () => {
    render(<MapView center={defaultCenter} />);

    const tileLayer = screen.getByTestId("mock-tile-layer");
    expect(tileLayer).toHaveAttribute(
      "data-url",
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    );
  });

  it("renders markers with correct positions", () => {
    const markers = [
      { id: "pickup-1", position: [18.0735, -15.9582], type: "pickup", label: "Pickup" },
      { id: "dest-1", position: [18.0896, -15.9754], type: "destination", label: "Drop" },
    ];

    render(<MapView center={defaultCenter} markers={markers} />);

    const renderedMarkers = screen.getAllByTestId("mock-marker");
    expect(renderedMarkers).toHaveLength(2);
    expect(renderedMarkers[0]).toHaveAttribute(
      "data-position",
      JSON.stringify([18.0735, -15.9582])
    );
    expect(renderedMarkers[1]).toHaveAttribute(
      "data-position",
      JSON.stringify([18.0896, -15.9754])
    );
  });

  it("renders markers for all types: pickup, destination, stop, driver", () => {
    const markers = [
      { id: "p1", position: [18.0, -15.9], type: "pickup" },
      { id: "d1", position: [18.1, -15.8], type: "destination" },
      { id: "s1", position: [18.05, -15.85], type: "stop" },
      { id: "dr1", position: [18.02, -15.91], type: "driver", animate: false },
    ];

    render(<MapView center={defaultCenter} markers={markers} />);

    const renderedMarkers = screen.getAllByTestId("mock-marker");
    expect(renderedMarkers).toHaveLength(4);
  });

  it("renders route polyline when routePath has 2+ coordinates", () => {
    const routePath = [
      [18.0735, -15.9582],
      [18.08, -15.97],
      [18.0896, -15.9754],
    ];

    render(<MapView center={defaultCenter} routePath={routePath} />);

    const polyline = screen.getByTestId("mock-polyline");
    expect(polyline).toBeInTheDocument();
    expect(polyline).toHaveAttribute(
      "data-positions",
      JSON.stringify(routePath)
    );
    expect(polyline).toHaveAttribute("data-color", "#00A651");
  });

  it("does not render polyline when routePath has fewer than 2 points", () => {
    render(<MapView center={defaultCenter} routePath={[[18.0, -15.9]]} />);

    const polyline = screen.queryByTestId("mock-polyline");
    expect(polyline).not.toBeInTheDocument();
  });

  it("does not render polyline when routePath is empty", () => {
    render(<MapView center={defaultCenter} routePath={[]} />);

    const polyline = screen.queryByTestId("mock-polyline");
    expect(polyline).not.toBeInTheDocument();
  });

  it("renders no markers when markers prop is empty", () => {
    render(<MapView center={defaultCenter} markers={[]} />);

    const renderedMarkers = screen.queryAllByTestId("mock-marker");
    expect(renderedMarkers).toHaveLength(0);
  });

  it("renders animated driver marker separately", () => {
    const markers = [
      { id: "p1", position: [18.0, -15.9], type: "pickup" },
      { id: "dr1", position: [18.02, -15.91], type: "driver", animate: true },
    ];

    render(<MapView center={defaultCenter} markers={markers} />);

    // Both markers should render (one static, one animated)
    const renderedMarkers = screen.getAllByTestId("mock-marker");
    expect(renderedMarkers).toHaveLength(2);
  });

  it("applies full-screen container class", () => {
    render(<MapView center={defaultCenter} />);

    const container = screen.getByTestId("mapview-container");
    expect(container).toHaveClass("mapview-container");
  });
});
