// Package telemetry provides structured OpenTelemetry (OTLP/HTTP) logging
// to PostHog with end-to-end W3C trace and session correlation.
package telemetry

import (
	"context"
	"crypto/rand"
	"fmt"
	"net/url"
	"strings"
	"sync/atomic"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/version"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	otellog "go.opentelemetry.io/otel/log"
	"go.opentelemetry.io/otel/propagation"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	"go.opentelemetry.io/otel/sdk/resource"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"go.opentelemetry.io/otel/trace"
)

const (
	DefaultHost        = "https://us.i.posthog.com"
	DefaultServiceName = "warehouse-parser-api"
	DefaultEnvironment = "production"
	LogsPath           = "/i/v1/logs"

	HeaderPostHogSessionID  = "X-PostHog-Session-Id"
	HeaderPostHogDistinctID = "X-PostHog-Distinct-Id"
	HeaderPostHogWindowID   = "X-PostHog-Window-Id"
	HeaderRequestID         = "X-Request-Id"
	HeaderTraceID           = "X-Trace-Id"
	HeaderTraceparent       = "traceparent"

	AttrPostHogDistinctID = "posthogDistinctId"
	AttrSessionID         = "sessionId"
	AttrWindowID          = "window.id"
	AttrRequestID         = "request_id"
	AttrTraceID           = "trace_id"
	AttrSpanID            = "span_id"

	cookielessDistinctID = "$posthog_cookieless"
)

// LogLevel is the closed vocabulary for minimum exported backend log severity.
type LogLevel string

const (
	LevelDebug LogLevel = "debug"
	LevelInfo  LogLevel = "info"
	LevelWarn  LogLevel = "warn"
	LevelError LogLevel = "error"
)

// ParseLogLevel validates and maps a configured log level name to its canonical
// LogLevel value and OpenTelemetry minimum severity.
func ParseLogLevel(raw string) (LogLevel, otellog.Severity, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", string(LevelInfo):
		return LevelInfo, otellog.SeverityInfo, nil
	case string(LevelDebug):
		return LevelDebug, otellog.SeverityDebug, nil
	case string(LevelWarn), "warning":
		return LevelWarn, otellog.SeverityWarn, nil
	case string(LevelError):
		return LevelError, otellog.SeverityError, nil
	default:
		return "", otellog.SeverityUndefined, fmt.Errorf("invalid POSTHOG_LOG_LEVEL %q: must be debug, info, warn, or error", raw)
	}
}

// ResolveEndpointURL normalizes a PostHog host or full OTLP logs URL into a
// clean endpoint URL accepted by otlploghttp.WithEndpointURL.
func ResolveEndpointURL(rawHost string) (string, error) {
	host := strings.TrimSpace(rawHost)
	if host == "" {
		host = DefaultHost
	}

	u, err := url.Parse(host)
	if err != nil {
		return "", fmt.Errorf("invalid POSTHOG_HOST %q: %w", rawHost, err)
	}
	if (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "", fmt.Errorf("invalid POSTHOG_HOST %q: must be an http or https URL with host", rawHost)
	}

	u.RawQuery = ""
	u.Fragment = ""

	path := strings.TrimRight(u.Path, "/")
	switch {
	case path == "":
		u.Path = LogsPath
	case strings.HasSuffix(path, LogsPath) || strings.HasSuffix(path, "/v1/logs"):
		u.Path = path
	default:
		u.Path = path + LogsPath
	}

	return u.String(), nil
}

// Config configures the PostHog OpenTelemetry log provider.
type Config struct {
	APIKey         string
	Host           string
	ServiceName    string
	ServiceVersion string
	Environment    string
	LogLevel       string
	Processor      sdklog.Processor // Optional test override; when nil, uses BatchProcessor(otlploghttp) if APIKey != ""
}

// Provider manages the OpenTelemetry LoggerProvider lifecycle and structured event emission.
type Provider struct {
	sdkProvider *sdklog.LoggerProvider
	logger      otellog.Logger
	minSeverity otellog.Severity
	enabled     bool
}

var defaultProvider atomic.Pointer[Provider]

// Default returns the active package-level telemetry provider (may be nil before Setup).
func Default() *Provider {
	return defaultProvider.Load()
}

// SetDefault installs p as the package-level telemetry provider.
func SetDefault(p *Provider) {
	defaultProvider.Store(p)
}

