package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

var (
	ErrForbidden       = errors.New("insufficient permissions")
	ErrUnauthenticated = errors.New("authentication required")
	ErrConflict        = errors.New("conflict")
)

// AccessContext carries verified identity and trusted deployment configuration.
type AccessContext struct {
	Email        string
	AuthDisabled bool
	IsSuperadmin func(string) bool
}

func (a AccessContext) protected(email string) bool {
	return a.IsSuperadmin != nil && a.IsSuperadmin(email)
}

type RoleInput struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Permissions []string `json:"permissions"`
}

type UserActions struct {
	Approve bool `json:"approve"`
	Assign  bool `json:"assign"`
	Delete  bool `json:"delete"`
}

type DirectoryUser struct {
	model.User
	Actions UserActions `json:"actions"`
}

type AssignableRole struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type UserDirectory struct {
	Users           []DirectoryUser  `json:"users"`
	AssignableRoles []AssignableRole `json:"assignable_roles"`
}

type accessQuery interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

const userAccessQuery = `SELECT u.id, u.email, u.name, u.picture, r.name, u.locale, u.created_at,
	u.updated_at, r.id, rp.permission
	FROM users u JOIN roles r ON r.id = u.role_id
	LEFT JOIN role_permissions rp ON rp.role_id = r.id`

func scanUserAccess(rows *sql.Rows) ([]model.Principal, error) {
	var users []model.Principal
	for rows.Next() {
		var p model.Principal
		var grant sql.NullString
		u := &p.User
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.Picture, &u.Role, &u.Locale,
			&u.CreatedAt, &u.UpdatedAt, &p.RoleID, &grant); err != nil {
			return nil, err
		}
		if len(users) == 0 || users[len(users)-1].User.ID != u.ID {
			users = append(users, p)
		}
		if permission := model.Permission(grant.String); p.RoleID != guestRoleID && p.RoleID != adminRoleID && grant.Valid && model.ValidPermission(permission) {
			last := &users[len(users)-1]
			last.Permissions = append(last.Permissions, permission)
		}
	}
	return users, rows.Err()
}

func currentUser(ctx context.Context, q accessQuery, email string) (*model.Principal, error) {
	rows, err := q.QueryContext(ctx, userAccessQuery+` WHERE u.email = ? COLLATE NOCASE ORDER BY rp.permission`, strings.TrimSpace(email))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users, err := scanUserAccess(rows)
	if err != nil || len(users) == 0 {
		return nil, err
	}
	return &users[0], nil
}

func resolvePrincipal(ctx context.Context, q accessQuery, access AccessContext) (*model.Principal, error) {
	if access.AuthDisabled {
		return &model.Principal{Implicit: true}, nil
	}
	if strings.TrimSpace(access.Email) == "" {
		return nil, nil
	}
	p, err := currentUser(ctx, q, access.Email)
	if err != nil || p == nil {
		return p, err
	}
	configured := access.protected(p.User.Email)
	p.Implicit = p.RoleID == adminRoleID || configured
	if configured {
		p.User.Role = string(model.RoleSuperadmin)
	}
	return p, nil
}

func (s *Storage) ResolvePrincipal(ctx context.Context, access AccessContext) (*model.Principal, error) {
	return resolvePrincipal(ctx, s.db, access)
}

func requireActor(ctx context.Context, tx *sql.Tx, access AccessContext, grants ...model.Permission) (*model.Principal, error) {
	actor, err := resolvePrincipal(ctx, tx, access)
	if err != nil {
		return nil, err
	}
	if actor == nil {
		return nil, ErrUnauthenticated
	}
	for _, grant := range grants {
		if actor.Can(grant) {
			return actor, nil
		}
	}
	return nil, ErrForbidden
}

func coversRole(actor *model.Principal, roleID int64, grants []model.Permission) bool {
	if actor.Implicit {
		return true
	}
	if roleID == adminRoleID {
		return false
	}
	for _, grant := range grants {
		if !actor.Can(grant) {
			return false
		}
	}
	return true
}

func canManageRole(actor *model.Principal, role model.Role) bool {
	return (actor.Implicit || actor.RoleID != role.ID) && coversRole(actor, role.ID, role.Permissions)
}

func canManageUser(access AccessContext, actor, target *model.Principal) bool {
	return actor.User.ID != target.User.ID && !access.protected(target.User.Email) && coversRole(actor, target.RoleID, target.Permissions)
}

const roleAccessQuery = `SELECT r.id, r.name, r.description, r.is_system, rp.permission
	FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id`

func selectRoles(ctx context.Context, q accessQuery, query string, args ...any) ([]model.Role, error) {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	roles := []model.Role{}
	for rows.Next() {
		var role model.Role
		var grant sql.NullString
		if err := rows.Scan(&role.ID, &role.Name, &role.Description, &role.IsSystem, &grant); err != nil {
			return nil, err
		}
		if len(roles) == 0 || roles[len(roles)-1].ID != role.ID {
			role.Permissions = []model.Permission{}
			roles = append(roles, role)
		}
		if grant.Valid && role.ID != guestRoleID && role.ID != adminRoleID && model.ValidPermission(model.Permission(grant.String)) {
			last := &roles[len(roles)-1]
			last.Permissions = append(last.Permissions, model.Permission(grant.String))
		}
	}
	return roles, rows.Err()
}

