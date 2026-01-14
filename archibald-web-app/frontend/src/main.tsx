import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initializeDatabase } from './db/database';
import { registerSW } from 'virtual:pwa-register';

// Register service worker
const updateSW = registerSW({
  onNeedRefresh() {
    console.log('[PWA] New content available, reload to update');
    // Could show UI prompt here in future
  },
  onOfflineReady() {
    console.log('[PWA] App ready to work offline');
  }
});

// Initialize IndexedDB before rendering app
initializeDatabase().then((result) => {
  if (!result.success) {
    console.error('[App] Database initialization failed:', result.error);
    // App will still render but offline features won't work
  }

  // Render app
  const root = document.getElementById('root');
  if (root) {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
});
