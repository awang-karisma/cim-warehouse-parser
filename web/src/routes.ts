import type { AuthContextValue } from '~/auth';
import { USER_ROLE } from '~/domain';
import type { Permission } from '~/permissions.generated';

export const ROUTES = {
  root: "/",
  dashboard: "/dashboard",
  orders: "/orders",
  orderDetailPattern: "/orders/:id",
  items: "/items",
  customers: "/customers",
  customerAliases: "/customer-aliases",
  areas: "/areas",
  deliveryFlow: "/delivery-flow",
  purchaseOrders: "/purchase-orders",
  barcode: "/barcode",
  sync: "/sync",
  search: "/search",
  settings: "/settings",
  users: "/admin/users",
  roles: "/admin/roles",
  privacy: "/privacy",
  terms: "/terms",
  datalogger: "/datalogger",
  dataloggerRecordsPattern: "/datalogger-records/:id",
} as const;

export const ROUTE_ACCESS = {
  [ROUTES.dashboard]: 'dashboard:read',
  [ROUTES.orders]: 'order:read',
  [ROUTES.orderDetailPattern]: 'order:read',
  [ROUTES.items]: 'item:read',
  [ROUTES.purchaseOrders]: 'purchase_order:read',
  [ROUTES.customers]: 'customer:read',
  [ROUTES.customerAliases]: 'alias:read',
  [ROUTES.areas]: 'area:read',
  [ROUTES.sync]: 'sync:read',
  [ROUTES.deliveryFlow]: 'delivery:read',
  [ROUTES.barcode]: 'barcode:print',
  [ROUTES.users]: 'user:read',
  [ROUTES.roles]: 'role:read',
  [ROUTES.dataloggerRecordsPattern]: 'logger_session:read',
  [ROUTES.datalogger]: ['logger_session:read', 'logger_session:create', 'logger_device:read'],
  [ROUTES.search]: ['order:read', 'item:read', 'customer:read'],
  [ROUTES.settings]: 'approved',
} as const satisfies Record<string, Permission | readonly Permission[] | 'approved'>;

export type WorkspaceRoute = keyof typeof ROUTE_ACCESS;

export const WORKSPACE_DESTINATIONS = [
  ROUTES.dashboard, ROUTES.orders, ROUTES.items, ROUTES.purchaseOrders, ROUTES.deliveryFlow,
  ROUTES.customers, ROUTES.customerAliases, ROUTES.areas, ROUTES.barcode, ROUTES.datalogger,
  ROUTES.search, ROUTES.sync, ROUTES.users, ROUTES.roles,
] as const satisfies readonly WorkspaceRoute[];

export function canAccessRoute(auth: AuthContextValue, route: WorkspaceRoute): boolean {
  const requirement = ROUTE_ACCESS[route];
  if (requirement === 'approved') {
    const user = auth.user();
    return !auth.failed() && !!user && user.role !== USER_ROLE.GUEST;
  }
  return typeof requirement === 'string' ? auth.can(requirement) : auth.canAny(...requirement);
}

export function orderDetailPath(id: string): string {
  return `${ROUTES.orders}/${id}`;
}

export function dataloggerRecordsPath(id: number | string): string {
  return `/datalogger-records/${id}`;
}
