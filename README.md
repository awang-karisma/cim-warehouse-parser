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

- **Operational Dashboard & Date-Ranged History**:
  - Opens on the current WITA calendar day. The date toolbar supports manual From/To dates plus Today, 7-day, 30-day, 3-month, 6-month, and 1-year presets; invalid ranges suspend historical requests.
  - `GET /api/v1/dashboard/operations` supplies three all-date operational counts: orders with a `BELUM SELESAI` item, shelf-ready unfinished line items with positive remaining quantity **excluding customer-held `PENDING` items**, and delivery runs in `PLANNED`, `PICKING`, `READY`, or `DISPATCHED`. These are independent of the historical date picker; the backlog and shelf-ready links preserve their matching filters (`/orders?status=...`, `/items?ready_to_dispatch=true`), while active runs open Delivery Flow. Items CSV export supports `ready_to_dispatch=true` as well.
  - With `sync:read`, the dashboard polls `/api/v1/status` every 30 seconds and subscribes to sync events. It shows a WITA timestamp only when the latest attempt succeeded, warns when the mirror fails or becomes stale during work hours, and offers manual sync with `sync:trigger`. Dashboard data is still visible without sync telemetry; recent orders and drilldowns require their destination grant.
  - `GET /api/v1/dashboard/summary?from&to` returns order/item/customer/area totals, line-item status counts, and daily order volume over inclusive WITA order-placement dates. The Orders KPI links to `/orders?from&to` with those bounds; other KPI cards link to full lists (all dates), with that scope stated on the dashboard. Recent orders share the selected range.
  - `GET /api/v1/dashboard/pressure?from&to` ranks destinations and the top five customers by `BELUM SELESAI` + `PROSES` **line items** for orders placed in the selected inclusive date range. `PENDING` is shown separately as a customer hold, not counted as actionable unfinished work; cancellations are excluded. Area/customer links retain the date range in Orders. The section displays the average stored, policy-calculated lead time once per eligible completed item (not once per shipment row), with a completed-item count and an empty state when none qualify. An empty workload offers a 30-day range shortcut.
  - `GET /api/v1/dashboard/status-trend?from&to` selects the latest successful aggregate mirror snapshot per observed WITA date; empty successful mirrors are observations, unsynced days are gaps, and the status-population graph remains unchanged. `/api/v1/stats` remains global.
  - `GET /api/v1/dashboard/status-changes?from&to` counts each order once in the final status it newly reaches per successful WITA day. First appearances count; same-day intermediate states and reversals to the day's baseline do not. Disappearances do not count; reappearances keep their baseline. Empty successful days return `{}`, while unsynced and pre-tracking days have no point. Today's count is provisional until the day's last successful sync. Historical aggregate snapshots are not backfilled into per-order change history.
  - Dashboard time-series charts use Chart.js through `solid-chartjs` with independent, keyboard-accessible chart-type switches: order volume shows Bars or Line (weekly buckets beyond 14 days), status totals show Line or Stacked Bars, and per-order daily status changes show nonnegative Stacked Bars or an unsmoothed Line. Each chart has independent loading, error/retry, and no-history states; status changes share status normalization, gaps, selected dates, tooltips, and screen-reader summaries.
- **Google OAuth and Role-Based Access Control (RBAC)**:
  - Google login still establishes an HttpOnly `warehouse_session` cookie. The server re-reads the user, role, and grants on every protected request; existing sessions immediately reflect changes.
  - `guest` waits for approval with no grants. Approved `user` starts with no grants; its shared grants are editable. Custom roles carry explicit `resource:action` grants. Each user has one assignment.
  - `admin` and configured `superadmin` have every registered permission, including future permissions, without grant rows. Admins can appoint other admins but cannot change or delete themselves or configured superadmins. Delegates cannot manage stronger roles or accounts, assign admin, or edit their own role.
  - `/admin/roles` shows the capability catalog and role editor; `/admin/users` displays assignments and only the actions and role choices the server allows for each target.
  - Navigation, direct routes, secondary requests, and actions use the same capability contract. Approved users without workspace access can still refresh access, open preferences, or sign out. `/privacy` and `/terms` remain public.
  - Intentionally leaving `GOOGLE_CLIENT_ID` empty enables full local development access, including user and role administration. An auth error never enables that mode.

