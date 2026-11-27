package storage

import (
	"errors"
	"path/filepath"
	"testing"

	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
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
	readActor := make(chan struct{})
	continueWrite := make(chan struct{})
	result := make(chan error, 1)
	go func() {
		_, err := s.CreateRole(ctx, AccessContext{Email: email, IsSuperadmin: func(string) bool {
			close(readActor)
			<-continueWrite
			return false
		}}, RoleInput{Name: "Must not exist", Permissions: []string{}})
		result <- err
	}()
	select {
	case <-readActor:
	case err := <-result:
		t.Fatalf("actor lookup did not reach the transaction barrier: %v", err)
	}
	_, revokeErr := s.UpdateRole(ctx, local, role.ID, RoleInput{Name: role.Name, Permissions: []string{}})
	close(continueWrite)
	if revokeErr != nil {
		t.Fatal(revokeErr)
	}
	var busy *sqlite.Error
	if err := <-result; !errors.As(err, &busy) || busy.Code() != sqlite3.SQLITE_BUSY_SNAPSHOT {
		t.Fatalf("a stale write must fail closed at the SQLite snapshot boundary: %v", err)
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
