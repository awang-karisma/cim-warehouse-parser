package api

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/awang-karisma/warehouse-parser/pkg/auth"
	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/gofiber/fiber/v3"
)

type googleCallbackReq struct {
	Credential string `json:"credential"`
}

// handleAuthConfig returns public authentication configuration (Google Client ID and status).
func (s *Server) handleAuthConfig(c fiber.Ctx) error {
	c.Set("Cache-Control", "no-store")
	if s.appConfig == nil || s.appConfig.GoogleClientID == "" {
		return c.JSON(fiber.Map{
			"auth_enabled": false,
		})
	}
	return c.JSON(fiber.Map{
		"auth_enabled":     true,
		"google_client_id": s.appConfig.GoogleClientID,
	})
}

// handleGoogleCallback verifies the Google ID token and issues a session cookie.
func (s *Server) handleGoogleCallback(c fiber.Ctx) error {
	c.Set("Cache-Control", "no-store")
	if s.appConfig == nil || s.appConfig.GoogleClientID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "authentication is not enabled"})
	}

	var req googleCallbackReq
	if err := json.Unmarshal(c.Body(), &req); err != nil || strings.TrimSpace(req.Credential) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body: credential is required"})
	}

	ctx := c.Context()
	email, name, picture, err := auth.VerifyGoogleIDToken(ctx, req.Credential, s.appConfig.GoogleClientID)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": fmt.Sprintf("invalid google credential: %v", err)})
	}

	if s.store == nil {
		return storageUnavailable
	}
	if _, err := s.store.UpsertUser(ctx, email, name, picture); err != nil {
		return storageUnavailable
	}
	principal, err := s.resolveCurrentUser(ctx, s.identity(email))
	if err != nil {
		return storageUnavailable
	}
	if principal == nil {
		clearSessionCookie(c)
		return fiber.NewError(fiber.StatusUnauthorized, "authentication required")
	}
	token, err := auth.GenerateToken(s.appConfig.JWTSecret, &principal.User, nil)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "failed to generate session token")
	}

	c.Cookie(&fiber.Cookie{
		Name:     "warehouse_session",
		Value:    token,
		Path:     "/",
		HTTPOnly: true,
		Secure:   c.Protocol() == "https",
		SameSite: "Lax",
		MaxAge:   86400,
	})

	return sendSessionUser(c, principal)
}

// handleAuthMe returns the current effective identity, including pending accounts.
func (s *Server) handleAuthMe(c fiber.Ctx) error {
	c.Set("Cache-Control", "no-store")
	if s.authDisabled() {
		return fiber.NewError(fiber.StatusBadRequest, "authentication is not enabled")
	}
	access, err := s.authenticate(c)
	if err != nil {
		return err
	}
	return sendSessionUser(c, access.principal)
}

func sendSessionUser(c fiber.Ctx, principal *model.Principal) error {
	u := principal.User
	permissions := principal.Permissions
	if principal.Implicit {
		permissions = []model.Permission{"*"}
	} else if permissions == nil {
		permissions = []model.Permission{}
	}
	return c.JSON(fiber.Map{"user": fiber.Map{
		"email": u.Email, "name": u.Name, "picture": u.Picture, "role": u.Role,
		"locale": u.Locale, "permissions": permissions,
	}})
}

// handleLogout clears the session cookie.
func (s *Server) handleLogout(c fiber.Ctx) error {
	clearSessionCookie(c)
	return c.JSON(fiber.Map{"status": string(ResultOK)})
}

// handleClearDatabase wipes orders, items, deliveries, and sync history.
func (s *Server) handleClearDatabase(c fiber.Ctx) error {
	if s.store == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "storage service not available"})
	}

	if err := s.store.ClearData(c.Context()); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("failed to clear database: %v", err)})
	}

	return c.JSON(fiber.Map{
		"status":  string(ResultOK),
		"message": "database cleared",
	})
}