- **Accurate Online Integration & Barcode Printing (`/barcode`)**:
  - Reusable Accurate API layer supporting both official Bearer-token API (with request signing and host redirect handling) and web automation login (with MFA/TOTP challenge support). The web login flow follows redirects only on the configured IdP host and scheme; redirects to other hosts or schemes are rejected to avoid forwarding authentication data.
  - Persistent SQLite session management (`accurate_session`) preserved across spreadsheet sync and database reset; Accurate logout clears persisted session data and replaces the active web-provider client and cookie jar.
  - Six transaction source adapters: Receive Item (`receive-item`), Purchase Order (`purchase-order`), Sales Order (`sales-order`), Delivery Order (`delivery-order`), Stock Opname Order (`stock-opname-order`), and Stock Opname Result (`stock-opname-result`).
  - Interactive barcode printing workspace with live vector barcode rendering (`CODE128`, `CODE39`, `EAN13`, `QRCODE`, `DATAMATRIX`) via `jsbarcode`, `qrcode-generator`, and `datamatrix-svg-ts`.
  - Preset templates & reusable custom designs: Tom & Jerry No. 108 (5×14) & No. 121 (2×5), Continuous Thermal Rolls (50×30mm, 40×20mm), A4 Stock Opname Audit Sheet, and reusable page designs in SQLite (`page_designs`) with full CRUD API. Designs persist geometry, optional element-coordinate `label_layout`, and all selected barcode/print/preview settings in `settings_json`; legacy rows/requests receive explicit defaults. Settings include symbology, barcode height, font size, quantity mode, leading skip count, preview guides, and preview zoom. Layout-only arrangements remain independent in `label_layout_presets`; product queue contents remain transient.
  - Independent label layout presets are persisted in `label_layout_presets`, separate from paper/page designs. Selecting or managing saved layouts requires the corresponding `preset` grants. Local design and printing with `barcode:print` do not require saved presets, saved designs, or Accurate Online access.
  - Single and Multiply quantity printing modes, instant barcode scanner input with Accurate Online live item autocomplete lookup, and transaction document importer (PO, SO, DO, Receive Item, Opname).
  - Print-isolated CSS: exact configured paper sizing, zero margins, application chrome completely hidden during printing.


- **Delivery Flow Workspace & Warehouse Picking (`/delivery-flow`)**:
  - **Two-Stage Dispatch Planning & Warehouse Picking Workflow**:
    1. *Stage 1 — Stock Readiness & Zero-Layout-Shift Item Selection (`?tab=plan`)*: Filters unfinished candidates and items by stock readiness. Both Stock Readiness and Show Client Holds start unchecked; blank/`-` stock statuses with positive remaining quantity remain visible and manually selectable until warehouse-only filtering is enabled. `+ Select Ready` still selects only `STOK GUDANG`. A fixed 5-column table (`Pick`, `Item Name`, `Stock Status`, `Order Status`, `Remote Rem.`) avoids layout shifts.
    2. *Stage 2 — Quantities, Picking Notes & Driver Workload (`?tab=configure`)*: Dedicated view renders only selected orders/items with always-mounted `Qty to Deliver` and `Picking Note` inputs. The configure text filter updates immediately and applies after 300ms idle. Stock toggles preserve their values across Plan/Configure switches and reset only after a successful save.
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
- **Elitech Data Logger Workspace (`/datalogger`, `/datalogger-records/:id`)**:
  - Accessible directly from the main sidebar under Tools (`navGroups.tools.datalogger` with thermometer icon).
  - Ingests Elitech USB temperature/humidity data loggers directly in Chromium browsers via WebHID or from Elitech / custom-mapped CSV exports, sharing a single live USB session across Import and Configuration tabs, binding pulled datasets into immutable device-serial snapshots, and utilizing a reusable `DeviceConnectSection` component.
  - Persists named recording sessions, readings, and reusable configuration profiles in SQLite (`datalogger_sessions`, `datalogger_records`, `datalogger_profiles`) independently of spreadsheet resyncs, exposed via `/api/v1/datalogger/*` (with inclusive date overlap filtering, text search, customizable pagination, and role-gated profile CRUD).
  - Fully localized across English and Indonesian (`web/src/i18n/`) with unified translations for tabs, KPI cards, sessions directory, responsive mobile cards, graph view, import forms, date filter, and pagination.
  - Dedicated Configuration tab (`?tab=config`) supporting RC-5+ logging interval, target-duration interval calculation, start mode (`immediate`, `manual` delay, `timer` scheduled local start), 13-byte trip number, 100-byte trip description, RC-5+ LCD screen display auto-off timeout (`15s`, `30s`, `45s`, `60s`, `Always On` with on-the-fly standalone write), reusable shared profiles, Quick Reset (preserving current hardware settings), workstation clock/timezone synchronization, and post-format read-only verification.
  - Cold-chain telemetry KPI cards prominently placed at the top (`Total Sessions`, `Total Records`, `Temp Range`, `Latest Import`) with the refresh action inline with the navigation tabs.
  - Dual desktop/mobile table representation: full 9-column `DataTable` on desktop and touchscreen-friendly responsive card list on mobile (eliminating horizontal clipping).
  - Dedicated tabbed Graph View with full-width `ZoomableTimeChart` (dual-axis zoom & pan), hardware Marked events (`M` flag) triangle overlay and accessible `<details>` list, active session pills, date range windowing, and per-session summary stats table with direct "View Raw" action links.
  - Dedicated single-session Raw Data log viewing and CSV file export at `/datalogger-records/:id`.
  - Technical reference (USB HID protocol, RC-5+ configuration & Quick Reset, firmware `0x38` quirks, Linux `udev` rules, schema, API): [`docs/datalogger.md`](docs/datalogger.md).
  - **Thermal map (`/datalogger?tab=thermal`)** opens the floor or volume viewer. Use **Edit layout** to draw the room, partitions, and sensor positions, or to import/export a geometry-only version-1 `room-layout.json`.
  - **Assign sessions** maps saved Data Logger sessions to sensors without modifying stored readings. To add readings, use the existing Data Logger **Import** tab and save them as a session first.
  - **Load Selected** opens the graph and makes the same fetched readings available for sensor assignment. The thermal map prepares its sources only when opened.
  - The map keeps a shared 1×, 10×, or 60× timeline and a fixed observed Celsius range. Spatial estimates use physical 3D distance; partitions are visual only. Geometry, assignments, and playhead survive switching Data Logger tabs. Layout editing and numeric readings still work without WebGL 2.
