package telemetry_test

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/awang-karisma/warehouse-parser/pkg/telemetry"
	"go.opentelemetry.io/otel/attribute"
	otellog "go.opentelemetry.io/otel/log"
	sdklog "go.opentelemetry.io/otel/sdk/log"
)

type memoryProcessor struct {
	mu      sync.Mutex
	records []sdklog.Record
}

func (m *memoryProcessor) Enabled(context.Context, sdklog.EnabledParameters) bool { return true }

func (m *memoryProcessor) OnEmit(_ context.Context, record *sdklog.Record) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.records = append(m.records, record.Clone())
	return nil
}

func (m *memoryProcessor) Shutdown(context.Context) error   { return nil }
func (m *memoryProcessor) ForceFlush(context.Context) error { return nil }

func (m *memoryProcessor) snapshot() []sdklog.Record {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]sdklog.Record, len(m.records))
	copy(out, m.records)
	return out
}

func recordAttrs(r *sdklog.Record) map[string]attribute.Value {
	attrs := make(map[string]attribute.Value)
	r.WalkAttributes(func(kv attribute.KeyValue) bool {
		attrs[string(kv.Key)] = kv.Value
		return true
	})
	return attrs
}

func TestParseLogLevel(t *testing.T) {
	tests := []struct {
		raw      string
		wantLvl  telemetry.LogLevel
		wantSev  otellog.Severity
		wantFail bool
	}{
		{"", telemetry.LevelInfo, otellog.SeverityInfo, false},
		{"INFO", telemetry.LevelInfo, otellog.SeverityInfo, false},
		{"debug", telemetry.LevelDebug, otellog.SeverityDebug, false},
		{"warn", telemetry.LevelWarn, otellog.SeverityWarn, false},
		{"WARNING", telemetry.LevelWarn, otellog.SeverityWarn, false},
		{"error", telemetry.LevelError, otellog.SeverityError, false},
		{"verbose", "", otellog.SeverityUndefined, true},
	}

	for _, tc := range tests {
		lvl, sev, err := telemetry.ParseLogLevel(tc.raw)
		if tc.wantFail {
			if err == nil {
				t.Errorf("ParseLogLevel(%q) expected error, got nil", tc.raw)
			}
			continue
		}
		if err != nil {
			t.Errorf("ParseLogLevel(%q) unexpected error: %v", tc.raw, err)
			continue
		}
		if lvl != tc.wantLvl || sev != tc.wantSev {
			t.Errorf("ParseLogLevel(%q) = (%q, %v), want (%q, %v)", tc.raw, lvl, sev, tc.wantLvl, tc.wantSev)
		}
	}
}

