import type { BarcodeHeight, BarcodeSymbology, DataloggerStartMode, DeliveryRunStatus, FontSize, QtyMode } from "~/domain";
import type { Permission } from '~/permissions.generated';
export type { BarcodeHeight, DataloggerStartMode, DeliveryRunStatus, FontSize, QtyMode } from "~/domain";

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

export interface DashboardDailyOrder {
  date: string;
  count: number;
}

export interface DashboardSummary {
  total_orders: number;
  total_items: number;
  unique_customers: number;
  unique_areas: number;
  status_counts: Record<string, number>;
  daily_orders: DashboardDailyOrder[];
}
export interface DashboardOperations {
  active_backlog_orders: number;
  shelf_ready_items: number;
  active_runs: number;
}

export interface DashboardPressureRow {
  name: string;
  unfinished_items: number;
  pending_items: number;
}

export interface DashboardCustomerPressureRow extends DashboardPressureRow {
  area: string;
}

export interface DashboardPressure {
  areas: DashboardPressureRow[];
  customers: DashboardCustomerPressureRow[];
  average_lead_time: number | null;
  completed_items: number;
}


export interface OrderStatusPoint {
  date: string;
  status_counts: Record<string, number>;
}

export interface OrderStatusTrendResponse {
  points: OrderStatusPoint[];
}

export interface OrderStatusChangePoint {
  date: string;
  entered_status_counts: Record<string, number>;
}

export interface OrderStatusChangesResponse {
  points: OrderStatusChangePoint[];
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
  latitude?: number | null;
  longitude?: number | null;
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
  map_tile_cache_dir?: string;
  map_tile_cache_ttl?: string;
  map_tile_cache_max_size_mb?: number;
  map_tile_invalidated_at?: string;
  map_carto_api_key_configured?: boolean;
  map_osm_api_key_configured?: boolean;
  map_esri_api_key_configured?: boolean;
}

export interface MapTileConfigResponse {
  carto_api_key_configured: boolean;
  osm_api_key_configured: boolean;
  satellite_api_key_configured: boolean;
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
  latitude?: number | null;
  longitude?: number | null;
}

export interface CustomerAliasesResponse {
  groups: CustomerAliasGroup[];
}

export interface DeliveryEntry {
  date: string;
  quantity: string;
}

export interface DeliveryItem {
  delivery_date: string;
  shipped_quantity: string;
  shipment_index: number;
  shipment_count: number;
  item: NormalizedItem;
}

export interface PaginatedDeliveries {
  total: number;
  limit: number;
  offset: number;
  deliveries: DeliveryItem[];
}
export interface DeliveryStats {
  total_scheduled: number;
  completed: number;
  pending: number;
  avg_lead_time: number;
}


export interface User {
  id: number;
  email: string;
  name: string;
  picture: string;
  role: string;
  created_at: string;
  updated_at: string;
  actions: { approve: boolean; assign: boolean; delete: boolean };
}

export interface UsersResponse {
  users: User[];
  assignable_roles: Array<{ id: number; name: string }>;
}

export interface RoleInput {
  name: string;
  description: string;
  permissions: Permission[];
}

export interface Role extends RoleInput {
  id: number;
  is_system: boolean;
  actions: { update: boolean; delete: boolean };
}

export interface WorkdayPolicy {
  effective_from: string;
  work_days: string[];
}

export interface WorkdayPoliciesResponse {
  policies: WorkdayPolicy[];
}

export interface AccurateDatabase {
  id: number;
  alias: string;
  host: string;
  uniqueId?: string;
  isPrivateCloud?: boolean;
}

export interface AccurateStatus {
  enabled: boolean;
  provider?: string;
  connected: boolean;
  database?: AccurateDatabase;
}

export interface AccuratePagination {
  page: number;
  pageCount: number;
  pageSize: number;
  rowCount: number;
}

export interface AccurateInventoryItem {
  id: number;
  no: string;
  name: string;
  upcNo: string;
  unit1Name: string;
  unit2Name?: string;
  unitPrice: number;
  allQuantity: number;
  availableToSell: number;
  itemType: string;
  itemTypeName: string;
  canPrintBarcode: boolean;
}

export interface AccurateSearchItemsResult {
  items: AccurateInventoryItem[];
  pagination: AccuratePagination;
}

export interface AccurateSourceInfo {
  id: string;
  name: string;
  dataPlan: string;
  available: boolean;
  reason?: string;
}

export interface AccurateDocumentHeader {
  id: number;
  number: string;
  date: string;
  description: string;
  statusName: string;
}

export interface AccurateDocumentsResult {
  documents: AccurateDocumentHeader[];
  pagination: AccuratePagination;
}

export interface AccurateNormalizedItem {
  itemId: number;
  itemNo: string;
  itemName: string;
  upcNo: string;
  quantity: number;
  unitName: string;
  unitPrice?: number;
  documentType: string;
  documentNumber: string;
}