- **Interactive Modern UI & API Docs**:
  - Single-Page Application built with SolidJS, Vite, Tailwind CSS v4, and Kobalte / SolidUI primitives.
  - Light, Dark, and System color themes with uniform status palettes.
  - **Indonesian & English Multi-Language Support**:
    - Powered by `@solid-primitives/i18n` with type-safe dictionaries (`web/src/i18n/`).
    - Defaults to Bahasa Indonesia (`id`) to serve Indonesian warehouse staff, with full English (`en`) support.
    - Instant language switching via the header dropdown toggle (`LanguageToggle`) and dedicated Settings card.
    - Per-user locale preference persistence in `localStorage` (`warehouse-ui-locale:<email>`) and embedded SQLite database (`users.locale` via `PUT /api/v1/user/locale`).
    - Status badge text localizes dynamically while preserving exact status color mapping.
  - Dedicated views for Dashboard, Orders, Items, Customer View, Customer Aliases, Area Map, Delivery Flow, Barcode Printer, Data Logger, Sync Manager, Search, Settings, User Management, and Role Management.
  - Smooth page transitions, staggered card entrances, and standardized table shimmer skeletons.
  - Order detail view featuring direct Google Sheets row linking (`range=A{row_index}`), dedicated shipment lead time metrics, interactive hover/focus tooltips for item notes, and multi-column client-side sorting.
  - Standardized `DataTable` presentation shell with unified comfortable density (`px-3 py-3` cells, `h-11 px-3` headers) and responsive horizontal overflow.
  - Streamlined expandable order rows on the Orders page with an embedded 5-column line items tray (`#`, `Item Name`, `Progress`, `Status Order`, `Status Barang`), progress bar with `sent / ordered` count, and row-level navigation to order details.
  - Cohesive order-level cancellation status dominance (orders are marked `BATAL` only when every line item is cancelled; mixed orders preserve active priority) synchronized across Orders list, Dashboard, Order Detail, and order status filter.
  - Calculated workday lead time engine with date-effective schedule history managed with workday grants (`workday_policies`), immediate stored record recalculation, and chronological audit trail.
  - Compact delivery date presentation across Items and Order Detail using per-shipment secondary badges with unit-free quantities (`DD/MM/YYYY (qty)`). Delivery Timeline features a normalized date column (`YYYY-MM-DD`) with strict calendar validation, chronologically sorted with invalid entries last, and a dedicated Delivered Qty column before Delivery Progress. Order Detail and Delivery Timeline display sent/ordered counts with item units beneath progress bars.
  - Mobile-responsive layout: viewport-constrained flex shell, auto-dismissing mobile navigation drawer, reflowing search and filter toolbars, and phone-fitted modals and dialogs.
  - The sidebar shows permitted destinations under Overview, Operations, Customers & Areas, Tools, and Administration. The same access rules apply to desktop, icon rail, mobile drawer, and deep links. The footer shows status for `sync:read`, a manual sync button for `sync:trigger`, and configuration-dependent freshness color only with `system:read`.
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
| `SUPERADMIN_EMAILS` | `""` | Comma-separated recovery accounts with implicit superadmin access. At least one nonblank entry is required when `GOOGLE_CLIENT_ID` is set. |
| `ACCURATE_PROVIDER` | `""` | Accurate Online provider (`"official"`, `"web"`, or empty/disabled). |
| `ACCURATE_EMAIL` | `""` | User email for Accurate web automation provider. |
| `ACCURATE_PASSWORD` | `""` | User password for Accurate web automation provider (never logged or persisted). |
| `ACCURATE_API_TOKEN` | `""` | Accurate Online API Bearer token for official provider. |
| `ACCURATE_API_SIGNATURE_SECRET` | `""` | Optional HMAC-SHA256 signature secret for official API request signing. |

