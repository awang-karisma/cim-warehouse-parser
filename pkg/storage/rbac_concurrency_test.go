package storage

import (
	"errors"
	"path/filepath"
	"testing"
)

func TestRevokingActorDuringRoleWriteCannotCommitStaleAuthority(t *testing.T) {
	s, err := New(filepath.Join(t.TempDir(), "rbac.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	ctx := t.Context()
	local := AccessContext{AuthDisabled: true}
	role, err := s.CreateRole(ctx, local, RoleInput{Name: "Delegated creator", Permissions: []string{"role:create"}})
	if err != nil {
		t.Fatal(err)
	}
	const email = "delegate@example.test"
	if _, err := s.UpsertUser(ctx, email, "Delegate", ""); err != nil {
		t.Fatal(err)
	}
	if err := s.AssignUserRole(ctx, local, email, role.Name); err != nil {
		t.Fatal(err)
	}
	revoke, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = revoke.Rollback() }()
	if _, err := revoke.ExecContext(ctx, `DELETE FROM role_permissions WHERE role_id = ?`, role.ID); err != nil {
		t.Fatal(err)
	}
	result := make(chan error, 1)
	go func() {
		_, err := s.CreateRole(ctx, AccessContext{Email: email}, RoleInput{Name: "Must not exist", Permissions: []string{}})
		result <- err
	}()
	revokeErr := revoke.Commit()
	if revokeErr != nil {
		_ = revoke.Rollback()
	}
	writeErr := <-result
	if revokeErr != nil {
		t.Fatal(revokeErr)
	}
	if !errors.Is(writeErr, ErrForbidden) {
		t.Fatalf("writer must authorize against committed revocation: %v", writeErr)
	}
	roles, err := s.GetRoles(ctx, local)
	if err != nil {
		t.Fatal(err)
	}
	for _, role := range roles {
		if role.Name == "Must not exist" {
			t.Fatal("role committed under revoked authority")
		}
	}
}
