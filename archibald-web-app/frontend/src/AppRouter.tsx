import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import "./App.css";
import { useAuth } from "./hooks/useAuth";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import { useAutomaticSync } from "./hooks/useAutomaticSync";
import { LoginModal } from "./components/LoginModal";
import { PinSetupWizard } from "./components/PinSetupWizard";
import { TargetWizard } from "./components/TargetWizard";
import { UnlockScreen } from "./components/UnlockScreen";
import { LiquidLoader } from "./components/LiquidLoader";
import OrderForm from "./components/OrderForm";
import OrderStatus from "./components/OrderStatus";
import OrdersList from "./components/OrdersList";
import SyncBanner from "./components/SyncBanner";
import { OfflineBanner } from "./components/OfflineBanner";
import { CacheRefreshButton } from "./components/CacheRefreshButton";
import { AdminPage } from "./pages/AdminPage";
import { OrderHistory } from "./pages/OrderHistory";
import { PendingOrdersView } from "./pages/PendingOrdersView";
import { DraftOrders } from "./pages/DraftOrders";
import { CustomerList } from "./pages/CustomerList";
import { CustomerEdit } from "./pages/CustomerEdit";
import { ArticoliList } from "./pages/ArticoliList";
import { Dashboard } from "./pages/Dashboard";
import { ProfilePage } from "./pages/ProfilePage";
import { PriceVariationsPage } from "./pages/PriceVariationsPage";
import { DashboardNav } from "./components/DashboardNav";
// import { UnifiedSyncProgress } from "./components/UnifiedSyncProgress"; // Temporarily disabled

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
  const [showTargetWizard, setShowTargetWizard] = useState(false);
  const [hasTarget, setHasTarget] = useState(true); // assume true, check on mount

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

  // Check if user has set target after authentication
  useEffect(() => {
    const checkTarget = async () => {
      if (!auth.isAuthenticated || !auth.token) {
        return;
      }

      try {
        const response = await fetch("/api/users/me/target", {
          headers: { Authorization: `Bearer ${auth.token}` },
        });

        if (response.ok) {
          const targetData = await response.json();
          const hasConfiguredTarget = targetData.yearlyTarget > 0;
          setHasTarget(hasConfiguredTarget);
          setShowTargetWizard(!hasConfiguredTarget);
        }
      } catch (error) {
        console.error("[AppRouter] Failed to check target:", error);
      }
    };

    checkTarget();
  }, [auth.isAuthenticated, auth.token]);

  // Handle target wizard completion
  const handleTargetComplete = async (config: {
    yearlyTarget: number;
    currency: string;
    commissionRate: number;
    bonusAmount: number;
    bonusInterval: number;
    extraBudgetInterval: number;
    extraBudgetReward: number;
    monthlyAdvance: number;
    hideCommissions: boolean;
  }) => {
    const token = auth.token;
    if (!token) return;

    try {
      const response = await fetch("/api/users/me/target", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        setHasTarget(true);
        setShowTargetWizard(false);
      } else {
        console.error(
          "[AppRouter] Failed to set target:",
          await response.text(),
        );
        alert("Errore nel salvare la configurazione. Riprova.");
      }
    } catch (error) {
      console.error("[AppRouter] Target set error:", error);
      alert("Errore di connessione. Riprova.");
    }
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

  // Show PIN setup wizard if needed (FIRST: before target wizard)
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

  // Show target wizard if authenticated but no target set (SECOND: after PIN setup)
  if (auth.isAuthenticated && showTargetWizard && !hasTarget) {
    return (
      <TargetWizard
        isOpen={showTargetWizard}
        onComplete={handleTargetComplete}
      />
    );
  }

  // Main app - authenticated users
  const isAdmin = auth.user?.role === "admin";

  // Shared Header component (simplified - navigation moved to DashboardNav)
  function AppHeader() {
    return (
      <header className="app-header">
        <div>
          <h1>📦 Archibald Mobile</h1>
          <p>Inserimento ordini</p>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
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
      {/* Unified sync progress - temporarily disabled due to SSE errors */}
      {/* <UnifiedSyncProgress mode="banner" /> */}
      {/* <UnifiedSyncProgress mode="badge" /> */}
      {/* Global Dashboard Navigation */}
      <DashboardNav />
      <Routes>
        {/* Dashboard route */}
        <Route
          path="/"
          element={
            <div
              className="app"
              style={{ marginTop: isOffline ? "64px" : "0" }}
            >
              <SyncBanner />
              <AppHeader />
              <main className="app-main" style={{ padding: "0" }}>
                <Dashboard />
              </main>
              <footer className="app-footer">
                <p>v1.0.0 • Fresis Team</p>
              </footer>
            </div>
          }
        />

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
            </div>
          }
        />

        {/* Profile route */}
        <Route
          path="/profile"
          element={
            <div
              className="app"
              style={{ marginTop: isOffline ? "64px" : "0" }}
            >
              <SyncBanner />
              <AppHeader />
              <main className="app-main" style={{ padding: "0" }}>
                <ProfilePage />
              </main>
              <footer className="app-footer">
                <p>v1.0.0 • Fresis Team</p>
              </footer>
            </div>
          }
        />

        {/* Price Variations route */}
        <Route
          path="/prezzi-variazioni"
          element={
            <div
              className="app"
              style={{ marginTop: isOffline ? "64px" : "0" }}
            >
              <SyncBanner />
              <AppHeader />
              <main className="app-main" style={{ padding: "0" }}>
                <PriceVariationsPage />
              </main>
              <footer className="app-footer">
                <p>v1.0.0 • Fresis Team</p>
              </footer>
            </div>
          }
        />

        {/* Order Form route */}
        <Route
          path="/order-form"
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
