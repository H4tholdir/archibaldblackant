# Coding Conventions

**Analysis Date:** 2026-02-22

## Naming Patterns

**Files:**
- kebab-case for all modules: `customer-sync-service.ts`, `format-currency.ts`
- PascalCase for React components: `OrderFormSimple.tsx`, `CustomerCard.tsx`
- `*.spec.ts` / `*.spec.tsx` co-located with source for tests
- `-db.ts` suffix for database classes: `customer-db.ts`, `product-db.ts`
- `.service.ts` suffix for frontend services: `orders.service.ts`

**Functions:**
- camelCase for all functions: `formatCurrency()`, `getNextFtNumber()`
- `handle` prefix for event handlers: `handleSubmit`, `handleClick`
- Domain vocabulary from Italian business context used where appropriate

**Variables:**
- camelCase for variables: `warehouseQty`, `totalRevenue`
- UPPER_SNAKE_CASE for constants: `JWT_EXPIRY`, `JWT_ALGORITHM`
- `private` keyword for class members (no underscore prefix)

**Types:**
- PascalCase, no I prefix: `OrderData`, `UserRole`, `JWTPayload`
- `{ComponentName}Props` for React props: `EntityBadgeProps`
- Prefer `type` over `interface` (per CLAUDE.md C-8)
- `import type { ... }` for type-only imports (per CLAUDE.md C-6)

**Classes:**
- PascalCase with purpose suffix: `CustomerDatabase`, `OrderService`, `QueueManager`, `BrowserPool`
- Singleton: `private static instance`, `getInstance()`

## Code Style

**Formatting:**
- 2-space indentation
- Double quotes for strings
- Semicolons required
- No explicit Prettier config (implicit defaults)

**TypeScript:**
- Strict mode enabled in both frontend and backend tsconfig
- `noUnusedLocals`, `noUnusedParameters` in frontend

**Linting:**
- No explicit ESLint config
- TypeScript strict mode acts as primary linter
- Type-check commands: `npm run type-check` (frontend), `npm run build` (backend)

## Import Organization

**Order:**
1. External packages (react, express, vitest)
2. Internal types (`import type { ... }`)
3. Internal modules (services, utils)
4. Relative imports (./local)

**Grouping:**
- `import type { ... }` always separate from value imports
- Named imports preferred over default exports

**Path Aliases:**
- No path aliases configured (relative imports used)

## Error Handling

**Patterns:**
- Try/catch at route handler level in backend
- EventEmitter 'error' events for async operations
- `fetchWithRetry` utility for resilient API calls on frontend
- Sync services emit progress/error events

**Error Types:**
- HTTP status codes for API errors (400, 401, 403, 500)
- Descriptive error messages in response body
- JWT 401 triggers auto-refresh or re-login

## Logging

**Framework:**
- Winston logger in backend (`backend/src/logger.ts`)
- Console + file transports (error.log, combined.log)
- Configurable via `LOG_LEVEL` env var

**Patterns:**
- Structured logging at service boundaries
- `[ServiceName]` prefix pattern in some services
- console.log still present in some frontend code

## Comments

**When to Comment:**
- Self-documenting code preferred (per CLAUDE.md C-7)
- Comments only for critical caveats
- TODO comments for deferred work with phase reference

**TODO Format:**
- `// TODO: description` or `// TODO_FUTURE_FEATURE: description`
- Phase references when deferring work

## Function Design

**Size:**
- Small, composable, testable functions preferred (per CLAUDE.md C-4)
- Avoid extraction unless reuse, testability, or readability demands it (per CLAUDE.md C-9)

**Parameters:**
- Destructured objects for complex params
- `Pick<Type>` for partial type usage in function signatures

**Return Values:**
- Explicit returns
- Early return for guard clauses

## Module Design

**Exports:**
- Named exports preferred
- Default exports for React page components
- Singleton `getInstance()` for service classes

**Database Classes:**
- Singleton pattern with `getInstance(dbPath?)`
- Standard CRUD: `insert()`, `update()`, `delete()`, `search()`, `getAll()`

**React Components:**
- Inline styles consistent across codebase (no CSS modules)
- Custom hooks encapsulate business logic
- Context API for shared state (PrivacyContext, WebSocketContext)

---

*Convention analysis: 2026-02-22*
*Update when patterns change*