// Setup initializes an OpenTelemetry LoggerProvider, installs it globally, and
// registers it as the package default. When APIKey and Processor are both empty,
// a zero-overhead no-op provider is returned.
func Setup(ctx context.Context, cfg Config) (*Provider, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	_, minSeverity, err := ParseLogLevel(cfg.LogLevel)
	if err != nil {
		return nil, err
	}

	serviceName := strings.TrimSpace(cfg.ServiceName)
	if serviceName == "" {
		serviceName = DefaultServiceName
	}
	serviceVersion := strings.TrimSpace(cfg.ServiceVersion)
	if serviceVersion == "" {
		serviceVersion = version.Version
	}
	environment := strings.TrimSpace(cfg.Environment)
	if environment == "" {
		environment = DefaultEnvironment
	}

	res := resource.NewWithAttributes(
		semconv.SchemaURL,
		semconv.ServiceName(serviceName),
		semconv.ServiceVersion(serviceVersion),
		semconv.DeploymentEnvironment(environment),
	)

	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	apiKey := strings.TrimSpace(cfg.APIKey)

	var (
		sdkProvider *sdklog.LoggerProvider
		enabled     bool
	)
	switch {
	case cfg.Processor != nil:
		sdkProvider = sdklog.NewLoggerProvider(
			sdklog.WithResource(res),
			sdklog.WithProcessor(cfg.Processor),
		)
		enabled = true
	case apiKey != "":
		endpointURL, err := ResolveEndpointURL(cfg.Host)
		if err != nil {
			return nil, err
		}
		exporter, err := otlploghttp.New(
			ctx,
			otlploghttp.WithEndpointURL(endpointURL),
			otlploghttp.WithHeaders(map[string]string{
				"Authorization": "Bearer " + apiKey,
			}),
		)
		if err != nil {
			return nil, fmt.Errorf("failed to initialize OTLP log exporter: %w", err)
		}
		sdkProvider = sdklog.NewLoggerProvider(
			sdklog.WithResource(res),
			sdklog.WithProcessor(sdklog.NewBatchProcessor(exporter)),
		)
		enabled = true
	default:
		sdkProvider = sdklog.NewLoggerProvider(
			sdklog.WithResource(res),
		)
		enabled = false
	}

	otel.SetLoggerProvider(sdkProvider)

	p := &Provider{
		sdkProvider: sdkProvider,
		logger:      sdkProvider.Logger(serviceName),
		minSeverity: minSeverity,
		enabled:     enabled,
	}
	SetDefault(p)
	return p, nil
}

// Enabled reports whether log records will be emitted to a configured processor/exporter.
func (p *Provider) Enabled() bool {
	return p != nil && p.enabled
}

// Shutdown flushes pending log records and releases underlying SDK resources.
func (p *Provider) Shutdown(ctx context.Context) error {
	if p == nil || p.sdkProvider == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	return p.sdkProvider.Shutdown(ctx)
}

// Correlation holds request-scoped tracing, PostHog session/person, and error metadata.
type Correlation struct {
	RequestID   string
	TraceID     trace.TraceID
	SpanID      trace.SpanID
	SessionID   string
	DistinctID  string
	WindowID    string
	UserRole    string
	OperationID string
	HandlerErr  error
	PanicStack  string
}

type correlationContextKey struct{}

// Event describes a structured wide-event log record to emit via OpenTelemetry.
type Event struct {
	Name       string
	Severity   otellog.Severity
	Body       string
	Err        error
	Attributes []attribute.KeyValue
}

// StartRequestContext extracts W3C traceparent and PostHog correlation headers
// into ctx, generating a fresh random trace/span ID when none is supplied.
func StartRequestContext(ctx context.Context, headers map[string]string) (context.Context, *Correlation) {
	if ctx == nil {
		ctx = context.Background()
	}

	lowerHeaders := make(map[string]string, len(headers))
	for k, v := range headers {
		trimmed := strings.TrimSpace(v)
		if trimmed != "" {
			lowerHeaders[strings.ToLower(k)] = trimmed
		}
	}

	extractedCtx := (propagation.TraceContext{}).Extract(ctx, propagation.MapCarrier(lowerHeaders))
	sc := trace.SpanContextFromContext(extractedCtx)
	if !sc.IsValid() {
		sc = trace.NewSpanContext(trace.SpanContextConfig{
			TraceID:    randomTraceID(),
			SpanID:     randomSpanID(),
			TraceFlags: trace.FlagsSampled,
		})
		extractedCtx = trace.ContextWithSpanContext(extractedCtx, sc)
	}

	requestID := lowerHeaders[strings.ToLower(HeaderRequestID)]
	if requestID == "" {
		requestID = sc.TraceID().String()
	}

	distinctID := lowerHeaders[strings.ToLower(HeaderPostHogDistinctID)]
	if distinctID == cookielessDistinctID {
		distinctID = ""
	}

	corr := &Correlation{
		RequestID:  requestID,
		TraceID:    sc.TraceID(),
		SpanID:     sc.SpanID(),
		SessionID:  lowerHeaders[strings.ToLower(HeaderPostHogSessionID)],
		DistinctID: distinctID,
		WindowID:   lowerHeaders[strings.ToLower(HeaderPostHogWindowID)],
	}

	extractedCtx = context.WithValue(extractedCtx, correlationContextKey{}, corr)
	return extractedCtx, corr
}

