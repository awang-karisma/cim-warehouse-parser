import type { Permission } from '~/permissions.generated';
import { ROUTES, ROUTE_ACCESS, WORKSPACE_DESTINATIONS, type WorkspaceRoute } from '~/routes';

export type RoleSurfaceKey =
  | 'dashboard'
  | 'orders'
  | 'delivery'
  | 'customers'
  | 'barcode'
  | 'datalogger'
  | 'system'
  | 'access'
  | 'other';

export interface RoleSurfaceDefinition {
  key: RoleSurfaceKey;
  routes: readonly WorkspaceRoute[];
  resources: readonly string[];
}

export const ROLE_SURFACES: readonly RoleSurfaceDefinition[] = [
  { key: 'dashboard', routes: [ROUTES.dashboard], resources: ['dashboard'] },
  { key: 'orders', routes: [ROUTES.orders, ROUTES.items, ROUTES.purchaseOrders], resources: ['order', 'item', 'purchase_order', 'timeline'] },
  { key: 'delivery', routes: [ROUTES.deliveryFlow], resources: ['delivery', 'driver'] },
  { key: 'customers', routes: [ROUTES.customers, ROUTES.customerAliases, ROUTES.areas], resources: ['customer', 'alias', 'area'] },
  { key: 'barcode', routes: [ROUTES.barcode], resources: ['barcode', 'design', 'preset', 'accurate'] },
  { key: 'datalogger', routes: [ROUTES.datalogger], resources: ['logger_session', 'logger_profile', 'logger_device'] },
  { key: 'system', routes: [ROUTES.sync, ROUTES.settings], resources: ['sync', 'system', 'workday', 'database'] },
  { key: 'access', routes: [ROUTES.users, ROUTES.roles], resources: ['user', 'role'] },
];

export const PERMISSION_PREREQUISITES: Readonly<Partial<Record<Permission, readonly Permission[]>>> = {
  'item:export': ['item:read'],
  'alias:export': ['alias:read'],
  'logger_device:write': ['logger_device:read'],
};

export const SENSITIVE_PERMISSIONS: Readonly<Partial<Record<Permission, true>>> = {
  'database:clear': true,
  'alias:import': true,
  'accurate:update': true,
  'accurate:delete': true,
  'logger_device:write': true,
  'role:create': true,
  'role:update': true,
  'role:delete': true,
  'user:update': true,
  'user:delete': true,
  'delivery:delete': true,
};

export const ROUTE_LABEL_KEYS = {
  [ROUTES.dashboard]: 'nav.dashboard',
  [ROUTES.orders]: 'nav.orders',
  [ROUTES.orderDetailPattern]: 'routes.orderDetails',
  [ROUTES.items]: 'nav.items',
  [ROUTES.purchaseOrders]: 'nav.purchaseOrders',
  [ROUTES.customers]: 'nav.customerView',
  [ROUTES.customerAliases]: 'nav.customerAliases',
  [ROUTES.areas]: 'nav.areaMap',
  [ROUTES.deliveryFlow]: 'nav.deliveryFlow',
  [ROUTES.barcode]: 'nav.barcodePrinter',
  [ROUTES.datalogger]: 'nav.datalogger',
  [ROUTES.dataloggerRecordsPattern]: 'nav.dataloggerReadings',
  [ROUTES.search]: 'nav.search',
  [ROUTES.sync]: 'nav.syncManager',
  [ROUTES.settings]: 'nav.settings',
  [ROUTES.users]: 'nav.userManagement',
  [ROUTES.roles]: 'nav.roleManagement',
} as const satisfies Record<WorkspaceRoute, string>;

export interface SurfaceGrantItem {
  resource: string;
  action: string;
  key: Permission;
}

export interface ResolvedRoleSurface {
  key: RoleSurfaceKey;
  routes: readonly WorkspaceRoute[];
  items: readonly SurfaceGrantItem[];
}

export interface MissingDependency {
  grant: Permission;
  missing: readonly Permission[];
}

export function isSensitivePermission(grant: Permission): boolean {
  return SENSITIVE_PERMISSIONS[grant] === true;
}

export function isReadLikeAction(action: string): boolean {
  return action === 'read';
}

export function routeUnlockedBy(
  route: WorkspaceRoute,
  hasGrant: (grant: Permission) => boolean,
  isGuest: boolean,
): boolean {
  if (isGuest) return false;
  const req = ROUTE_ACCESS[route];
  if (req === 'approved') return true;
  if (typeof req === 'string') return hasGrant(req);
  return req.some((perm) => hasGrant(perm));
}

export function countUnlockedWorkspaceRoutes(
  hasGrant: (grant: Permission) => boolean,
  isGuest: boolean,
): number {
  let count = 0;
  for (const route of WORKSPACE_DESTINATIONS) {
    if (routeUnlockedBy(route, hasGrant, isGuest)) count++;
  }
  return count;
}

export function resolveRoleSurfaces(catalog: readonly Permission[]): readonly ResolvedRoleSurface[] {
  const byResource = new Map<string, SurfaceGrantItem[]>();
  for (const key of catalog) {
    const split = key.indexOf(':');
    if (split < 0) continue;
    const resource = key.slice(0, split);
    const action = key.slice(split + 1);
    const list = byResource.get(resource);
    const item: SurfaceGrantItem = { resource, action, key };
    if (list) list.push(item);
    else byResource.set(resource, [item]);
  }

  const assigned = new Set<string>();
  const surfaces: ResolvedRoleSurface[] = [];

  for (const def of ROLE_SURFACES) {
    const items: SurfaceGrantItem[] = [];
    for (const res of def.resources) {
      assigned.add(res);
      const list = byResource.get(res);
      if (list) items.push(...list);
    }
    if (items.length > 0) {
      surfaces.push({ key: def.key, routes: def.routes, items });
    }
  }

  const extraItems: SurfaceGrantItem[] = [];
  for (const [resource, list] of byResource.entries()) {
    if (!assigned.has(resource)) extraItems.push(...list);
  }
  if (extraItems.length > 0) {
    surfaces.push({ key: 'other', routes: [], items: extraItems });
  }

  return surfaces;
}

export function findMissingDependencies(
  catalog: readonly Permission[],
  hasGrant: (grant: Permission) => boolean,
): readonly MissingDependency[] {
  const registered = new Set(catalog);
  const issues: MissingDependency[] = [];
  for (const grant of catalog) {
    if (!hasGrant(grant)) continue;
    const prereqs = PERMISSION_PREREQUISITES[grant];
    if (!prereqs) continue;
    const missing = prereqs.filter((req) => registered.has(req) && !hasGrant(req));
    if (missing.length > 0) issues.push({ grant, missing });
  }
  return issues;
}
