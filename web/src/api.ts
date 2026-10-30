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
  WorkdayPoliciesResponse,
  AccurateStatus,
  AccurateDatabase,
  AccurateSearchItemsResult,
  AccurateSourceInfo,
  AccurateDocumentsResult,
  AccurateNormalizedItem,
  PageDesign,
  PageDesignsResponse,
  LabelLayoutPreset,
  LabelLayoutPresetsResponse,
  DeliveryCandidatesResponse,
  DeliveryDriver,
  DeliveryDriversResponse,
  DeliveryRun,
  DeliveryRunsResponse,
  DeliveryRunStatus,
} from './types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

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
      if (parsed?.detail) message = parsed.detail;
      else if (parsed?.error) message = parsed.error;
      else if (parsed?.title) message = parsed.title;
    } catch {}
    throw new ApiError(message || `HTTP ${res.status}: ${res.statusText}`, res.status);
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

export const getWorkdayPolicies = () =>
  apiFetch<WorkdayPoliciesResponse>('/api/v1/workday-policies');

export const setWorkdayPolicy = (workDays: string[]) =>
  apiFetch<WorkdayPoliciesResponse>('/api/v1/workday-policies', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ work_days: workDays }),
  });

// Accurate Online Integration Endpoints
export const getAccurateStatus = () =>
  apiFetch<AccurateStatus>('/api/v1/accurate/status');

export const accurateLogin = (payload: { challengeId?: string; otp?: string } = {}) =>
  apiFetch<{ status: string; challengeId?: string }>('/api/v1/accurate/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const accurateLogout = () =>
  apiFetch<{ success: boolean }>('/api/v1/accurate/logout', {
    method: 'POST',
  });

export const getAccurateDatabases = () =>
  apiFetch<AccurateDatabase[]>('/api/v1/accurate/databases');

export const selectAccurateDatabase = (payload: { id?: number; uniqueId?: string }) =>
  apiFetch<{ success: boolean; database: AccurateDatabase }>('/api/v1/accurate/database', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const searchAccurateItems = (params?: { q?: string; page?: number; pageSize?: number }) => {
  const query = qs(params);
  return apiFetch<AccurateSearchItemsResult>(`/api/v1/accurate/items${query ? '?' + query : ''}`);
};

export const getAccurateSources = () =>
  apiFetch<AccurateSourceInfo[]>('/api/v1/accurate/sources');

export const getAccurateSourceDocuments = (
  source: string,
  params?: { q?: string; from?: string; to?: string; page?: number; pageSize?: number }
) => {
  const query = qs(params);
  return apiFetch<AccurateDocumentsResult>(
    `/api/v1/accurate/sources/${encodeURIComponent(source)}/documents${query ? '?' + query : ''}`
  );
};

export const getAccurateSourceDocumentItems = (source: string, id: number | string) =>
  apiFetch<AccurateNormalizedItem[]>(
    `/api/v1/accurate/sources/${encodeURIComponent(source)}/documents/${encodeURIComponent(id)}/items`
  );

export const getPageDesigns = () =>
  apiFetch<PageDesignsResponse>('/api/v1/page-designs');

export const createPageDesign = (design: Omit<PageDesign, 'id' | 'created_at' | 'updated_at'>) =>
  apiFetch<{ status: string; id: number }>('/api/v1/page-designs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(design),
  });

export const updatePageDesign = (id: number, design: Omit<PageDesign, 'id' | 'created_at' | 'updated_at'>) =>
  apiFetch<{ status: string }>(`/api/v1/page-designs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(design),
  });

export const deletePageDesign = (id: number) =>
  apiFetch<{ status: string }>(`/api/v1/page-designs/${id}`, {
    method: 'DELETE',
  });
export const getLabelLayoutPresets = () =>
  apiFetch<LabelLayoutPresetsResponse>('/api/v1/label-layout-presets');

export const createLabelLayoutPreset = (preset: Pick<LabelLayoutPreset, 'name' | 'label_layout'>) =>
  apiFetch<{ status: string; id: number }>('/api/v1/label-layout-presets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preset),
  });

export const updateLabelLayoutPreset = (id: number, preset: Pick<LabelLayoutPreset, 'name' | 'label_layout'>) =>
  apiFetch<{ status: string }>(`/api/v1/label-layout-presets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preset),
  });

export const deleteLabelLayoutPreset = (id: number) =>
  apiFetch<{ status: string }>(`/api/v1/label-layout-presets/${id}`, { method: 'DELETE' });

export const getDeliveryCandidates = () =>
  apiFetch<DeliveryCandidatesResponse>('/api/v1/delivery-flow/candidates');

export const getDeliveryDrivers = () =>
  apiFetch<DeliveryDriversResponse>('/api/v1/delivery-drivers');

export const createDeliveryDriver = (driver: Omit<DeliveryDriver, 'id' | 'created_at' | 'updated_at'>) =>
  apiFetch<{ status: string; id: number; driver?: DeliveryDriver }>('/api/v1/delivery-drivers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(driver),
  });

export const updateDeliveryDriver = (id: number, driver: Partial<DeliveryDriver>) =>
  apiFetch<{ status: string }>(`/api/v1/delivery-drivers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(driver),
  });

export const deleteDeliveryDriver = (id: number) =>
  apiFetch<{ status: string }>(`/api/v1/delivery-drivers/${id}`, {
    method: 'DELETE',
  });

export const getDeliveryRuns = (params?: {
  delivery_date?: string;
  status?: string;
  driver_name?: string;
  area?: string;
}) => {
  const query = qs(params);
  return apiFetch<DeliveryRunsResponse>(`/api/v1/delivery-runs${query ? '?' + query : ''}`);
};

export const getDeliveryRun = (id: number) =>
  apiFetch<{ run: DeliveryRun }>(`/api/v1/delivery-runs/${id}`);

export const createDeliveryRun = (run: DeliveryRun) =>
  apiFetch<{ status: string; id: number; run: DeliveryRun }>('/api/v1/delivery-runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(run),
  });

export const updateDeliveryRun = (id: number, run: DeliveryRun) =>
  apiFetch<{ status: string; run: DeliveryRun }>(`/api/v1/delivery-runs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(run),
  });

export const updateDeliveryRunStatus = (id: number, status: DeliveryRunStatus) =>
  apiFetch<{ status: string; run: DeliveryRun }>(`/api/v1/delivery-runs/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });

export const updateDeliveryRunDriver = (id: number, payload: { driver_id?: number; driver_name: string }) =>
  apiFetch<{ status: string; run: DeliveryRun }>(`/api/v1/delivery-runs/${id}/driver`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const toggleDeliveryRunItemPick = (runId: number, itemId: number, picked: boolean) =>
  apiFetch<{ status: string; run: DeliveryRun }>(
    `/api/v1/delivery-runs/${runId}/items/${itemId}/pick`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ picked }),
    }
  );

export const deleteDeliveryRun = (id: number) =>
  apiFetch<{ status: string }>(`/api/v1/delivery-runs/${id}`, {
    method: 'DELETE',
  });
