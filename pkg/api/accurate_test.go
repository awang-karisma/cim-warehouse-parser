package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/awang-karisma/warehouse-parser/pkg/accurate"
	"github.com/awang-karisma/warehouse-parser/pkg/accurate/adapter"
	"github.com/awang-karisma/warehouse-parser/pkg/accurate/provider/official"
	"github.com/awang-karisma/warehouse-parser/pkg/accurate/provider/web"
	"github.com/awang-karisma/warehouse-parser/pkg/accurate/session"
	"github.com/awang-karisma/warehouse-parser/pkg/api"
	"github.com/awang-karisma/warehouse-parser/pkg/config"
	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
	"github.com/awang-karisma/warehouse-parser/pkg/worker"
)

func setupTestServerWithAccurate(t *testing.T, appCfg *config.Config, prov accurate.Provider, sm *session.Manager, reg *adapter.Registry) *api.Server {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "test_api_accurate.db")
	store, err := storage.New(dbPath)
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	fetcher := worker.FetcherFunc(func(ctx context.Context, aliases map[string]model.CustomerAlias) ([]model.NormalizedItem, []model.Order, error) {
		return nil, nil, nil
	})
	_ = fetcher

	if appCfg == nil {
		appCfg = &config.Config{
			Port: "8080",
		}
	}

	if sm == nil && prov != nil {
		sm = session.NewManager(store, prov)
	}
	if reg == nil && prov != nil {
		reg = adapter.NewRegistry(prov)
	}

	srv := api.New(api.Config{
		Store:            store,
		AppConfig:        appCfg,
		AccurateProvider: prov,
		AccurateSession:  sm,
		AccurateRegistry: reg,
	})

	return srv
}

func doRequest(t *testing.T, srv *api.Server, method, path string, body any) (*http.Response, []byte) {
	t.Helper()
	var reqBody io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("failed to marshal request body: %v", err)
		}
		reqBody = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, path, reqBody)
	if err != nil {
		t.Fatalf("failed to build request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := srv.App().Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("failed to read response body: %v", err)
	}

	return resp, respBytes
}

func TestAccurateEndpoints_Disabled(t *testing.T) {
	// Provider unset / disabled
	srv := setupTestServerWithAccurate(t, &config.Config{AccurateProvider: ""}, nil, nil, nil)

	// 1. GET /status -> 200 OK with enabled: false
	resp, body := doRequest(t, srv, "GET", "/api/v1/accurate/status", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(body))
	}
	var status struct {
		Enabled   bool `json:"enabled"`
		Connected bool `json:"connected"`
	}
	if err := json.Unmarshal(body, &status); err != nil {
		t.Fatalf("failed to unmarshal status: %v", err)
	}
	if status.Enabled || status.Connected {
		t.Fatalf("expected enabled=false and connected=false, got: %+v", status)
	}

	// 2. All other endpoints should return 401 Unauthorized
	endpoints := []struct {
		method string
		path   string
		body   any
	}{
		{"POST", "/api/v1/accurate/login", map[string]string{}},
		{"POST", "/api/v1/accurate/logout", nil},
		{"GET", "/api/v1/accurate/databases", nil},
		{"POST", "/api/v1/accurate/database", map[string]int64{"id": 1}},
		{"GET", "/api/v1/accurate/items", nil},
		{"GET", "/api/v1/accurate/sources", nil},
		{"GET", "/api/v1/accurate/sources/receive-item/documents", nil},
		{"GET", "/api/v1/accurate/sources/receive-item/documents/1/items", nil},
	}

	for _, ep := range endpoints {
		t.Run(ep.method+" "+ep.path, func(t *testing.T) {
			r, b := doRequest(t, srv, ep.method, ep.path, ep.body)
			if r.StatusCode != http.StatusUnauthorized {
				t.Errorf("expected 401 for disabled Accurate on %s %s, got %d: %s", ep.method, ep.path, r.StatusCode, string(b))
			}
		})
	}
}

