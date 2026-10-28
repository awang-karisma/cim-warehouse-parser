---
name: Warehouse Parser
description: High-clarity operational ledger, dispatch planner, and physical label studio for NTB warehouse workflows.
colors:
  primary: "#18181b"
  primary-foreground: "#fafafa"
  background: "#ffffff"
  foreground: "#09090b"
  secondary: "#f4f4f5"
  muted-foreground: "#71717a"
  border: "#e4e4e7"
  sidebar-bg: "#fafafa"
  status-selesai: "#10b981"
  status-proses: "#f59e0b"
  status-belum-selesai: "#eab308"
  status-pending: "#a855f7"
  status-batal: "#ef4444"
  destructive: "#ef4444"
typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.04em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.04em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  card-surface:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "24px"
  badge-selesai:
    backgroundColor: "{colors.status-selesai}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
  input-field:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "40px"
---

# Design System: Warehouse Parser

## Overview

**Creative North Star: "The Telemetry Dispatch Ledger"**

Warehouse Parser is an operational instrument built for high-density spreadsheet reconciliation, warehouse shelf picking, and precision barcode/manifest printing across West Nusa Tenggara (NTB). Its visual architecture pairs a disciplined, monochrome industrial zinc frame with high-signal telemetry accents that speak only when reporting fulfillment state, stock readiness, or synchronization health.

Across desktop administration tables and one-handed mobile picking drawers, the interface favors structural clarity over decorative ornament. Chrome recedes into crisp 1px hairlines and neutral zinc surfaces so operators can scan hundreds of e-catalog codes (`EP-*`), hospital aliases, partial delivery schedules, and physical label grids without visual fatigue. When digital state meets paper—whether on an A4 delivery manifest or a 50×30mm thermal roll—the screen acts as an exact 1:1 physical proof.

**Key Characteristics:**
- **Monochrome Structural Chrome**: Navigation, toolbars, cards, and table shells rely on Carbon Slate, Paper White, and Zinc Mist so chromatic saturation is strictly reserved for operational status telemetry.
- **5-Channel Status Telemetry**: Canonical Indonesian fulfillment states (`SELESAI`, `PROSES`, `BELUM SELESAI`, `PENDING`, `BATAL`) map to five distinct, theme-adaptive semantic hues used consistently across badges, segmented distribution bars, and line-item progress meters.
- **Uniform Tabular Rhythm**: All operational tables share a standardized outer `DataTable` shell (`6px` radius, `1px` border) with `12px` (`px-3 py-3`) cell padding and `44px` (`h-11`) headers.
- **Floor-to-Print Continuity**: Responsive layouts collapse multi-column desktop filters and sidebars into mobile `Sheet` drawers, while `@media print` strips all application chrome to output zero-margin physical labels and manifests.

## Colors

The palette contrasts a quiet, achromatic zinc foundation against five high-legibility operational telemetry hues that adapt across light and dark modes.

### Primary
- **Carbon Slate** (`hsl(240 5.9% 10%)` light / `hsl(0 0% 98%)` dark): Primary action buttons, active sidebar emblems, focus rings, and primary command triggers.
- **Stark Alabaster** (`hsl(0 0% 98%)` light / `hsl(240 5.9% 10%)` dark): Foreground text and icons atop primary actions.

### Secondary
- **Fulfillment Emerald** (`--status-selesai`, `#10b981` light / `#34d399` dark): Completed orders (`SELESAI`, `DONE`, `READY`), 100% line-item delivery bars, and healthy worker sync indicators.
- **Dispatch Amber** (`--status-proses`, `#f59e0b` light / `#fbbf24` dark): In-progress shipments (`PROSES`, `PARTIAL`), active picking runs (`PICKING`), and partial delivery progress bars.
- **Backlog Gold** (`--status-belum-selesai`, `#eab308` light / `#facc15` dark): Unfinished order backlog (`BELUM SELESAI`) requiring warehouse attention.

