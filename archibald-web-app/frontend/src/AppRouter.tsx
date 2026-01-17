import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { useState, useEffect } from "react";
import "./App.css";
import { useAuth } from "./hooks/useAuth";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import { useAutomaticSync } from "./hooks/useAutomaticSync";
import { LoginModal } from "./components/LoginModal";
import { PinSetupWizard } from "./components/PinSetupWizard";
import { UnlockScreen } from "./components/UnlockScreen";
import { LiquidLoader } from "./components/LiquidLoader";
import OrderForm from "./components/OrderForm";
import OrderStatus from "./components/OrderStatus";
import OrdersList from "./components/OrdersList";
import SyncBanner from "./components/SyncBanner";
import { CacheSyncProgress } from "./components/CacheSyncProgress";
import { OfflineBanner } from "./components/OfflineBanner";
import { CacheRefreshButton } from "./components/CacheRefreshButton";
import { AdminPage } from "./pages/AdminPage";
import { OrderHistory } from "./pages/OrderHistory";
import { PendingOrdersView } from "./pages/PendingOrdersView";
import { DraftOrders } from "./pages/DraftOrders";
import { CustomerList } from "./pages/CustomerList";
import { CustomerEdit } from "./pages/CustomerEdit";
import { ArticoliList } from "./pages/ArticoliList";
import { pendingOrdersService } from "./services/pending-orders-service";
import { getDraftOrders } from "./services/draftOrderStorage";
import { UnifiedSyncProgress } from "./components/UnifiedSyncProgress";

