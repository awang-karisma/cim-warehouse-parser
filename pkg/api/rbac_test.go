package api_test

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/api"
	"github.com/awang-karisma/warehouse-parser/pkg/auth"
	"github.com/awang-karisma/warehouse-parser/pkg/config"
	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"github.com/danielgtaylor/huma/v2"
	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
)

const fixtureSecret = "disposable-rbac-test-key"

func grantDefaultUser(t *testing.T, store *storage.Storage, grants ...model.Permission) {
	t.Helper()
	p := make([]string, len(grants))
	for i, grant := range grants {
		p[i] = string(grant)
	}
	if _, err := store.UpdateRole(t.Context(), storage.AccessContext{AuthDisabled: true}, 2, storage.RoleInput{Name: "user", Permissions: p}); err != nil {
		t.Fatal(err)
	}
}

func fixtureConfig() *config.Config {
	return &config.Config{GoogleClientID: "fixture", JWTSecret: fixtureSecret, SuperadminEmails: "recovery@example.test"}
}

func fixtureIdentity(t *testing.T, store *storage.Storage, email string, roleID int64) string {
	t.Helper()
	u, err := store.UpsertUser(t.Context(), email, email, "")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.AssignUserRole(t.Context(), storage.AccessContext{AuthDisabled: true}, email, roleID); err != nil {
		t.Fatal(err)
	}
	// A stale privileged claim must not affect the effective principal.
	u.Role = "admin"
	cookie, err := auth.GenerateToken(fixtureSecret, u, nil)
	if err != nil {
		t.Fatal(err)
	}
	return cookie
}

func requestRBAC(t *testing.T, srv *api.Server, method, path, cookie, body string, want int) []byte {
	t.Helper()
	req, err := http.NewRequest(method, path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: "warehouse_session", Value: cookie})
	}
	res, err := srv.App().Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	data, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != want {
		t.Fatalf("%s %s: want %d, got %d: %s", method, path, want, res.StatusCode, data)
	}
	return data
}

func decodeRBAC[T any](t *testing.T, payload []byte) T {
	t.Helper()
	var out T
	if err := json.Unmarshal(payload, &out); err != nil {
		t.Fatalf("decode %s: %v", payload, err)
	}
	return out
}

func TestEveryProtectedRouteDeniesMissingIdentityAndNoGrants(t *testing.T) {
	srv, store, _ := setupTestServer(t, fixtureConfig())
	cookie := fixtureIdentity(t, store, "unprovisioned@example.test", 2)
	for _, route := range srv.App().GetRoutes(true) {
		if !strings.HasPrefix(route.Path, "/api/v1/") {
			continue
		}
		parts := strings.Split(route.Path, "/")
		for i, p := range parts {
			if strings.HasPrefix(p, ":") {
				parts[i] = "1"
			}
		}
		path := strings.Join(parts, "/")
		t.Run(route.Method+path, func(t *testing.T) {
			requestRBAC(t, srv, route.Method, path, "", `{"locale":"en"}`, 401)
			want := 403
			if path == "/api/v1/user/locale" {
				want = 200
			}
			requestRBAC(t, srv, route.Method, path, cookie, `{"locale":"en"}`, want)
		})
	}
	me := decodeRBAC[struct{ User model.User }](t, requestRBAC(t, srv, "GET", "/auth/me", cookie, "", 200))
	if me.User.Role != "user" || me.User.Permissions == nil || len(me.User.Permissions) != 0 {
		t.Fatalf("approved user must have a non-null empty list: %+v", me.User)
	}
}

