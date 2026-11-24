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
  timeline: "/timeline",
  barcode: "/barcode",
  sync: "/sync",
  search: "/search",
  settings: "/settings",
  users: "/admin/users",
  privacy: "/privacy",
  terms: "/terms",
  datalogger: "/datalogger",
  dataloggerRecordsPattern: "/datalogger-records/:id",
} as const;

export function orderDetailPath(id: string): string {
  return `${ROUTES.orders}/${id}`;
}

export function dataloggerRecordsPath(id: number | string): string {
  return `/datalogger-records/${id}`;
}
