/**
 * YALA ADMIN — SIDEBAR NAVIGATION CONFIGURATION
 *
 * Enterprise-grade sidebar structure for Yala Technologies Admin Application.
 *
 * Organization: 8 Business Departments
 * Brand: YALA TECHNOLOGIES
 * Slogan: FAST • SAFE • RELIABLE 🇲🇷
 */

// Brand constants
export const BRAND = {
  name: 'YALA TECHNOLOGIES',
  slogan: 'FAST • SAFE • RELIABLE 🇲🇷',
  color: '#00a651',
  colorDark: '#007a3d',
};

// Sidebar icon mapping
export const ICONS = {
  dashboard: 'layout',
  executive: 'briefcase',
  transportation: 'taxi',
  delivery: 'package',
  hr: 'users',
  finance: 'dollar-sign',
  security: 'shield',
  growth: 'trending-up',
  platform: 'settings',
  rides: 'map',
  drivers: 'user-check',
  riders: 'user-plus',
  vehicles: 'truck',
  couriers: 'users',
  merchants: 'store',
  employees: 'users',
  attendance: 'clock',
  verification: 'shield-check',
  breaks: 'bell',
  payouts: 'dollar-sign',
  refunds: 'credit-card',
  accounts: 'building',
  roles: 'key',
  audit: 'file-text',
  fraud: 'alert-circle',
  compliance: 'file-check',
  analytics: 'bar-chart',
  reports: 'bar-chart-2',
  launch: 'rocket',
  status: 'activity',
  notifications: 'bell',
  settings: 'settings',
  api: 'activity',
  configuration: 'sliders',
  academy: 'book-open',
  support: 'life-buoy',
  hallOfFame: 'award',
  incentives: 'trophy',
  partners: 'link',
  loyalty: 'heart',
};