func TestGranularPermissionsAndBoundedDelegation(t *testing.T) {
	srv, store, _ := setupTestServer(t, fixtureConfig())
	recovery := fixtureIdentity(t, store, "recovery@example.test", 2)
	admin := fixtureIdentity(t, store, "admin@example.test", 1)
	picker := fixtureIdentity(t, store, "picker@example.test", 1)
	approver := fixtureIdentity(t, store, "approver@example.test", 1)
	guest := fixtureIdentity(t, store, "guest@example.test", 1)
	fixtureIdentity(t, store, "other-guest@example.test", 1)
	r := func(method, path, cookie, body string, want int) []byte {
		t.Helper()
		return requestRBAC(t, srv, method, "/api/v1"+path, cookie, body, want)
	}
	roleFrom := func(payload []byte) model.Role {
		return decodeRBAC[struct{ Role model.Role }](t, payload).Role
	}
	assign := func(actor, target string, roleID int64, want int) {
		t.Helper()
		r("PUT", "/admin/users/"+target+"@example.test/role", actor, fmt.Sprintf(`{"role_id":%d}`, roleID), want)
	}
	assign(recovery, "admin", 3, 200)
	assign(admin, "recovery", 2, 403)
	assign(admin, "admin", 2, 403)
	assign(admin, "other-guest", 0, 400)
	me := decodeRBAC[struct{ User model.User }](t, requestRBAC(t, srv, "GET", "/auth/me", admin, "", 200))
	if me.User.Role != "admin" || !slices.Equal(me.User.Permissions, []string{"*"}) {
		t.Fatalf("admin lacks implicit grants: %+v", me.User)
	}
	var materialized int
	if err := store.DB().QueryRow(`SELECT COUNT(*) FROM role_permissions`).Scan(&materialized); err != nil || materialized != 0 {
		t.Fatalf("implicit grants must not be stored: %d (%v)", materialized, err)
	}
	catalog := decodeRBAC[struct{ Permissions []model.Permission }](t, r("GET", "/admin/permissions", admin, "", 200)).Permissions
	if !slices.Equal(catalog, slices.Sorted(model.Permissions)) || slices.Contains(catalog, "*") {
		t.Fatalf("invalid permission catalog: %v", catalog)
	}

	pickerRole := roleFrom(r("POST", "/admin/roles", admin, `{"name":" Picker ","description":" warehouse ","permissions":[" delivery:read ","delivery:pick","delivery:read"]}`, 201))
	if pickerRole.Name != "Picker" || pickerRole.Description != "warehouse" || !slices.Equal(pickerRole.Permissions, []model.Permission{model.PermDeliveryPick, model.PermDeliveryRead}) {
		t.Fatalf("role not normalized: %+v", pickerRole)
	}
	pickerPath := fmt.Sprintf("/admin/roles/%d", pickerRole.ID)
	r("POST", "/admin/roles", admin, `{"name":"pIcKeR","permissions":[]}`, 409)
	r("POST", "/admin/roles", admin, `{"name":" SuPeRaDmIn ","permissions":[]}`, 409)
	r("POST", "/admin/roles", admin, `{"name":"No grants"}`, 400)
	r("POST", "/admin/roles", admin, `{"name":"Wildcard","permissions":["*"]}`, 400)
	r("PUT", pickerPath, admin, `{"name":"Other","permissions":["does:not-exist"]}`, 400)
	r("PUT", "/admin/roles/3", admin, `{"name":"admin","permissions":[]}`, 409)
	r("PUT", "/admin/roles/1", admin, `{"name":"guest","permissions":[]}`, 409)
	r("PUT", "/admin/roles/2", admin, `{"name":"renamed user","permissions":[]}`, 409)
	r("DELETE", "/admin/roles/1", admin, "", 409)
	r("DELETE", "/admin/roles/3", admin, "", 409)
	r("DELETE", "/admin/roles/2", admin, "", 409)
	r("DELETE", "/admin/roles/999", admin, "", 404)
	assign(admin, "picker", pickerRole.ID, 200)
	r("DELETE", pickerPath, admin, "", 409)
	r("GET", "/delivery-runs", picker, "", 200)

	runBody := `{"title":"Fixture run","driver_name":"Driver","delivery_date":"2026-02-15","items":[{"order_id":"ORD-100","customer":"Clinic","area":"Lombok","nama_barang":"Tip","satuan":"BOX","jumlah":"4","belum_terkirim":"4","planned_qty":"2","status_order":"BELUM SELESAI","status_barang":"STOK GUDANG"}]}`
	run := decodeRBAC[struct{ Run model.DeliveryRun }](t, r("POST", "/delivery-runs", admin, runBody, 200)).Run
	runPath := fmt.Sprintf("/delivery-runs/%d", run.ID)
	pickPath := fmt.Sprintf("%s/items/%d/pick", runPath, run.Items[0].ID)
	r("PATCH", pickPath, picker, `{"picked":true}`, 200)
	r("PUT", runPath, picker, runBody, 403)
	r("GET", "/items/export", picker, "", 403)
	r("GET", "/admin/users", picker, "", 403)
	r("POST", "/admin/clear-database", picker, "", 403)
	r("PUT", pickerPath, admin, `{"name":"Picker West","permissions":["delivery:read"]}`, 200)
	r("PATCH", pickPath, picker, `{"picked":false}`, 403)
	persisted := decodeRBAC[struct{ Run model.DeliveryRun }](t, r("GET", runPath, picker, "", 200)).Run
	if !persisted.Items[0].Picked {
		t.Fatal("denied pick changed run state")
	}

	approverRole := roleFrom(r("POST", "/admin/roles", admin, `{"name":"Approver","permissions":["user:create","user:read"]}`, 201))
	assign(admin, "approver", approverRole.ID, 200)
	assign(approver, "guest", 3, 403)
	assign(approver, "guest", pickerRole.ID, 403)
	assign(approver, "guest", 2, 200)
	assign(approver, "guest", 1, 403)
	r("PUT", "/admin/roles/2", admin, `{"name":"user","permissions":["order:read"]}`, 200)
	assign(approver, "other-guest", 2, 403)
	users := decodeRBAC[storage.UserDirectory](t, r("GET", "/admin/users", approver, "", 200))
	for _, user := range users.Users {
		if user.Actions != (storage.UserActions{}) {
			t.Fatalf("directory advertises unauthorized action on %s: %+v", user.Email, user.Actions)
		}
	}
	if len(users.AssignableRoles) != 0 {
		t.Fatalf("approval-only actor got assignment choices: %v", users.AssignableRoles)
	}
	r("GET", "/admin/roles", approver, "", 403)

	search := decodeRBAC[storage.SearchResult](t, r("GET", "/search?q=Narmada", guest, "", 200))
	if search.Orders.Total == 0 || search.Items.Total != 0 || search.Customers.Total != 0 || search.Items.Results == nil || search.Customers.Results == nil {
		t.Fatalf("search returned unpermitted categories: %+v", search)
	}
	r("GET", "/search?q=Narmada&type=items", guest, "", 403)
	r("GET", "/search?q=Narmada&type=customers", guest, "", 403)
	r("GET", "/search?q=Narmada&type=invalid", guest, "", 400)
	r("PUT", "/admin/roles/2", admin, `{"name":"user","permissions":["item:read","alias:export","logger_session:read"]}`, 200)
	r("GET", "/items/export", guest, "", 403)
	r("GET", "/customer-aliases/export", guest, "", 403)
	r("PUT", "/admin/roles/2", admin, `{"name":"user","permissions":["item:read","item:export","alias:read","alias:export","alias:import","logger_session:read"]}`, 200)
	if csv := r("GET", "/items/export", guest, "", 200); !strings.Contains(string(csv), "Yellowtip") {
		t.Fatalf("authorized export missing seeded item: %s", csv)
	}
	r("POST", "/customer-aliases/import?mode=replace", guest, `{"version":1,"aliases":[{"alias":"Clinic A","canonical":"Clinic"}]}`, 200)
	alias := r("GET", "/customer-aliases/export", guest, "", 200)
	if !strings.Contains(string(alias), "Clinic A") {
		t.Fatalf("authorized export missing imported alias: %s", alias)
	}
	r("POST", "/datalogger/records/batch", guest, `{"session_ids":[1]}`, 200)
	r("POST", "/datalogger/sessions", guest, `{}`, 403)

	cfgWithoutRecovery := fixtureConfig()
	cfgWithoutRecovery.SuperadminEmails = "different@example.test"
	restarted := api.New(api.Config{Store: store, AppConfig: cfgWithoutRecovery})
	requestRBAC(t, restarted, "GET", "/api/v1/admin/users", recovery, "", 403)
	requestRBAC(t, restarted, "GET", "/api/v1/items", recovery, "", 200)
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	requestRBAC(t, restarted, "GET", "/auth/me", recovery, "", 503)
	requestRBAC(t, restarted, "GET", "/api/v1/admin/users", admin, "", 503)
}

