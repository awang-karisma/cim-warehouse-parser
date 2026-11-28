package api

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/auth"
	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"github.com/awang-karisma/warehouse-parser/pkg/telemetry"
	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humafiber"
	"github.com/gofiber/fiber/v3"
)

type policyKind uint8

const (
	policyPublic policyKind = iota + 1
	policySelfService
	policyAll
	policyAny
)

type operationPolicy struct {
	kind   policyKind
	grants []model.Permission
}

var (
	publicPolicy      = operationPolicy{kind: policyPublic}
	selfServicePolicy = operationPolicy{kind: policySelfService}
)

func allOf(grants ...model.Permission) operationPolicy {
	return operationPolicy{kind: policyAll, grants: grants}
}

func anyOf(grants ...model.Permission) operationPolicy {
	return operationPolicy{kind: policyAny, grants: grants}
}

func (p operationPolicy) valid() bool {
	switch p.kind {
	case policyPublic, policySelfService:
		return len(p.grants) == 0
	case policyAll, policyAny:
		for _, grant := range p.grants {
			if !model.ValidPermission(grant) {
				return false
			}
		}
		return len(p.grants) != 0
	default:
		return false
	}
}

const policyMetadata = "warehouse-policy"

func registerOperation[I, O any](s *Server, p operationPolicy, op huma.Operation, handler func(context.Context, *I) (*O, error)) {
	checkPolicy(op.Method, op.Path, p)
	s.recordPolicy(op.Method, strings.NewReplacer("{", ":", "}", "").Replace(op.Path))
	if op.Metadata == nil {
		op.Metadata = make(map[string]any, 1)
	}
	op.Metadata[policyMetadata] = p
	wrapped := func(ctx context.Context, input *I) (*O, error) {
		if corr := telemetry.CorrelationFromContext(ctx); corr != nil {
			corr.OperationID = op.OperationID
		}
		applyPrincipalCorrelation(ctx, accessFromContext(ctx))
		out, err := handler(ctx, input)
		if err != nil {
			if corr := telemetry.CorrelationFromContext(ctx); corr != nil {
				corr.HandlerErr = err
			}
		}
		return out, err
	}
	huma.Register(s.humaAPI, op, wrapped)
}

func checkPolicy(method, path string, p operationPolicy) {
	if !p.valid() {
		panic(fmt.Sprintf("invalid authorization policy for %s %s", method, path))
	}
}

func (s *Server) registerRaw(method, path string, p operationPolicy, handler fiber.Handler) {
	checkPolicy(method, path, p)
	s.recordPolicy(method, path)
	guard := func(c fiber.Ctx) error {
		access, err := s.authorize(c, p)
		if err != nil {
			if corr := telemetry.CorrelationFromContext(c.Context()); corr != nil {
				corr.HandlerErr = err
			}
			return err
		}
		if access != nil {
			applyPrincipalCorrelation(c.Context(), access)
			c.SetContext(context.WithValue(c.Context(), requestAccessKey{}, access))
		}
		return c.Next()
	}
	if method == fiber.MethodGet {
		s.recordPolicy(fiber.MethodHead, path)
		s.app.Get(path, guard, handler)
		return
	}
	s.app.Add([]string{method}, path, guard, handler)
}

func (s *Server) recordPolicy(method, path string) {
	key := method + " " + path
	if _, exists := s.policyRoutes[key]; exists {
		panic("duplicate authorization policy for " + key)
	}
	s.policyRoutes[key] = struct{}{}
}

func (s *Server) verifyPolicyCoverage() {
	for _, route := range s.app.GetRoutes(true) {
		if !strings.HasPrefix(route.Path, "/api/") && !strings.HasPrefix(route.Path, "/auth/") && route.Path != "/health" {
			continue
		}
		if _, ok := s.policyRoutes[route.Method+" "+route.Path]; !ok {
			panic("unclassified authorization policy for " + route.Method + " " + route.Path)
		}
	}
}

type requestAccessKey struct{}

