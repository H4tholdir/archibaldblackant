import { useState } from 'react';
import './App.css';
import { useAuth } from './hooks/useAuth';
import { LoginModal } from './components/LoginModal';
import OrderForm from './components/OrderForm';
import OrderStatus from './components/OrderStatus';
import SyncBanner from './components/SyncBanner';
import SyncBars from './components/SyncBars';

function App() {
  const auth = useAuth();
  const [jobId, setJobId] = useState<string | null>(null);
  const [view, setView] = useState<'form' | 'status'>('form');

  const handleOrderCreated = (newJobId: string) => {
    setJobId(newJobId);
    setView('status');
  };

  const handleNewOrder = () => {
    setJobId(null);
    setView('form');
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
    return (
      <LoginModal
        onLogin={auth.login}
        error={auth.error}
        isLoading={auth.isLoading}
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
        <div className="user-info">
          <span>{auth.user?.fullName}</span>
          <button
            onClick={auth.logout}
            className="btn btn-secondary btn-sm"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Barre di sincronizzazione */}
      <div style={{ padding: '0 20px', marginBottom: '20px' }}>
        <SyncBars />
      </div>

      <main className="app-main">
        {view === 'form' ? (
          <OrderForm token={auth.token!} onOrderCreated={handleOrderCreated} />
        ) : (
          <OrderStatus jobId={jobId!} onNewOrder={handleNewOrder} />
        )}
      </main>

      <footer className="app-footer">
        <p>v1.0.0 • Fresis Team</p>
      </footer>
    </div>
  );
}

export default App;
