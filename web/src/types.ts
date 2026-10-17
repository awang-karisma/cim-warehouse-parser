export interface OrderItem {
  row_index: number;
  order_number?: string;
  ecatalog_number?: string;
  nama_barang: string;
  jumlah: string;
  satuan: string;
  tanggal_pengiriman: string;
  lead_time_pengiriman: string;
  jumlah_terkirim: string;
  belum_terkirim: string;
  status_order: string;
  status_barang: string;
  keterangan: string;
  catatan: string;
}

export interface Order {
  id: string;
  order_number?: string;
  ecatalog_number?: string;
  tanggal: string;
  customer: string;
  area: string;
  total_items?: number;
  items: OrderItem[];
}

export interface NormalizedItem extends OrderItem {
  id?: number;
  order_id?: string;
  tanggal: string;
  customer: string;
  area: string;
}

export interface Stats {
  total_orders: number;
  total_items: number;
  unique_customers: number;
  unique_areas: number;
  status_counts: Record<string, number>;
}

export interface SyncRecord {
  id: number;
  synced_at: string;
  status: string;
  items_count: number;
  orders_count: number;
  error_message?: string;
  duration_ms: number;
}

export interface StatusResponse {
  status: string;
  is_inside_work_hours: boolean;
  last_sync?: string;
  next_sync?: string;
  last_duration_ms?: number;
  error?: string;
  last_record?: SyncRecord;
}

export interface SyncEvent {
  status: string;
  message?: string;
  record?: SyncRecord;
  duration_ms?: number;
  error?: string;
}

export interface CustomerSummary {
  name: string;
  area: string;
  total_orders: number;
  total_items: number;
  last_order_date: string;
  status_counts: Record<string, number>;
}

export interface AreaSummary {
  name: string;
  total_orders: number;
  total_items: number;
  unique_customers: number;
  status_counts: Record<string, number>;
}

export interface SearchOrderResult {
  id: string;
  customer: string;
  tanggal: string;
  matched_items: string[];
}

export interface SearchItemResult {
  row_index: number;
  customer: string;
  nama_barang: string;
  jumlah: string;
  status_order: string;
}

export interface SearchCustomerResult {
  name: string;
  area: string;
  total_orders: number;
}

export interface SearchResult {
  query: string;
  orders: {
    total: number;
    results: SearchOrderResult[];
  };
  items: {
    total: number;
    results: SearchItemResult[];
  };
  customers: {
    total: number;
    results: SearchCustomerResult[];
  };
}

export interface ConfigResponse {
  sync_interval: string;
  work_hours_start: string;
  work_hours_end: string;
  timezone: string;
  work_days: string[];
  spreadsheet_id: string;
}

export interface SystemResponse {
  version: string;
  go_version: string;
  uptime_seconds: number;
  port: string;
  db_path: string;
  tables: Record<string, { row_count: number }>;
}

export interface PaginatedOrders {
  total: number;
  limit: number;
  offset: number;
  orders: Order[];
}

export interface PaginatedItems {
  total: number;
  limit: number;
  offset: number;
  items: NormalizedItem[];
}

export interface PaginatedSyncHistory {
  total: number;
  limit: number;
  offset: number;
  records: SyncRecord[];
}

export interface PaginatedCustomers {
  total: number;
  limit: number;
  offset: number;
  customers: CustomerSummary[];
}

export interface CustomerAliasGroup {
  canonical: string;
  area?: string;
  aliases: string[];
}

export interface CustomerAliasesResponse {
  groups: CustomerAliasGroup[];
}