type requestAccess struct {
	identity  storage.AccessContext
	principal *model.Principal
	expiresAt time.Time
}

func accessFromContext(ctx context.Context) *requestAccess {
	a, _ := ctx.Value(requestAccessKey{}).(*requestAccess)
	return a
}

func (s *Server) authDisabled() bool {
	return s.appConfig == nil || s.appConfig.GoogleClientID == ""
}

func (s *Server) identity(email string) storage.AccessContext {
	a := storage.AccessContext{Email: email, AuthDisabled: s.authDisabled()}
	if s.appConfig != nil {
		a.IsSuperadmin = s.appConfig.IsSuperadmin
	}
	return a
}

func (s *Server) resolveCurrentUser(ctx context.Context, identity storage.AccessContext) (*model.Principal, error) {
	if s.store == nil {
		return nil, storageUnavailable
	}
	return s.store.ResolvePrincipal(ctx, identity)
}

var storageUnavailable = fiber.NewError(fiber.StatusServiceUnavailable, "storage service not available")

func (s *Server) authenticate(c fiber.Ctx) (*requestAccess, error) {
	if s.authDisabled() {
		return &requestAccess{identity: s.identity(""), principal: &model.Principal{Implicit: true}}, nil
	}
	claims, err := auth.ValidateToken(s.appConfig.JWTSecret, c.Cookies("warehouse_session"))
	if err != nil || claims.ExpiresAt == nil {
		return nil, fiber.NewError(fiber.StatusUnauthorized, "authentication required")
	}
	identity := s.identity(claims.Email)
	p, err := s.resolveCurrentUser(c.Context(), identity)
	if err != nil {
		return nil, storageUnavailable
	}
	if p == nil {
		clearSessionCookie(c)
		return nil, fiber.NewError(fiber.StatusUnauthorized, "authentication required")
	}
	identity.Email = p.User.Email
	return &requestAccess{identity: identity, principal: p, expiresAt: claims.ExpiresAt.Time}, nil
}

func (p operationPolicy) permits(principal *model.Principal) bool {
	switch p.kind {
	case policySelfService:
		return principal != nil
	case policyAll:
		for _, grant := range p.grants {
			if !principal.Can(grant) {
				return false
			}
		}
		return len(p.grants) > 0
	case policyAny:
		for _, grant := range p.grants {
			if principal.Can(grant) {
				return true
			}
		}
	}
	return false
}

func (s *Server) authorize(c fiber.Ctx, p operationPolicy) (*requestAccess, error) {
	if !p.valid() {
		return nil, fiber.NewError(fiber.StatusForbidden, "unclassified operation")
	}
	if p.kind == policyPublic {
		return nil, nil
	}
	c.Set("Cache-Control", "no-store")
	a, err := s.authenticate(c)
	if err != nil {
		return nil, err
	}
	if !p.permits(a.principal) {
		return nil, fiber.NewError(fiber.StatusForbidden, "insufficient permissions")
	}
	return a, nil
}

func (s *Server) humaAuthMiddleware(ctx huma.Context, next func(huma.Context)) {
	var p operationPolicy
	if op := ctx.Operation(); op != nil {
		p, _ = op.Metadata[policyMetadata].(operationPolicy)
	}
	a, err := s.authorize(humafiber.Unwrap(ctx), p)
	if err != nil {
		if corr := telemetry.CorrelationFromContext(ctx.Context()); corr != nil {
			corr.HandlerErr = err
		}
		var status *fiber.Error
		if errors.As(err, &status) {
			_ = huma.WriteErr(s.humaAPI, ctx, status.Code, status.Message)
		} else {
			_ = huma.WriteErr(s.humaAPI, ctx, fiber.StatusServiceUnavailable, "authorization service not available")
		}
		return
	}
	if a != nil {
		applyPrincipalCorrelation(ctx.Context(), a)
		ctx = huma.WithValue(ctx, requestAccessKey{}, a)
	}
	next(ctx)
}