---

## Deployment & Setup

### Upgrading an Existing Authenticated Installation

1. Stop the old service and any other process writing to its SQLite database. Back up with the SQLite backup mechanism, or copy the stopped database together with its WAL if present. Keep the corresponding pre-upgrade binary.
2. Verify that `SUPERADMIN_EMAILS` contains at least one recoverable Google account. Without a nonblank entry the new daemon refuses to start before opening SQLite.
3. Start the new daemon. The one-time migration preserves profiles and locales. Only legacy roles that normalize to `user`, `admin`, or `superadmin` become `user` with no grants; all other values become pending guests. Only configured superadmin identities retain implicit access. On later restarts, assignments and grants are preserved.
4. Sign in as a configured superadmin, open **User Management**, and assign your first `admin`. Then provision `user` or create custom roles in **Role Management**. To roll back, restore the pre-upgrade database and binary together; do not run the old binary against the migrated database.

For local development with authentication explicitly disabled, no recovery account is required. Keep that mode off on deployments serving untrusted clients.

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
- **Go**: `1.27+` (Air and Hivemind are tracked as Go module tools in `go.mod`)
- **Node.js**: `22+`
- **pnpm**: `12+` (`corepack enable pnpm`)

#### Run Development Environment

Run both the backend (Air live reload) and frontend (Vite dev server) concurrently under Hivemind process supervision:

```bash
# Runs Hivemind via `go tool hivemind Procfile.dev` (Go backend on :8080 + Vite on :3000)
make dev
```

Open `http://localhost:3000`. Vite automatically proxies API requests (`/api`, `/auth`, `/health`) to the Go backend on `http://localhost:8080`.

#### Running Services Individually

```bash
# Run backend only with Air live reload
make dev-backend
# or: make dev-server

# Run frontend only (Vite dev server)
make dev-frontend
# or: cd web && pnpm dev
```

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

## API & Permission Reference

`/auth/me` and the Google callback return the current `user` with an effective role and sorted `permissions` (`[]` for no grants, `["*"]` for implicit administrators). Both responses are non-cacheable. `/auth/me` is available to pending guests. Health, API docs, legal pages, and static assets are public. Signed-in self-service `PUT /api/v1/user/locale` does not need a business grant.

Business endpoints are under `/api/v1`. A slash-separated pair of methods and capabilities below maps in order; `+` requires both capabilities.