function AppRouter() {
  const auth = useAuth();
  const { isOffline } = useNetworkStatus();

  // Automatic sync when network returns
  useAutomaticSync(auth.token);
  const [jobId, setJobId] = useState<string | null>(null);
  const [view, setView] = useState<"form" | "status" | "orders-list">("form");
  const [tempCredentials, setTempCredentials] = useState<{
    username: string;
    password: string;
  } | null>(null);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [draftCount, setDraftCount] = useState(0);

  // Load pending count and draft count on mount and refresh periodically
  useEffect(() => {
    const loadCounts = async () => {
      try {
        const result = await pendingOrdersService.getPendingOrdersWithCounts();
        setPendingCount(result.counts.pending);

        // Load draft orders count from localStorage
        const drafts = getDraftOrders();
        setDraftCount(drafts.length);
      } catch (error) {
        console.error("[AppRouter] Failed to load counts:", error);
      }
    };

    if (auth.isAuthenticated) {
      loadCounts();
      // Refresh counts every 30 seconds
      const interval = setInterval(loadCounts, 30000);
      return () => clearInterval(interval);
    }
  }, [auth.isAuthenticated]);

  const handleOrderCreated = (newJobId: string) => {
    setJobId(newJobId);
    setView("status");
  };

  const handleNewOrder = () => {
    setJobId(null);
    setView("form");
  };

  const handleViewOrder = (selectedJobId: string) => {
    setJobId(selectedJobId);
    setView("status");
  };

  // Show loading spinner while checking auth
  if (auth.isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#1a1a1a",
        }}
      >
        <LiquidLoader text="Caricamento" />
      </div>
    );
  }

  // Determine which screen to show for non-authenticated users
  const showUnlock =
    !auth.isAuthenticated && !auth.isLoading && auth.lastUser && !showLoginForm;
  const showLogin =
    !auth.isAuthenticated &&
    !auth.isLoading &&
    (!auth.lastUser || showLoginForm);

  // Show unlock screen if lastUser exists
  if (showUnlock && auth.lastUser) {
    return (
      <UnlockScreen
        userId={auth.lastUser.userId}
        fullName={auth.lastUser.fullName}
        onUnlock={auth.unlockWithPin}
        onForgotPin={async () => {
          const confirmed = window.confirm(
            "Cancellare le credenziali salvate? Dovrai inserire di nuovo username e password Archibald.",
          );
          if (confirmed) {
            await auth.clearLastUser();
            setShowLoginForm(true);
          }
        }}
        onSwitchAccount={() => {
          auth.switchAccount();
          setShowLoginForm(true);
        }}
      />
    );
  }

  // Show login modal if not authenticated
  if (showLogin) {
    const handleLogin = async (
      username: string,
      password: string,
      rememberCredentials: boolean,
    ) => {
      const success = await auth.login(username, password, rememberCredentials);
      if (success && rememberCredentials) {
        setTempCredentials({ username, password });
      }
      return success;
    };

    return (
      <LoginModal
        onLogin={handleLogin}
        error={auth.error}
        isLoading={auth.isLoading}
      />
    );
  }

  // Show PIN setup wizard if needed
  if (auth.needsPinSetup && tempCredentials && auth.user) {
    return (
      <PinSetupWizard
        userId={auth.user.id}
        username={auth.user.username}
        onComplete={async (pin) => {
          await auth.completePinSetup(
            pin,
            tempCredentials.username,
            tempCredentials.password,
          );
          setTempCredentials(null); // Clear from memory
        }}
        onCancel={() => {
          auth.skipPinSetup();
          setTempCredentials(null); // Clear from memory
        }}
      />
    );
  }

  // Main app - authenticated users
  const isAdmin = auth.user?.role === "admin";

  // Shared Header component
  function AppHeader() {
    const navigate = useNavigate();
    const location = useLocation();

    return (
      <header className="app-header">
        <div>
          <h1>📦 Archibald Mobile</h1>
          <p>Inserimento ordini</p>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() => navigate("/")}
              className={`btn btn-sm ${location.pathname === "/" && view === "form" ? "btn-primary" : "btn-secondary"}`}
            >
              📝 Nuovo Ordine
            </button>
            <button
              type="button"
              onClick={() => navigate("/drafts")}
              className={`btn btn-sm ${location.pathname === "/drafts" ? "btn-primary" : "btn-secondary"}`}
              style={{ position: "relative" }}
            >
              📝 Bozze
              {draftCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: "-8px",
                    right: "-8px",
                    backgroundColor: "#2196f3",
                    color: "#fff",
                    borderRadius: "10px",
                    padding: "2px 6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    minWidth: "20px",
                  }}
                >
                  {draftCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate("/orders")}
              className={`btn btn-sm ${location.pathname === "/orders" ? "btn-primary" : "btn-secondary"}`}
            >
              📦 Storico
            </button>
            <button
              type="button"
              onClick={() => navigate("/customers")}
              className={`btn btn-sm ${location.pathname === "/customers" ? "btn-primary" : "btn-secondary"}`}
            >
              👥 Clienti
            </button>
            <button
              type="button"
              onClick={() => navigate("/products")}
              className={`btn btn-sm ${location.pathname === "/products" ? "btn-primary" : "btn-secondary"}`}
            >
              📦 Articoli
            </button>
            <button
              type="button"
              onClick={() => navigate("/pending")}
              className={`btn btn-sm ${location.pathname === "/pending" ? "btn-primary" : "btn-secondary"}`}
              style={{ position: "relative" }}
            >
              📋 Coda Offline
              {pendingCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: "-8px",
                    right: "-8px",
                    backgroundColor: "#ff9800",
                    color: "#fff",
                    borderRadius: "10px",
                    padding: "2px 6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    minWidth: "20px",
                  }}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          </div>
          <CacheRefreshButton />
          <div className="user-info">
            <span>{auth.user?.fullName}</span>
            {isAdmin && (
              <a href="/admin" className="btn btn-secondary btn-sm">
                🔧 Admin
              </a>
            )}
            <button onClick={auth.logout} className="btn btn-secondary btn-sm">
              Logout
            </button>
          </div>
        </div>
      </header>
    );
  }

  return (
    <BrowserRouter>
      <OfflineBanner />
      {/* Unified sync progress - banner mode for manual syncs */}
      <UnifiedSyncProgress mode="banner" />
      {/* Badge mode for automatic background syncs */}
      <UnifiedSyncProgress mode="badge" />
      <Routes>
        {/* Admin-only route */}
        {isAdmin && (
          <Route
            path="/admin"
            element={
              <AdminPage
                onLogout={auth.logout}
                userName={auth.user?.fullName || ""}
              />
            }
          />
        )}

        {/* Draft Orders route */}
        <Route
          path="/drafts"
          element={
            <div
              className="app"
              style={{ marginTop: isOffline ? "64px" : "0" }}
            >
              <SyncBanner />
              <AppHeader />
              <main className="app-main" style={{ padding: "0" }}>
                <DraftOrders />
              </main>
              <footer className="app-footer">
                <p>v1.0.0 • Fresis Team</p>
              </footer>
              <CacheSyncProgress />
            </div>
          }
        />

        {/* Order History route */}
        <Route
          path="/orders"
          element={
            <div
              className="app"
              style={{ marginTop: isOffline ? "64px" : "0" }}
            >
              <SyncBanner />
              <AppHeader />
              <main className="app-main" style={{ padding: "0" }}>
                <OrderHistory />
              </main>
              <footer className="app-footer">
                <p>v1.0.0 • Fresis Team</p>
              </footer>
              <CacheSyncProgress />
            </div>
          }
        />

        {/* Pending Orders route */}
        <Route
          path="/pending"
          element={
            <div
              className="app"
              style={{ marginTop: isOffline ? "64px" : "0" }}
            >
              <SyncBanner />
              <AppHeader />
              <main className="app-main" style={{ padding: "0" }}>
                <PendingOrdersView />
              </main>
              <footer className="app-footer">
                <p>v1.0.0 • Fresis Team</p>
              </footer>
              <CacheSyncProgress />
            </div>
          }
        />

        {/* Customers route */}
        <Route
          path="/customers"
          element={
            <div
              className="app"
              style={{ marginTop: isOffline ? "64px" : "0" }}
            >
              <SyncBanner />
              <AppHeader />
              <main className="app-main" style={{ padding: "0" }}>
                <CustomerList />
              </main>
              <footer className="app-footer">
                <p>v1.0.0 • Fresis Team</p>
              </footer>
              <CacheSyncProgress />
            </div>
          }
        />

        {/* Customer Edit route */}
        <Route
          path="/customers/:customerProfile/edit"
          element={
            <div
              className="app"
              style={{ marginTop: isOffline ? "64px" : "0" }}
            >
              <SyncBanner />
              <AppHeader />
              <main className="app-main" style={{ padding: "0" }}>
                <CustomerEdit />
              </main>
              <footer className="app-footer">
                <p>v1.0.0 • Fresis Team</p>
              </footer>
              <CacheSyncProgress />
            </div>
          }
        />

        {/* Products route */}
        <Route
          path="/products"
          element={
            <div
              className="app"
              style={{ marginTop: isOffline ? "64px" : "0" }}
            >
              <SyncBanner />
              <AppHeader />
              <main className="app-main" style={{ padding: "0" }}>
                <ArticoliList />
              </main>
              <footer className="app-footer">
                <p>v1.0.0 • Fresis Team</p>
              </footer>
              <CacheSyncProgress />
            </div>
          }
        />

        {/* Main app route */}
        <Route
          path="/"
          element={
            <div
              className="app"
              style={{ marginTop: isOffline ? "64px" : "0" }}
            >
              <SyncBanner />
              <AppHeader />
              <main className="app-main">
                {view === "form" ? (
                  <OrderForm
                    token={auth.token!}
                    onOrderCreated={handleOrderCreated}
                    isAdmin={isAdmin}
                  />
                ) : view === "status" ? (
                  <OrderStatus jobId={jobId!} onNewOrder={handleNewOrder} />
                ) : (
                  <OrdersList
                    token={auth.token!}
                    onViewOrder={handleViewOrder}
                    onNewOrder={handleNewOrder}
                  />
                )}
              </main>

              <footer className="app-footer">
                <p>v1.0.0 • Fresis Team</p>
              </footer>

              {/* Cache sync progress bar */}
              <CacheSyncProgress />
            </div>
          }
        />

        {/* Redirect unknown routes */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRouter;
