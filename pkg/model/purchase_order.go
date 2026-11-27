package model

import (
	"encoding/json"
	"time"
)

// RawPurchaseOrderRow represents a single unparsed row from the "PERMINTAAN PEMBELIAN" sheet.
type RawPurchaseOrderRow struct {
	RowIndex    int    `json:"row_index,omitempty" gsheets:"-"`
	Tanggal     string `json:"tanggal" gsheets:"Tanggal"`
	Pemasok     string `json:"pemasok" gsheets:"Pemasok"`
	KodeBarang  string `json:"kode_barang" gsheets:"Kode Barang"`
	NIE         string `json:"nie" gsheets:"NIE"`
	NamaBarang  string `json:"nama_barang" gsheets:"Nama Barang"`
	Jumlah      string `json:"jumlah" gsheets:"Jumlah"`
	Satuan      string `json:"satuan" gsheets:"Satuan"`
	StatusOrder string `json:"status_order" gsheets:"Status Order"`
	Keterangan  string `json:"keterangan" gsheets:"Keterangan"`
	Catatan     string `json:"catatan" gsheets:"Catatan"`
}

// PurchaseOrderItem represents a normalized purchase order line item.
type PurchaseOrderItem struct {
	ID          int64     `json:"id"`
	RowIndex    int       `json:"row_index"`
	Tanggal     time.Time `json:"tanggal" format:"date"`
	Pemasok     string    `json:"pemasok"`
	KodeBarang  string    `json:"kode_barang"`
	NIE         string    `json:"nie"`
	NamaBarang  string    `json:"nama_barang"`
	Jumlah      string    `json:"jumlah"`
	Satuan      string    `json:"satuan"`
	StatusOrder string    `json:"status_order"`
	Keterangan  string    `json:"keterangan"`
	Clients     []string  `json:"clients"`
	IsStock     bool      `json:"is_stock"`
	Catatan     string    `json:"catatan"`
}

// MarshalJSON formats Tanggal as an ISO date string (YYYY-MM-DD) or empty string when zero.
func (p PurchaseOrderItem) MarshalJSON() ([]byte, error) {
	type Alias PurchaseOrderItem
	var tanggalStr string
	if !p.Tanggal.IsZero() {
		tanggalStr = p.Tanggal.UTC().Format("2006-01-02")
	}
	clients := p.Clients
	if clients == nil {
		clients = []string{}
	}
	return json.Marshal(&struct {
		Alias
		Tanggal string   `json:"tanggal"`
		Clients []string `json:"clients"`
	}{
		Alias:   Alias(p),
		Tanggal: tanggalStr,
		Clients: clients,
	})
}

// UnmarshalJSON unmarshals PurchaseOrderItem from JSON, parsing Tanggal as a UTC midnight date.
func (p *PurchaseOrderItem) UnmarshalJSON(data []byte) error {
	type Alias PurchaseOrderItem
	aux := &struct {
		*Alias
		Tanggal string `json:"tanggal"`
	}{
		Alias: (*Alias)(p),
	}
	if err := json.Unmarshal(data, aux); err != nil {
		return err
	}
	p.Tanggal = ParseDate(aux.Tanggal)
	if p.Clients == nil {
		p.Clients = []string{}
	}
	return nil
}

// PurchaseOrderFilter defines filtering, sorting, and pagination criteria for purchase order queries.
type PurchaseOrderFilter struct {
	Query    string
	Supplier string
	Status   string
	Type     string // "", "all", "client", "stock"
	From     string
	To       string
	Sort     string
	Order    string
	Limit    int
	Offset   int
}

// PurchaseOrderStats contains aggregated metrics across all stored purchase order items.
type PurchaseOrderStats struct {
	Total          int `json:"total"`
	StockItems     int `json:"stock_items"`
	ClientItems    int `json:"client_items"`
	SuppliersCount int `json:"suppliers_count"`
	PendingItems   int `json:"pending_items"`
	FinishedItems  int `json:"finished_items"`
}

// PurchaseOrderListResponse is the paginated response payload for purchase order queries.
type PurchaseOrderListResponse struct {
	Items     []PurchaseOrderItem `json:"items"`
	Total     int                 `json:"total"`
	Limit     int                 `json:"limit"`
	Offset    int                 `json:"offset"`
	Stats     PurchaseOrderStats  `json:"stats"`
	Suppliers []string            `json:"suppliers"`
	Statuses  []string            `json:"statuses"`
}
