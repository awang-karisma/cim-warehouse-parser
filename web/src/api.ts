import type {
  Stats,
  PaginatedOrders,
  Order,
  PaginatedItems,
  StatusResponse,
  SyncRecord,
  PaginatedSyncHistory,
  PaginatedCustomers,
  AreaSummary,
  SearchResult,
  ConfigResponse,
  SystemResponse,
  SyncEvent,
  CustomerAliasesResponse,
  PaginatedDeliveries,
  DeliveryStats,
  UsersResponse,
} from './types';

function qs(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  }
  return searchParams.toString();
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) {
    const errorText = await res.text();
    let message = errorText;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed?.error) message = parsed.error;
    } catch {}
    throw new Error(message || `HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const getStats = () => apiFetch<Stats>('/api/v1/stats');

export const getOrders = (params?: {
  customer?: string;
  date?: string;
  tanggal?: string;
  area?: string;
  status?: string;
  order_number?: string;
  ecatalog_number?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}) => {
  const query = qs(params);
  return apiFetch<PaginatedOrders>(`/api/v1/orders${query ? '?' + query : ''}`);
};

export const getOrderById = (id: string) => apiFetch<Order>(`/api/v1/orders/${encodeURIComponent(id)}`);

export const getItems = (params?: {
  customer?: string;
  nama_barang?: string;
  status_order?: string;
  status_barang?: string;
  status_barang_other?: boolean;
  date?: string;
  tanggal?: string;
  order_number?: string;
  ecatalog_number?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}) => {
  const query = qs(params);
  return apiFetch<PaginatedItems>(`/api/v1/items${query ? '?' + query : ''}`);
};

export const getStatus = () => apiFetch<StatusResponse>('/api/v1/status');

export const triggerSync = () =>
  apiFetch<{ status: string; message: string; record?: SyncRecord }>('/api/v1/sync', {
    method: 'POST',
  });

export const getSyncHistory = (params?: { limit?: number; offset?: number }) => {
  const query = qs(params);
  return apiFetch<PaginatedSyncHistory>(`/api/v1/sync/history${query ? '?' + query : ''}`);
};

export const getCustomers = (params?: { search?: string; area?: string; limit?: number; offset?: number }) => {
  const query = qs(params);
  return apiFetch<PaginatedCustomers>(`/api/v1/customers${query ? '?' + query : ''}`);
};

export const getAreas = () => apiFetch<{ total: number; areas: AreaSummary[] }>('/api/v1/areas');

export const search = (params: { q: string; type?: string; limit?: number }) => {
  const query = qs(params);
  return apiFetch<SearchResult>(`/api/v1/search${query ? '?' + query : ''}`);
};

export const getConfig = () => apiFetch<ConfigResponse>('/api/v1/config');

export const getSystemInfo = () => apiFetch<SystemResponse>('/api/v1/system');

export function subscribeSyncEvents(onEvent: (evt: SyncEvent) => void): EventSource {
  const es = new EventSource('/api/v1/sync/events');
  es.addEventListener('sync', (e) => {
    try {
      const data = JSON.parse(e.data) as SyncEvent;
      onEvent(data);
    } catch (err) {
      console.error('Failed to parse SSE event data', err);
    }
  });
  return es;
}

export const getCustomerAliases = () => apiFetch<CustomerAliasesResponse>('/api/v1/customer-aliases');

export const setCustomerAlias = (alias: string, canonical: string, area?: string) =>
  apiFetch<{ status: string }>('/api/v1/customer-aliases', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alias, canonical, area }),
  });

export const deleteCustomerAlias = (alias: string) =>
  apiFetch<{ status: string }>(`/api/v1/customer-aliases/${encodeURIComponent(alias)}`, {
    method: 'DELETE',
  });
export interface AliasImportResult {
  status: string;
  imported: number;
  skipped: number;
  errors?: string[];
}

export const getCustomerAliasesExportUrl = () => `/api/v1/customer-aliases/export`;

export const importCustomerAliasesFile = (file: File, mode: 'merge' | 'replace' = 'merge') => {
  const fd = new FormData();
  fd.append('file', file);
  return apiFetch<AliasImportResult>(`/api/v1/customer-aliases/import?mode=${mode}`, {
    method: 'POST',
    body: fd,
  });
};

export const importCustomerAliasesSqlText = (sql: string, mode: 'merge' | 'replace' = 'merge') =>
  apiFetch<AliasImportResult>(`/api/v1/customer-aliases/import?mode=${mode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sql' },
    body: sql,
  });

export const getDeliveries = (params?: {
  customer?: string;
  nama_barang?: string;
  status_order?: string;
  date?: string;
  tanggal?: string;
  order_number?: string;
  ecatalog_number?: string;
  sort?: string;
  order?: string;
  limit?: number;
  offset?: number;
}) => {
  const query = qs(params);
  return apiFetch<PaginatedDeliveries>(`/api/v1/deliveries${query ? '?' + query : ''}`);
};
export const getDeliveryStats = () => apiFetch<DeliveryStats>('/api/v1/deliveries/stats');


export const getUsers = () => apiFetch<UsersResponse>('/api/v1/admin/users');

export const setUserRole = (email: string, role: string) =>
  apiFetch<{ status: string }>(`/api/v1/admin/users/${encodeURIComponent(email)}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });

export const deleteUser = (email: string) =>
  apiFetch<{ status: string }>(`/api/v1/admin/users/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  });

export const clearDatabase = () =>
  apiFetch<{ status: string; message: string }>('/api/v1/admin/clear-database', {
    method: 'POST',
  });
