package api_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
)

func TestDeliveryFlowCandidatesAPI(t *testing.T) {
	srv, store, _ := setupTestServer(t)

	// Ensure there are candidate orders
	orders := []model.Order{
		{
			ID:          "ORD-CAND-1",
			OrderNumber: "ORD-CAND-1",
			Tanggal:     model.ParseDate("01/02/2026"),
			Customer:    "RS Rinjani",
			Area:        "Lombok Timur",
			Items: []model.OrderItem{
				{
					RowIndex:      10,
					NamaBarang:    "Kasa Steril",
					Jumlah:        "50",
					BelumTerkirim: "50",
					StatusOrder:   "BELUM SELESAI",
					StatusBarang:  "STOK GUDANG",
				},
			},
		},
	}
	items := []model.NormalizedItem{
		{
			RowIndex:      10,
			Tanggal:       orders[0].Tanggal,
			Customer:      orders[0].Customer,
			Area:          orders[0].Area,
			NamaBarang:    "Kasa Steril",
			Jumlah:        "50",
			BelumTerkirim: "50",
			StatusOrder:   "BELUM SELESAI",
			StatusBarang:  "STOK GUDANG",
		},
	}
	if err := store.SyncMirror(context.Background(), items, orders); err != nil {
		t.Fatalf("failed to sync mirror: %v", err)
	}

	req, _ := http.NewRequest("GET", "/api/v1/delivery-flow/candidates", nil)
	resp, err := srv.App().Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var body struct {
		Orders []model.Order `json:"orders"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(body.Orders) != 1 {
		t.Fatalf("expected 1 candidate order, got %d", len(body.Orders))
	}
	if body.Orders[0].ID != "ORD-CAND-1" {
		t.Errorf("expected ORD-CAND-1, got %s", body.Orders[0].ID)
	}
	if len(body.Orders[0].Items) != 1 {
		t.Errorf("expected 1 item, got %d", len(body.Orders[0].Items))
	}
}

func TestDeliveryDriversAPI(t *testing.T) {
	srv, _, _ := setupTestServer(t)

	// List initial drivers (empty)
	req, _ := http.NewRequest("GET", "/api/v1/delivery-drivers", nil)
	resp, err := srv.App().Test(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/v1/delivery-drivers failed, status: %d", resp.StatusCode)
	}
	var listBody struct {
		Drivers []model.DeliveryDriver `json:"drivers"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&listBody)
	if len(listBody.Drivers) != 0 {
		t.Fatalf("expected 0 drivers initially, got %d", len(listBody.Drivers))
	}

	// Validation reject empty name
	req, _ = http.NewRequest("POST", "/api/v1/delivery-drivers", strings.NewReader(`{"name": "   "}`))
	req.Header.Set("Content-Type", "application/json")
	resp, _ = srv.App().Test(req)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty driver name, got %d", resp.StatusCode)
	}

	// Create driver
	createPayload := `{"name": "Ahmad Dani", "phone": "0812345678", "vehicle": "Carry Futura"}`
	req, _ = http.NewRequest("POST", "/api/v1/delivery-drivers", strings.NewReader(createPayload))
	req.Header.Set("Content-Type", "application/json")
	resp, err = srv.App().Test(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/v1/delivery-drivers failed: %v, status: %d", err, resp.StatusCode)
	}
	var createBody struct {
		Status string               `json:"status"`
		ID     int64                `json:"id"`
		Driver model.DeliveryDriver `json:"driver"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&createBody)
	if createBody.ID <= 0 || createBody.Driver.Name != "Ahmad Dani" {
		t.Fatalf("unexpected create response: %+v", createBody)
	}
	driverID := createBody.ID

	// Duplicate driver name returns 400
	req, _ = http.NewRequest("POST", "/api/v1/delivery-drivers", strings.NewReader(createPayload))
	req.Header.Set("Content-Type", "application/json")
	resp, _ = srv.App().Test(req)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for duplicate name, got %d", resp.StatusCode)
	}

	// Update driver
	updatePayload := `{"name": "Ahmad Dani Updated", "phone": "0899999999", "vehicle": "Blind Van", "active": true}`
	req, _ = http.NewRequest("PUT", fmt.Sprintf("/api/v1/delivery-drivers/%d", driverID), strings.NewReader(updatePayload))
	req.Header.Set("Content-Type", "application/json")
	resp, _ = srv.App().Test(req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PUT /api/v1/delivery-drivers/{id} failed: %d", resp.StatusCode)
	}

	// Update non-existent returns 404
	req, _ = http.NewRequest("PUT", "/api/v1/delivery-drivers/9999", strings.NewReader(updatePayload))
	req.Header.Set("Content-Type", "application/json")
	resp, _ = srv.App().Test(req)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for non-existent driver, got %d", resp.StatusCode)
	}

	// Delete driver
	req, _ = http.NewRequest("DELETE", fmt.Sprintf("/api/v1/delivery-drivers/%d", driverID), nil)
	resp, _ = srv.App().Test(req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("DELETE /api/v1/delivery-drivers/{id} failed: %d", resp.StatusCode)
	}

	// Delete again returns 404
	req, _ = http.NewRequest("DELETE", fmt.Sprintf("/api/v1/delivery-drivers/%d", driverID), nil)
	resp, _ = srv.App().Test(req)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for deleting already deleted driver, got %d", resp.StatusCode)
	}
}

func TestDeliveryRunsAPI(t *testing.T) {
	srv, _, _ := setupTestServer(t)

	// Validation: rejects missing delivery date or empty items
	req, _ := http.NewRequest("POST", "/api/v1/delivery-runs", strings.NewReader(`{"driver_name": "", "delivery_date": "", "items": []}`))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := srv.App().Test(req)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty run fields, got %d", resp.StatusCode)
	}

	// Create valid run
	runJSON := `{
		"title": "East Lombok Batch 1",
		"driver_name": "Pak Joko",
		"areas": ["Lombok Timur"],
		"delivery_date": "2026-02-15",
		"notes": "Handle with care",
		"items": [
			{
				"order_id": "ORD-100",
				"customer": "Puskesmas Selong",
				"area": "Lombok Timur",
				"nama_barang": "Spuit 3cc",
				"satuan": "BOX",
				"jumlah": "50",
				"belum_terkirim": "50",
				"planned_qty": "25",
				"status_order": "BELUM SELESAI",
				"status_barang": "STOK GUDANG",
				"keterangan": "Urgent"
			},
			{
				"order_id": "ORD-101",
				"customer": "Puskesmas Aikmel",
				"area": "Lombok Timur",
				"nama_barang": "Infus D5",
				"satuan": "KARTON",
				"jumlah": "10",
				"belum_terkirim": "10",
				"planned_qty": "10",
				"status_order": "BELUM SELESAI",
				"status_barang": "STOK GUDANG"
			}
		]
	}`
	req, _ = http.NewRequest("POST", "/api/v1/delivery-runs", strings.NewReader(runJSON))
	req.Header.Set("Content-Type", "application/json")
	resp, err := srv.App().Test(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/v1/delivery-runs failed: %v, status: %d", err, resp.StatusCode)
	}

	var createRunBody struct {
		Status string            `json:"status"`
		ID     int64             `json:"id"`
		Run    model.DeliveryRun `json:"run"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&createRunBody); err != nil {
		t.Fatalf("failed to decode create run response: %v", err)
	}
	runID := createRunBody.ID
	if runID <= 0 || len(createRunBody.Run.Items) != 2 {
		t.Fatalf("unexpected create run output: %+v", createRunBody)
	}

	// Get run by ID
	req, _ = http.NewRequest("GET", fmt.Sprintf("/api/v1/delivery-runs/%d", runID), nil)
	resp, _ = srv.App().Test(req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/v1/delivery-runs/{id} failed: %d", resp.StatusCode)
	}

	var getRunBody struct {
		Run model.DeliveryRun `json:"run"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&getRunBody)
	if getRunBody.Run.Title != "East Lombok Batch 1" || getRunBody.Run.Status != "PLANNED" {
		t.Errorf("unexpected run details: %+v", getRunBody.Run)
	}

	// Toggle pick first item
	item1ID := getRunBody.Run.Items[0].ID
	item2ID := getRunBody.Run.Items[1].ID

	pickPayload := `{"picked": true}`
	req, _ = http.NewRequest("PATCH", fmt.Sprintf("/api/v1/delivery-runs/%d/items/%d/pick", runID, item1ID), strings.NewReader(pickPayload))
	req.Header.Set("Content-Type", "application/json")
	resp, _ = srv.App().Test(req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PATCH toggle pick failed: %d", resp.StatusCode)
	}

	var pickResp struct {
		Status string            `json:"status"`
		Run    model.DeliveryRun `json:"run"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&pickResp)
	if pickResp.Run.Status != "PICKING" || pickResp.Run.PickedItems != 1 {
		t.Errorf("expected status PICKING and 1 picked item, got status %s, picked %d", pickResp.Run.Status, pickResp.Run.PickedItems)
	}

	// Toggle pick second item -> auto READY
	req, _ = http.NewRequest("PATCH", fmt.Sprintf("/api/v1/delivery-runs/%d/items/%d/pick", runID, item2ID), strings.NewReader(pickPayload))
	req.Header.Set("Content-Type", "application/json")
	resp, _ = srv.App().Test(req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PATCH toggle pick 2 failed: %d", resp.StatusCode)
	}
	_ = json.NewDecoder(resp.Body).Decode(&pickResp)
	if pickResp.Run.Status != "READY" || pickResp.Run.PickedItems != 2 {
		t.Errorf("expected status READY and 2 picked items, got %s, %d", pickResp.Run.Status, pickResp.Run.PickedItems)
	}

	// Status update to DISPATCHED
	req, _ = http.NewRequest("PATCH", fmt.Sprintf("/api/v1/delivery-runs/%d/status", runID), strings.NewReader(`{"status": "DISPATCHED"}`))
	req.Header.Set("Content-Type", "application/json")
	resp, _ = srv.App().Test(req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PATCH status update failed: %d", resp.StatusCode)
	}
	_ = json.NewDecoder(resp.Body).Decode(&pickResp)
	if pickResp.Run.Status != "DISPATCHED" {
		t.Errorf("expected status DISPATCHED, got %s", pickResp.Run.Status)
	}

	// Invalid status update returns 400
	req, _ = http.NewRequest("PATCH", fmt.Sprintf("/api/v1/delivery-runs/%d/status", runID), strings.NewReader(`{"status": "INVALID_STATUS"}`))
	req.Header.Set("Content-Type", "application/json")
	resp, _ = srv.App().Test(req)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid status, got %d", resp.StatusCode)
	}

	// Reassign driver via PATCH /api/v1/delivery-runs/{id}/driver (e.g. sudden driver change)
	driverPatchPayload := `{"driver_id": 42, "driver_name": "Pak Slamet (Sub)"}`
	req, _ = http.NewRequest("PATCH", fmt.Sprintf("/api/v1/delivery-runs/%d/driver", runID), strings.NewReader(driverPatchPayload))
	req.Header.Set("Content-Type", "application/json")
	resp, _ = srv.App().Test(req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PATCH driver update failed: %d", resp.StatusCode)
	}
	_ = json.NewDecoder(resp.Body).Decode(&pickResp)
	if pickResp.Run.DriverName != "Pak Slamet (Sub)" || pickResp.Run.DriverID != 42 {
		t.Errorf("expected driver to be updated to Pak Slamet (Sub), got %s", pickResp.Run.DriverName)
	}

	// Update entire run
	updatedRunJSON := `{
		"title": "East Lombok Batch 1 - Final",
		"driver_name": "Pak Joko",
		"areas": ["Lombok Timur"],
		"delivery_date": "2026-02-15",
		"status": "DISPATCHED",
		"items": [
			{
				"order_id": "ORD-100",
				"customer": "Puskesmas Selong",
				"area": "Lombok Timur",
				"nama_barang": "Spuit 3cc",
				"satuan": "BOX",
				"jumlah": "50",
				"belum_terkirim": "50",
				"planned_qty": "30",
				"status_order": "BELUM SELESAI",
				"status_barang": "STOK GUDANG"
			}
		]
	}`
	req, _ = http.NewRequest("PUT", fmt.Sprintf("/api/v1/delivery-runs/%d", runID), strings.NewReader(updatedRunJSON))
	req.Header.Set("Content-Type", "application/json")
	resp, _ = srv.App().Test(req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PUT /api/v1/delivery-runs/{id} failed: %d", resp.StatusCode)
	}

	// Filter runs list
	req, _ = http.NewRequest("GET", "/api/v1/delivery-runs?delivery_date=2026-02-15&status=DISPATCHED", nil)
	resp, _ = srv.App().Test(req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/v1/delivery-runs with filter failed: %d", resp.StatusCode)
	}
	var runsListBody struct {
		Runs []model.DeliveryRun `json:"runs"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&runsListBody)
	if len(runsListBody.Runs) != 1 {
		t.Fatalf("expected 1 filtered run, got %d", len(runsListBody.Runs))
	}

	// Delete run
	req, _ = http.NewRequest("DELETE", fmt.Sprintf("/api/v1/delivery-runs/%d", runID), nil)
	resp, _ = srv.App().Test(req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("DELETE /api/v1/delivery-runs/{id} failed: %d", resp.StatusCode)
	}

	// Get deleted run returns 404
	req, _ = http.NewRequest("GET", fmt.Sprintf("/api/v1/delivery-runs/%d", runID), nil)
	resp, _ = srv.App().Test(req)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for deleted run, got %d", resp.StatusCode)
	}
}
