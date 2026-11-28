package storage

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"testing"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
)

func TestCustomerLocationCRUDAndValidation(t *testing.T) {
	store, err := New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	ctx := context.Background()

	// Validation errors
	cases := []struct {
		name     string
		customer string
		lat, lng *float64
	}{
		{"empty customer", "   ", new(-8.58), new(116.11)},
		{"missing lng", "RSUD NTB", new(-8.58), nil},
		{"missing lat", "RSUD NTB", nil, new(116.11)},
		{"lat too low", "RSUD NTB", new(-91.0), new(116.11)},
		{"lat too high", "RSUD NTB", new(91.0), new(116.11)},
		{"lng too low", "RSUD NTB", new(-8.58), new(-181.0)},
		{"lng too high", "RSUD NTB", new(-8.58), new(181.0)},
		{"NaN lat", "RSUD NTB", new(math.NaN()), new(116.11)},
		{"Inf lng", "RSUD NTB", new(-8.58), new(math.Inf(1))},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := store.SetCustomerLocation(ctx, tc.customer, tc.lat, tc.lng)
			if !errors.Is(err, ErrValidation) {
				t.Fatalf("expected ErrValidation, got %v", err)
			}
		})
	}

	// Set, read, update (case-insensitive), clear
	if err := store.SetCustomerLocation(ctx, "RSUD Provinsi NTB", new(-8.5833), new(116.1167)); err != nil {
		t.Fatalf("SetCustomerLocation failed: %v", err)
	}
	locs, err := store.GetCustomerLocations(ctx)
	if err != nil {
		t.Fatalf("GetCustomerLocations failed: %v", err)
	}
	if len(locs) != 1 || locs[0].Customer != "RSUD Provinsi NTB" || locs[0].Latitude != -8.5833 || locs[0].Longitude != 116.1167 {
		t.Fatalf("unexpected locations: %+v", locs)
	}

	// Update with different casing replaces existing row
	if err := store.SetCustomerLocation(ctx, "rsud provinsi ntb", new(-8.6), new(116.2)); err != nil {
		t.Fatalf("SetCustomerLocation update failed: %v", err)
	}
	locs, err = store.GetCustomerLocations(ctx)
	if err != nil {
		t.Fatalf("GetCustomerLocations failed: %v", err)
	}
	if len(locs) != 1 || locs[0].Latitude != -8.6 || locs[0].Longitude != 116.2 {
		t.Fatalf("expected updated single row, got %+v", locs)
	}

	// Clear
	if err := store.SetCustomerLocation(ctx, "RSUD PROVINSI NTB", nil, nil); err != nil {
		t.Fatalf("SetCustomerLocation clear failed: %v", err)
	}
	locs, err = store.GetCustomerLocations(ctx)
	if err != nil {
		t.Fatalf("GetCustomerLocations failed: %v", err)
	}
	if len(locs) != 0 {
		t.Fatalf("expected empty locations after clear, got %+v", locs)
	}
}

