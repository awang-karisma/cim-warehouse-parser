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

- **Accurate Online Integration & Barcode Printing (`/barcode`)**:
  - Reusable Accurate API layer supporting both official Bearer-token API (with request signing and host redirect handling) and web automation login (with MFA/TOTP challenge support).
  - Persistent SQLite session management (`accurate_session`) preserved across spreadsheet sync and database reset.
  - Six transaction source adapters: Receive Item (`receive-item`), Purchase Order (`purchase-order`), Sales Order (`sales-order`), Delivery Order (`delivery-order`), Stock Opname Order (`stock-opname-order`), and Stock Opname Result (`stock-opname-result`).
  - Interactive barcode printing workspace with live vector barcode rendering (`CODE128`, `CODE39`, `EAN13`, `QRCODE`, `DATAMATRIX`) via `jsbarcode`, `qrcode-generator`, and `datamatrix-svg-ts`.
  - Preset templates & reusable custom designs: Tom & Jerry No. 108 (5×14) & No. 121 (2×5), Continuous Thermal Rolls (50×30mm, 40×20mm), A4 Stock Opname Audit Sheet, and persistent admin-managed custom page designs stored in SQLite (`page_designs`) with full CRUD API. Selecting custom presets enables a real-time live-editing dimensions inspector with instantaneous print canvas preview (supporting A4, A5, Letter, Custom, and custom-dimensioned continuous Roll sheets with exact millimeter print sizing), inline saving, copying, and deletion without modal dialogs.
  - Single and Multiply quantity printing modes, instant barcode scanner input with Accurate Online live item autocomplete lookup, and transaction document importer (PO, SO, DO, Receive Item, Opname).
  - Print-isolated CSS: exact configured paper sizing, zero margins, application chrome completely hidden during printing.


