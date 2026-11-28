package api_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/awang-karisma/warehouse-parser/pkg/api"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"github.com/awang-karisma/warehouse-parser/pkg/telemetry"
	"go.opentelemetry.io/otel/attribute"
	otellog "go.opentelemetry.io/otel/log"
	sdklog "go.opentelemetry.io/otel/sdk/log"
)

type testLogProcessor struct {
	mu      sync.Mutex
	records []sdklog.Record
}

func (p *testLogProcessor) Enabled(context.Context, sdklog.EnabledParameters) bool { return true }

func (p *testLogProcessor) OnEmit(_ context.Context, record *sdklog.Record) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.records = append(p.records, record.Clone())
	return nil
}

func (p *testLogProcessor) Shutdown(context.Context) error   { return nil }
func (p *testLogProcessor) ForceFlush(context.Context) error { return nil }

func (p *testLogProcessor) reset() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.records = nil
}

func (p *testLogProcessor) snapshot() []sdklog.Record {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]sdklog.Record, len(p.records))
	copy(out, p.records)
	return out
}

func attrsMap(r *sdklog.Record) map[string]attribute.Value {
	m := make(map[string]attribute.Value)
	r.WalkAttributes(func(kv attribute.KeyValue) bool {
		m[string(kv.Key)] = kv.Value
		return true
	})
	return m
}

func TestTelemetryMiddleware_CorrelationAndErrorLogging(t *testing.T) {
	proc := &testLogProcessor{}
	prev := telemetry.Default()
	t.Cleanup(func() { telemetry.SetDefault(prev) })

	provider, err := telemetry.Setup(context.Background(), telemetry.Config{
		ServiceName: "warehouse-parser-api-test",
		LogLevel:    "info",
		Processor:   proc,
	})
	if err != nil {
		t.Fatalf("telemetry.Setup failed: %v", err)
	}
	t.Cleanup(func() { _ = provider.Shutdown(context.Background()) })

	store, err := storage.New(":memory:")
	if err != nil {
		t.Fatalf("storage.New failed: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	srv := api.New(api.Config{Store: store})

	const (
		traceID     = "4bf92f3577b34da6a3ce929d0e0e4736"
		spanID      = "00f067aa0ba902b7"
		traceparent = "00-" + traceID + "-" + spanID + "-01"
	)

	t.Run("successful API request logs wide event and propagates headers", func(t *testing.T) {
		proc.reset()
		req := httptest.NewRequest(http.MethodGet, "/api/v1/orders", nil)
		req.Header.Set("traceparent", traceparent)
		req.Header.Set("X-PostHog-Session-Id", "sess-abc")
		req.Header.Set("X-PostHog-Distinct-Id", "user@example.com")
		req.Header.Set("X-Request-Id", "req-123")

		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}
		if got := resp.Header.Get("X-Request-Id"); got != "req-123" {
			t.Errorf("response X-Request-Id = %q, want req-123", got)
		}
		if got := resp.Header.Get("X-Trace-Id"); got != traceID {
			t.Errorf("response X-Trace-Id = %q, want %q", got, traceID)
		}

		records := proc.snapshot()
		if len(records) != 1 {
			t.Fatalf("expected 1 log record, got %d", len(records))
		}
		rec := records[0]
		if rec.Severity() != otellog.SeverityInfo {
			t.Errorf("severity = %v, want SeverityInfo", rec.Severity())
		}
		if rec.TraceID().String() != traceID {
			t.Errorf("TraceID = %q, want %q", rec.TraceID().String(), traceID)
		}
		if rec.SpanID().String() != spanID {
			t.Errorf("SpanID = %q, want %q", rec.SpanID().String(), spanID)
		}
		attrs := attrsMap(&rec)
		if got := attrs["event"].AsString(); got != "http.request.completed" {
			t.Errorf("event = %q, want http.request.completed", got)
		}
		if got := attrs["http.response.status_code"].AsInt64(); got != 200 {
			t.Errorf("http.response.status_code = %d, want 200", got)
		}
		if got := attrs[telemetry.AttrSessionID].AsString(); got != "sess-abc" {
			t.Errorf("sessionId = %q, want sess-abc", got)
		}
		if got := attrs[telemetry.AttrPostHogDistinctID].AsString(); got != "user@example.com" {
			t.Errorf("posthogDistinctId = %q, want user@example.com", got)
		}
		if got := attrs[telemetry.AttrRequestID].AsString(); got != "req-123" {
			t.Errorf("request_id = %q, want req-123", got)
		}
	})

	t.Run("failing 503 request logs SeverityError with handler detail", func(t *testing.T) {
		proc.reset()
		noStoreSrv := api.New(api.Config{Store: nil})

		req := httptest.NewRequest(http.MethodGet, "/api/v1/orders", nil)
		req.Header.Set("traceparent", traceparent)
		req.Header.Set("X-PostHog-Session-Id", "sess-abc")
		req.Header.Set("X-PostHog-Distinct-Id", "user@example.com")
		req.Header.Set("X-Request-Id", "req-123")

		resp, err := noStoreSrv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusServiceUnavailable {
			t.Fatalf("status = %d, want 503", resp.StatusCode)
		}

		records := proc.snapshot()
		if len(records) != 1 {
			t.Fatalf("expected 1 log record, got %d", len(records))
		}
		rec := records[0]
		if rec.Severity() != otellog.SeverityError {
			t.Errorf("severity = %v, want SeverityError", rec.Severity())
		}
		attrs := attrsMap(&rec)
		if got := attrs["event"].AsString(); got != "http.request.failed" {
			t.Errorf("event = %q, want http.request.failed", got)
		}
		if got := attrs["http.response.status_code"].AsInt64(); got != 503 {
			t.Errorf("http.response.status_code = %d, want 503", got)
		}
		if got := attrs["error.message"].AsString(); !strings.Contains(got, "storage service not available") {
			t.Errorf("error.message = %q, want substring 'storage service not available'", got)
		}
		if got := attrs[telemetry.AttrSessionID].AsString(); got != "sess-abc" {
			t.Errorf("sessionId = %q, want sess-abc", got)
		}
		if got := attrs[telemetry.AttrPostHogDistinctID].AsString(); got != "user@example.com" {
			t.Errorf("posthogDistinctId = %q, want user@example.com", got)
		}
		if got := attrs[telemetry.AttrRequestID].AsString(); got != "req-123" {
			t.Errorf("request_id = %q, want req-123", got)
		}
	})

	t.Run("healthy /health probe suppresses routine log noise", func(t *testing.T) {
		proc.reset()
		req := httptest.NewRequest(http.MethodGet, "/health", nil)

		resp, err := srv.App().Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}

		if records := proc.snapshot(); len(records) != 0 {
			t.Errorf("expected 0 log records for 200 /health, got %d", len(records))
		}
	})
}
