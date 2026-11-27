package storage

import (
	"context"
	"fmt"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
)

const (
	guestRoleID int64 = 1
	userRoleID  int64 = 2
	adminRoleID int64 = 3
)

const usersSchema = `(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	email TEXT NOT NULL UNIQUE COLLATE NOCASE,
	name TEXT NOT NULL DEFAULT '',
	picture TEXT NOT NULL DEFAULT '',
	role_id INTEGER NOT NULL DEFAULT 1 REFERENCES roles(id) ON DELETE RESTRICT,
	locale TEXT NOT NULL DEFAULT 'id',
	created_at DATETIME NOT NULL DEFAULT (datetime('now')),
	updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
)`

func (s *Storage) migrateUserRoles() error {
	tx, err := s.db.BeginTx(context.Background(), nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var legacy, current, locale bool
	if err := tx.QueryRow(`SELECT
		COALESCE(MAX(name = 'role'), 0),
		COALESCE(MAX(name = 'role_id'), 0),
		COALESCE(MAX(name = 'locale'), 0)
		FROM pragma_table_info('users')`).Scan(&legacy, &current, &locale); err != nil {
		return err
	}
	if current {
		return nil
	}
	if legacy && !locale {
		if _, err := tx.Exec(`ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'id'`); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`CREATE TABLE roles (
		id INTEGER PRIMARY KEY,
		name TEXT NOT NULL UNIQUE COLLATE NOCASE,
		description TEXT NOT NULL DEFAULT '',
		is_system INTEGER NOT NULL
	);
	CREATE TABLE role_permissions (
		role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
		permission TEXT NOT NULL,
		PRIMARY KEY(role_id, permission)
	);`); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO roles (id, name, is_system) VALUES (?, ?, 1), (?, ?, 1), (?, ?, 1)`,
		guestRoleID, model.RoleGuest, userRoleID, model.RoleUser, adminRoleID, model.RoleAdmin); err != nil {
		return err
	}
	if legacy {
		if _, err := tx.Exec(`CREATE TABLE users_rbac ` + usersSchema); err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO users_rbac (id, email, name, picture, role_id, locale, created_at, updated_at)
			SELECT id, email, name, picture, CASE WHEN role = ? THEN ? ELSE ? END, locale, created_at, updated_at FROM users`,
			model.RoleGuest, guestRoleID, userRoleID); err != nil {
			return fmt.Errorf("copy legacy users: %w", err)
		}
		if _, err := tx.Exec(`DROP TABLE users; ALTER TABLE users_rbac RENAME TO users;`); err != nil {
			return err
		}
	} else if _, err := tx.Exec(`CREATE TABLE users ` + usersSchema); err != nil {
		return err
	}
	if _, err := tx.Exec(`CREATE INDEX idx_users_email ON users(email);
		CREATE INDEX idx_users_role_id ON users(role_id);`); err != nil {
		return err
	}
	return tx.Commit()
}
