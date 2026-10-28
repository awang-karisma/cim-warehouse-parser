# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary Users**: Internal warehouse operations staff, dispatch supervisors, and order administrators operating in West Nusa Tenggara (NTB, Indonesia).
- **Situations & Jobs**:
  - **Order & Fulfillment Administrators**: Track institutional and e-catalog (`EP-*`) orders, reconcile customer name variants via aliases, monitor item fulfillment status and workday-calculated delivery lead times, and manage synchronization schedules and workday policies.
  - **Dispatch Supervisors**: Filter stock-ready unfinished line items, group orders by regional NTB destination areas, plan partial or full shipment quantities, assign or reassign delivery drivers on the fly, and print structured A4 delivery manifests with signature blocks.
  - **Warehouse Floor & Receiving Staff**: Execute touchscreen-friendly warehouse picking checklists (by destination order or consolidated shelf pick list) on mobile/tablet devices, scan or look up inventory items from Accurate Online, and print barcode/QR sticker sheets (Tom & Jerry No. 108/121), continuous thermal roll labels (50×30mm, 40×20mm), custom page designs, and A4 stock opname audit sheets.

## Product Purpose

`Warehouse Parser` is an internal warehouse operations, order normalization, dispatch planning, and barcode printing system. It eliminates manual data-entry friction and operational blind spots caused by semi-structured human-maintained tracking spreadsheets while actively bridging warehouse workflows into **Accurate Online** as the long-term primary source of truth.

Success means operators can reliably search, plan, pick, label, and dispatch warehouse orders across desktop and mobile floor devices without data tearing, spreadsheet formatting fragility, or disruption during the transition from Google Sheets to Accurate Online.

## Positioning

Unlike generic ERP dashboards or rigid spreadsheet viewers, `Warehouse Parser` combines domain-specific normalization for human-maintained NTB order sheets (forward-filling omitted cells, tokenizing freeform multi-shipment strings, resolving regional abbreviations and hospital/clinic aliases, and computing policy-aware workday lead times) with source-agnostic operational workspaces (`Delivery Flow` and `Barcode Printer`) that persist independently of spreadsheet resyncs and connect directly to Accurate Online inventory and transactions.

## Operating Context

- **Dual-Source Transition (Google Sheets $\rightarrow$ Accurate Online)**:
  - Ingests live order tracking spreadsheets (`PESANAN` tab via Google Sheets API v4 or local CSV fallback) into an atomic embedded SQLite WAL mirror (`SyncMirror`) on a scheduled worker loop (`08:00–17:00` WITA / `Asia/Makassar`, Monday–Saturday) with real-time Server-Sent Events (SSE) updates.
  - Connects to Accurate Online via dual provider implementations (`official` HMAC-signed Bearer token API and `web` automated session with MFA/TOTP support) to query live inventory items and import six transaction document types (`receive-item`, `purchase-order`, `sales-order`, `delivery-order`, `stock-opname-order`, `stock-opname-result`).
  - Uses source-agnostic item keys (`source_key`) in `Delivery Flow` so active dispatch runs and picking states survive spreadsheet resyncs, database clears, and the migration from Google Sheets to Accurate Online.
- **Physical & Hardware Environment**:
  - Used at office desks (wide tabular analysis, alias management, route planning) and on warehouse floors via mobile phones/tablets (touchscreen shelf picking, sudden driver reassignment, barcode scanning).
  - Drives physical print media with zero-margin `@media print` isolation: A4 delivery manifests, A4 stock opname audit sheets, Tom & Jerry die-cut sticker sheets (No. 108 & No. 121), continuous thermal label rolls (50×30mm, 40×20mm), and persistent custom label grid designs.

## Capabilities and Constraints