func TestAccurateEndpoints_OfficialFlow(t *testing.T) {
	mux := http.NewServeMux()
	server := httptest.NewServer(mux)
	defer server.Close()

	// Mock endpoints
	mux.HandleFunc("/api/db-list.do", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"s": true,
			"d": [
				{"id": 101, "alias": "Main Warehouse", "host": "` + server.URL + `", "isPrivateCloud": false}
			]
		}`))
	})

	mux.HandleFunc("/api/open-db.do", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"s": true,
			"session": "sess-token-123",
			"host": "` + server.URL + `"
		}`))
	})

	mux.HandleFunc("/accurate/api/item/list.do", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"s": true,
			"sp": {"page": 1, "pageCount": 1, "pageSize": 50, "rowCount": 1},
			"d": [
				{
					"id": 501,
					"no": "ITEM-501",
					"name": "Widget A",
					"upcNo": "1234567890",
					"unit1Name": "PCS",
					"unitPrice": 12500,
					"allQuantity": 50,
					"availableToSell": 45,
					"itemType": "INVENTORY",
					"itemTypeName": "Persediaan"
				}
			]
		}`))
	})

	mux.HandleFunc("/accurate/api/receive-item/list.do", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"s": true,
			"sp": {"page": 1, "pageCount": 1, "pageSize": 20, "rowCount": 1},
			"d": [
				{"id": 901, "number": "RI-2026-001", "transDate": "2026-10-24", "statusName": "Selesai", "description": "Penerimaan Barang"}
			]
		}`))
	})

	mux.HandleFunc("/accurate/api/receive-item/detail.do", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"s": true,
			"d": {
				"id": 901,
				"number": "RI-2026-001",
				"detailItem": [
					{
						"id": 1,
						"item": {"id": 501, "no": "ITEM-501", "name": "Widget A"},
						"quantity": 10,
						"unitPrice": 12500,
						"itemUnit": {"name": "PCS"}
					}
				]
			}
		}`))
	})

	appCfg := &config.Config{
		AccurateProvider: "official",
		AccurateAPIToken: "secret-token",
	}
	prov := official.New("secret-token",
		official.WithBaseURL(server.URL),
		official.WithHTTPClient(server.Client()),
	)
	srv := setupTestServerWithAccurate(t, appCfg, prov, nil, nil)

	// 1. Initial status: enabled=true, connected=false
	resp, body := doRequest(t, srv, "GET", "/api/v1/accurate/status", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, string(body))
	}
	var st struct {
		Enabled   bool   `json:"enabled"`
		Provider  string `json:"provider"`
		Connected bool   `json:"connected"`
	}
	_ = json.Unmarshal(body, &st)
	if !st.Enabled || st.Provider != "official" || st.Connected {
		t.Fatalf("unexpected initial status: %+v", st)
	}

	// 2. Login
	resp, body = doRequest(t, srv, "POST", "/api/v1/accurate/login", map[string]string{})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("login failed: %d %s", resp.StatusCode, string(body))
	}
	var loginRes struct {
		Status string `json:"status"`
	}
	_ = json.Unmarshal(body, &loginRes)
	if loginRes.Status != "success" {
		t.Fatalf("expected login success, got %s", loginRes.Status)
	}

	// 3. List databases
	resp, body = doRequest(t, srv, "GET", "/api/v1/accurate/databases", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("databases failed: %d %s", resp.StatusCode, string(body))
	}
	var dbs []accurate.Database
	_ = json.Unmarshal(body, &dbs)
	if len(dbs) != 1 || dbs[0].ID != 101 {
		t.Fatalf("unexpected databases: %+v", dbs)
	}

	// 4. Select database
	resp, body = doRequest(t, srv, "POST", "/api/v1/accurate/database", map[string]int64{"id": 101})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("select database failed: %d %s", resp.StatusCode, string(body))
	}
	var selDb struct {
		Success  bool              `json:"success"`
		Database accurate.Database `json:"database"`
	}
	_ = json.Unmarshal(body, &selDb)
	if !selDb.Success || selDb.Database.ID != 101 {
		t.Fatalf("unexpected select database result: %+v", selDb)
	}

	// Verify status is now connected
	_, body = doRequest(t, srv, "GET", "/api/v1/accurate/status", nil)
	_ = json.Unmarshal(body, &st)
	if !st.Connected {
		t.Fatalf("expected connected=true after selecting database")
	}

	// 5. Search items
	resp, body = doRequest(t, srv, "GET", "/api/v1/accurate/items?q=Widget&page=1&pageSize=10", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("items search failed: %d %s", resp.StatusCode, string(body))
	}
	var itemsRes accurate.SearchItemsResult
	_ = json.Unmarshal(body, &itemsRes)
	if len(itemsRes.Items) != 1 || itemsRes.Items[0].No != "ITEM-501" {
		t.Fatalf("unexpected items: %+v", itemsRes)
	}

	// 6. List sources
	resp, body = doRequest(t, srv, "GET", "/api/v1/accurate/sources", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("sources list failed: %d %s", resp.StatusCode, string(body))
	}
	var sources []accurate.SourceInfo
	_ = json.Unmarshal(body, &sources)
	if len(sources) != 6 {
		t.Fatalf("expected 6 sources, got %d", len(sources))
	}

	// 7. List documents for receive-item
	resp, body = doRequest(t, srv, "GET", "/api/v1/accurate/sources/receive-item/documents?page=1&pageSize=10", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("source documents failed: %d %s", resp.StatusCode, string(body))
	}
	var docRes struct {
		Documents  []accurate.DocumentHeader `json:"documents"`
		Pagination accurate.Pagination       `json:"pagination"`
	}
	_ = json.Unmarshal(body, &docRes)
	if len(docRes.Documents) != 1 || docRes.Documents[0].Number != "RI-2026-001" {
		t.Fatalf("unexpected documents: %+v", docRes)
	}

	// 8. Get document items
	resp, body = doRequest(t, srv, "GET", "/api/v1/accurate/sources/receive-item/documents/901/items", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("document items failed: %d %s", resp.StatusCode, string(body))
	}
	var docItems []accurate.NormalizedItem
	_ = json.Unmarshal(body, &docItems)
	if len(docItems) != 1 || docItems[0].ItemNo != "ITEM-501" || docItems[0].Quantity != 10 {
		t.Fatalf("unexpected doc items: %+v", docItems)
	}

	// 9. Logout
	resp, body = doRequest(t, srv, "POST", "/api/v1/accurate/logout", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("logout failed: %d %s", resp.StatusCode, string(body))
	}
	_, body = doRequest(t, srv, "GET", "/api/v1/accurate/status", nil)
	_ = json.Unmarshal(body, &st)
	if st.Connected {
		t.Fatalf("expected connected=false after logout")
	}
}

func TestAccurateEndpoints_WebMFAFlow(t *testing.T) {
	idpMux := http.NewServeMux()
	idpServer := httptest.NewServer(idpMux)
	defer idpServer.Close()

	idpMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.SetCookie(w, &http.Cookie{Name: "JSESSIONID", Value: "IDP-SESS", Path: "/"})
		w.WriteHeader(http.StatusOK)
	})

	idpMux.HandleFunc("/pre-login.do", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"s": true,
			"d": {
				"valid": true,
				"requireTotp": true,
				"permit": "PERMIT-XYZ",
				"errorCode": 0
			}
		}`))
	})

	idpMux.HandleFunc("/auth.do", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		pw := r.FormValue("j_password")
		if !strings.HasPrefix(pw, "ua") {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		http.Redirect(w, r, "/manage", http.StatusFound)
	})

	appCfg := &config.Config{
		AccurateProvider: "web",
		AccurateEmail:    "test@accurate.id",
		AccuratePassword: "secret-password",
	}
	client := accurate.NewClient(idpServer.Client().Transport)
	client.SetIdPHost(idpServer.URL)
	prov := web.New("test@accurate.id", "secret-password", client)
	srv := setupTestServerWithAccurate(t, appCfg, prov, nil, nil)

	// Step 1: Initial login triggers MFA required
	resp, body := doRequest(t, srv, "POST", "/api/v1/accurate/login", map[string]string{})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("login step 1 failed: %d %s", resp.StatusCode, string(body))
	}
	var loginRes struct {
		Status      string `json:"status"`
		ChallengeID string `json:"challengeId"`
	}
	_ = json.Unmarshal(body, &loginRes)
	if loginRes.Status != "mfa_required" || loginRes.ChallengeID == "" {
		t.Fatalf("expected mfa_required with challengeId, got: %+v", loginRes)
	}

	// Step 2: Complete MFA with OTP
	resp, body = doRequest(t, srv, "POST", "/api/v1/accurate/login", map[string]string{
		"challengeId": loginRes.ChallengeID,
		"otp":         "123456",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("login step 2 failed: %d %s", resp.StatusCode, string(body))
	}
	_ = json.Unmarshal(body, &loginRes)
	if loginRes.Status != "success" {
		t.Fatalf("expected success, got: %s", loginRes.Status)
	}
}

