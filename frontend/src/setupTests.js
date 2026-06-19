// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }),
});

jest.mock("react-leaflet", () => {
  const React = require("react");

  return {
    MapContainer: ({ children, ...props }) => (
      <div data-testid="map-container" {...props}>
        {children}
      </div>
    ),
    TileLayer: () => <div data-testid="tile-layer" />,
    Marker: ({ children, ...props }) => (
      <div data-testid="map-marker" {...props}>
        {children}
      </div>
    ),
    Polyline: () => <div data-testid="map-polyline" />,
    useMap: () => ({
      fitBounds: jest.fn(),
      setView: jest.fn(),
    }),
    useMapEvents: jest.fn(),
  };
});

jest.mock("leaflet", () => ({
  divIcon: jest.fn((options) => options),
  latLngBounds: jest.fn(() => ({
    isValid: () => true,
  })),
}));
