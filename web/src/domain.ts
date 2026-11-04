export const ORDER_STATUS = {
  UNFINISHED: "BELUM SELESAI",
  COMPLETE: "SELESAI",
  PROCESSING: "PROSES",
  PENDING: "PENDING",
  CANCELLED: "BATAL",
  CANCEL: "CANCEL",
} as const;

export const STOCK_STATUS = {
  PROCESSING_ORDER: "PROSES ORDER",
  WAREHOUSE: "STOK GUDANG",
  EMPTY: "STOK KOSONG",
  VENDOR_DELIVERY: "DELIVERY VENDOR",
  DONE: "DONE",
} as const;

export const DELIVERY_RUN_STATUS = { PLANNED: "PLANNED", PICKING: "PICKING", READY: "READY", DISPATCHED: "DISPATCHED", COMPLETED: "COMPLETED" } as const;
export const SYNC_STATUS = { SYNCING: "SYNCING", SUCCESS: "SUCCESS", ERROR: "ERROR" } as const;
export const WORKER_STATE = { IDLE: "IDLE", SYNCING: "SYNCING", OUTSIDE_HOURS: "OUTSIDE_HOURS", ERROR: "ERROR" } as const;
export const USER_ROLE = { GUEST: "guest", USER: "user", ADMIN: "admin", SUPERADMIN: "superadmin" } as const;
export const LOCALE = { ENGLISH: "en", INDONESIAN: "id" } as const;
export const ACCURATE_SOURCE = { RECEIVE_ITEM: "receive-item", PURCHASE_ORDER: "purchase-order", SALES_ORDER: "sales-order", DELIVERY_ORDER: "delivery-order", STOCK_OPNAME_ORDER: "stock-opname-order", STOCK_OPNAME_RESULT: "stock-opname-result" } as const;
export const ACCURATE_PROVIDER = { WEB: "web", OFFICIAL: "official" } as const;
export const ACCURATE_LOGIN_STATUS = { SUCCESS: "success", MFA_REQUIRED: "mfa_required" } as const;
export const BARCODE_SYMBOLOGY = { CODE128: "CODE128", CODE39: "CODE39", EAN13: "EAN13", QRCODE: "QRCODE", DATAMATRIX: "DATAMATRIX" } as const;
export const BARCODE_HEIGHT = { COMPACT: "compact", MEDIUM: "medium", LARGE: "large" } as const;
export const FONT_SIZE = { SMALL: "small", MEDIUM: "medium", LARGE: "large" } as const;
export const QTY_MODE = { SINGLE: "single", MULTIPLY: "multiply" } as const;
export const WEEKDAY_NAME = { SUNDAY: "Sunday", MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday" } as const;

export type DeliveryRunStatus = (typeof DELIVERY_RUN_STATUS)[keyof typeof DELIVERY_RUN_STATUS];
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
export type Locale = (typeof LOCALE)[keyof typeof LOCALE];
export type BarcodeSymbology = (typeof BARCODE_SYMBOLOGY)[keyof typeof BARCODE_SYMBOLOGY];
export type BarcodeHeight = (typeof BARCODE_HEIGHT)[keyof typeof BARCODE_HEIGHT];
export type FontSize = (typeof FONT_SIZE)[keyof typeof FONT_SIZE];
export type QtyMode = (typeof QTY_MODE)[keyof typeof QTY_MODE];