func TestResolveEndpointURL(t *testing.T) {
	tests := []struct {
		raw      string
		want     string
		wantFail bool
	}{
		{"", "https://us.i.posthog.com/i/v1/logs", false},
		{"https://us.i.posthog.com", "https://us.i.posthog.com/i/v1/logs", false},
		{"https://eu.i.posthog.com/", "https://eu.i.posthog.com/i/v1/logs", false},
		{"https://us.i.posthog.com/i/v1/logs", "https://us.i.posthog.com/i/v1/logs", false},
		{"https://us.i.posthog.com/i/v1/logs?foo=bar#frag", "https://us.i.posthog.com/i/v1/logs", false},
		{"http://localhost:4318/v1/logs", "http://localhost:4318/v1/logs", false},
		{"ftp://us.i.posthog.com", "", true},
		{"://bad", "", true},
		{"https://", "", true},
	}

	for _, tc := range tests {
		got, err := telemetry.ResolveEndpointURL(tc.raw)
		if tc.wantFail {
			if err == nil {
				t.Errorf("ResolveEndpointURL(%q) expected error, got %q", tc.raw, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("ResolveEndpointURL(%q) unexpected error: %v", tc.raw, err)
			continue
		}
		if got != tc.want {
			t.Errorf("ResolveEndpointURL(%q) = %q, want %q", tc.raw, got, tc.want)
		}
	}
}

func TestStartRequestContextAndEmit(t *testing.T) {
	proc := &memoryProcessor{}
	prev := telemetry.Default()
	t.Cleanup(func() { telemetry.SetDefault(prev) })

	provider, err := telemetry.Setup(context.Background(), telemetry.Config{
		ServiceName:    "warehouse-parser-api",
		ServiceVersion: "v1.2.3",
		Environment:    "staging",
		LogLevel:       "info",
		Processor:      proc,
	})
	if err != nil {
		t.Fatalf("Setup failed: %v", err)
	}
	t.Cleanup(func() { _ = provider.Shutdown(context.Background()) })

	if !provider.Enabled() {
		t.Fatalf("expected provider.Enabled() == true")
	}

	ctx, corr := telemetry.StartRequestContext(context.Background(), map[string]string{
		"traceparent":           "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
		"X-PostHog-Session-Id":  "01932d1f-1234-7000-8000-000000000001",
		"X-PostHog-Distinct-Id": "operator@example.com",
		"X-PostHog-Window-Id":   "win-1",
		"X-Request-Id":          "req-99",
	})
	corr.UserRole = "admin"
	corr.OperationID = "list-orders"

	// Below minimum severity (info) should be dropped.
	telemetry.Emit(ctx, telemetry.Event{
		Name:     "debug.ignored",
		Severity: otellog.SeverityDebug,
		Body:     "ignored debug message",
	})

	telemetry.Emit(ctx, telemetry.Event{
		Name:     "http.request.completed",
		Severity: otellog.SeverityInfo,
		Body:     "GET /api/v1/orders 200 (12ms)",
		Err:      errors.New("boom"),
		Attributes: []attribute.KeyValue{
			attribute.Int("http.response.status_code", 200),
		},
	})

	records := proc.snapshot()
	if len(records) != 1 {
		t.Fatalf("expected 1 emitted record, got %d", len(records))
	}

	rec := records[0]
	if rec.TraceID().String() != "4bf92f3577b34da6a3ce929d0e0e4736" {
		t.Errorf("TraceID = %q, want 4bf92f3577b34da6a3ce929d0e0e4736", rec.TraceID().String())
	}
	if rec.SpanID().String() != "00f067aa0ba902b7" {
		t.Errorf("SpanID = %q, want 00f067aa0ba902b7", rec.SpanID().String())
	}
	if rec.EventName() != "http.request.completed" {
		t.Errorf("EventName = %q, want http.request.completed", rec.EventName())
	}
	if rec.SeverityText() != "INFO" {
		t.Errorf("SeverityText = %q, want INFO", rec.SeverityText())
	}

	attrs := recordAttrs(&rec)
	wantStrings := map[string]string{
		telemetry.AttrPostHogDistinctID: "operator@example.com",
		telemetry.AttrSessionID:         "01932d1f-1234-7000-8000-000000000001",
		telemetry.AttrWindowID:          "win-1",
		telemetry.AttrRequestID:         "req-99",
		telemetry.AttrTraceID:           "4bf92f3577b34da6a3ce929d0e0e4736",
		telemetry.AttrSpanID:            "00f067aa0ba902b7",
		"user_role":                     "admin",
		"operation_id":                  "list-orders",
		"event":                         "http.request.completed",
	}
	for k, want := range wantStrings {
		got, ok := attrs[k]
		if !ok || got.AsString() != want {
			t.Errorf("attr[%q] = %v (present=%v), want %q", k, got, ok, want)
		}
	}
	if got, ok := attrs["http.response.status_code"]; !ok || got.AsInt64() != 200 {
		t.Errorf("attr[http.response.status_code] = %v (present=%v), want 200", got, ok)
	}
	if got, ok := attrs["exception.message"]; !ok || got.AsString() != "boom" {
		t.Errorf("attr[exception.message] = %v (present=%v), want boom", got, ok)
	}
}

func TestStartRequestContextGeneratesIDsAndStripsCookieless(t *testing.T) {
	_, corr := telemetry.StartRequestContext(context.Background(), map[string]string{
		"X-PostHog-Distinct-Id": "$posthog_cookieless",
	})
	if !corr.TraceID.IsValid() {
		t.Errorf("expected generated TraceID to be valid")
	}
	if !corr.SpanID.IsValid() {
		t.Errorf("expected generated SpanID to be valid")
	}
	if corr.RequestID != corr.TraceID.String() {
		t.Errorf("expected default RequestID=%q to match TraceID, got %q", corr.TraceID.String(), corr.RequestID)
	}
	if corr.DistinctID != "" {
		t.Errorf("expected $posthog_cookieless to be cleared, got %q", corr.DistinctID)
	}
}

func TestSetupNoOpWhenUnconfigured(t *testing.T) {
	prev := telemetry.Default()
	t.Cleanup(func() { telemetry.SetDefault(prev) })

	provider, err := telemetry.Setup(context.Background(), telemetry.Config{})
	if err != nil {
		t.Fatalf("Setup unconfigured failed: %v", err)
	}
	t.Cleanup(func() { _ = provider.Shutdown(context.Background()) })

	if provider.Enabled() {
		t.Errorf("expected provider.Enabled() == false when APIKey is empty")
	}
	// Should be a safe no-op.
	telemetry.Emit(context.Background(), telemetry.Event{
		Name:     "noop.event",
		Severity: otellog.SeverityError,
		Body:     "should not panic or export",
	})
}

func TestOTLPHTTPExporterWiring(t *testing.T) {
	var (
		mu          sync.Mutex
		gotMethod   string
		gotPath     string
		gotAuth     string
		gotCT       string
		gotPayload  []byte
		requestSeen bool
	)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var reader io.Reader = r.Body
		if strings.EqualFold(r.Header.Get("Content-Encoding"), "gzip") {
			gz, err := gzip.NewReader(r.Body)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			defer gz.Close()
			reader = gz
		}
		body, _ := io.ReadAll(reader)
		mu.Lock()
		gotMethod = r.Method
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		gotCT = r.Header.Get("Content-Type")
		gotPayload = body
		requestSeen = true
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	prev := telemetry.Default()
	t.Cleanup(func() { telemetry.SetDefault(prev) })

	ctx := context.Background()
	provider, err := telemetry.Setup(ctx, telemetry.Config{
		APIKey: "phc_test_token_123",
		Host:   srv.URL,
	})
	if err != nil {
		t.Fatalf("Setup with OTLP HTTP exporter failed: %v", err)
	}

	reqCtx, _ := telemetry.StartRequestContext(ctx, map[string]string{
		"X-PostHog-Distinct-Id": "warehouse-op@example.com",
		"X-PostHog-Session-Id":  "sess-otlp-1",
	})

	telemetry.Emit(reqCtx, telemetry.Event{
		Name:     "otlp.wire.check",
		Severity: otellog.SeverityError,
		Body:     "posthog otlp export payload check",
	})

	if err := provider.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown failed: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()

	if !requestSeen {
		t.Fatalf("expected OTLP server to receive POST /i/v1/logs request")
	}
	if gotMethod != http.MethodPost {
		t.Errorf("method = %q, want POST", gotMethod)
	}
	if gotPath != "/i/v1/logs" {
		t.Errorf("path = %q, want /i/v1/logs", gotPath)
	}
	if gotAuth != "Bearer phc_test_token_123" {
		t.Errorf("Authorization = %q, want %q", gotAuth, "Bearer phc_test_token_123")
	}
	if !strings.HasPrefix(gotCT, "application/x-protobuf") {
		t.Errorf("Content-Type = %q, want application/x-protobuf", gotCT)
	}
	if len(gotPayload) == 0 {
		t.Fatalf("expected non-empty OTLP protobuf payload")
	}
	if !bytes.Contains(gotPayload, []byte("posthog otlp export payload check")) {
		t.Errorf("OTLP payload does not contain expected log body")
	}
	if !bytes.Contains(gotPayload, []byte(telemetry.AttrPostHogDistinctID)) || !bytes.Contains(gotPayload, []byte("warehouse-op@example.com")) {
		t.Errorf("OTLP payload does not contain posthogDistinctId attribute")
	}
}