### Tertiary
- **Hold Violet** (`--status-pending`, `#a855f7` light / `#c084fc` dark): Customer-requested holds (`PENDING`) and zero-progress awaiting queues, visually distinct from routine backlog.
- **Alert Crimson** (`--status-batal`, `#ef4444` light / `#f87171` dark): Cancelled orders (`BATAL`, `CANCEL`), sync errors, and destructive actions.

### Neutral
- **Paper White** (`hsl(0 0% 100%)` light / `hsl(240 10% 3.9%)` dark): Root canvas, card surfaces, and data table backgrounds.
- **Deep Charcoal** (`hsl(240 10% 3.9%)` light / `hsl(0 0% 98%)` dark): High-contrast primary body copy, customer titles, and numeric quantities.
- **Zinc Mist** (`hsl(240 4.8% 95.9%)` light / `hsl(240 3.7% 15.9%)` dark): Secondary buttons, table header/hover tints, progress tracks, and expandable order tray backgrounds.
- **Muted Slate** (`hsl(240 3.8% 46.1%)` light / `hsl(240 5% 64.9%)` dark): Secondary labels, timestamps, column headers, and empty-state helper text.
- **Hairline Zinc** (`hsl(240 5.9% 90%)` light / `hsl(240 3.7% 15.9%)` dark): 1px structural borders on cards, inputs, tables, and sidebar dividers.

### Named Rules
**The Telemetry-Only Chroma Rule.** Saturated color is reserved exclusively for semantic status badges, fulfillment progress bars, stock readiness indicators, and destructive alerts. Structural navigation, headers, and containers remain strictly achromatic zinc.

**The Tinted-Fill Badge Rule.** Status badges never use full-bleed saturated backgrounds in tables; they pair a `15%` opacity semantic background (`bg-status-*/15`) with a `30%` opacity border (`border-status-*/30`) and full-strength semantic text so dense tables remain calm and readable.

## Typography

**Display Font:** Inter (with `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` fallbacks)
**Body Font:** Inter (with system sans-serif fallbacks)
**Label/Mono Font:** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`

**Character:** Utilitarian, high-x-height neo-grotesque typography engineered for rapid scanning of Indonesian regional names, hospital aliases, and numeric shipment counts, paired with crisp monospace for e-catalog identifiers (`EP-*`), order IDs (`ORD-0001`), and barcode strings.

### Hierarchy
- **Display** (`700`, `1.875rem` / `30px`, line-height `1.2`): Primary KPI metrics on Dashboard and Timeline cards (`text-2xl` to `text-3xl font-bold tracking-tight`).
- **Headline** (`600`, `1.25rem` / `20px`, line-height `1.3`): Page section headers and modal titles (`text-xl font-semibold tracking-tight`).
- **Title** (`600`, `1.125rem` / `18px`, line-height `1.4`): Card titles (`CardTitle`, `text-lg font-semibold leading-none tracking-tight`).
- **Body** (`400`–`500`, `0.875rem` / `14px`, line-height `1.5`): Standard table cell content, form inputs, and operational descriptions (`text-sm`).
- **Label** (`600`, `0.6875rem` / `11px`, letter-spacing `0.04em`, uppercase): Status badges (`text-[11px] font-semibold uppercase tracking-wide`) and KPI card overlines (`text-xs font-semibold uppercase tracking-wider`).

### Named Rules
**The Monospace Identifier Rule.** E-catalog numbers (`EP-[A-Z0-9]+`), generated order codes (`ORD-0001`), user role tags, email addresses, and raw barcode symbology strings must render in monospace so character alignment and alphanumeric scanning are unambiguous.

## Layout

The application uses a viewport-constrained flex shell (`SidebarProvider` with `--sidebar-width: 16rem` and `SidebarInset` enforcing `min-w-0`) that prevents horizontal page overflow while allowing wide tabular datasets to scroll cleanly within `DataTable` containers.

- **Page Padding & Rhythm**: Main workspace content uses `16px` (`p-4`) on mobile and `24px` (`md:p-6`) on desktop, with `16px`–`24px` (`gap-4` to `gap-6`) vertical stack rhythm between KPI grids, filter toolbars, and tables.
- **Responsive Filter Toolbars**: Search and filter bars stack in 1 column below `640px` (`sm`), 2 columns at tablet (`sm`), and inline flex rows at desktop (`lg` / `1024px`).
- **Uniform Table Density**: All data tables standardize on `44px` (`h-11 px-3`) headers and `12px` (`px-3 py-3`) cell padding. Orders list rows expand inline to reveal a 5-column line-item tray (`#`, `Item Name`, `Progress`, `Status Order`, `Status Barang`) without leaving the page.
- **Mobile Workspace Drawers**: On viewports below `lg`, multi-pane workspaces like Delivery Flow collapse secondary filter/dispatch panels and run switchers into slide-over `Sheet` drawers triggered by floating action buttons.