func TestCustomerLocationJoinsMigrationSurvivalAndExportImport(t *testing.T) {
	store, err := New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	ctx := context.Background()

	// Seed order & item
	now := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	items := []model.NormalizedItem{{
		RowIndex:    2,
		OrderID:     "ORD-0001",
		Tanggal:     now,
		Customer:    "RSUD NTB Alias",
		Area:        "Mataram",
		NamaBarang:  "Reagen A",
		Jumlah:      "10",
		StatusOrder: "PROSES",
	}}
	orders := []model.Order{{
		ID:       "ORD-0001",
		Tanggal:  now,
		Customer: "RSUD NTB Alias",
		Area:     "Mataram",
		Items: []model.OrderItem{{
			RowIndex:    2,
			NamaBarang:  "Reagen A",
			Jumlah:      "10",
			StatusOrder: "PROSES",
		}},
	}}
	if err := store.SyncMirror(ctx, items, orders); err != nil {
		t.Fatalf("SyncMirror failed: %v", err)
	}

	// Set location on alias name before canonicalization
	if err := store.SetCustomerLocation(ctx, "RSUD NTB Alias", new(-8.5833), new(116.1167)); err != nil {
		t.Fatalf("SetCustomerLocation failed: %v", err)
	}

	// Verify GetCustomers returns coordinates
	customers, total, err := store.GetCustomers(ctx, "", "", 100, 0)
	if err != nil {
		t.Fatalf("GetCustomers failed: %v", err)
	}
	if total != 1 || len(customers) != 1 {
		t.Fatalf("expected 1 customer, got total=%d len=%d", total, len(customers))
	}
	if customers[0].Latitude == nil || customers[0].Longitude == nil || *customers[0].Latitude != -8.5833 || *customers[0].Longitude != 116.1167 {
		t.Fatalf("expected joined coordinates, got %+v", customers[0])
	}

	// Alias canonicalization migrates location to canonical name
	if err := store.SetCustomerAlias(ctx, "RSUD NTB Alias", "RSUD Provinsi NTB", "Mataram"); err != nil {
		t.Fatalf("SetCustomerAlias failed: %v", err)
	}
	locs, err := store.GetCustomerLocations(ctx)
	if err != nil {
		t.Fatalf("GetCustomerLocations failed: %v", err)
	}
	if len(locs) != 1 || locs[0].Customer != "RSUD Provinsi NTB" {
		t.Fatalf("expected migrated location under canonical, got %+v", locs)
	}

	// Verify GetCustomerAliasesGrouped joins coordinates
	groups, err := store.GetCustomerAliasesGrouped(ctx)
	if err != nil {
		t.Fatalf("GetCustomerAliasesGrouped failed: %v", err)
	}
	if len(groups) != 1 || groups[0].Latitude == nil || *groups[0].Latitude != -8.5833 {
		t.Fatalf("expected group with coordinates, got %+v", groups)
	}

	// Survives SyncMirror and ClearData
	if err := store.SyncMirror(ctx, nil, nil); err != nil {
		t.Fatalf("SyncMirror empty failed: %v", err)
	}
	if err := store.ClearData(ctx); err != nil {
		t.Fatalf("ClearData failed: %v", err)
	}
	locs, err = store.GetCustomerLocations(ctx)
	if err != nil {
		t.Fatalf("GetCustomerLocations after clear failed: %v", err)
	}
	if len(locs) != 1 || locs[0].Customer != "RSUD Provinsi NTB" {
		t.Fatalf("expected location to survive SyncMirror and ClearData, got %+v", locs)
	}

	// Export and re-import round-trip
	exported, err := store.ExportCustomerAliasesJSON(ctx)
	if err != nil {
		t.Fatalf("ExportCustomerAliasesJSON failed: %v", err)
	}
	var doc CustomerAliasesDocument
	if err := json.Unmarshal(exported, &doc); err != nil {
		t.Fatalf("unmarshal export failed: %v", err)
	}
	if len(doc.Locations) != 1 || doc.Locations[0].Customer != "RSUD Provinsi NTB" {
		t.Fatalf("expected exported location, got %+v", doc)
	}

	// Import into fresh storage
	store2, err := New(":memory:")
	if err != nil {
		t.Fatalf("failed to create storage 2: %v", err)
	}
	t.Cleanup(func() { _ = store2.Close() })

	if _, err := store2.ImportCustomerAliasesJSON(ctx, exported, "replace"); err != nil {
		t.Fatalf("ImportCustomerAliasesJSON failed: %v", err)
	}
	locs2, err := store2.GetCustomerLocations(ctx)
	if err != nil {
		t.Fatalf("GetCustomerLocations store2 failed: %v", err)
	}
	if len(locs2) != 1 || locs2[0].Customer != "RSUD Provinsi NTB" || locs2[0].Latitude != -8.5833 {
		t.Fatalf("expected round-tripped location, got %+v", locs2)
	}

	// Invalid location payload rejects atomically
	badPayload := []byte(`{"version":1,"aliases":[],"locations":[{"customer":"X","latitude":120,"longitude":10}]}`)
	if _, err := store2.ImportCustomerAliasesJSON(ctx, badPayload, "replace"); !errors.Is(err, ErrValidation) {
		t.Fatalf("expected ErrValidation on bad location import, got %v", err)
	}
	locs2, _ = store2.GetCustomerLocations(ctx)
	if len(locs2) != 1 {
		t.Fatalf("expected existing locations untouched after failed import, got %+v", locs2)
	}
}
