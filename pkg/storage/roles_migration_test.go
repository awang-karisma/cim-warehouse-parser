package storage

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

func TestUserRoleCutover(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE users (
		id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
		name TEXT NOT NULL, picture TEXT NOT NULL, role TEXT NOT NULL, locale TEXT NOT NULL,
		created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL
	);
	CREATE INDEX idx_users_email ON users(email);
	INSERT INTO users VALUES
		(11,'guest@example.com','Guest','p','guest','id','2026-01-01','2026-01-02'),
		(12,'user@example.com','User','p','user','id','2026-01-01','2026-01-02'),
		(13,'old-admin@example.com','Admin','p','admin','en','2026-01-01','2026-01-02'),
		(14,'recovery@example.com','Recovery','p',' SUPERADMIN ','id','2026-01-01','2026-01-02'),
		(15,'mixed@example.com','Mixed','p','Guest','id','2026-01-01','2026-01-02'),
		(16,'padded@example.com','Padded','p',' guest ','id','2026-01-01','2026-01-02'),
		(17,'unknown@example.com','Unknown','p','operator','id','2026-01-01','2026-01-02'),
		(18,'empty@example.com','Empty','p','','id','2026-01-01','2026-01-02');`)
	_ = db.Close()
	if err != nil {
		t.Fatal(err)
	}
	open := func() *Storage {
		s, err := New(path)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = s.Close() })
		return s
	}
	s := open()
	for email, expected := range map[string]string{
		"guest@example.com": "guest", "user@example.com": "user",
		"old-admin@example.com": "user", "recovery@example.com": "user",
		"mixed@example.com": "guest", "padded@example.com": "guest",
		"unknown@example.com": "guest", "empty@example.com": "guest",
	} {
		u, err := s.GetUserByEmail(ctx, email)
		if err != nil || u == nil || u.Role != expected {
			t.Fatalf("%s: expected %s, got %+v (%v)", email, expected, u, err)
		}
	}
	u, err := s.GetUserByEmail(ctx, "OLD-ADMIN@example.com")
	if err != nil || u == nil || u.ID != 13 || u.Name != "Admin" || u.Picture != "p" || u.Locale != "en" ||
		!u.CreatedAt.Equal(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)) ||
		!u.UpdatedAt.Equal(time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("profile not preserved: %+v (%v)", u, err)
	}
	var grants int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM role_permissions`).Scan(&grants); err != nil || grants != 0 {
		t.Fatalf("initial grants: %d (%v)", grants, err)
	}
	recovery := AccessContext{Email: "recovery@example.com", IsSuperadmin: func(email string) bool { return email == "recovery@example.com" }}
	if err := s.AssignUserRole(ctx, recovery, "old-admin@example.com", 3); err != nil {
		t.Fatal(err)
	}
	input := RoleInput{Name: "Picker", Permissions: []string{"delivery:pick"}}
	role, err := s.CreateRole(ctx, recovery, input)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.AssignUserRole(ctx, recovery, "user@example.com", role.ID); err != nil {
		t.Fatal(err)
	}
	input.Name = "Picker West"
	if _, err := s.UpdateRole(ctx, recovery, role.ID, input); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err := s.Close(); err != nil {
			t.Fatal(err)
		}
		s = open()
	}
	if err := s.SyncMirror(ctx, nil, nil); err != nil {
		t.Fatal(err)
	}
	if err := s.ClearData(ctx); err != nil {
		t.Fatal(err)
	}
	for email, expected := range map[string]string{"old-admin@example.com": "admin", "user@example.com": "Picker West"} {
		u, err := s.GetUserByEmail(ctx, email)
		if err != nil || u == nil || u.Role != expected {
			t.Fatalf("%s: expected %s after reopening, got %+v (%v)", email, expected, u, err)
		}
	}
	var permission string
	if err := s.db.QueryRow(`SELECT permission FROM role_permissions`).Scan(&permission); err != nil || permission != "delivery:pick" {
		t.Fatalf("grant not preserved: %q (%v)", permission, err)
	}
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM role_permissions`).Scan(&grants); err != nil || grants != 1 {
		t.Fatalf("grants after reopening: %d (%v)", grants, err)
	}
}

func TestUserRoleCutoverAddsMissingLocale(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pre-locale.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE users (
		id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL,
		name TEXT NOT NULL, picture TEXT NOT NULL, role TEXT NOT NULL,
		created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL
	);
	INSERT INTO users VALUES (7,'legacy@example.test','Legacy','','user','2026-01-01','2026-01-02');`)
	_ = db.Close()
	if err != nil {
		t.Fatal(err)
	}
	s, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	user, err := s.GetUserByEmail(t.Context(), "legacy@example.test")
	if err != nil || user == nil || user.ID != 7 || user.Locale != "id" || user.Role != "user" {
		t.Fatalf("legacy profile not migrated with the default locale: %+v (%v)", user, err)
	}
}

func TestRoleIDUpgradePreservesAssignmentsAndGrants(t *testing.T) {
	path := "file:" + filepath.Join(t.TempDir(), "rbac-preview.db") + "?_pragma=foreign_keys(1)"
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE roles (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
		description TEXT NOT NULL DEFAULT '', is_system INTEGER NOT NULL);
	CREATE TABLE role_permissions (role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
		permission TEXT NOT NULL, PRIMARY KEY(role_id, permission));
	CREATE TABLE users ` + usersSchema + `;
	INSERT INTO roles (id, name, is_system) VALUES (1,'guest',1),(2,'user',1),(3,'admin',1),(7,'Picker',0);
	INSERT INTO role_permissions VALUES (7,'delivery:pick');
	INSERT INTO users (email, role_id) VALUES ('picker@example.test', 7);`)
	_ = db.Close()
	if err != nil {
		t.Fatal(err)
	}
	s, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	ctx := t.Context()
	var permission string
	if err := s.db.QueryRow(`SELECT permission FROM users JOIN role_permissions USING (role_id) WHERE users.email = 'picker@example.test'`).Scan(&permission); err != nil || permission != "delivery:pick" {
		t.Fatalf("assignment or grant lost: %q (%v)", permission, err)
	}
	local := AccessContext{AuthDisabled: true}
	if err := s.AssignUserRole(ctx, local, "picker@example.test", userRoleID); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteRole(ctx, local, 7); err != nil {
		t.Fatal(err)
	}
	role, err := s.CreateRole(ctx, local, RoleInput{Name: "Picker", Permissions: []string{}})
	if err != nil || role.ID <= 7 {
		t.Fatalf("replacement must have a higher ID: %+v (%v)", role, err)
	}
}
