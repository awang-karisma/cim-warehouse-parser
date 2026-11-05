package storage

import (
	"context"
	"testing"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
)

func dailyTestOrder(status, id string) ([]model.NormalizedItem, []model.Order) {
	date := model.ParseDate("02/01/2026")
	item := model.NormalizedItem{RowIndex: 2, Tanggal: date, Customer: "Clinic A", NamaBarang: "Item", Jumlah: "1", StatusOrder: status}
	orderItem := model.OrderItem{RowIndex: 2, NamaBarang: "Item", Jumlah: "1", StatusOrder: status}
	order := model.Order{ID: id, Tanggal: date, Customer: "Clinic A", Items: []model.OrderItem{orderItem}}
	return []model.NormalizedItem{item}, []model.Order{order}
}

func TestDailyOrderStatusChanges(t *testing.T) {
	ctx := context.Background()
	s, err := New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	loc, err := time.LoadLocation("Asia/Makassar")
	if err != nil {
		t.Fatal(err)
	}
	syncAt := func(day int, status string, present bool) error {
		items, orders := dailyTestOrder(status, "ORD-0001")
		if !present {
			items, orders = nil, nil
		}
		instant := time.Date(2026, 2, 1, 8, 0, 0, 0, loc).AddDate(0, 0, day-1)
		return s.syncMirrorAt(ctx, items, orders, instant)
	}
	changes := func(day string) map[string]int {
		t.Helper()
		points, err := s.GetDailyOrderStatusChanges(ctx, day, day)
		if err != nil {
			t.Fatal(err)
		}
		if len(points) != 1 {
			t.Fatalf("%s: expected successful observation, got %#v", day, points)
		}
		return points[0].EnteredStatusCounts
	}
	if err := syncAt(1, "BELUM SELESAI", true); err != nil {
		t.Fatal(err)
	}
	if got := changes("2026-02-01"); got["BELUM SELESAI"] != 1 {
		t.Fatalf("initial appearance: %#v", got)
	}
	if err := syncAt(1, "BELUM SELESAI", true); err != nil {
		t.Fatal(err)
	}
	if got := changes("2026-02-01"); got["BELUM SELESAI"] != 1 {
		t.Fatalf("unchanged repeat should retain one daily appearance: %#v", got)
	}
	if err := syncAt(1, "PROSES", true); err != nil {
		t.Fatal(err)
	}
	if err := syncAt(1, "SELESAI", true); err != nil {
		t.Fatal(err)
	}
	if got := changes("2026-02-01"); len(got) != 1 || got["SELESAI"] != 1 {
		t.Fatalf("A-B-C final state: %#v", got)
	}
	if err := syncAt(2, "PROSES", true); err != nil {
		t.Fatal(err)
	}
	if err := syncAt(2, "SELESAI", true); err != nil {
		t.Fatal(err)
	}
	if got := changes("2026-02-02"); len(got) != 0 {
		t.Fatalf("reversal to baseline: %#v", got)
	}
	if err := syncAt(3, "", false); err != nil {
		t.Fatal(err)
	}
	if err := syncAt(3, "PENDING", true); err != nil {
		t.Fatal(err)
	}
	if got := changes("2026-02-03"); got["PENDING"] != 1 {
		t.Fatalf("disappear/reappear: %#v", got)
	}
	if err := syncAt(5, "BELUM SELESAI", true); err != nil {
		t.Fatal(err)
	}
	if got := changes("2026-02-05"); got["BELUM SELESAI"] != 1 {
		t.Fatalf("next-day transition: %#v", got)
	}
	if points, err := s.GetDailyOrderStatusChanges(ctx, "2026-02-04", "2026-02-04"); err != nil || len(points) != 0 {
		t.Fatalf("unsynced day should be absent: %#v %v", points, err)
	}
	if err := syncAt(6, "", false); err != nil {
		t.Fatal(err)
	}
	if got := changes("2026-02-06"); len(got) != 0 {
		t.Fatalf("empty successful mirror: %#v", got)
	}
	if err := s.ClearData(ctx); err != nil {
		t.Fatal(err)
	}
	if points, err := s.GetDailyOrderStatusChanges(ctx, "2026-02-01", "2026-02-10"); err != nil || len(points) != 0 {
		t.Fatalf("ClearData left observations: %#v %v", points, err)
	}
}

func TestDailyOrderStatusTrackingRejectsDuplicatesAndRollsBack(t *testing.T) {
	ctx := context.Background()
	s, err := New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	now := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)
	items, orders := dailyTestOrder("PROSES", "ORD-1")
	duplicate := orders[0]
	orders[0].OrderNumber = "PO-1"
	duplicate.OrderNumber = "PO-2"
	duplicate.ID = "ORD-2"
	orders = append(orders, duplicate)
	if err := s.syncMirrorAt(ctx, nil, orders, now); err == nil {
		t.Fatal("expected duplicate fallback identity to fail")
	}
	var orderCount, historyCount int
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM orders").Scan(&orderCount); err != nil {
		t.Fatal(err)
	}
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM sync_history").Scan(&historyCount); err != nil {
		t.Fatal(err)
	}
	if orderCount != 0 || historyCount != 0 {
		t.Fatalf("duplicate sync was not rolled back: orders=%d history=%d", orderCount, historyCount)
	}
	items, orders = dailyTestOrder("PROSES", "ORD-1")
	if _, err := s.db.ExecContext(ctx, `CREATE TRIGGER reject_daily_status BEFORE INSERT ON daily_order_statuses BEGIN SELECT RAISE(ABORT, 'rejected'); END`); err != nil {
		t.Fatal(err)
	}
	if err := s.syncMirrorAt(ctx, items, orders, now); err == nil {
		t.Fatal("expected tracking trigger to reject sync")
	}
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM orders").Scan(&orderCount); err != nil {
		t.Fatal(err)
	}
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM sync_history").Scan(&historyCount); err != nil {
		t.Fatal(err)
	}
	if orderCount != 0 || historyCount != 0 {
		t.Fatalf("tracking failure was not rolled back: orders=%d history=%d", orderCount, historyCount)
	}
}

func TestDailyOrderNumberIdentityStableAfterFirstObservation(t *testing.T) {
	ctx := context.Background()
	s, err := New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	loc, err := time.LoadLocation("Asia/Makassar")
	if err != nil {
		t.Fatal(err)
	}
	instant := time.Date(2026, 3, 1, 8, 0, 0, 0, loc)
	items, orders := dailyTestOrder("PROSES", "ORD-1")
	orders[0].OrderNumber = "PO-100"
	items[0].OrderNumber = "PO-100"
	if err := s.syncMirrorAt(ctx, items, orders, instant); err != nil {
		t.Fatal(err)
	}
	items[0].StatusOrder = "SELESAI"
	orders[0].Items[0].StatusOrder = "SELESAI"
	if err := s.syncMirrorAt(ctx, items, orders, instant.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	points, err := s.GetDailyOrderStatusChanges(ctx, "2026-03-01", "2026-03-01")
	if err != nil {
		t.Fatal(err)
	}
	if len(points) != 1 || len(points[0].EnteredStatusCounts) != 1 || points[0].EnteredStatusCounts["SELESAI"] != 1 {
		t.Fatalf("numbered order key changed within day: %+v", points)
	}
}
