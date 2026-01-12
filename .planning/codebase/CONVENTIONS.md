# Coding Conventions

**Analysis Date:** 2026-01-11

## Naming Patterns

**Files:**
- Backend: kebab-case for all files (`queue-manager.ts`, `customer-db.ts`, `adaptive-timeout-manager.ts`)
- Frontend: PascalCase.tsx for React components (`OrderForm.tsx`, `SyncButton.tsx`)
- Frontend: camelCase.ts for utilities and hooks (`useVoiceInput.ts`, `orderParser.ts`)
- Test files: `*.test.ts` pattern (Vitest convention, but no tests present)

**Functions:**
- camelCase for all functions (backend and frontend)
- Descriptive action verbs: `parseVoiceOrder()`, `handleOrderCreated()`, `acquireSyncLock()`, `normalizeArticleCode()`
- No special prefix for async functions

**Variables:**
- camelCase consistently throughout
- Boolean prefixed with `is`: `isListening`, `isSupported`, `isLoggedIn`, `syncInProgress`
- State variables: `showCustomerDropdown`, `customersLoaded`, `loadingProducts`
- Constants: No UPPER_SNAKE_CASE pattern observed (inline strings/numbers used)

**Types:**
- PascalCase for interfaces: `Customer`, `Product`, `OrderData`, `SyncProgress`
- PascalCase for type aliases
- No `I` prefix on interfaces (not ICustomer, just Customer)
- Class names: PascalCase (`ArchibaldBot`, `BrowserPool`, `QueueManager`, `CustomerDatabase`)

## Code Style

**Formatting:**
- No `.prettierrc` config file found
- 2-space indentation (inferred from code)
- Double quotes for strings (backend and frontend)
- Semicolons consistently used on all statements
- Trailing commas in multi-line objects/arrays

**Linting:**
- No `.eslintrc` config file found
- TypeScript strict mode enabled (`tsconfig.json`)
- Frontend enables `noUnusedLocals` and `noUnusedParameters`

## Import Organization

**Backend Imports:**
- Named imports preferred: `import { logger } from './logger'`
- Default imports for libraries: `import express from 'express'`
- Type imports for TypeScript: `import type { Request, Response } from 'express'`
- File extensions omitted (Node resolution)

**Frontend Imports:**
- Named imports for React hooks: `import { useState, useEffect } from 'react'`
- Default imports for components: `export default function OrderForm() {}`
- Type imports: `import type { OrderItem } from '../types/order'`

**Patterns Observed:**
- External packages first
- Internal modules second
- Relative imports last
- No enforced ordering (no import sorting tool detected)

## Error Handling

**Patterns:**
- Services throw errors with descriptive messages
- API handlers catch errors and return appropriate HTTP status codes
- Winston logger.error() called with context before throwing/returning
- Try/catch blocks at service boundaries
- Puppeteer operations wrapped in custom `runOp()` for timing and error capture

**Error Types:**
- Standard Error class used throughout (no custom error classes)
- Error messages include context: `new Error(\`Failed to sync customers: \${error.message}\`)`

## Logging

**Framework:**
- Winston logger (`backend/src/logger.ts`)
- Levels: debug, info, warn, error
- Console + file output (`logs/error.log`, `logs/combined.log`)

**Patterns:**
- Structured logging with metadata: `logger.info('Message', { key: value })`
- Timing metadata automatically added (deltaMs, logSeq)
- Colored console output for development
- Italian comments + English log messages

**What NOT to do:**
- Avoid `console.log()` in production code (use logger instead)
  - Note: Many `console.log()` statements currently present (tech debt)

## Comments

**When to Comment:**
- Explain "why" not "what" - code should be self-explanatory
- Document business logic and non-obvious workarounds
- JSDoc for complex functions (optional, not enforced)
- Italian language used throughout backend comments (domain-specific choice)

**Patterns Observed:**
- Inline comments for logic clarification: `// Controlla se c'è un'operazione nel lock globale`
- JSDoc style for public methods:
  ```typescript
  /**
   * Avvia il sync automatico in background
   * @param intervalMinutes Intervallo in minuti tra i sync
   * @param skipInitialSync Se true, non esegue il sync iniziale immediato
   */
  ```
- Minimal comments overall - code is self-documenting

**TODO Comments:**
- Not standardized (no consistent pattern found)

## Function Design

**Size:**
- No strict limit enforced
- Some large functions exist (e.g., `archibald-bot.ts` has 700+ line functions)
- Complex operations kept in single functions with internal structure

**Parameters:**
- No strict limit on parameter count
- Object destructuring used in some places
- Options objects used for complex configurations

**Return Values:**
- Explicit return statements
- Early returns for guard clauses
- Promises returned for async operations (no explicit Promise wrapping)

## Module Design

**Exports:**
- Named exports for utilities/functions: `export function parseVoiceOrder()`
- Named exports for classes: `export class QueueManager {}`
- Default exports for React components: `export default function App() {}`

**Barrel Files:**
- No `index.ts` barrel files present
- Direct imports from source files throughout

**Singleton Pattern:**
- Pervasive in backend services
- Static `getInstance()` method with private constructor
- Pattern:
  ```typescript
  private static instance: ClassName;
  static getInstance(): ClassName {
    if (!ClassName.instance) {
      ClassName.instance = new ClassName();
    }
    return ClassName.instance;
  }
  ```

## TypeScript Configuration

**Backend (`backend/tsconfig.json`):**
- target: ES2022
- module: CommonJS
- strict: true
- esModuleInterop: true
- skipLibCheck: true
- forceConsistentCasingInFileNames: true
- resolveJsonModule: true
- moduleResolution: node

**Frontend (`frontend/tsconfig.json`):**
- target: ES2020
- module: ESNext
- moduleResolution: bundler
- jsx: react-jsx
- strict: true
- noUnusedLocals: true
- noUnusedParameters: true
- noFallthroughCasesInSwitch: true

**Key Differences:**
- Backend: CommonJS for Node.js compatibility
- Frontend: ESNext modules for Vite bundling
- Frontend: Additional strictness flags for unused variables

## Patterns Observed

**Backend:**
- Singleton services with getInstance()
- EventEmitter for progress updates
- Resource pooling (BrowserPool)
- Checkpoint/resume for long operations
- Lock-based concurrency control

**Frontend:**
- Functional components with hooks
- Custom hooks for reusable logic (`useVoiceInput`)
- Utility functions for business logic (`orderParser`)
- WebSocket for real-time updates

---

*Convention analysis: 2026-01-11*
*Update when patterns change*
