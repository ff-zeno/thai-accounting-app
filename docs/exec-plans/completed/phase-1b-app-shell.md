# Phase 1b: App Shell & Organization Management

**Status:** Complete (shipped 2026-03-15)
**Duration:** ~3-4 days
**Dependencies:** Phase 1a (infrastructure) completed
**Blocks:** Phase 2 (bank statements), all UI-dependent phases

## Goal

Build the application shell with navigation, organization management, and empty page stubs for all sections. After this phase, you can create an org, switch between orgs, and navigate to every section of the app (even though most pages are empty shells).

## Deliverables

### Next.js Layout

- Root layout (`src/app/layout.tsx`): HTML lang, font loading, metadata
- App group layout (`src/app/(app)/layout.tsx`): sidebar + main content area
- Sidebar navigation with all sections from the UI nav structure:
  - Dashboard
  - Bank Accounts
  - Documents (Expenses, Income, Upload)
  - Reconciliation
  - Tax & Filing (WHT Certificates, Monthly Filings, VAT, Calendar)
  - Vendors
  - Reports & Export
  - Settings
- Responsive: sidebar collapses on mobile (hamburger menu or sheet)
- Active route highlighting in sidebar

### shadcn/ui Setup

- Initialize shadcn/ui with Tailwind CSS 4
- Install base components used across the app:
  - Button, Input, Label, Select, Dialog, Sheet, Card
  - DropdownMenu (for org switcher)
  - Separator, Badge, Skeleton (for loading states)
  - Sonner or Toast (for notifications)
- Configure `components.json` with project paths

### Organization Switcher

- `src/components/layout/org-switcher.tsx`
- Dropdown in the sidebar header showing current org name
- Lists all orgs the user has access to (for now: all orgs, since no auth yet)
- "Create new organization" option in the dropdown
- Selected org stored in a cookie or URL parameter (persists across page navigations)
- Org context available to all pages via `src/lib/utils/org-context.ts`
- All database queries scoped by the selected org_id (application-level WHERE, not RLS)

### Organization CRUD

- **Create organization:** Dialog/form with fields:
  - Name (English)
  - Name (Thai)
  - Tax ID (13-digit, validated)
  - Branch number (5-digit, default `00000` for head office)
  - Registration number (optional)
  - Address (English)
  - Address (Thai)
  - VAT registered (boolean toggle)
  - Fiscal year end month (default: 12)
  - Fiscal year end day (default: 31)
- **Edit organization:** Same form, pre-filled with existing data
- **Switch organization:** Via org switcher dropdown, updates the active org context
- Server actions or API routes for create/update operations
- Validation: tax_id format (13 digits), branch_number format (5 digits)

### Users Stub

- `users` table exists in schema (from Phase 1a)
- No user management UI in this phase
- A default "System" user record created during org creation (for audit trail purposes)
- `created_by` fields on relevant tables reference this stub user

### Audit Log Table

- `audit_log` table exists in schema (from Phase 1a)
- Audit log middleware is NOT implemented in this phase (deferred to Phase 4)
- Table is empty but structurally ready
- Note in code: `// TODO Phase 4: Add audit log middleware when workflows stabilize`

### Page Shells

Empty pages with correct routes, page title, and a placeholder message ("Coming in Phase N"). Each page exists at its correct URL:

- `/dashboard` -- "Dashboard overview coming in Phase 6"
- `/bank-accounts` -- "Bank account management coming in Phase 2"
- `/bank-accounts/[accountId]` -- "Account details coming in Phase 2"
- `/bank-accounts/[accountId]/upload` -- "Statement upload coming in Phase 2"
- `/documents/expenses` -- "Expense documents coming in Phase 3"
- `/documents/income` -- "Income documents coming in Phase 3"
- `/documents/upload` -- "Document upload coming in Phase 3"
- `/documents/[docId]/review` -- "Document review coming in Phase 3"
- `/capture` -- "Mobile capture coming in Phase 3"
- `/reconciliation` -- "Reconciliation coming in Phase 4"
- `/reconciliation/review` -- "Reconciliation review coming in Phase 4"
- `/tax/wht-certificates` -- "WHT certificates coming in Phase 5"
- `/tax/monthly-filings` -- "Monthly filings coming in Phase 5"
- `/tax/vat` -- "VAT management coming in Phase 6"
- `/tax/calendar` -- "Filing calendar coming in Phase 5"
- `/vendors` -- "Vendor registry coming in Phase 2"
- `/vendors/[vendorId]` -- "Vendor details coming in Phase 2"
- `/reports` -- "Reports coming in Phase 6"
- `/settings` -- "Settings" (org edit form lives here, functional now)

### Settings Page

- `/settings` is the one non-shell page (besides org management)
- Shows the organization edit form for the current org
- Allows editing all organization fields

## Tests

### Organization CRUD Tests (Integration)
- Create an organization with all fields -- persists to database
- Create an organization with minimal fields (only required) -- defaults applied
- Edit organization name and tax_id -- changes saved
- Tax ID validation: reject non-13-digit values
- Branch number validation: reject non-5-digit values
- Fiscal year end defaults: month=12, day=31 when not specified

### Org Switcher Tests (Integration)
- With two orgs created, switching changes the active org context
- After switching, database queries return data scoped to the new org
- Org context persists across page navigation

### Component Rendering Tests (Unit)
- Sidebar renders with all navigation sections
- Org switcher renders with org name
- Page shell components render without errors
- Active route highlighted correctly in sidebar

### Route Accessibility Tests
- All page shell routes return 200 (not 404)
- Dynamic routes with placeholder IDs render the shell
- Layout renders consistently across all routes

## Checkpoint

Phase 1b is done when:

- [ ] Can create a new organization via the UI
- [ ] Can create a second organization
- [ ] Can switch between the two orgs using the org switcher
- [ ] Sidebar shows all navigation sections with correct links
- [ ] Every page shell route loads without error
- [ ] Settings page shows the org edit form and saves changes
- [ ] All component and integration tests pass
- [ ] Mobile viewport: sidebar collapses, navigation still accessible
