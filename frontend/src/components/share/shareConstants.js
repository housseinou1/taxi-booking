/**
 * Shared styling constants for Yala Share Ride components.
 * Dark theme with Uber-style design language.
 */

export const COLORS = {
  darkNavy: '#0B1220',
  primaryGreen: '#00A651',
  primaryGreenHover: '#008f45',
  goldAccent: '#D4AF37',
  white: '#FFFFFF',
  lightGray: 'rgba(255, 255, 255, 0.7)',
  mutedGray: 'rgba(255, 255, 255, 0.5)',
  errorRed: '#EF4444',
  cardBg: 'rgba(255, 255, 255, 0.06)',
  cardBorder: 'rgba(255, 255, 255, 0.1)',
  cardBorderActive: 'rgba(0, 166, 81, 0.6)',
  overlay: 'rgba(11, 18, 32, 0.92)',
  successGreen: '#10B981',
};

export const TRANSITIONS = {
  fast: 'all 200ms ease',
  normal: 'all 300ms ease',
  slow: 'all 400ms ease',
};

export const SHADOWS = {
  card: '0 2px 12px rgba(0, 0, 0, 0.3)',
  elevated: '0 8px 32px rgba(0, 0, 0, 0.4)',
  button: '0 4px 16px rgba(0, 166, 81, 0.3)',
};

export const FONTS = {
  heading: { fontSize: '20px', fontWeight: '700', letterSpacing: '-0.3px' },
  subheading: { fontSize: '16px', fontWeight: '600' },
  body: { fontSize: '14px', fontWeight: '400' },
  small: { fontSize: '12px', fontWeight: '400' },
  caption: { fontSize: '11px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px' },
};

export const SHARE_STATUSES = [
  'requested',
  'matching',
  'driver_assigned',
  'driver_arriving',
  'driver_arrived',
  'passenger_pickup',
  'additional_pickup',
  'in_progress',
  'drop_off_stop',
  'completed',
];

export const STATUS_LABELS = {
  requested: 'Requesting ride...',
  matching: 'Finding riders...',
  driver_assigned: 'Driver assigned',
  driver_arriving: 'Driver on the way',
  driver_arrived: 'Driver arrived',
  passenger_pickup: 'Picking you up',
  additional_pickup: 'Picking up another rider',
  in_progress: 'On the way',
  drop_off_stop: 'Dropping off a rider',
  completed: 'Ride completed',
};
