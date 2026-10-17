// Package model defines the core data structures for warehouse order tracking data.
package model

// RawOrderRow represents a single unparsed row directly mapped from the Google Sheet or CSV.
// All fields are strings to prevent conversion errors from irregular human input in spreadsheet cells.
type RawOrderRow struct {
	RowIndex           int    `json:"row_index,omitempty" gsheets:"-"`
	Tanggal            string `json:"tanggal" gsheets:"Tanggal"`
	Customer           string `json:"customer" gsheets:"Customer"`
	Area               string `json:"area" gsheets:"Area"`
	NamaBarang         string `json:"nama_barang" gsheets:"Nama Barang"`
	Jumlah             string `json:"jumlah" gsheets:"Jumlah"`
	Satuan             string `json:"satuan" gsheets:"Satuan"`
	TanggalPengiriman  string `json:"tanggal_pengiriman" gsheets:"Tanggal Pengiriman"`
	LeadTimePengiriman string `json:"lead_time_pengiriman" gsheets:"Lead Time Pengiriman"`
	JumlahTerkirim     string `json:"jumlah_terkirim" gsheets:"Jumlah Terkirim"`
	BelumTerkirim      string `json:"belum_terkirim" gsheets:"Belum Terkirim"`
	StatusOrder        string `json:"status_order" gsheets:"Status Order"`
	StatusBarang       string `json:"status_barang" gsheets:"Status Barang"`
	Keterangan         string `json:"keterangan" gsheets:"Keterangan"`
	Catatan            string `json:"catatan" gsheets:"Catatan"`
}

// NormalizedItem represents a flat, normalized order item with forward-filled Tanggal,
// Customer, and Area, along with the 1-based sheet row number.
type NormalizedItem struct {
	RowIndex           int    `json:"row_index"`
	OrderNumber        string `json:"order_number,omitempty"`
	EcatalogNumber     string `json:"ecatalog_number,omitempty"`
	Tanggal            string `json:"tanggal"`
	Customer           string `json:"customer"`
	Area               string `json:"area"`
	NamaBarang         string `json:"nama_barang"`
	Jumlah             string `json:"jumlah"`
	Satuan             string `json:"satuan"`
	TanggalPengiriman  string `json:"tanggal_pengiriman"`
	LeadTimePengiriman string `json:"lead_time_pengiriman"`
	JumlahTerkirim     string `json:"jumlah_terkirim"`
	BelumTerkirim      string `json:"belum_terkirim"`
	StatusOrder        string `json:"status_order"`
	StatusBarang       string `json:"status_barang"`
	Keterangan         string `json:"keterangan"`
	Catatan            string `json:"catatan"`
}

// Order represents a grouped order belonging to a specific customer on a specific date,
// containing one or more ordered line items.
type Order struct {
	ID             string      `json:"id"`
	OrderNumber    string      `json:"order_number,omitempty"`
	EcatalogNumber string      `json:"ecatalog_number,omitempty"`
	Tanggal        string      `json:"tanggal"`
	Customer       string      `json:"customer"`
	Area           string      `json:"area"`
	Items          []OrderItem `json:"items"`
}

// OrderItem represents a line item within a grouped Order.
type OrderItem struct {
	RowIndex           int    `json:"row_index"`
	OrderNumber        string `json:"order_number,omitempty"`
	EcatalogNumber     string `json:"ecatalog_number,omitempty"`
	NamaBarang         string `json:"nama_barang"`
	Jumlah             string `json:"jumlah"`
	Satuan             string `json:"satuan"`
	TanggalPengiriman  string `json:"tanggal_pengiriman"`
	LeadTimePengiriman string `json:"lead_time_pengiriman"`
	JumlahTerkirim     string `json:"jumlah_terkirim"`
	BelumTerkirim      string `json:"belum_terkirim"`
	StatusOrder        string `json:"status_order"`
	StatusBarang       string `json:"status_barang"`
	Keterangan         string `json:"keterangan"`
	Catatan            string `json:"catatan"`
}

// CustomerAlias defines a customer variant spelling alias mapped to a canonical customer name and optional linked area.
type CustomerAlias struct {
	Alias     string `json:"alias,omitempty"`
	Canonical string `json:"canonical"`
	Area      string `json:"area,omitempty"`
}

