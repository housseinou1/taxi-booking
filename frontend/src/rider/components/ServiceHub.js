import React from 'react';
import './ServiceHub.css';

/**
 * ServiceHub component displaying quick-access tiles for Delivery, Intercity, and Schedule services.
 * Intercity and Schedule route into the shared /services workspace tabs.
 *
 * Props:
 * - onNavigate: (path: string) => void — called when a service tile is tapped
 */
function ServiceHub({ onNavigate }) {
  const services = [
    {
      key: 'delivery',
      label: 'Delivery',
      path: '/delivery',
      icon: (
        <svg
          className="service-hub__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="1" y="3" width="15" height="13" rx="2" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      ),
    },
    {
      key: 'intercity',
      label: 'Intercity',
      path: '/services?tab=intercity',
      icon: (
        <svg
          className="service-hub__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      ),
    },
    {
      key: 'schedule',
      label: 'Schedule',
      path: '/services?tab=scheduled',
      icon: (
        <svg
          className="service-hub__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <circle cx="12" cy="16" r="2" />
        </svg>
      ),
    },
  ];

  return (
    <nav className="service-hub" aria-label="Services">
      {services.map((service) => (
        <button
          key={service.key}
          className="service-hub__tile"
          onClick={() => onNavigate(service.path)}
          aria-label={service.label}
          type="button"
        >
          {service.icon}
          <span className="service-hub__label">{service.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default ServiceHub;