// CorrelationFromContext retrieves the request-scoped Correlation from ctx, if present.
func CorrelationFromContext(ctx context.Context) *Correlation {
	if ctx == nil {
		return nil
	}
	corr, _ := ctx.Value(correlationContextKey{}).(*Correlation)
	return corr
}

// Emit emits evt using the package-level default provider.
func Emit(ctx context.Context, evt Event) {
	Default().Emit(ctx, evt)
}

// Emit builds an OpenTelemetry log record enriched with request correlation and
// emits it if the provider is enabled and evt.Severity meets the configured threshold.
func (p *Provider) Emit(ctx context.Context, evt Event) {
	if p == nil || !p.enabled || evt.Severity < p.minSeverity {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}

	now := time.Now()
	var record otellog.Record
	record.SetTimestamp(now)
	record.SetObservedTimestamp(now)
	record.SetSeverity(evt.Severity)
	record.SetSeverityText(severityText(evt.Severity))
	record.SetBody(attribute.StringValue(evt.Body))

	attrs := make([]attribute.KeyValue, 0, len(evt.Attributes)+10)
	if evt.Name != "" {
		record.SetEventName(evt.Name)
		attrs = append(attrs, attribute.String("event", evt.Name))
	}
	if evt.Err != nil {
		record.SetErr(evt.Err)
	}

	if corr := CorrelationFromContext(ctx); corr != nil {
		if !trace.SpanContextFromContext(ctx).IsValid() && corr.TraceID.IsValid() {
			ctx = trace.ContextWithSpanContext(ctx, trace.NewSpanContext(trace.SpanContextConfig{
				TraceID:    corr.TraceID,
				SpanID:     corr.SpanID,
				TraceFlags: trace.FlagsSampled,
			}))
		}
		if corr.DistinctID != "" {
			attrs = append(attrs, attribute.String(AttrPostHogDistinctID, corr.DistinctID))
		}
		if corr.SessionID != "" {
			attrs = append(attrs, attribute.String(AttrSessionID, corr.SessionID))
		}
		if corr.WindowID != "" {
			attrs = append(attrs, attribute.String(AttrWindowID, corr.WindowID))
		}
		if corr.RequestID != "" {
			attrs = append(attrs, attribute.String(AttrRequestID, corr.RequestID))
		}
		if corr.TraceID.IsValid() {
			attrs = append(attrs, attribute.String(AttrTraceID, corr.TraceID.String()))
		}
		if corr.SpanID.IsValid() {
			attrs = append(attrs, attribute.String(AttrSpanID, corr.SpanID.String()))
		}
		if corr.UserRole != "" {
			attrs = append(attrs, attribute.String("user_role", corr.UserRole))
		}
		if corr.OperationID != "" {
			attrs = append(attrs, attribute.String("operation_id", corr.OperationID))
		}
		if corr.PanicStack != "" {
			attrs = append(attrs, attribute.String("exception.stacktrace", corr.PanicStack))
		}
	}

	attrs = append(attrs, evt.Attributes...)
	if len(attrs) > 0 {
		record.AddAttributes(attrs...)
	}

	p.logger.Emit(ctx, record)
}

func severityText(s otellog.Severity) string {
	switch {
	case s >= otellog.SeverityFatal:
		return "FATAL"
	case s >= otellog.SeverityError:
		return "ERROR"
	case s >= otellog.SeverityWarn:
		return "WARN"
	case s >= otellog.SeverityInfo:
		return "INFO"
	case s >= otellog.SeverityDebug:
		return "DEBUG"
	default:
		return "TRACE"
	}
}

func randomTraceID() trace.TraceID {
	var id trace.TraceID
	for !id.IsValid() {
		_, _ = rand.Read(id[:])
	}
	return id
}

func randomSpanID() trace.SpanID {
	var id trace.SpanID
	for !id.IsValid() {
		_, _ = rand.Read(id[:])
	}
	return id
}