- **Bilingual UI (Per-User Configurable) with Immutable Stored Data**:
  - The user interface must support both **English (`en`) and Indonesian (`id`)**, configurable per user.
  - **Stored Database Values Remain Untouched**: All data persisted in SQLite—including canonical domain statuses (`BELUM SELESAI`, `SELESAI`, `PROSES`, `PENDING`, `BATAL`), stock readiness markers (`STOK GUDANG`, `DP`, `indent`), regional NTB area names (`Lombok Barat`, `Lombok Timur`, `Lombok Tengah`, `Lombok Utara`, `Kota Mataram`, `Sumbawa`, `Bima`, `Dompu`, etc.), customer names, aliases, and operator notes (`keterangan`, `catatan`)—must remain stored and queried verbatim as-is.
- **Role-Based Access Control (RBAC)**:
  - Google OAuth 2.0 authentication (`warehouse_session` JWT cookies backed by authoritative SQLite user lookup on every request; optional bypass when `GOOGLE_CLIENT_ID` is unset for local/dev use).
  - Four privilege tiers:
    - `guest`: Newly authenticated accounts awaiting approval.
    - `user`: Operational read/execution access (dashboard, orders, items, customers, aliases view/export, delivery flow planning & picking, barcode printing).
    - `admin`: Configuration and management control (manual sync triggers, customer alias CRUD & JSON import, workday policy updates, custom barcode page design CRUD, database reset, approving `guest` $\rightarrow$ `user`, deleting `guest`/`user` accounts).
    - `superadmin`: Full user and admin role lifecycle management (`SUPERADMIN_EMAILS`).
  - Public `/privacy` and `/terms` routes remain accessible without authentication.
- **Domain Invariants**:
  - Order-level cancellation dominance: an order resolves to `BATAL` only when every line item is cancelled (`BATAL` or `CANCEL`); mixed orders evaluate active item precedence (`BELUM SELESAI` > `PROSES` > `PENDING`).
  - Workday lead times are computed strictly for completed (`SELESAI`) items with `sent >= ordered` against chronological date-effective `workday_policies`, dividing active workdays in `(orderDate, latestDeliveryDate]` by the shipment entry count.
  - Single-binary deployment portability: Go backend (`CGO_ENABLED=0`, `modernc.org/sqlite`) with embedded SolidJS frontend assets (`embed_frontend`).

## Brand Commitments

- **Product Name**: `Warehouse Parser` (with `Admin Console` / `Warehouse Order Tracking` operational descriptors).
- **Voice & Tone**: Direct, utilitarian, high-clarity operational language in both English and Indonesian UI locales, avoiding marketing fluff in task-critical views.

## Evidence on Hand

- Production-representative Go backend (`cmd/`, `pkg/`) and SolidJS + Tailwind CSS v4 + Kobalte SPA (`web/src/`).
- Live operational surfaces: `Dashboard`, `Orders`, `OrderDetail`, `Items`, `Customers`, `CustomerAliases`, `Areas`, `DeliveryFlow`, `Timeline`, `Barcode`, `Sync`, `Search`, `Settings`, `Users`, `Login`, `PendingApproval`, `Privacy`, and `Terms`.
- OpenAPI 3.1 specification (`/openapi.json`) and Scalar API reference (`/docs`).
- *Absence note*: Do not fabricate external customer testimonials, third-party SLA benchmarks, or public pricing tiers; this is an internal operational platform.

## Product Principles

1. **Migration Resilience Over Source Coupling**: Operational workflows (dispatch runs, picking lists, barcode queues, alias maps, custom label designs) must remain decoupled from raw spreadsheet row volatility so the transition from Google Sheets to Accurate Online is seamless.
2. **Untouched Data Truth, Localized Interface**: Never mutate or translate canonical database values to fit UI localization; render stored domain records faithfully while allowing each operator to switch UI chrome between English and Indonesian.
3. **Floor-to-Desk Continuity**: Every core operational flow must work both for dense desktop administration and one-handed mobile/tablet execution on the warehouse floor, paired with exact-dimension print outputs when digital state meets physical paper or labels.
4. **Atomic & Auditable State**: Multi-record updates (mirror syncs, alias imports, workday policy recalculations, picking status transitions) execute atomically with clear operator feedback on whether changes affect live state immediately or on the next synchronization cycle.
