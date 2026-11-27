package api

import (
	"encoding/json"
	"errors"
	"net/url"
	"slices"
	"strconv"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"github.com/gofiber/fiber/v3"
)

func (s *Server) adminIdentity(c fiber.Ctx) (storage.AccessContext, error) {
	if s.store == nil {
		return storage.AccessContext{}, storageUnavailable
	}
	if a := accessFromContext(c.Context()); a != nil {
		return a.identity, nil
	}
	return storage.AccessContext{}, fiber.NewError(fiber.StatusUnauthorized, "authentication required")
}

func adminError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, storage.ErrUnauthenticated):
		clearSessionCookie(c)
		return fiber.NewError(fiber.StatusUnauthorized, err.Error())
	case errors.Is(err, storage.ErrForbidden):
		return fiber.NewError(fiber.StatusForbidden, err.Error())
	case errors.Is(err, storage.ErrValidation):
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	case errors.Is(err, storage.ErrNotFound):
		return fiber.NewError(fiber.StatusNotFound, err.Error())
	case errors.Is(err, storage.ErrConflict):
		return fiber.NewError(fiber.StatusConflict, err.Error())
	default:
		return storageUnavailable
	}
}

func (s *Server) handleListPermissions(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"permissions": slices.Sorted(model.Permissions)})
}

func (s *Server) handleListRoles(c fiber.Ctx) error {
	a, err := s.adminIdentity(c)
	if err != nil {
		return err
	}
	roles, err := s.store.GetRoles(c.Context(), a)
	if err != nil {
		return adminError(c, err)
	}
	return c.JSON(fiber.Map{"roles": roles})
}

func roleID(c fiber.Ctx) (int64, error) {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id <= 0 {
		return 0, fiber.NewError(fiber.StatusBadRequest, "invalid role id")
	}
	return id, nil
}

func (s *Server) handleCreateRole(c fiber.Ctx) error {
	a, err := s.adminIdentity(c)
	if err != nil {
		return err
	}
	var input storage.RoleInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}
	role, err := s.store.CreateRole(c.Context(), a, input)
	if err != nil {
		return adminError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"role": role})
}

func (s *Server) handleUpdateRole(c fiber.Ctx) error {
	a, err := s.adminIdentity(c)
	if err != nil {
		return err
	}
	id, err := roleID(c)
	if err != nil {
		return err
	}
	var input storage.RoleInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}
	role, err := s.store.UpdateRole(c.Context(), a, id, input)
	if err != nil {
		return adminError(c, err)
	}
	return c.JSON(fiber.Map{"role": role})
}

func (s *Server) handleDeleteRole(c fiber.Ctx) error {
	a, err := s.adminIdentity(c)
	if err != nil {
		return err
	}
	id, err := roleID(c)
	if err != nil {
		return err
	}
	if err := s.store.DeleteRole(c.Context(), a, id); err != nil {
		return adminError(c, err)
	}
	return c.JSON(StatusOKResponse{Status: string(ResultOK)})
}

func (s *Server) handleListUsers(c fiber.Ctx) error {
	a, err := s.adminIdentity(c)
	if err != nil {
		return err
	}
	users, err := s.store.GetUserDirectory(c.Context(), a)
	if err != nil {
		return adminError(c, err)
	}
	return c.JSON(users)
}

func targetEmail(c fiber.Ctx) (string, error) {
	email, err := url.PathUnescape(c.Params("email"))
	if err != nil {
		return "", fiber.NewError(fiber.StatusBadRequest, "invalid email")
	}
	return email, nil
}

func (s *Server) handleSetUserRole(c fiber.Ctx) error {
	a, err := s.adminIdentity(c)
	if err != nil {
		return err
	}
	email, err := targetEmail(c)
	if err != nil {
		return err
	}
	var input struct {
		Role string `json:"role"`
	}
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}
	if err := s.store.AssignUserRole(c.Context(), a, email, input.Role); err != nil {
		return adminError(c, err)
	}
	return c.JSON(StatusOKResponse{Status: string(ResultOK)})
}

func (s *Server) handleDeleteUser(c fiber.Ctx) error {
	a, err := s.adminIdentity(c)
	if err != nil {
		return err
	}
	email, err := targetEmail(c)
	if err != nil {
		return err
	}
	if err := s.store.RemoveUser(c.Context(), a, email); err != nil {
		return adminError(c, err)
	}
	return c.JSON(StatusOKResponse{Status: string(ResultOK)})
}
