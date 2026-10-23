# Warehouse Parser

Automated order ingestion, normalization, and visualization system.

`warehouse-parser` ingests semi-structured, human-maintained order tracking spreadsheets (from Google Sheets API v4 or fallback CSV files) where operators omit repeated cells, group multi-part shipments into freeform text strings, and use regional abbreviations. It normalizes records, extracts e-catalog identifiers, resolves customer spelling aliases, maintains an atomic mirror in an embedded SQLite database, and serves data through a type-safe REST API with Server-Sent Events (SSE) and an interactive SolidJS dashboard.

---

## Features

- **Automated Spreadsheet Normalization**:
  - Forward-fills omitted dates, customer names, and NTB regional areas across sequential rows.
  - Two-pass customer area inheritance across orders.
  - Regex extraction of e-catalog identifiers (`EP-[A-Z0-9]+`).
  - Tokenizes delivery strings (e.g. `DD/MM/YYYY (qty)`) into distinct shipment schedules.
  - Sequential order grouping (`ORD-0001`, `ORD-0002`).

- **Customer Alias Engine**:
  - Resolves variant customer names to canonical targets (e.g., `RSUD Narmada` $\rightarrow$ `RS Narmada`).
  - Dedicated Customer Aliases view (`/customer-aliases`) with live search, canonical grouping, and in-place editing for canonical names and linked areas.
  - Contextual inline alias assignment retained in Customer View (`/customers`).
  - Versioned JSON document export and atomic parse-verified JSON import (`mode=merge` or `mode=replace`).
  - Standard JSON schema: `{"version": 1, "aliases": [{"alias": "Alias", "canonical": "Canonical", "area": "Area"}]}` (`area` is optional and defaults to `""`).
- **Embedded SQLite Mirror**:
  - Pure Go SQLite driver (`modernc.org/sqlite`, `CGO_ENABLED=0`) with Write-Ahead Logging (WAL).
  - Atomic transactions via `SyncMirror()` (cleans and recreates order state without data tearing).

- **Background Synchronization Worker**:
  - Periodic polling with configurable sync interval (e.g. `15m`, `1h`).
  - Active working hours window evaluation (`08:00–17:00`, Monday–Saturday in `Asia/Makassar` / UTC+8).
  - Real-time event broadcasting over Server-Sent Events (`/api/v1/sync/events`).

- **Google OAuth 2.0 & Role-Based Access Control (RBAC)**:
  - Google Identity Services (GIS) login with ID token server verification.
  - HS256 JWT session tokens with HttpOnly `warehouse_session` cookies.
  - Four privilege tiers:
    - `guest`: Newly signed-in accounts; restricted to approval pending view.
    - `user`: Read-only data access (orders, items, deliveries, stats, search).
    - `admin`: Operational control (manual sync trigger, alias management, database reset, user management: approve guest accounts to `user`, delete guest/user accounts).
    - `superadmin`: Full administration (role assignments across all roles, deletion of admin accounts; configured via `SUPERADMIN_EMAILS`).
  - Fully backward-compatible: leaving `GOOGLE_CLIENT_ID` empty disables authentication.
  - Public Privacy Policy (`/privacy`) and Terms of Service (`/terms`) pages linked from the sign-in screen to meet Google OAuth verification requirements.