## Elevation & Depth

Warehouse Parser relies on **structural 1px hairlines (`#e4e4e7`) paired with whisper-quiet surface elevation**. Depth is functional rather than theatrical: cards sit cleanly on the canvas with a subtle `shadow-sm` lift, tabular rows separate via crisp horizontal borders and muted hover fills (`bg-muted/50`), and deeper shadows appear only when representing physical paper sheets or modal overlays.

### Shadow Vocabulary
- **Card Rest Elevation** (`box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05)`): Applied to `Card` containers to gently separate KPI blocks and settings sections from the background canvas.
- **Physical Print Sheet Proof** (`box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)`): Applied exclusively to `.print-sheet` in the Barcode Printer canvas to signify a physical A4 sheet or thermal label roll floating over the dark/muted preview stage.

### Named Rules
**The Structural Hairline Rule.** Every card, table shell, input field, and sidebar boundary is anchored by a `1px solid` border (`hsl(var(--border))`). Never rely on drop shadows alone to define container edges.

## Shapes

Corner geometry follows a tight `8px` (`--radius: 0.5rem`) base scale that keeps dense operational forms crisp and aligned:
- **Cards & Modals**: Gently rounded corners (`8px` / `rounded-lg`).
- **Buttons, Inputs, DataTables & Status Badges**: Crisp operational corners (`6px` / `rounded-md`), with optional full-pill (`9999px`) reserved for progress bars (`ItemProgress`), avatars, and count chips.
- **Print Isolation Geometry**: Inside `.print-sheet` and `.delivery-print-sheet`, screen-only dashed guide outlines (`1px dashed rgba(100, 116, 139, 0.4)`) assist layout alignment on screen and vanish completely under `@media print`.

## Components