// Department configurations
export const DEPARTMENTS = {
  executive: {
    id: 'executive',
    label: 'Executive',
    icon: ICONS.executive,
    order: 1,
    routes: [
      { id: 'dashboard', label: 'Executive Dashboard', path: '/admin/executive' },
      { id: 'ceo-command', label: 'CEO Command Center', path: '/admin/ceo' },
      { id: 'reports', label: 'Executive Reports', path: '/admin/ceo-reports' },
      { id: 'performance', label: 'Business Performance', path: '/admin/ops-center' },
    ],
  },
  transportation: {
    id: 'transportation',
    label: 'Transportation',
    icon: ICONS.transportation,
    order: 2,
    routes: [
      { id: 'overview', label: 'Operations Overview', path: '/admin/rides' },
      { id: 'rides', label: 'Ride Management', path: '/admin/rides' },
      { id: 'drivers', label: 'Driver Management', path: '/admin/drivers' },
      { id: 'riders', label: 'Rider Management', path: '/admin/riders' },
      { id: 'vehicles', label: 'Vehicle Management', path: '/admin/vehicles' },
      { id: 'approvals', label: 'Driver Approvals', path: '/admin/approvals' },
      { id: 'fleet', label: 'Fleet Management', path: '/admin/fleet' },
    ],
  },
  delivery: {
    id: 'delivery',
    label: 'Delivery',
    icon: ICONS.delivery,
    order: 3,
    routes: [
      { id: 'dashboard', label: 'Delivery Dashboard', path: '/admin/delivery' },
      { id: 'orders', label: 'Delivery Orders', path: '/admin/delivery' },
      { id: 'couriers', label: 'Courier Management', path: '/admin/delivery/couriers' },
      { id: 'merchants', label: 'Delivery Merchants', path: '/admin/delivery/merchants' },
      { id: 'performance', label: 'Delivery Performance', path: '/admin/delivery' },
    ],
  },
  hr: {
    id: 'hr',
    label: 'Human Resources',
    icon: ICONS.hr,
    order: 4,
    routes: [
      { id: 'directory', label: 'Employee Directory', path: '/admin/employees' },
      { id: 'registration', label: 'Employee Registration', path: '/admin/employees' },
      { id: 'attendance', label: 'Attendance', path: '/admin/attendance' },
      { id: 'verification', label: 'Hourly Verification', path: '/admin/verification' },
      { id: 'breaks', label: 'Break Notifications', path: '/admin/break-notifications' },
      { id: 'leave', label: 'Leave & Absence', path: '/admin/hr' },
      { id: 'performance', label: 'Employee Performance', path: '/admin/hr' },
      { id: 'discipline', label: 'Discipline', path: '/admin/hr' },
      { id: 'training', label: 'Training', path: '/admin/academy' },
      { id: 'recognition', label: 'Recognition', path: '/admin/hall-of-fame' },
    ],
  },
  finance: {
    id: 'finance',
    label: 'Finance',
    icon: ICONS.finance,
    order: 5,
    routes: [
      { id: 'overview', label: 'Financial Overview', path: '/admin/ops-center/finance' },
      { id: 'payments', label: 'Payment Management', path: '/admin/payments' },
      { id: 'transactions', label: 'Transactions', path: '/admin/finance-ops' },
      { id: 'payouts', label: 'Driver & Courier Payouts', path: '/admin/withdrawals' },
      { id: 'refunds', label: 'Refund Management', path: '/admin/finance-ops' },
      { id: 'accounts', label: 'Settlement Accounts', path: '/admin/withdrawal-accounts' },
      { id: 'business-accounts', label: 'Business Accounts', path: '/admin/business-accounts' },
      { id: 'reports', label: 'Financial Reports', path: '/admin/bi' },
    ],
  },
  security: {
    id: 'security',
    label: 'Security & Compliance',
    icon: ICONS.security,
    order: 6,
    routes: [
      { id: 'dashboard', label: 'Security Dashboard', path: '/admin/security' },
      { id: 'roles', label: 'Roles & Permissions', path: '/admin/roles' },
      { id: 'audit', label: 'Audit Logs', path: '/admin/security' },
      { id: 'fraud', label: 'Fraud Monitoring', path: '/admin/security' },
      { id: 'verification', label: 'Identity Verification', path: '/admin/verification' },
      { id: 'compliance', label: 'Compliance Monitoring', path: '/admin/compliance-governance' },
    ],
  },
  growth: {
    id: 'growth',
    label: 'Growth & Analytics',
    icon: ICONS.growth,
    order: 7,
    routes: [
      { id: 'marketing', label: 'Marketing', path: '/admin/growth' },
      { id: 'promotions', label: 'Promotions', path: '/admin/incentive-engine' },
      { id: 'analytics', label: 'Business Analytics', path: '/admin/bi' },
      { id: 'reports', label: 'Operational Reports', path: '/admin/bi' },
      { id: 'revenue', label: 'Revenue Analytics', path: '/admin/bi' },
    ],
  },
  platform: {
    id: 'platform',
    label: 'Platform Administration',
    icon: ICONS.platform,
    order: 8,
    routes: [
      { id: 'launch', label: 'Launch Hub', path: '/admin/launch' },
      { id: 'status', label: 'System Health', path: '/admin/status' },
      { id: 'notifications', label: 'Notifications', path: '/admin/ops-center' },
      { id: 'settings', label: 'Settings', path: '/admin/ceo' },
      { id: 'api', label: 'API Gateway', path: '/admin/api-gateway' },
      { id: 'configuration', label: 'Platform Configuration', path: '/admin/multi-city' },
    ],
  },
};

// Complete sidebar configuration
export const SIDEBAR_CONFIG = Object.values(DEPARTMENTS).sort((a, b) => a.order - b.order);

// Route to department mapping
export const ROUTE_DEPARTMENT_MAP = {};
SIDEBAR_CONFIG.forEach((dept) => {
  dept.routes.forEach((route) => {
    ROUTE_DEPARTMENT_MAP[route.path] = dept.id;
  });
});

// Export helper functions
export function getSidebarConfig() {
  return {
    brand: BRAND,
    departments: SIDEBAR_CONFIG,
    routeMap: ROUTE_DEPARTMENT_MAP,
  };
}

export function getDepartment(deptId) {
  return DEPARTMENTS[deptId] || null;
}

export function getRouteInfo(path) {
  return ROUTE_DEPARTMENT_MAP[path] || null;
}