export interface BarcodeItem {
  id: string;
  selected: boolean;
  itemNo: string;
  itemName: string;
  barcode: string;
  quantity: number;
  unit: string;
  price: number;
  documentType?: string;
  documentNumber?: string;
}

export interface PresetConfig {
  name: string;
  paper: string;
  paperWidthMM: number;
  paperHeightMM: number;
  labelWidthMM: number;
  labelHeightMM: number;
  cols: number;
  rows: number;
  gapXMM: number;
  gapYMM: number;
  marginTopMM: number;
  marginLeftMM: number;
  isAuditSheet: boolean;
}
export type LabelElementType =
  | 'company'
  | 'itemName'
  | 'barcode'
  | 'barcodeText'
  | 'itemCode'
  | 'price'
  | 'unit'
  | 'separator'
  | 'customText';

export interface LabelElement {
  id: string;
  type: LabelElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  align: 'left' | 'center' | 'right';
  fontScale: number;
  visible: boolean;
  customText?: string;
}

export type LabelLayout = LabelElement[];
export interface LabelLayoutPreset {
  id: number;
  name: string;
  label_layout: string;
  created_at?: string;
  updated_at?: string;
}

export interface LabelLayoutPresetsResponse {
  presets: LabelLayoutPreset[];
}


export type Symbology = BarcodeSymbology;

export interface BarcodePresetSettings {
  symbology: Symbology;
  barcode_height: BarcodeHeight;
  font_size: FontSize;
  qty_mode: QtyMode;
  skip_count: number;
  show_screen_border: boolean;
  zoom: number;
}

export interface PageDesign {
  id: number;
  name: string;
  paper: string;
  paper_width_mm: number;
  paper_height_mm: number;
  label_width_mm: number;
  label_height_mm: number;
  cols: number;
  rows: number;
  gap_x_mm: number;
  gap_y_mm: number;
  margin_top_mm: number;
  margin_left_mm: number;
  is_audit_sheet: boolean;
	label_layout?: string;
	settings: BarcodePresetSettings;
  created_at?: string;
  updated_at?: string;
}

export interface PageDesignsResponse {
  designs: PageDesign[];
}

export interface DeliveryDriver {
  id?: number;
  name: string;
  phone?: string;
  vehicle?: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DeliveryDriversResponse {
  drivers: DeliveryDriver[];
}



export interface DeliveryRunItem {
  id?: number;
  run_id?: number;
  source_key?: string;
  row_index?: number;
  order_id?: string;
  order_number?: string;
  ecatalog_number?: string;
  tanggal?: string;
  customer?: string;
  area?: string;
  nama_barang: string;
  satuan?: string;
  jumlah?: string;
  belum_terkirim?: string;
  planned_qty: string;
  status_order?: string;
  status_barang?: string;
  keterangan?: string;
  catatan?: string;
  note?: string;
  picked?: boolean;
  picked_at?: string;
}

export interface DeliveryRun {
  id?: number;
  title?: string;
  driver_id?: number;
  driver_name: string;
  areas?: string[];
  delivery_date: string;
  status?: DeliveryRunStatus;
  notes?: string;
  total_items?: number;
  picked_items?: number;
  items: DeliveryRunItem[];
  created_at?: string;
  updated_at?: string;
}

export interface DeliveryRunsResponse {
  runs: DeliveryRun[];
}

export interface DeliveryCandidatesResponse {
  orders: Order[];
}

export interface DataloggerSession {
  id: number;
  name: string;
  device_model: string;
  serial_number: string;
  record_count: number;
  start_time: string;
  end_time: string;
  temp_min: number;
  temp_max: number;
  has_humidity: boolean;
  created_at: string;
}

export interface DataloggerRecord {
  id: number;
  session_id: number;
  timestamp: string;
  temperature: number;
  humidity: number | null;
  flags: string;
}

export interface DataloggerConfiguration {
  interval_seconds: number;
  duration_seconds: number | null;
  start_mode: DataloggerStartMode;
  start_delay_seconds: number;
  scheduled_start_local: string | null;
  trip_number: string;
  trip_description: string;
}

export interface DataloggerProfile {
  id: number;
  name: string;
  config: DataloggerConfiguration;
  created_at: string;
  updated_at: string;
}

export interface DataloggerProfilesResponse {
  profiles: DataloggerProfile[];
}

export interface PurchaseOrderItem {
  id: number;
  row_index: number;
  tanggal: string;
  pemasok: string;
  kode_barang: string;
  nie: string;
  nama_barang: string;
  jumlah: string;
  satuan: string;
  status_order: string;
  keterangan: string;
  clients: string[];
  is_stock: boolean;
  catatan: string;
}

export interface PurchaseOrderStats {
  total: number;
  stock_items: number;
  client_items: number;
  suppliers_count: number;
  pending_items: number;
  finished_items: number;
}

export interface PurchaseOrderListResponse {
  items: PurchaseOrderItem[];
  total: number;
  limit: number;
  offset: number;
  stats: PurchaseOrderStats;
  suppliers: string[];
  statuses: string[];
}
