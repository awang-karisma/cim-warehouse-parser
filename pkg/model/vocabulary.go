package model

// OrderStatus identifies application-recognized order values. Persisted spreadsheet
// fields remain strings because upstream input can contain unknown statuses.
type OrderStatus string

const (
	OrderUnfinished OrderStatus = "BELUM SELESAI"
	OrderComplete   OrderStatus = "SELESAI"
	OrderProcessing OrderStatus = "PROSES"
	OrderPending    OrderStatus = "PENDING"
	OrderCancelled  OrderStatus = "BATAL"
	OrderCancel     OrderStatus = "CANCEL"
)

type StockStatus string

const (
	StockProcessingOrder StockStatus = "PROSES ORDER"
	StockWarehouse       StockStatus = "STOK GUDANG"
	StockEmpty           StockStatus = "STOK KOSONG"
	StockVendorDelivery  StockStatus = "DELIVERY VENDOR"
	StockDone            StockStatus = "DONE"
)

type DeliveryRunStatus string

const (
	RunPlanned    DeliveryRunStatus = "PLANNED"
	RunPicking    DeliveryRunStatus = "PICKING"
	RunReady      DeliveryRunStatus = "READY"
	RunDispatched DeliveryRunStatus = "DISPATCHED"
	RunCompleted  DeliveryRunStatus = "COMPLETED"
)

type UserRole string

const (
	RoleGuest      UserRole = "guest"
	RoleUser       UserRole = "user"
	RoleAdmin      UserRole = "admin"
	RoleSuperadmin UserRole = "superadmin"
)

type Locale string

const (
	LocaleEnglish    Locale = "en"
	LocaleIndonesian Locale = "id"
)

type SyncStatus string

const (
	Syncing     SyncStatus = "SYNCING"
	SyncSuccess SyncStatus = "SUCCESS"
	SyncError   SyncStatus = "ERROR"
)

type WorkerState string

const (
	WorkerIdle         WorkerState = "IDLE"
	WorkerSyncing      WorkerState = "SYNCING"
	WorkerOutsideHours WorkerState = "OUTSIDE_HOURS"
	WorkerError        WorkerState = "ERROR"
)

type WeekdayName string

const (
	WeekdaySunday    WeekdayName = "Sunday"
	WeekdayMonday    WeekdayName = "Monday"
	WeekdayTuesday   WeekdayName = "Tuesday"
	WeekdayWednesday WeekdayName = "Wednesday"
	WeekdayThursday  WeekdayName = "Thursday"
	WeekdayFriday    WeekdayName = "Friday"
	WeekdaySaturday  WeekdayName = "Saturday"
)

type BarcodeSymbology string

const (
	BarcodeCode128    BarcodeSymbology = "CODE128"
	BarcodeCode39     BarcodeSymbology = "CODE39"
	BarcodeEAN13      BarcodeSymbology = "EAN13"
	BarcodeQRCode     BarcodeSymbology = "QRCODE"
	BarcodeDataMatrix BarcodeSymbology = "DATAMATRIX"
)

type BarcodeHeight string

const (
	BarcodeHeightCompact BarcodeHeight = "compact"
	BarcodeHeightMedium  BarcodeHeight = "medium"
	BarcodeHeightLarge   BarcodeHeight = "large"
)

type BarcodeFontSize string

const (
	BarcodeFontSmall  BarcodeFontSize = "small"
	BarcodeFontMedium BarcodeFontSize = "medium"
	BarcodeFontLarge  BarcodeFontSize = "large"
)

type BarcodeQuantityMode string

const (
	BarcodeQuantitySingle   BarcodeQuantityMode = "single"
	BarcodeQuantityMultiply BarcodeQuantityMode = "multiply"
)