func TestAccountDelegationCannotManageStrongerOrImplicitRoles(t *testing.T) {
	srv, store, _ := setupTestServer(t, fixtureConfig())
	local := storage.AccessContext{AuthDisabled: true}
	create := func(name string, grants []string) *model.Role {
		t.Helper()
		r, err := store.CreateRole(t.Context(), local, storage.RoleInput{Name: name, Permissions: grants})
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	delegate := create("Delegated operator", []string{"role:create", "role:update", "role:delete", "user:read", "user:update", "user:delete", "sync:read"})
	stronger := create("Orders operator", []string{"order:read"})
	all := []string{}
	for grant := range model.Permissions {
		all = append(all, string(grant))
	}
	explicit := create("All current explicit grants", all)
	actor := fixtureIdentity(t, store, "delegate@example.test", delegate.ID)
	fullDelegate := fixtureIdentity(t, store, "explicit@example.test", explicit.ID)
	fixtureIdentity(t, store, "stronger@example.test", stronger.ID)
	fixtureIdentity(t, store, "peeradmin@example.test", 3)
	fixtureIdentity(t, store, "pending@example.test", 1)
	r := func(method, path, cookie, body string, want int) []byte {
		t.Helper()
		return requestRBAC(t, srv, method, "/api/v1/admin"+path, cookie, body, want)
	}
	readOnly := `{"name":"Sync observer","permissions":["sync:read"]}`
	created := decodeRBAC[struct{ Role model.Role }](t, r("POST", "/roles", actor, readOnly, 201)).Role
	r("POST", "/roles", actor, `{"name":"Cannot grant this","permissions":["order:read"]}`, 403)
	r("PUT", fmt.Sprintf("/roles/%d", stronger.ID), actor, readOnly, 403)
	r("DELETE", fmt.Sprintf("/roles/%d", stronger.ID), actor, "", 403)
	r("PUT", fmt.Sprintf("/roles/%d", delegate.ID), actor, readOnly, 403)
	r("PUT", fmt.Sprintf("/roles/%d", created.ID), actor, `{"name":"Sync observer","permissions":["order:read"]}`, 403)
	r("PUT", "/users/pending@example.test/role", actor, fmt.Sprintf(`{"role_id":%d}`, stronger.ID), 403)
	r("PUT", "/users/peeradmin@example.test/role", fullDelegate, `{"role_id":2}`, 403)
	r("PUT", "/roles/3", fullDelegate, `{"name":"admin","permissions":[]}`, 403)
	r("PUT", "/users/delegate@example.test/role", actor, `{"role_id":2}`, 403)
	r("DELETE", "/users/delegate@example.test", actor, "", 403)
	r("DELETE", fmt.Sprintf("/roles/%d", delegate.ID), actor, "", 403)
	r("PUT", "/users/stronger@example.test/role", actor, `{"role_id":1}`, 403)
	r("DELETE", "/users/stronger@example.test", actor, "", 403)
	r("PUT", "/users/pending@example.test/role", fullDelegate, `{"role_id":3}`, 403)
	r("DELETE", "/users/peeradmin@example.test", fullDelegate, "", 403)
	r("DELETE", fmt.Sprintf("/roles/%d", created.ID), actor, "", 200)
	replacement := create(created.Name, []string{"sync:read"})
	if replacement.ID == created.ID {
		t.Fatalf("replacement reused deleted role ID %d", created.ID)
	}
	r("PUT", "/users/pending@example.test/role", actor, fmt.Sprintf(`{"role_id":%d}`, created.ID), 400)
	current, err := store.GetUserByEmail(t.Context(), "stronger@example.test")
	if err != nil || current == nil || current.Role != stronger.Name {
		t.Fatalf("denied account mutation changed assignment: %+v (%v)", current, err)
	}
}

func TestConfiguredRecoveryRequiresAnExistingIdentity(t *testing.T) {
	srv, _, _ := setupTestServer(t, fixtureConfig())
	token, err := auth.GenerateToken(fixtureSecret, &model.User{Email: "recovery@example.test", Role: "admin"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequest("GET", "/auth/me", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.AddCookie(&http.Cookie{Name: "warehouse_session", Value: token})
	res, err := srv.App().Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", res.StatusCode)
	}
	for _, cookie := range res.Cookies() {
		if cookie.Name == "warehouse_session" && (cookie.MaxAge < 0 || (!cookie.Expires.IsZero() && cookie.Expires.Before(time.Now()))) {
			return
		}
	}
	t.Fatalf("missing expired session cookie: %v", res.Header.Values("Set-Cookie"))
}

func TestLocalModeAllowsClassifiedOperationsOnly(t *testing.T) {
	srv, store, _ := setupTestServer(t)
	fixtureIdentity(t, store, "local-target@example.test", 1)
	requestRBAC(t, srv, "PUT", "/api/v1/admin/users/local-target@example.test/role", "", `{"role_id":3}`, 200)
	requestRBAC(t, srv, "GET", "/api/v1/admin/roles", "", "", 200)
	huma.Register(srv.HumaAPI(), huma.Operation{Method: "GET", Path: "/api/v1/unclassified"}, func(context.Context, *struct{}) (*struct{}, error) {
		return nil, nil
	})
	requestRBAC(t, srv, "GET", "/api/v1/unclassified", "", "", 403)
}

func TestSSEStopsBeforeBroadcastAfterGrantRevocation(t *testing.T) {
	srv, store, _ := setupTestServer(t, fixtureConfig())
	grantDefaultUser(t, store, model.PermSyncRead)
	cookie := fixtureIdentity(t, store, "listener@example.test", 2)
	admin := fixtureIdentity(t, store, "admin@example.test", 3)
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	served := make(chan error, 1)
	go func() { served <- srv.App().Listener(listener, fiber.ListenConfig{DisableStartupMessage: true}) }()
	t.Cleanup(func() {
		_ = srv.App().ShutdownWithTimeout(time.Second)
		_ = listener.Close()
		<-served
	})
	ctx, cancel := context.WithTimeout(t.Context(), 7*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "GET", "http://"+listener.Addr().String()+"/api/v1/sync/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.AddCookie(&http.Cookie{Name: "warehouse_session", Value: cookie})
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != 200 || !strings.Contains(res.Header.Get("Content-Type"), "text/event-stream") {
		t.Fatalf("SSE failed: %s (%s)", res.Status, res.Header.Get("Content-Type"))
	}
	r := bufio.NewReader(res.Body)
	for _, expected := range []string{"event: sync", "data:", "\n"} {
		line, err := r.ReadString('\n')
		if err != nil || !strings.HasPrefix(line, expected) {
			t.Fatalf("expected initial event %q, got %q (%v)", expected, line, err)
		}
	}
	grantDefaultUser(t, store)
	requestRBAC(t, srv, "POST", "/api/v1/sync", admin, "", 200)
	if line, err := r.ReadString('\n'); line != "" || err != io.EOF {
		t.Fatalf("revoked stream did not terminate cleanly: %q (%v)", line, err)
	}
	requestRBAC(t, srv, "GET", "/api/v1/status", cookie, "", 403)
}

func TestSSEWriteDeadlineDoesNotOutliveSession(t *testing.T) {
	srv, store, _ := setupTestServer(t, fixtureConfig())
	grantDefaultUser(t, store, model.PermSyncRead)
	const email = "blocked@example.test"
	cookie := fixtureIdentity(t, store, email, 2)
	requestRBAC(t, srv, "GET", "/api/v1/status", cookie, "", 200)
	expiry := time.Now().Truncate(time.Second).Add(3 * time.Second)
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, auth.Claims{
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(expiry)}, Email: email,
	}).SignedString([]byte(fixtureSecret))
	if err != nil {
		t.Fatal(err)
	}
	client, server := net.Pipe()
	defer client.Close()
	defer server.Close()
	served := make(chan error, 1)
	go func() { served <- srv.App().Server().ServeConn(server) }()
	if err := client.SetWriteDeadline(expiry); err != nil {
		t.Fatal(err)
	}
	if _, err := fmt.Fprintf(client, "GET /api/v1/sync/events HTTP/1.1\r\nHost: localhost\r\nCookie: warehouse_session=%s\r\n\r\n", token); err != nil {
		t.Fatal(err)
	}
	// Never read the response: net.Pipe blocks the first socket write.
	select {
	case err := <-served:
		if timeout, ok := err.(net.Error); !ok || !timeout.Timeout() || time.Now().Before(expiry) {
			t.Fatalf("expected the blocked write to time out at session expiry, got %v", err)
		}
	case <-time.After(time.Until(expiry) + time.Second):
		t.Fatal("blocked SSE write outlived session expiry")
	}
}
