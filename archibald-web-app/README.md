# Archibald Black Ant

Mobile-first PWA for Archibald ERP order entry with voice input and multi-user support.

## Features

- **Order Creation**: Mobile-optimized form with product autocomplete, package selection, and quantity validation
- **Voice Input**: Hands-free order entry with Italian voice recognition and entity parsing
- **Multi-User Authentication**: JWT-based login with per-user session isolation
- **Real-time Sync**: WebSocket-based progress tracking for customer, product, and price synchronization
- **Offline-First**: PWA with IndexedDB caching for customer and product data
- **Background Automation**: Puppeteer-based RPA for seamless Archibald ERP integration

## Multi-User Support

The system supports multiple users with individual Archibald sessions:

1. **Login**: Each user logs in with their own Archibald credentials
2. **Sessions**: Separate BrowserContext per user (complete cookie isolation)
3. **Orders**: Orders created under the logged-in user's account in Archibald
4. **Whitelist**: Only authorized users can login (managed via admin API)

### Authentication Flow

1. User enters Archibald username and password in login form
2. Backend validates user is whitelisted in users.db
3. Backend tests credentials via Puppeteer login to Archibald
4. On success, backend generates JWT (8h expiry) with userId and username
5. Frontend stores JWT in localStorage and includes it in all API requests
6. On logout, backend closes user's BrowserContext and clears cached session

### Session Management

- **Per-user BrowserContexts**: One shared Browser with isolated contexts per user
- **Cookie isolation**: Puppeteer BrowserContext API guarantees complete session separation
- **Session cache**: Cookies persisted to `.cache/session-{userId}.json` (24h TTL)
- **Memory efficiency**: 300MB for 10 users vs 1.5GB for 10 separate Browsers (5x improvement)
- **Auto-cleanup**: Background job runs every hour to cleanup expired sessions

### Security Measures

- **No password storage**: Passwords used only for immediate Puppeteer validation, never stored
- **JWT authentication**: All order operations require valid JWT token
- **Whitelist control**: Only whitelisted users can login
- **Session expiry**: 24h TTL for cached cookies, 8h for JWT tokens
- **Environment variables**: JWT_SECRET stored in .env file (not committed)

## Setup

### Environment Variables

Create `.env` file in `backend/` directory:

```
JWT_SECRET=your-secret-key-here  # Required for JWT token signing
ARCHIBALD_URL=https://your-archibald-instance.com
```

### Installation

```bash
# Backend
cd archibald-web-app/backend
npm install
npm run dev

# Frontend
cd archibald-web-app/frontend
npm install
npm run dev
```

### Seed Test Users

```bash
cd archibald-web-app/backend
npm run seed:users
```

This creates 3 test users in `data/users.db` (all whitelisted by default).

## Admin Endpoints

**Note**: Admin endpoints have no authentication in Phase 6 (MVP limitation, deferred to Phase 7).

- **POST /api/admin/users** - Create new user
  ```json
  {
    "username": "string",
    "fullName": "string",
    "whitelisted": true
  }
  ```

- **GET /api/admin/users** - List all users
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "uuid",
        "username": "string",
        "fullName": "string",
        "whitelisted": true
      }
    ]
  }
  ```

- **PATCH /api/admin/users/:id/whitelist** - Update whitelist status
  ```json
  {
    "whitelisted": false
  }
  ```

- **DELETE /api/admin/users/:id** - Delete user

## Architecture

### Backend

- **Framework**: Express.js
- **Database**: SQLite (users.db, customers.db, products.db, sync-checkpoints.db)
- **Job Queue**: BullMQ with Redis
- **Browser Automation**: Puppeteer
- **Authentication**: JWT (jose library)
- **Logging**: Winston

### Frontend

- **Framework**: React 19
- **Build**: Vite
- **Styling**: CSS Modules
- **Voice Input**: Web Speech API
- **State Management**: React hooks (no global state library)

### Key Components

- **BrowserPool**: Manages per-user BrowserContexts (one Browser, N contexts)
- **SessionCacheManager**: Per-user cookie persistence
- **UserDatabase**: User and whitelist management
- **QueueManager**: Order processing with BullMQ
- **ArchibaldBot**: Puppeteer wrapper for ERP automation
- **SessionCleanupJob**: Background job for expired session cleanup

## Testing

```bash
# Backend unit tests
cd archibald-web-app/backend
npm test

# Multi-user session test
npm run test:multi-user

# Manual order test
npm run test:order

# Manual queue test
npm run test:queue
```

## Development

### Backend Development

```bash
cd archibald-web-app/backend
npm run dev  # Watch mode with tsx
```

### Frontend Development

```bash
cd archibald-web-app/frontend
npm run dev  # Vite dev server on port 5173
```

Frontend proxies `/api` requests to backend on port 3000 (configured in `vite.config.ts`).

## Production Deployment

1. Set `JWT_SECRET` environment variable
2. Set `ARCHIBALD_URL` environment variable
3. Build frontend: `cd frontend && npm run build`
4. Build backend: `cd backend && npm run build`
5. Start backend: `cd backend && npm start`
6. Serve frontend: `frontend/dist/` with Nginx or similar

## License

MIT
