package model

//go:generate go run ../../internal/permissiongen -out ../../web/src/permissions.generated.ts

// Permission identifies a registered operation capability, not a role or wildcard.
type Permission string

const (
	PermDashboardRead       Permission = "dashboard:read"
	PermOrderRead           Permission = "order:read"
	PermItemRead            Permission = "item:read"
	PermItemExport          Permission = "item:export"
	PermPurchaseOrderRead   Permission = "purchase_order:read"
	PermCustomerRead        Permission = "customer:read"
	PermAreaRead            Permission = "area:read"
	PermAliasRead           Permission = "alias:read"
	PermAliasWrite          Permission = "alias:write"
	PermAliasDelete         Permission = "alias:delete"
	PermAliasImport         Permission = "alias:import"
	PermAliasExport         Permission = "alias:export"
	PermTimelineRead        Permission = "timeline:read"
	PermSyncRead            Permission = "sync:read"
	PermSyncTrigger         Permission = "sync:trigger"
	PermSystemRead          Permission = "system:read"
	PermWorkdayRead         Permission = "workday:read"
	PermWorkdayUpdate       Permission = "workday:update"
	PermDatabaseClear       Permission = "database:clear"
	PermDeliveryRead        Permission = "delivery:read"
	PermDeliveryCreate      Permission = "delivery:create"
	PermDeliveryUpdate      Permission = "delivery:update"
	PermDeliveryPick        Permission = "delivery:pick"
	PermDeliveryDelete      Permission = "delivery:delete"
	PermDriverRead          Permission = "driver:read"
	PermDriverCreate        Permission = "driver:create"
	PermDriverUpdate        Permission = "driver:update"
	PermDriverDelete        Permission = "driver:delete"
	PermBarcodePrint        Permission = "barcode:print"
	PermDesignRead          Permission = "design:read"
	PermDesignCreate        Permission = "design:create"
	PermDesignUpdate        Permission = "design:update"
	PermDesignDelete        Permission = "design:delete"
	PermPresetRead          Permission = "preset:read"
	PermPresetCreate        Permission = "preset:create"
	PermPresetUpdate        Permission = "preset:update"
	PermPresetDelete        Permission = "preset:delete"
	PermAccurateRead        Permission = "accurate:read"
	PermAccurateCreate      Permission = "accurate:create"
	PermAccurateUpdate      Permission = "accurate:update"
	PermAccurateDelete      Permission = "accurate:delete"
	PermLoggerSessionRead   Permission = "logger_session:read"
	PermLoggerSessionCreate Permission = "logger_session:create"
	PermLoggerSessionUpdate Permission = "logger_session:update"
	PermLoggerSessionDelete Permission = "logger_session:delete"
	PermLoggerProfileRead   Permission = "logger_profile:read"
	PermLoggerProfileCreate Permission = "logger_profile:create"
	PermLoggerProfileUpdate Permission = "logger_profile:update"
	PermLoggerProfileDelete Permission = "logger_profile:delete"
	PermLoggerDeviceRead    Permission = "logger_device:read"
	PermLoggerDeviceWrite   Permission = "logger_device:write"
	PermUserRead            Permission = "user:read"
	PermUserCreate          Permission = "user:create"
	PermUserUpdate          Permission = "user:update"
	PermUserDelete          Permission = "user:delete"
	PermRoleRead            Permission = "role:read"
	PermRoleCreate          Permission = "role:create"
	PermRoleUpdate          Permission = "role:update"
	PermRoleDelete          Permission = "role:delete"
)

var permissionRegistry = map[Permission]struct{}{
	PermDashboardRead:       {},
	PermOrderRead:           {},
	PermItemRead:            {},
	PermItemExport:          {},
	PermPurchaseOrderRead:   {},
	PermCustomerRead:        {},
	PermAreaRead:            {},
	PermAliasRead:           {},
	PermAliasWrite:          {},
	PermAliasDelete:         {},
	PermAliasImport:         {},
	PermAliasExport:         {},
	PermTimelineRead:        {},
	PermSyncRead:            {},
	PermSyncTrigger:         {},
	PermSystemRead:          {},
	PermWorkdayRead:         {},
	PermWorkdayUpdate:       {},
	PermDatabaseClear:       {},
	PermDeliveryRead:        {},
	PermDeliveryCreate:      {},
	PermDeliveryUpdate:      {},
	PermDeliveryPick:        {},
	PermDeliveryDelete:      {},
	PermDriverRead:          {},
	PermDriverCreate:        {},
	PermDriverUpdate:        {},
	PermDriverDelete:        {},
	PermBarcodePrint:        {},
	PermDesignRead:          {},
	PermDesignCreate:        {},
	PermDesignUpdate:        {},
	PermDesignDelete:        {},
	PermPresetRead:          {},
	PermPresetCreate:        {},
	PermPresetUpdate:        {},
	PermPresetDelete:        {},
	PermAccurateRead:        {},
	PermAccurateCreate:      {},
	PermAccurateUpdate:      {},
	PermAccurateDelete:      {},
	PermLoggerSessionRead:   {},
	PermLoggerSessionCreate: {},
	PermLoggerSessionUpdate: {},
	PermLoggerSessionDelete: {},
	PermLoggerProfileRead:   {},
	PermLoggerProfileCreate: {},
	PermLoggerProfileUpdate: {},
	PermLoggerProfileDelete: {},
	PermLoggerDeviceRead:    {},
	PermLoggerDeviceWrite:   {},
	PermUserRead:            {},
	PermUserCreate:          {},
	PermUserUpdate:          {},
	PermUserDelete:          {},
	PermRoleRead:            {},
	PermRoleCreate:          {},
	PermRoleUpdate:          {},
	PermRoleDelete:          {},
}

// Permissions yields the catalog. Its wire keys also identify role-editor translations.
func Permissions(yield func(Permission) bool) {
	for p := range permissionRegistry {
		if !yield(p) {
			return
		}
	}
}

func ValidPermission(p Permission) bool {
	_, ok := permissionRegistry[p]
	return ok
}
