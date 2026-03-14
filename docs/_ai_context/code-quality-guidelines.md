# Code Quality Guidelines

Project-specific conventions for a Next.js 16 / TypeScript / React 19 / Tailwind v4 app. Update as conventions evolve.

## Naming Conventions

- Components: PascalCase (`InvoiceList.tsx`)
- Hooks: `use` prefix, camelCase (`useInvoiceData.ts`)
- Utilities/helpers: camelCase (`formatCurrency.ts`)
- Route segments: kebab-case (`src/app/tax-reports/page.tsx`)
- Types/interfaces: PascalCase, no `I` prefix (`Invoice`, not `IInvoice`)
- Be consistent with surrounding code even if you prefer a different convention

## Next.js Patterns

- Use App Router conventions: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`
- Prefer Server Components by default — add `'use client'` only when needed (state, effects, browser APIs)
- Use Server Actions for form submissions and mutations
- Colocate components with their route when they are route-specific
- Shared components go in `src/components/`

## TypeScript

- Prefer `interface` for object shapes, `type` for unions and intersections
- Do not use `any` — use `unknown` and narrow, or define the type
- Use strict mode — the tsconfig enforces this

## Error Handling

- Check every error return — do not discard errors silently
- Wrap errors with context: where the error happened and what was being attempted
- Validate inputs at system boundaries (API routes, external data)
- Do not validate inputs between internal functions that you control
- Use `error.tsx` boundary files for route-level error handling

## Testing Patterns

- Test behavior, not implementation — tests should survive refactoring
- Prefer real dependencies over mocks when they are fast and deterministic
- Mock only external services, slow I/O, or non-deterministic behavior
- Each test should verify one specific behavior

## Code Organization

- Follow the existing directory structure and module organization
- Do not create abstractions for one-time operations
- Three similar lines of code is better than a premature abstraction
- Keep changes minimal — only modify what is needed for the current task

## Styling

- Use Tailwind utility classes — avoid custom CSS unless necessary
- Extract repeated class combinations into components, not CSS classes
- Use Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`) for breakpoints

## Common Anti-Patterns to Avoid

- Adding error handling for scenarios that cannot happen
- Creating helper utilities used only once
- Adding comments that restate what the code does
- Over-engineering with feature flags or configuration for simple changes
- Using `'use client'` unnecessarily on components that could be Server Components
- Wrapping everything in `try/catch` instead of letting error boundaries handle it
