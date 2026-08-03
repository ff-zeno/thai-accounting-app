# Consolidated Design Guidance — 2026-08-01

## Decision

The default owner experience becomes a focused projection of the existing accounting system: **Home, Bank, Documents, Tax, and More**.

This request supersedes the July 2026 decision only for the default owner foreground.
It explicitly reverses that decision's “More dies” outcome: More returns as the focused owner projection's advanced-capability bucket, not as a restoration of the old menu model.
Keep the July implementation assets: the shared navigation registry, pins, Reports hub, responsive shell, Help sidebar, React Flow renderer, routes, and deep links.
Do not remove accounting capability or move routes for information-architecture reasons.

`docs/exec-plans/active/owner-mode-ux-reset.md` should become the single authoritative active plan.
It must record the July shipment, replace its stale baseline, and link to rather than duplicate `ui-consistency.md`, `design-refresh.md`, the July navigation review, and the accounting structure map.

## Current state

- The App Router contains 79 pages.
- `src/lib/nav/structure.ts` exposes 47 entries across seven tier-one categories plus Settings.
- The product already has a capable owner loop: document capture and review, bank reconciliation, tax obligations, and close.
- The Help sidebar, bilingual glossary, and three lazy-loaded static React Flow diagrams are shipped.
- `HELP_CONTENT` has 11 route-prefix entries; high-stakes `/tax` guidance is absent and many routes use generic fallback guidance.
- `ui-consistency.md` identifies the near-term UI bottleneck: bespoke tables, ad-hoc forms, and fragmented status presentation.
- VAT has a materialisation/source-of-truth decision to resolve before a user-facing lifecycle table or diagram can be truthful.

## Product principles

1. The monthly loop is the default surface; advanced capability is progressive disclosure.
2. Bank movement is explained by documents; tax consumes reconciled outcomes.
3. Every compliance decision gets bilingual, point-of-need explanation.
4. Profile flags determine visibility; users do not see inapplicable modules.
5. Each domain status has one bilingual rendering, tone, icon, and explanation.
6. Every filing number drills down to source evidence and filing state.
7. AI proposes; people confirm.
8. Stable deep links outlive navigation changes.
9. Desktop and mobile use the same navigation and disclosure data.

## Owner projection

| Foreground | Change |
| --- | --- |
| Home | Keep as the attention and monthly-readiness cockpit. |
| Bank | Make reconciliation a Bank workspace tab or subflow. Preserve all `/reconciliation/*` URLs. |
| Documents | Keep capture, extraction review, and evidence queues together. |
| Tax | Make This Month the tax entry point, then reveal the relevant workbench. |
| More | Hold Operations, Accounting, Reports, Copilot, admin, advanced settings, and enabled optional modules. |

Profile-gate Sales/POS, Payroll and Assets, and PP36-related surfaces using existing organisation flags.
A non-POS, no-employee service business should see no more than five primary choices.

## Immediate work

1. **Truth pass.** Amend `owner-mode-ux-reset.md` to distinguish shipped July work from the new owner projection.
2. **Simplify navigation.** Implement the five-choice projection with profile gating and mobile parity.
3. **Standardise owner UI.** Execute the owner-facing portion of `ui-consistency.md`: status registry, page/composite patterns, and shared data-table adoption for document, bank, and tax surfaces.
4. **Resolve VAT truth.** Decide and test the materialisation contract before implementing VAT/WHT lifecycle tables or diagrams.
5. **Expand guidance where decisions happen.** Add `/tax` guidance, inline explainers, foreground-route coverage checks, valid CTA checks, and an ordered textual equivalent for every diagram.

Useful composite names to fold into `ui-consistency.md`: `PageFrame`, `WorkflowHeader`, `ReadinessSummary`, `WorkQueue`, `EvidenceTable`, `ReviewDrawer`, and `FilingCard`.

## React Flow and documentation guidance

Keep React Flow as a static explanatory projection.
It must not calculate readiness, persist edits, or mutate accounting state.

Keep the existing `step`, `action`, `outcome`, and `note` vocabulary.
Add `decision` and `state` only when required by a new diagram.

The next useful diagrams are:

1. First-run setup and bank-statement-to-match workflows.
2. Tax deadline and PP36-to-PND54 statutory explanations.
3. VAT and WHT lifecycles after their underlying state transitions are authoritative.

Runtime Help content and the glossary are the user-facing authority.
Domain code and reviewed accounting rules remain the accuracy authority.
`docs/_ai_context/accounting-structure-map.md` is engineering evidence and a useful source for discovering relationships, not direct owner copy.

Every published diagram needs an ordered text or checklist equivalent because `FlowViewer` makes nodes non-focusable.
Extend `src/lib/help/content.test.ts` for flow IDs, foreground-route/topic coverage, and CTA validity.

## Explicit non-goals

Do not start a content-platform migration, MDX conversion, React Flow editor, in-app developer structure map, schema split, broad domain-module refactor, service-layer rewrite, command palette, or persistent global period context.
Capture architecture refactors as ADR-level proposals after owner-mode work proves the need.

## Review reconciliation

The independent Sol and Fable reviews agreed on simplifying the owner surface, completing UI consistency work, preserving routes and capability, making diagrams explanatory, and resolving VAT truth before lifecycle UX.

Sol’s peer review corrected Fable’s stale measurements: approximately 39, not 68, routes use generic Help fallback; CI exists; and the query surface is larger than initially stated.
Fable’s peer review agreed with the focused owner projection and UI-consistency priority, but recommended that runtime Help—not the engineering structure map—own user-facing content.
Fable’s reciprocal critique was recovered from terminal output after its session was interrupted; no repository changes occurred.
