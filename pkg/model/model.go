// Package model defines the core data structures for warehouse order tracking data.
package model

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"
)

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
	RowIndex           int       `json:"row_index"`
	OrderID            string    `json:"order_id,omitempty"`
	OrderNumber        string    `json:"order_number,omitempty"`
	EcatalogNumber     string    `json:"ecatalog_number,omitempty"`
	Tanggal            time.Time `json:"tanggal" format:"date"`
	Customer           string    `json:"customer"`
	Area               string    `json:"area"`
	NamaBarang         string    `json:"nama_barang"`
	Jumlah             string    `json:"jumlah"`
	Satuan             string    `json:"satuan"`
	TanggalPengiriman  string    `json:"tanggal_pengiriman"`
	LeadTimePengiriman string    `json:"lead_time_pengiriman"`
	JumlahTerkirim     string    `json:"jumlah_terkirim"`
	BelumTerkirim      string    `json:"belum_terkirim"`
	StatusOrder        string    `json:"status_order"`
	StatusBarang       string    `json:"status_barang"`
	Keterangan         string    `json:"keterangan"`
	Catatan            string    `json:"catatan"`
}

// Order represents a grouped order belonging to a specific customer on a specific date,
// containing one or more ordered line items.
type Order struct {
	ID             string      `json:"id"`
	OrderNumber    string      `json:"order_number,omitempty"`
	EcatalogNumber string      `json:"ecatalog_number,omitempty"`
	Tanggal        time.Time   `json:"tanggal" format:"date"`
	Customer       string      `json:"customer"`
	Area           string      `json:"area"`
	Items          []OrderItem `json:"items"`
}

// OrderItem represents a line item within a grouped Order.
type OrderItem struct {
	RowIndex           int    `json:"row_index"`
	OrderNumber        string `json:"order_number,omitempty"`
	EcatalogNumber     string `json:"ecatalog_number,omitempty"`
	Area               string `json:"area,omitempty"`
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

// ParseDate parses supported date strings (ISO YYYY-MM-DD or DD/MM/YYYY) as a UTC midnight calendar date.
// Blank or unparseable input returns zero time.Time without any timezone conversion.
func ParseDate(raw string) time.Time {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return time.Time{}
	}
	// Try ISO YYYY-MM-DD (including with ISO time like 2026-01-02T00:00:00Z)
	if len(trimmed) >= 10 && trimmed[4] == '-' && trimmed[7] == '-' {
		if t, err := time.Parse("2006-01-02", trimmed[:10]); err == nil {
			return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
		}
	}
	// Try DD/MM/YYYY
	if t, err := time.ParseInLocation("02/01/2006", trimmed, time.UTC); err == nil {
		return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
	}
	// Try single digit day/month DD/MM/YYYY
	parts := strings.Split(trimmed, "/")
	if len(parts) == 3 {
		d, err1 := strconv.Atoi(parts[0])
		m, err2 := strconv.Atoi(parts[1])
		y, err3 := strconv.Atoi(parts[2])
		if err1 == nil && err2 == nil && err3 == nil && y >= 1000 && m >= 1 && m <= 12 && d >= 1 && d <= 31 {
			t := time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.UTC)
			if t.Year() == y && int(t.Month()) == m && t.Day() == d {
				return t
			}
		}
	}
	return time.Time{}
}

// MarshalJSON formats Tanggal as an ISO date string (YYYY-MM-DD) or empty string when zero,
// avoiding any timestamp or local-time timezone shift.
func (n NormalizedItem) MarshalJSON() ([]byte, error) {
	type Alias NormalizedItem
	var tanggalStr string
	if !n.Tanggal.IsZero() {
		tanggalStr = n.Tanggal.UTC().Format("2006-01-02")
	}
	return json.Marshal(&struct {
		Alias
		Tanggal string `json:"tanggal"`
	}{
		Alias:   Alias(n),
		Tanggal: tanggalStr,
	})
}

// UnmarshalJSON unmarshals NormalizedItem from JSON, parsing Tanggal as a UTC midnight date.
func (n *NormalizedItem) UnmarshalJSON(data []byte) error {
	type Alias NormalizedItem
	aux := struct {
		*Alias
		Tanggal string `json:"tanggal"`
	}{
		Alias: (*Alias)(n),
	}
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}
	n.Tanggal = ParseDate(aux.Tanggal)
	return nil
}

// MarshalJSON formats Tanggal as an ISO date string (YYYY-MM-DD) or empty string when zero,
// avoiding any timestamp or local-time timezone shift.
func (o Order) MarshalJSON() ([]byte, error) {
	type Alias Order
	var tanggalStr string
	if !o.Tanggal.IsZero() {
		tanggalStr = o.Tanggal.UTC().Format("2006-01-02")
	}
	return json.Marshal(&struct {
		Alias
		Tanggal string `json:"tanggal"`
	}{
		Alias:   Alias(o),
		Tanggal: tanggalStr,
	})
}

// UnmarshalJSON unmarshals Order from JSON, parsing Tanggal as a UTC midnight date.
func (o *Order) UnmarshalJSON(data []byte) error {
	type Alias Order
	aux := struct {
		*Alias
		Tanggal string `json:"tanggal"`
	}{
		Alias: (*Alias)(o),
	}
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}
	o.Tanggal = ParseDate(aux.Tanggal)
	return nil
}

// User represents an authenticated system user.
type User struct {
	ID        int64     `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Picture   string    `json:"picture"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// WorkdayPolicy defines an active workday schedule effective from a specific calendar date (YYYY-MM-DD).
type WorkdayPolicy struct {
	EffectiveFrom string   `json:"effective_from"`
	WorkDays      []string `json:"work_days"`
}
