import { useNavigate } from 'react-router-dom';
import SyncBars from '../components/SyncBars';
import '../styles/AdminPage.css';

interface AdminPageProps {
  onLogout: () => void;
  userName: string;
}

export function AdminPage({ onLogout, userName }: AdminPageProps) {
  const navigate = useNavigate();

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-left">
          <h1>📊 Archibald Admin</h1>
          <p>Pannello di Controllo</p>
        </div>
        <div className="admin-header-right">
          <button
            onClick={() => navigate('/')}
            className="btn btn-secondary btn-sm"
          >
            📱 Vai all'App
          </button>
          <div className="user-info">
            <span>{userName}</span>
            <button onClick={onLogout} className="btn btn-secondary btn-sm">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="admin-main">
        <section className="admin-section">
          <h2>🔄 Sincronizzazione Dati da Archibald ERP</h2>
          <p className="admin-description">
            Sincronizza clienti, prodotti e prezzi dal sistema Archibald ERP al
            database backend. Le barre mostrano il progresso in tempo reale.
          </p>
          <div className="sync-bars-container">
            <SyncBars />
          </div>
        </section>

        <section className="admin-section">
          <h2>ℹ️ Informazioni</h2>
          <div className="info-grid">
            <div className="info-card">
              <h3>🔵 Barra Clienti</h3>
              <p>
                Sincronizza l'elenco completo dei clienti da Archibald ERP.
                Include nome, codice, città e dati di contatto.
              </p>
            </div>
            <div className="info-card">
              <h3>🟡 Barra Prodotti</h3>
              <p>
                Sincronizza il catalogo prodotti con tutte le varianti e codici
                articolo disponibili.
              </p>
            </div>
            <div className="info-card">
              <h3>🟠 Barra Prezzi</h3>
              <p>
                Sincronizza i listini prezzi aggiornati per tutti i prodotti e
                clienti.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="admin-footer">
        <p>
          v1.0.0 • Admin Panel • Solo per amministratori • Fresis Team
        </p>
      </footer>
    </div>
  );
}