| Endpoint | Method | Permission |
| :--- | :--- | :--- |
| `/stats`, `/dashboard/*` | GET | `dashboard:read` |
| `/orders`, `/orders/{id}` | GET | `order:read` (includes line items) |
| `/items`; `/items/export` | GET | `item:read`; export also requires `item:export` |
| `/purchase-orders` | GET | `purchase_order:read` |
| `/customers`; `/areas` | GET | `customer:read`; `area:read` |
| `/customer-aliases`; `/customer-aliases/{alias}` | GET / PUT / DELETE | `alias:read` / `alias:write` / `alias:delete` |
| `/customer-aliases/import`; `/customer-aliases/export` | POST / GET | `alias:import` (includes bulk replacement) / `alias:read` + `alias:export` |
| `/deliveries`, `/deliveries/stats` | GET | `timeline:read` |
| `/status`, `/sync/history`, `/sync/events` | GET | `sync:read` (the stream rechecks before sending events) |
| `/sync`; `/admin/clear-database` | POST | `sync:trigger`; `database:clear` |
| `/system`, `/config` | GET | `system:read` |
| `/workday-policies` | GET / PUT | `workday:read` / `workday:update` |
| `/delivery-flow/candidates`, `/delivery-runs`, `/delivery-runs/{id}` | GET | `delivery:read` |
| `/delivery-runs`; `/delivery-runs/{id}` | POST / PUT / DELETE | `delivery:create` / `delivery:update` / `delivery:delete` |
| `/delivery-runs/{id}/status`, `/delivery-runs/{id}/driver` | PATCH | `delivery:update` |
| `/delivery-runs/{id}/items/{item_id}/pick` | PATCH | `delivery:pick` |
| `/delivery-drivers`, `/delivery-drivers/{id}` | GET / POST / PUT / DELETE | `driver:read` / `driver:create` / `driver:update` / `driver:delete` |
| `/page-designs`, `/page-designs/{id}` | GET / POST / PUT / DELETE | `design:read` / `design:create` / `design:update` / `design:delete` |
| `/label-layout-presets`, `/label-layout-presets/{id}` | GET / POST / PUT / DELETE | `preset:read` / `preset:create` / `preset:update` / `preset:delete` |
| `/accurate/*` | GET | `accurate:read` |
| `/accurate/login`, `/accurate/database`, `/accurate/logout` | POST | `accurate:create`, `accurate:update`, `accurate:delete` respectively; all affect the shared connection |
| `/datalogger/sessions`, `/datalogger/sessions/{id}`, `/datalogger/sessions/{id}/records`; `/datalogger/records/batch` | GET; POST | `logger_session:read` |
| `/datalogger/sessions`; `/datalogger/sessions/{id}/name`; `/datalogger/sessions/{id}` | POST / PUT / DELETE | `logger_session:create` / `logger_session:update` / `logger_session:delete` |
| `/datalogger/profiles`, `/datalogger/profiles/{id}` | GET / POST / PUT / DELETE | `logger_profile:read` / `logger_profile:create` / `logger_profile:update` / `logger_profile:delete` |
| `/admin/users`; `/admin/users/{email}/role`; `/admin/users/{email}` | GET / PUT / DELETE | `user:read` / `user:create` (approval only) or `user:update` (assignment) / `user:delete` |
| `/admin/permissions`; `/admin/roles`, `/admin/roles/{id}` | GET; GET / POST / PUT / DELETE | `role:read`; `role:read` / `role:create` / `role:update` / `role:delete` |

`PUT /api/v1/workday-policies` returns only the saved `{policy}`. Update-only users choose a replacement schedule from an empty draft; history requires `workday:read`. If Settings is the only available operational workspace, `/` opens it.

`GET /api/v1/search` searches only categories covered by `order:read`, `item:read`, or `customer:read`. Explicit forbidden categories return 403; an all-category request still returns empty arrays and zero counts for excluded categories.

`POST /api/v1/admin/roles` and `PUT /api/v1/admin/roles/{id}` accept `{name, description, permissions}`. Supply `[]` to clear grants; `*` and unknown grants are not assignable. Role metadata and grants save atomically; roles with assignees cannot be deleted. User assignments keep the existing `{role: string}` body. The list returns allowed target actions and assignable role IDs/names without requiring `role:read`.

Browser-local capabilities: `barcode:print` allows local label work; `logger_device:read` allows connecting and pulling readings; `logger_device:write` additionally allows hardware configuration/reset/format/display writes only with read access and an active connection. These control actions in this app, not use of hardware by other software.

The Go registry in `pkg/model/permission.go` owns the capability keys. After adding one, run `go generate ./pkg/model` to regenerate the TypeScript union and update the operation policy and role-editor locale copy.

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

## Typed Error and Vocabulary Policy

- Reusable application failures use sentinel errors and `errors.Is`/`errors.As`. Wrapped upstream causes remain inspectable; duplicate delivery-driver names are identified by SQLite's unique-constraint code, not error-message text.
- Closed business vocabularies are owned by `pkg/model/vocabulary.go`, `pkg/accurate/vocabulary.go`, and `web/src/domain.ts`; storage query/response and spreadsheet status fields remain strings to preserve unknown external values and exact wire/database spellings.
- Frontend routes and sort directions are centralized in `web/src/routes.ts` and `web/src/utils/tableSorting.ts`.

---

## License

MIT
