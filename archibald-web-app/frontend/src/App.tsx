import { useState } from 'react';
import './App.css';
import { useAuth } from './hooks/useAuth';
import { LoginModal } from './components/LoginModal';
import { PinSetupWizard } from './components/PinSetupWizard';
import OrderForm from './components/OrderForm';
import OrderStatus from './components/OrderStatus';
import OrdersList from './components/OrdersList';
import SyncBanner from './components/SyncBanner';
import SyncBars from './components/SyncBars';

function App() {
  const auth = useAuth();
  const [jobId, setJobId] = useState<string | null>(null);
  const [view, setView] = useState<'form' | 'status' | 'orders-list'>('form');
  const [tempCredentials, setTempCredentials] = useState<{ username: string; password: string } | null>(null);

  const handleOrderCreated = (newJobId: string) => {
    setJobId(newJobId);
    setView('status');
  };

  const handleNewOrder = () => {
    setJobId(null);
    setView('form');
  };

  const handleViewOrder = (selectedJobId: string) => {
    setJobId(selectedJobId);
    setView('status');
  };

  const handleViewOrdersList = () => {
    setView('orders-list');
  };

  // Show loading spinner while checking auth
  if (auth.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p>Caricamento...</p>
      </div>
    );
  }

  // Show login modal if not authenticated
  if (!auth.isAuthenticated) {
    const handleLogin = async (username: string, password: string, rememberCredentials: boolean) => {
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
  if (auth.needsPinSetup && tempCredentials) {
    return (
      <PinSetupWizard
        onComplete={async (pin) => {
          await auth.completePinSetup(pin, tempCredentials.username, tempCredentials.password);
          setTempCredentials(null); // Clear from memory
        }}
        onCancel={() => {
          auth.skipPinSetup();
          setTempCredentials(null); // Clear from memory
        }}
      />
    );
  }

  // Show main app if authenticated
  return (
    <div className="app">
      <SyncBanner />
      <header className="app-header">
        <div>
          <h1>📦 Archibald Mobile</h1>
          <p>Inserimento ordini</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleNewOrder}
              className={`btn btn-sm ${view === 'form' ? 'btn-primary' : 'btn-secondary'}`}
            >
              📝 Nuovo Ordine
            </button>
            <button
              type="button"
              onClick={handleViewOrdersList}
              className={`btn btn-sm ${view === 'orders-list' ? 'btn-primary' : 'btn-secondary'}`}
            >
              📊 I Miei Ordini
            </button>
          </div>
          <div className="user-info">
            <span>{auth.user?.fullName}</span>
            <button
              onClick={auth.logout}
              className="btn btn-secondary btn-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Barre di sincronizzazione */}
      <div style={{ padding: '0 20px', marginBottom: '20px' }}>
        <SyncBars />
      </div>

      <main className="app-main">
        {view === 'form' ? (
          <OrderForm token={auth.token!} onOrderCreated={handleOrderCreated} />
        ) : view === 'status' ? (
          <OrderStatus jobId={jobId!} onNewOrder={handleNewOrder} />
        ) : (
          <OrdersList token={auth.token!} onViewOrder={handleViewOrder} onNewOrder={handleNewOrder} />
        )}
      </main>

      <footer className="app-footer">
        <p>v1.0.0 • Fresis Team</p>
      </footer>
    </div>
  );
}

export default App;