### Buttons
Utilitarian, keyboard-accessible Kobalte triggers with crisp `6px` corners and immediate state feedback.
- **Shape:** `6px` radius (`rounded-md`), standard height `40px` (`h-10 px-4 py-2`), compact `36px` (`h-9 px-3 text-xs`), icon square `40px` (`size-10`).
- **Primary:** Carbon Slate background (`bg-primary`) with Stark Alabaster text (`text-primary-foreground`), shifting to `90%` opacity on hover.
- **Hover / Focus:** `2px` offset ring in Carbon Slate (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`).
- **Secondary / Outline / Ghost / Destructive:** Zinc Mist fill (`bg-secondary`), 1px hairline stroke (`border-input hover:bg-accent`), transparent toolbar action (`hover:bg-accent`), and Alert Crimson (`bg-destructive`) for irreversible deletions.

### Chips
Semantic status badges (`Badge.tsx`) and shipment schedule tokens (`DeliveryDateBadges.tsx`) engineered for rapid tabular scanning.
- **Style:** `6px` radius (`rounded-md`), `11px` uppercase semibold text (`tracking-wide`), `15%` semantic fill with `30%` semantic border.
- **State:** Maps canonical Indonesian domain statuses (`SELESAI`, `PROSES`, `BELUM SELESAI`, `PENDING`, `BATAL`, `STOK GUDANG`, `PROSES ORDER`, `DELIVERY VENDOR`) directly to their dedicated telemetry tokens without mutating the underlying text.

### Cards / Containers
Structured operational modules (`Card`) and tabular shells (`DataTable`).
- **Corner Style:** `8px` (`rounded-lg`) for `Card`; `6px` (`rounded-md`) for `DataTable`.
- **Background:** Paper White (`bg-card`) in light mode, Deep Charcoal (`hsl(240 10% 3.9%)`) in dark mode.
- **Shadow Strategy:** `shadow-sm` on `Card`; flat `0` shadow on `DataTable`.
- **Border:** `1px solid` Hairline Zinc (`border`).
- **Internal Padding:** `24px` (`p-6`) on `CardHeader` and `CardContent` (`pt-0`).

### Inputs / Fields
High-clarity text inputs (`TextFieldInput`) and searchable comboboxes (`AreaCombobox`).
- **Style:** `40px` height (`h-10`), `6px` radius (`rounded-md`), `1px solid` Hairline Zinc (`border-input`), `12px` horizontal padding (`px-3 py-2`), `14px` text (`text-sm`).
- **Focus:** `2px` ring with `2px` background offset (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`).
- **Error / Disabled:** Destructive border/label highlight (`data-[invalid]:border-error-foreground`) and `50%` opacity when disabled.

### Navigation
Collapsible left `AppSidebar` (`16rem` expanded, icon-rail collapsed) paired with a `64px` (`h-16`) top breadcrumb and user session bar.
- **Style:** Zinc Alabaster (`--sidebar-background: 0 0% 98%`) with `14px` medium links, `16px` Tabler icons, active route highlight (`bg-sidebar-accent`), and a live `SyncStatusFooter` displaying real-time SSE worker status and next-sync countdown. Mobile viewports auto-dismiss the navigation drawer on route selection.

### ItemProgress & Print Canvas (Signature Components)
- **ItemProgress:** Compact inline fulfillment meter combining a `8px` (`h-2`) rounded track (`bg-secondary`), a semantic fill bar (`bg-status-selesai` at 100%, `bg-status-proses` for partial, `bg-status-pending` at 0%), a right-aligned percentage readout, and a `sent / ordered unit` sub-label.
- **Barcode & Manifest Print Canvas:** Live-scaled vector sheet preview (`.print-sheet`, `.delivery-print-sheet`) that renders exact physical millimeter dimensions (`mm`) for Tom & Jerry sheets, thermal rolls, and A4 manifests, stripping all UI chrome during `@media print`.

## Do's and Don'ts

### Do:
- **Do** use the five `--status-*` tokens (`selesai`, `proses`, `belum-selesai`, `pending`, `batal`) for all order, item, and sync state indicators so status colors mean the exact same thing on every screen.
- **Do** wrap all page-level tables in `DataTable` with `px-3 py-3` cells and `h-11 px-3` headers to preserve uniform row density.
- **Do** preserve stored Indonesian database values (`BELUM SELESAI`, `STOK GUDANG`, regional NTB areas, customer aliases) verbatim while allowing UI chrome labels to switch between English (`en`) and Indonesian (`id`).
- **Do** constrain flex children with `min-w-0` and keep dialogs within `w-[calc(100vw-2rem)] max-w-lg` so 320px–375px warehouse mobile screens never suffer horizontal overflow.

### Don't:
- **Don't** introduce decorative gradients, marketing hero banners, or saturated background fills on structural cards, sidebars, or table headers.
- **Don't** label an order `BATAL` unless every single line item in that order has a cancellation status (`BATAL` or `CANCEL`).
- **Don't** let application shell chrome (sidebar, breadcrumbs, filter toolbars, or screen borders) leak into `@media print` output for barcode labels or delivery manifests.