- **Interactive Modern UI & API Docs**:
  - Single-Page Application built with SolidJS, Vite, Tailwind CSS v4, and Kobalte / SolidUI primitives.
  - Light, Dark, and System color themes with uniform status palettes.
  - Dedicated route views for Dashboard, Orders, Items, Customer View, Customer Aliases, Area Map, Delivery Timeline, Sync Manager, Search, and Settings.
  - Smooth page transitions, staggered card entrances, and standardized table shimmer skeletons.
  - Order detail view featuring direct Google Sheets row linking (`range=A{row_index}`), dedicated shipment lead time metrics, interactive hover/focus tooltips for item notes, and multi-column client-side sorting.
  - Standardized `DataTable` presentation shell with unified comfortable density (`px-3 py-3` cells, `h-11 px-3` headers) and responsive horizontal overflow.
  - Streamlined expandable order rows on the Orders page with an embedded 5-column line items tray (`#`, `Item Name`, `Progress`, `Status Order`, `Status Barang`), progress bar with `sent / ordered` count, and row-level navigation to order details.
  - Calculated workday lead time engine with admin-managed date-effective schedule history (`workday_policies`), immediate stored record recalculation, and chronological audit trail.
  - Mobile-responsive layout: viewport-constrained flex shell, auto-dismissing mobile navigation drawer, reflowing search and filter toolbars, and phone-fitted modals and dialogs.
  - OpenAPI 3.1 specification at `/openapi.json` and interactive Scalar documentation at `/docs`.
---

## Architecture Overview

```
                      +-----------------------------+
                      |     Remote Data Source      |
                      |  - Google Sheets API v4     |
                      |  - Local Fallback CSV       |
                      +--------------+--------------+
                                     |
                                     v
+------------------------------------+------------------------------------+
| pkg/parser: Ingestion & Deserialization                                 |
| - ParseSheetWithAliases / ParseCSVWithAliases                           |
| - Deserializes spreadsheet rows into model.RawOrderRow                  |
| - Applies customer alias overrides                                      |
+------------------------------------+------------------------------------+
                                     |
                                     v
+------------------------------------+------------------------------------+
| pkg/normalizer: Normalization & Grouping                                |
| - Forward-fills Tanggal, Customer, and Area over empty cells            |
| - Regex extracts e-catalog codes (EP-[A-Z0-9]+)                         |
| - Normalizes regional variants (e.g. 'Lotim' -> 'Lombok Timur')         |
| - Parses shipment strings: 'DD/MM/YYYY (qty)' into Delivery entries     |
| - Groups sequential rows into model.Order (ORD-0001)                    |
+------------------------------------+------------------------------------+
                                     |
                                     v
+------------------------------------+------------------------------------+
| pkg/storage: SQLite Mirror Engine (modernc.org/sqlite, CGO-free WAL)   |
| - SyncMirror(): Atomic transaction (DELETE + batch INSERT)              |
| - User management, customer aliases, and historical sync logs           |
+------------------------------------+------------------------------------+
       ^                             |                             ^
       |                             v                             |
+------+--------------+      +-------+-------------+        +------+------+
| pkg/worker: Worker  |      | pkg/api: HTTP API   | <----+ | web/src: UI |
| - Periodic loop     |      | - Fiber v3 + Huma v2|  SSE   | SolidJS SPA |
| - Work-hours check  |      | - Scalar docs /docs | Events | Tailwind v4 |
| - SSE broadcasting  |      | - Google OAuth+RBAC |        | Kobalte     |
+---------------------+      +---------------------+        +-------------+
```

---

## Configuration

Copy `.env.example` to `.env` and adjust settings:

```bash
cp .env.example .env
```

### Generating a Persistent `JWT_SECRET`

When authentication is enabled (`GOOGLE_CLIENT_ID` is set), the backend signs user session cookies using HMAC-SHA256 with `JWT_SECRET`.

- **Why set this**: If `JWT_SECRET` is left blank, the application automatically generates a random 32-byte secret in memory at boot. However, **all active user sessions will be invalidated whenever the server restarts**.
- **Recommendation**: Generate a secure 32-byte hex string (64 characters) and save it in `.env`.

Use any of the following commands to generate a key:

```bash
# Using OpenSSL (macOS / Linux)
openssl rand -hex 32

# Or using Python 3
python3 -c "import secrets; print(secrets.token_hex(32))"

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output into `.env`:

```env
JWT_SECRET=4c28f9a3e2185d99b104c8f9b9739a76d8b3c20e14a8e57f123d567890abcdef
```

To automatically generate and append it to `.env`:

```bash
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
```
### Environment Variables Reference

| Variable | Default | Description |
| :--- | :--- | :--- |
| `SERVER_PORT` / `PORT` | `8080` | HTTP daemon listening port. |
| `DB_PATH` | `data/warehouse.db` | SQLite database file location. |
| `SYNC_INTERVAL` | `15m` | Background polling interval (`15m`, `1h`, `30s`). |
| `SYNC_WORK_HOURS_START` | `08:00` | Sync window start time (`HH:MM`, 24-hour). |
| `SYNC_WORK_HOURS_END` | `17:00` | Sync window end time (`HH:MM`, 24-hour). |
| `SYNC_TIMEZONE` | `Asia/Makassar` | Timezone for work-hours evaluation (UTC+8). |
| `SYNC_BYPASS_WORK_HOURS_ON_FIRST_SYNC` | `true` | Runs an immediate initial sync on boot if DB is empty. |
| `SPREADSHEET_ID` | *(demo sheet)* | Remote Google Sheet ID. |
| `SHEET_NAME` | `PESANAN` | Spreadsheet tab name. |
| `GOOGLE_APPLICATION_CREDENTIALS` | `""` | Path to Google Service Account JSON key. |
| `GOOGLE_API_KEY` | `""` | Google Cloud API key for public sheet access. |
| `CSV_FALLBACK_PATH` | `testdata/orders_sample.csv` | Local fallback file when remote source is unavailable. |
| `GOOGLE_CLIENT_ID` | `""` | Google OAuth 2.0 Web Client ID. Leave blank to disable auth. |
| `JWT_SECRET` | `""` | HMAC-SHA256 signing key (auto-generates random 32-byte key if unset). |
| `SUPERADMIN_EMAILS` | `""` | Comma-separated emails granted superadmin privileges. |

---

## Deployment & Setup

### 1. Using Docker Compose (Recommended)

The easiest way to run the full server with persistent storage:

```bash
# 1. Prepare environment variables
cp .env.example .env
# Edit .env with your Google API Key, OAuth Client ID, or Spreadsheet ID

# 2. Start services
docker compose up -d

# 3. View logs
docker compose logs -f
```

Access the application at `http://localhost:8080`.

### 2. Using Prebuilt Container Images (GitHub Container Registry)

Prebuilt multi-arch images (`linux/amd64`, `linux/arm64`) are published via GitHub Container Registry:

```bash
# Run bundled image (Server + Embedded Frontend UI)
docker run -d \
  --name warehouse-server \
  -p 8080:8080 \
  -v warehouse_data:/data \
  -e GOOGLE_API_KEY="AIzaSy..." \
  -e SPREADSHEET_ID="<YOUR_SHEET_ID>" \
  -e GOOGLE_CLIENT_ID="<CLIENT_ID>.apps.googleusercontent.com" \
  -e JWT_SECRET="<YOUR_32_BYTE_HEX_SECRET>" \
  -e SUPERADMIN_EMAILS="admin@example.com" \
  ghcr.io/awang-karisma/warehouse-parser:latest

# Or run headless API image (API only, no frontend)
docker run -d \
  --name warehouse-api \
  -p 8080:8080 \
  -v warehouse_data:/data \
  ghcr.io/awang-karisma/warehouse-parser:latest-standalone
```

### 3. Local Development Setup

#### Prerequisites
- **Go**: `1.27+`
- **Node.js**: `22+`
- **pnpm**: `12+` (`corepack enable pnpm`)

#### Run Backend Server
```bash
# Run server in dev mode (reads .env automatically)
make dev
# or: go run ./cmd/warehouse-server
```

#### Run Frontend in Vite Dev Server
```bash
cd web
pnpm install
pnpm dev
```
Open `http://localhost:3000`. API requests to `/api`, `/auth`, and `/health` are automatically proxied to the backend running on `http://localhost:8080`.

#### Build Server with Embedded Frontend Assets
```bash
# Builds web/dist and compiles standalone static binary into bin/warehouse-server
make embed

# Run the single binary
./bin/warehouse-server
```