func TestAccurateEndpoints_SessionExpired_Invalidates(t *testing.T) {
	mux := http.NewServeMux()
	server := httptest.NewServer(mux)
	defer server.Close()

	// Upstream returns 401 unauthorized
	mux.HandleFunc("/accurate/api/item/list.do", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"s":false,"d":["Session has expired"]}`))
	})

	appCfg := &config.Config{
		AccurateProvider: "official",
		AccurateAPIToken: "token-1",
	}
	prov := official.New("token-1", official.WithBaseURL(server.URL), official.WithHTTPClient(server.Client()))
	prov.SetSession(server.URL, "sess-1", accurate.Database{ID: 10})
	srv := setupTestServerWithAccurate(t, appCfg, prov, nil, nil)

	// Set initial session state so Status shows connected
	srvAccurateSession := srv.HumaAPI() // verify via endpoint
	_ = srvAccurateSession

	// Items request should fail with 401 session expired and invalidate session
	resp, body := doRequest(t, srv, "GET", "/api/v1/accurate/items?q=&page=1&pageSize=10", nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", resp.StatusCode, string(body))
	}

	// Now verify status is disconnected
	_, body = doRequest(t, srv, "GET", "/api/v1/accurate/status", nil)
	var st struct {
		Connected bool `json:"connected"`
	}
	_ = json.Unmarshal(body, &st)
	if st.Connected {
		t.Fatalf("expected session to be invalidated, but connected is still true")
	}
}

func TestAccurateEndpoints_SecretRedaction(t *testing.T) {
	mux := http.NewServeMux()
	server := httptest.NewServer(mux)
	defer server.Close()

	secretToken := "SUPER_SECRET_TOKEN_XYZ987"
	secretSig := "SUPER_SECRET_SIG_KEY_123"

	// Mock server echoes the token/secret in error response
	mux.HandleFunc("/accurate/api/item/list.do", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`Error verifying ` + secretToken + ` and ` + secretSig))
	})

	appCfg := &config.Config{
		AccurateProvider:           "official",
		AccurateAPIToken:           secretToken,
		AccurateAPISignatureSecret: secretSig,
	}
	prov := official.New(secretToken,
		official.WithBaseURL(server.URL),
		official.WithHTTPClient(server.Client()),
		official.WithSignatureSecret(secretSig),
	)
	prov.SetSession(server.URL, "sess-1", accurate.Database{ID: 10})
	srv := setupTestServerWithAccurate(t, appCfg, prov, nil, nil)

	resp, body := doRequest(t, srv, "GET", "/api/v1/accurate/items?q=&page=1&pageSize=10", nil)
	if resp.StatusCode != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", resp.StatusCode)
	}

	respStr := string(body)
	if strings.Contains(respStr, secretToken) {
		t.Fatalf("secret token was leaked in response: %s", respStr)
	}
	if strings.Contains(respStr, secretSig) {
		t.Fatalf("secret signature was leaked in response: %s", respStr)
	}
}
