import { useState } from 'react';
import './App.css';
import OrderForm from './components/OrderForm';
import OrderStatus from './components/OrderStatus';
import SyncBanner from './components/SyncBanner';
import SyncBars from './components/SyncBars';

function App() {
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

  return (
    <div className="app">
      <SyncBanner />
      <header className="app-header">
        <div>
          <h1>📦 Archibald Mobile</h1>
          <p>Inserimento ordini</p>
        </div>
      </header>

      {/* Barre di sincronizzazione */}
      <div style={{ padding: '0 20px', marginBottom: '20px' }}>
        <SyncBars />
      </div>

      <main className="app-main">
        {view === 'form' ? (
          <OrderForm onOrderCreated={handleOrderCreated} />
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
