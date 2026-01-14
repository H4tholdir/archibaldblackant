import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initializeDatabase } from './db/database';

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