func selectRole(ctx context.Context, q accessQuery, where string, arg any) (model.Role, error) {
	roles, err := selectRoles(ctx, q, roleAccessQuery+where+` ORDER BY rp.permission`, arg)
	if err != nil {
		return model.Role{}, err
	}
	if len(roles) == 0 {
		return model.Role{}, ErrNotFound
	}
	return roles[0], nil
}

func roleActions(actor *model.Principal, role model.Role) model.RoleActions {
	managed := canManageRole(actor, role)
	return model.RoleActions{
		Update: managed && actor.Can(model.PermRoleUpdate) && (!role.IsSystem || role.ID == userRoleID),
		Delete: managed && actor.Can(model.PermRoleDelete) && !role.IsSystem,
	}
}

func (s *Storage) GetRoles(ctx context.Context, access AccessContext) ([]model.Role, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	actor, err := requireActor(ctx, tx, access, model.PermRoleRead)
	if err != nil {
		return nil, err
	}
	roles, err := selectRoles(ctx, tx, roleAccessQuery+` ORDER BY r.is_system DESC, r.name COLLATE NOCASE, r.id, rp.permission`)
	if err != nil {
		return nil, err
	}
	for i := range roles {
		roles[i].Actions = roleActions(actor, roles[i])
	}
	return roles, nil
}

func normalizeRole(input RoleInput) (model.Role, error) {
	role := model.Role{
		Name: strings.TrimSpace(input.Name), Description: strings.TrimSpace(input.Description),
		Permissions: make([]model.Permission, 0, len(input.Permissions)),
	}
	if role.Name == "" {
		return model.Role{}, fmt.Errorf("%w: role name is required", ErrValidation)
	}
	if strings.EqualFold(role.Name, string(model.RoleSuperadmin)) {
		return model.Role{}, fmt.Errorf("%w: reserved role name", ErrConflict)
	}
	if input.Permissions == nil {
		return model.Role{}, fmt.Errorf("%w: permissions array is required", ErrValidation)
	}
	for _, raw := range input.Permissions {
		grant := model.Permission(strings.TrimSpace(raw))
		if !model.ValidPermission(grant) {
			return model.Role{}, fmt.Errorf("%w: unknown permission %q", ErrValidation, raw)
		}
		role.Permissions = append(role.Permissions, grant)
	}
	slices.Sort(role.Permissions)
	role.Permissions = slices.Compact(role.Permissions)
	return role, nil
}

func roleNameError(err error) error {
	var sqliteErr *sqlite.Error
	if errors.As(err, &sqliteErr) && sqliteErr.Code() == sqlite3.SQLITE_CONSTRAINT_UNIQUE {
		return fmt.Errorf("%w: role name already exists", ErrConflict)
	}
	return err
}

func setRolePermissions(ctx context.Context, tx *sql.Tx, role model.Role) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM role_permissions WHERE role_id = ?`, role.ID); err != nil {
		return err
	}
	if len(role.Permissions) == 0 {
		return nil
	}
	stmt, err := tx.PrepareContext(ctx, `INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, grant := range role.Permissions {
		if _, err := stmt.ExecContext(ctx, role.ID, grant); err != nil {
			return err
		}
	}
	return nil
}

