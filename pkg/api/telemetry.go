package api

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/telemetry"
	"github.com/danielgtaylor/huma/v2"
	"github.com/gofiber/fiber/v3"
	"go.opentelemetry.io/otel/attribute"
	otellog "go.opentelemetry.io/otel/log"
)

const slowRequestThreshold = 2 * time.Second

func shouldLogRequest(path string, status int) bool {
	if path == "/health" {
		return status >= fiber.StatusBadRequest
	}
	if path == "/api/v1/status" {
		return status != fiber.StatusOK
	}
	return strings.HasPrefix(path, "/api/") || strings.HasPrefix(path, "/auth/")
}

func (s *Server) telemetryMiddleware(c fiber.Ctx) error {
	headers := map[string]string{
		telemetry.HeaderTraceparent:       c.Get(telemetry.HeaderTraceparent),
		telemetry.HeaderRequestID:         c.Get(telemetry.HeaderRequestID),
		telemetry.HeaderPostHogSessionID:  c.Get(telemetry.HeaderPostHogSessionID),
		telemetry.HeaderPostHogDistinctID: c.Get(telemetry.HeaderPostHogDistinctID),
		telemetry.HeaderPostHogWindowID:   c.Get(telemetry.HeaderPostHogWindowID),
	}

	ctx, corr := telemetry.StartRequestContext(c.Context(), headers)
	c.SetContext(ctx)

	c.Set(telemetry.HeaderRequestID, corr.RequestID)
	c.Set(telemetry.HeaderTraceID, corr.TraceID.String())

	start := time.Now()
	err := c.Next()
	duration := time.Since(start)

	if err != nil && corr.HandlerErr == nil {
		corr.HandlerErr = err
	}

	status := c.Response().StatusCode()
	if err != nil {
		status = fiber.StatusInternalServerError
		var fe *fiber.Error
		if errors.As(err, &fe) {
			status = fe.Code
		}
	}

	if !shouldLogRequest(c.Path(), status) {
		return err
	}

	applyPrincipalCorrelation(c.Context(), accessFromContext(c.Context()))

	routePath := c.Path()
	if r := c.Route(); r != nil && r.Path != "" && r.Path != "/" && r.Path != "/*" {
		routePath = r.Path
	}

	isSSE := c.Path() == "/api/v1/sync/events"

	var (
		severity  otellog.Severity
		eventName string
	)
	switch {
	case status >= fiber.StatusInternalServerError || corr.PanicStack != "":
		severity = otellog.SeverityError
		eventName = "http.request.failed"
	case status >= fiber.StatusBadRequest:
		severity = otellog.SeverityWarn
		eventName = "http.request.client_error"
	case !isSSE && duration > slowRequestThreshold:
		severity = otellog.SeverityWarn
		eventName = "http.request.slow"
	default:
		severity = otellog.SeverityInfo
		eventName = "http.request.completed"
	}

	errMsg := extractErrorMessage(corr.HandlerErr)

	attrs := make([]attribute.KeyValue, 0, 6)
	attrs = append(attrs,
		attribute.String("http.request.method", c.Method()),
		attribute.String("http.route", routePath),
		attribute.String("url.path", c.Path()),
		attribute.Int("http.response.status_code", status),
		attribute.Int64("duration_ms", duration.Milliseconds()),
	)
	if errMsg != "" {
		attrs = append(attrs, attribute.String("error.message", errMsg))
	}

	telemetry.Emit(c.Context(), telemetry.Event{
		Name:       eventName,
		Severity:   severity,
		Body:       fmt.Sprintf("%s %s %d (%dms)", c.Method(), routePath, status, duration.Milliseconds()),
		Err:        corr.HandlerErr,
		Attributes: attrs,
	})

	return err
}

func extractErrorMessage(err error) string {
	if err == nil {
		return ""
	}
	var he *huma.ErrorModel
	if errors.As(err, &he) {
		var parts []string
		if d := strings.TrimSpace(he.Detail); d != "" {
			parts = append(parts, d)
		} else if t := strings.TrimSpace(he.Title); t != "" {
			parts = append(parts, t)
		}
		for _, detail := range he.Errors {
			if detail == nil {
				continue
			}
			msg := strings.TrimSpace(detail.Message)
			if detail.Location != "" && msg != "" {
				parts = append(parts, detail.Location+": "+msg)
			} else if msg != "" {
				parts = append(parts, msg)
			}
		}
		if len(parts) > 0 {
			return strings.Join(parts, "; ")
		}
	}
	return err.Error()
}

func applyPrincipalCorrelation(ctx context.Context, access *requestAccess) {
	if access == nil || access.principal == nil {
		return
	}
	corr := telemetry.CorrelationFromContext(ctx)
	if corr == nil {
		return
	}
	if email := strings.TrimSpace(access.principal.User.Email); email != "" {
		corr.DistinctID = email
	}
	if role := strings.TrimSpace(access.principal.User.Role); role != "" {
		corr.UserRole = role
	}
}