### 4. Standalone CLI Parser Tool

Parse spreadsheet data directly to standard output or JSON files without running the server daemon:

```bash
# Parse local CSV
go run ./cmd/warehouse-parser -csv testdata/orders_sample.csv

# Parse Google Sheet with API Key and output JSON orders
go run ./cmd/warehouse-parser \
  -api-key "AIzaSy..." \
  -sheet-id "<SHEET_ID>" \
  -sheet-name "PESANAN" \
  -format json-orders
```

---

## API & Roles Reference

| Endpoint | Method | Minimum Role | Description |
| :--- | :---: | :---: | :--- |
| `/health` | `GET` | Public | Service health probe. |
| `/docs` | `GET` | Public | Interactive Scalar API documentation. |
| `/openapi.json` | `GET` | Public | OpenAPI 3.1 specification. |
| `/auth/config` | `GET` | Public | Public authentication status and client ID. |
| `/auth/google/callback` | `POST` | Public | Exchange Google ID token for session cookie. |
| `/auth/me` | `GET` | Authenticated | Retrieve current user profile and role. |
| `/auth/logout` | `POST` | Authenticated | Invalidate session cookie. |
| `/api/v1/orders` | `GET` | `user` | List paginated orders with filters. |
| `/api/v1/orders/{id}` | `GET` | `user` | Retrieve order details and items. |
| `/api/v1/items` | `GET` | `user` | List normalized items with filters. |
| `/api/v1/items/export` | `GET` | `user` | Export filtered items to CSV. |
| `/api/v1/deliveries` | `GET` | `user` | List parsed delivery shipments (supports sort, order, pagination; default date DESC). |
| `/api/v1/deliveries/stats` | `GET` | `user` | Aggregated delivery KPI metrics (total, completed, pending, avg lead time). |
| `/api/v1/customers` | `GET` | `user` | List customer summaries. |
| `/api/v1/areas` | `GET` | `user` | Area order aggregations. |
| `/api/v1/search` | `GET` | `user` | Global search across orders, items, and customers. |
| `/api/v1/sync/events` | `GET` | `user` | Real-time SSE worker events stream. |
| `/api/v1/customer-aliases` | `GET` | `user` | List grouped customer name aliases. |
| `/api/v1/customer-aliases/export` | `GET` | `user` | Export customer aliases as JSON document (`customer-aliases.json`). |
| `/api/v1/sync` | `POST` | `admin` | Trigger immediate manual synchronization. |
| `/api/v1/customer-aliases` | `PUT` | `admin` | Create or update customer alias. |
| `/api/v1/customer-aliases/{alias}`| `DELETE` | `admin` | Remove customer alias mapping. |
| `/api/v1/customer-aliases/import` | `POST` | `admin` | Import customer aliases JSON (supports `mode=merge` or `mode=replace`). |
| `/api/v1/workday-policies` | `GET` | `user` | List chronological history of effective workday schedules for lead-time calculation. |
| `/api/v1/workday-policies` | `PUT` | `admin` | Set active workdays effective from current local date and recalculate stored lead times. |
| `/api/v1/admin/clear-database` | `POST` | `admin` | Reset order, item, and sync tables. |
| `/api/v1/admin/users` | `GET` | `admin` | List registered users and roles. |
| `/api/v1/admin/users/{email}/role` | `PUT` | `admin` / `superadmin` | Approve `guest`→`user` (admin); assign `user` or `admin` (superadmin). |
| `/api/v1/admin/users/{email}` | `DELETE` | `admin` / `superadmin` | Delete `guest` or `user` accounts (admin); delete any non-superadmin (superadmin). |

---

## Testing & Quality Assurance

```bash
# Run all Go unit and integration tests
make test

# Run Go tests with race detector
go test -race ./...

# Go formatting and vet
gofmt -s -w .
go vet ./...

# Frontend typecheck
cd web && pnpm exec tsc --noEmit

# Frontend production bundle check
cd web && pnpm run build
```

---

## License

MIT