- **Delivery Flow Workspace & Warehouse Picking (`/delivery-flow`)**:
  - **Two-Stage Dispatch Planning & Warehouse Picking Workflow**:
    1. *Stage 1 — Stock Readiness & Zero-Layout-Shift Item Selection (`?tab=plan`)*: Filters candidate orders and line items by warehouse stock readiness (`status_barang = 'STOK GUDANG'` by default, with toggles for all unfinished item statuses and `PENDING` client-hold requests) and summarizes candidate orders by regional `Area` with quick `+ Select Ready` actions. Uses a fixed 5-column table (`Pick`, `Item Name`, `Stock Status`, `Order Status`, `Remote Rem.`) so checking items never shifts table layout.
    2. *Stage 2 — Quantities, Picking Notes & Driver Workload (`?tab=configure`)*: Dedicated view rendering all selected orders and items in an identical Order Card and table shell with always-visible `Qty to Deliver` steppers and `Picking Note` inputs. Includes a live **Driver Workload & Routes** overview card for the selected dispatch date (showing each driver's vehicle, run count, assigned items/orders, and NTB routes covered) alongside driver assignment, dispatch date, run title, and route instructions.
    3. *Stage 3 — Warehouse Preparation & Printable Manifest (`?tab=runs`)*: Mobile-ready warehouse picking checklist supporting two grouping modes: `By Destination Order` (delivery staging per customer stop) and `Consolidated Warehouse Pick List` (shelf pulling aggregated by product and unit with single-click bulk picking). Includes a printable A4 manifest (`.delivery-print-sheet`) with run metadata, structured table, and driver/supervisor/receiver signature blocks.
    4. *Sudden Driver Reassignment*: In `Warehouse Picking & Runs`, supervisor can instantly reassign or change the assigned driver directly on any active run in 1 click (`PATCH /api/v1/delivery-runs/:id/driver`) without re-entering the planner.
  - **Independent SQLite Persistence & Source-Agnostic Keys**:
    - Persists dispatch runs and items (`delivery_drivers`, `delivery_runs`, `delivery_run_items`) with stable source-agnostic identity keys (`source_key` via `BuildDeliveryItemSourceKey`), completely decoupled from remote sync tables and surviving `SyncMirror` and database clear operations.
  - **Automated Status Transitions**:
    - Toggling item picked status automatically advances run status: `PLANNED` $\rightarrow$ `PICKING` $\rightarrow$ `READY` (all items picked), with manual controls for `DISPATCHED` and `COMPLETED`.

  - **Mobile-Responsive Drawers & Design Tokens**:
    - Modernized with Kobalte `Tabs` primitives (`?tab=plan|configure|runs`) and semantic design tokens (`primary`, `destructive`, `status-selesai`, `status-pending`).
    - Responsive right `Sheet` drawers for Stage 1 (filters & area selection) and Stage 2 (driver workload & dispatch), and a left `Sheet` drawer for Stage 3 (run switching) via floating action buttons on mobile screens.
  - **Mobile Layout & Persistent Floating Pill Dock**:
    - **Persistent Floating Pill Dock**: Floating rounded bottom dock (`fixed bottom-2 left-2 right-2 rounded-2xl border bg-card/98 backdrop-blur-md shadow-2xl p-3.5 sm:p-4`) with comfortable `h-10` touch targets. Features real-time selection metrics, an outline Clear Selection button with trash icon, and an integrated filter drawer (hidden by default). The filter toggle displays the total count of enabled filters (omitting cluttering area text) and the Next button uses concise action copy (`Lanjut →` / `Next →`) to eliminate mobile text overflow. Stays anchored to the viewport across both Stage 1 (`?tab=plan`) and Stage 2 (`?tab=configure`). In Stage 2, the toolbar button is replaced by a clean navigation link (`← Kembali ke Pilih Barang`), mirrored directly within the dock header.
    - **Integrated Filter Drawer & Sidebar**: Text search filtering (`searchTerm`) is housed inside the floating dock's integrated drawer on mobile and the filter sidebar (`PlanSelectSidebarContent`) on desktop, removing redundant search inputs from the top toolbar. Filter count badge dynamically reflects active search queries, readiness toggles, and area filters.
    - **Design-System Micro-Pills & Product Units**: Separate, compact micro-pills for `status_barang` (e.g. `STOK GUDANG`) and `status_order` (e.g. `BELUM SELESAI`, `PENDING`) using uniform design system tokens and colors (`Badge.tsx`). The remaining quantity column consistently renders with product unit (`{remaining} / {total} {satuan}`), preventing text wrapping and preserving layout stability.
    - **Desktop Invariant**: Desktop rendering (`!isMobile()`) preserves the full 8-column main content table and 4-column right sidebar across all routes without layout shifts.
- **Interactive Modern UI & API Docs**:
  - Single-Page Application built with SolidJS, Vite, Tailwind CSS v4, and Kobalte / SolidUI primitives.
  - Light, Dark, and System color themes with uniform status palettes.
  - **Indonesian & English Multi-Language Support**:
    - Powered by `@solid-primitives/i18n` with type-safe dictionaries (`web/src/i18n/`).
    - Defaults to Bahasa Indonesia (`id`) to serve Indonesian warehouse staff, with full English (`en`) support.
    - Instant language switching via the header dropdown toggle (`LanguageToggle`) and dedicated Settings card.
    - Per-user locale preference persistence in `localStorage` (`warehouse-ui-locale:<email>`) and embedded SQLite database (`users.locale` via `PUT /api/v1/user/locale`).
    - Status badge text localizes dynamically while preserving exact status color mapping.
  - Dedicated route views for Dashboard, Orders, Items, Customer View, Customer Aliases, Area Map, Delivery Flow, Delivery Timeline, Barcode Printer, Sync Manager, Search, and Settings.
  - Smooth page transitions, staggered card entrances, and standardized table shimmer skeletons.
  - Order detail view featuring direct Google Sheets row linking (`range=A{row_index}`), dedicated shipment lead time metrics, interactive hover/focus tooltips for item notes, and multi-column client-side sorting.
  - Standardized `DataTable` presentation shell with unified comfortable density (`px-3 py-3` cells, `h-11 px-3` headers) and responsive horizontal overflow.
  - Streamlined expandable order rows on the Orders page with an embedded 5-column line items tray (`#`, `Item Name`, `Progress`, `Status Order`, `Status Barang`), progress bar with `sent / ordered` count, and row-level navigation to order details.
  - Cohesive order-level cancellation status dominance (orders are marked `BATAL` only when every line item is cancelled; mixed orders preserve active priority) synchronized across Orders list, Dashboard, Order Detail, and order status filter.
  - Calculated workday lead time engine with admin-managed date-effective schedule history (`workday_policies`), immediate stored record recalculation, and chronological audit trail.
  - Compact delivery date presentation across Items and Order Detail using per-shipment secondary badges with unit-free quantities (`DD/MM/YYYY (qty)`). Delivery Timeline features a normalized date column (`YYYY-MM-DD`) with strict calendar validation, chronologically sorted with invalid entries last, and a dedicated Delivered Qty column before Delivery Progress. Order Detail and Delivery Timeline display sent/ordered counts with item units beneath progress bars.
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
| `ACCURATE_PROVIDER` | `""` | Accurate Online provider (`"official"`, `"web"`, or empty/disabled). |
| `ACCURATE_EMAIL` | `""` | User email for Accurate web automation provider. |
| `ACCURATE_PASSWORD` | `""` | User password for Accurate web automation provider (never logged or persisted). |
| `ACCURATE_API_TOKEN` | `""` | Accurate Online API Bearer token for official provider. |
| `ACCURATE_API_SIGNATURE_SECRET` | `""` | Optional HMAC-SHA256 signature secret for official API request signing. |

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
| `/api/v1/accurate/status` | `GET` | `user` | Accurate Online integration status and connected database info. |
| `/api/v1/accurate/login` | `POST` | `user` | Connect or submit MFA challenge to Accurate Online. |
| `/api/v1/accurate/logout` | `POST` | `user` | Invalidate active Accurate Online session. |
| `/api/v1/accurate/databases` | `GET` | `user` | List accessible tenant databases. |
| `/api/v1/accurate/database` | `POST` | `user` | Open tenant database and acquire session token. |
| `/api/v1/accurate/items` | `GET` | `user` | Search master inventory items with pagination. |
| `/api/v1/accurate/sources` | `GET` | `user` | List registered transaction source adapters. |
| `/api/v1/accurate/sources/{source}/documents` | `GET` | `user` | List documents for a transaction source with date/keyword filters. |
| `/api/v1/accurate/sources/{source}/documents/{id}/items` | `GET` | `user` | Retrieve normalized line items from a transaction document. |

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