// Administration writes acquire the SQLite writer lock before authorizing, so
// actor grants and the mutation are evaluated in the same serialized transaction.
func (s *Storage) CreateRole(ctx context.Context, access AccessContext, input RoleInput) (*model.Role, error) {
	role, err := normalizeRole(input)
	if err != nil {
		return nil, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	actor, err := requireActor(ctx, tx, access, model.PermRoleCreate)
	if err != nil {
		return nil, err
	}
	if !coversRole(actor, 0, role.Permissions) {
		return nil, ErrForbidden
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO roles (name, description, is_system) VALUES (?, ?, 0)`, role.Name, role.Description)
	if err != nil {
		return nil, roleNameError(err)
	}
	role.ID, err = res.LastInsertId()
	if err != nil {
		return nil, err
	}
	if err := setRolePermissions(ctx, tx, role); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	role.Actions = roleActions(actor, role)
	return &role, nil
}

func (s *Storage) UpdateRole(ctx context.Context, access AccessContext, id int64, input RoleInput) (*model.Role, error) {
	role, err := normalizeRole(input)
	if err != nil {
		return nil, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	actor, err := requireActor(ctx, tx, access, model.PermRoleUpdate)
	if err != nil {
		return nil, err
	}
	old, err := selectRole(ctx, tx, ` WHERE r.id = ?`, id)
	if err != nil {
		return nil, err
	}
	if !canManageRole(actor, old) || !coversRole(actor, id, role.Permissions) {
		return nil, ErrForbidden
	}
	if old.IsSystem && (old.ID != userRoleID || role.Name != old.Name) {
		return nil, fmt.Errorf("%w: protected system role", ErrConflict)
	}
	role.ID, role.IsSystem = old.ID, old.IsSystem
	if _, err := tx.ExecContext(ctx, `UPDATE roles SET name = ?, description = ? WHERE id = ?`, role.Name, role.Description, id); err != nil {
		return nil, roleNameError(err)
	}
	if err := setRolePermissions(ctx, tx, role); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	role.Actions = roleActions(actor, role)
	return &role, nil
}

func (s *Storage) DeleteRole(ctx context.Context, access AccessContext, id int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	actor, err := requireActor(ctx, tx, access, model.PermRoleDelete)
	if err != nil {
		return err
	}
	role, err := selectRole(ctx, tx, ` WHERE r.id = ?`, id)
	if err != nil {
		return err
	}
	if !canManageRole(actor, role) {
		return ErrForbidden
	}
	if role.IsSystem {
		return fmt.Errorf("%w: protected system role", ErrConflict)
	}
	var assigned bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE role_id = ?)`, id).Scan(&assigned); err != nil {
		return err
	}
	if assigned {
		return fmt.Errorf("%w: role is assigned to users", ErrConflict)
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM role_permissions WHERE role_id = ?`, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM roles WHERE id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

func canAssignRole(actor, target *model.Principal, role model.Role) bool {
	return coversRole(actor, role.ID, role.Permissions) && (actor.Can(model.PermUserUpdate) ||
		(actor.Can(model.PermUserCreate) && target.RoleID == guestRoleID && role.ID == userRoleID))
}

func (s *Storage) GetUserDirectory(ctx context.Context, access AccessContext) (*UserDirectory, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	actor, err := requireActor(ctx, tx, access, model.PermUserRead)
	if err != nil {
		return nil, err
	}
	var approvedRole model.Role
	var choices []model.Role
	if actor.Can(model.PermUserUpdate) || actor.Can(model.PermUserCreate) {
		choices, err = selectRoles(ctx, tx, roleAccessQuery+` ORDER BY r.name COLLATE NOCASE, r.id, rp.permission`)
		if err != nil {
			return nil, err
		}
	}
	res := &UserDirectory{Users: []DirectoryUser{}, AssignableRoles: []AssignableRole{}}
	for _, role := range choices {
		if role.ID == userRoleID {
			approvedRole = role
		}
		if actor.Can(model.PermUserUpdate) && coversRole(actor, role.ID, role.Permissions) {
			res.AssignableRoles = append(res.AssignableRoles, AssignableRole{role.ID, role.Name})
		}
	}
	rows, err := tx.QueryContext(ctx, userAccessQuery+` ORDER BY u.created_at DESC, u.id, rp.permission`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users, err := scanUserAccess(rows)
	if err != nil {
		return nil, err
	}
	for _, target := range users {
		entry := DirectoryUser{User: target.User}
		if access.protected(entry.Email) {
			entry.Role = string(model.RoleSuperadmin)
		}
		if canManageUser(access, actor, &target) {
			entry.Actions = UserActions{
				Approve: target.RoleID == guestRoleID && approvedRole.ID != 0 && canAssignRole(actor, &target, approvedRole),
				Assign:  len(res.AssignableRoles) != 0 && actor.Can(model.PermUserUpdate),
				Delete:  actor.Can(model.PermUserDelete),
			}
		}
		res.Users = append(res.Users, entry)
	}
	return res, nil
}

func (s *Storage) AssignUserRole(ctx context.Context, access AccessContext, email string, roleID int64) error {
	email = strings.TrimSpace(email)
	if email == "" || roleID <= 0 {
		return fmt.Errorf("%w: email and an assignable role ID are required", ErrValidation)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	actor, err := requireActor(ctx, tx, access, model.PermUserCreate, model.PermUserUpdate)
	if err != nil {
		return err
	}
	target, err := currentUser(ctx, tx, email)
	if err != nil {
		return err
	}
	if target == nil {
		return ErrNotFound
	}
	if !canManageUser(access, actor, target) {
		return ErrForbidden
	}
	role, err := selectRole(ctx, tx, ` WHERE r.id = ?`, roleID)
	if errors.Is(err, ErrNotFound) {
		return fmt.Errorf("%w: unknown assignable role", ErrValidation)
	}
	if err != nil {
		return err
	}
	if !canAssignRole(actor, target, role) {
		return ErrForbidden
	}
	if _, err := tx.ExecContext(ctx, `UPDATE users SET role_id = ?, updated_at = datetime('now') WHERE id = ?`, role.ID, target.User.ID); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Storage) RemoveUser(ctx context.Context, access AccessContext, email string) error {
	email = strings.TrimSpace(email)
	if email == "" {
		return fmt.Errorf("%w: email is required", ErrValidation)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	actor, err := requireActor(ctx, tx, access, model.PermUserDelete)
	if err != nil {
		return err
	}
	target, err := currentUser(ctx, tx, email)
	if err != nil {
		return err
	}
	if target == nil {
		return ErrNotFound
	}
	if !canManageUser(access, actor, target) {
		return ErrForbidden
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, target.User.ID); err != nil {
		return err
	}
	return tx.Commit()
}
