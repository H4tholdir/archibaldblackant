// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('./pages/ToolRecognitionPage', () => ({
  ToolRecognitionPage: () => <div>TOOL-RECOGNITION-PAGE</div>,
}))
vi.mock('./pages/ProductDetailPage', () => ({
  ProductDetailPage: () => <div>PRODUCT-DETAIL-PAGE</div>,
}))
vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    token: 'tok',
    user: { id: 'u1', username: 'test', fullName: 'Test User', role: 'agent' },
    lastUser: null,
    needsPinSetup: false,
    pendingMfaToken: null,
    pendingMfaSetupToken: null,
    logout: vi.fn(),
  }),
}))
vi.mock('./hooks/useToast', () => ({
  useToast: () => [],
}))
vi.mock('./contexts/WebSocketContext', () => ({
  WebSocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useWebSocket: () => ({ socket: null, isConnected: false }),
  useWebSocketContext: () => ({ subscribe: vi.fn(() => vi.fn()), isConnected: false }),
}))
vi.mock('./contexts/NotificationsContext', () => ({
  NotificationsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useNotifications: () => ({ notifications: [], unreadCount: 0 }),
}))
vi.mock('./contexts/OperationTrackingContext', () => ({
  OperationTrackingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useOperationTracking: () => ({}),
}))
vi.mock('./contexts/PrivacyContext', () => ({
  PrivacyProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePrivacy: () => ({ isPrivacyMode: false, togglePrivacy: vi.fn() }),
}))
vi.mock('./components/DashboardNav', () => ({
  DashboardNav: () => <nav data-testid="dashboard-nav" />,
}))
vi.mock('./components/GlobalOperationBanner', () => ({
  GlobalOperationBanner: () => null,
}))
vi.mock('./components/OfflineBanner', () => ({
  OfflineBanner: () => null,
}))
vi.mock('./components/OfflineSyncBanner', () => ({
  OfflineSyncBanner: () => null,
}))
vi.mock('./components/ImpersonationBanner', () => ({
  ImpersonationBanner: () => null,
}))
vi.mock('./components/AdminSessionBanner', () => ({
  AdminSessionBanner: () => null,
}))
vi.mock('./components/WebSocketSync', () => ({
  default: () => null,
}))
vi.mock('./components/Toast', () => ({
  ToastContainer: () => null,
}))
vi.mock('./services/toast.service', () => ({
  toastService: { error: vi.fn(), success: vi.fn(), info: vi.fn(), remove: vi.fn() },
}))

// Replace BrowserRouter with a passthrough so MemoryRouter from the test controls routing
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    BrowserRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

// Mock the target check fetch so TargetWizard is not shown
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ yearlyTarget: 100000 }),
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

import AppRouter from './AppRouter'

describe('AppRouter', () => {
  it('/recognition renderizza ToolRecognitionPage', () => {
    render(
      <MemoryRouter initialEntries={['/recognition']}>
        <AppRouter />
      </MemoryRouter>
    )
    expect(screen.getByText('TOOL-RECOGNITION-PAGE')).toBeInTheDocument()
  })

  it('/products/:id renderizza ProductDetailPage', () => {
    render(
      <MemoryRouter initialEntries={['/products/H1.314.016']}>
        <AppRouter />
      </MemoryRouter>
    )
    expect(screen.getByText('PRODUCT-DETAIL-PAGE')).toBeInTheDocument()
  })
})
