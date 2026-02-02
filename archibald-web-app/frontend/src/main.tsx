import React from "react";
import ReactDOM from "react-dom/client";
import AppRouter from "./AppRouter";
import "./index.css";
import { initializeDatabase } from "./db/database";
import { registerSW } from "virtual:pwa-register";
import { syncService } from "./services/sync.service";
import { unifiedSyncService } from "./services/unified-sync-service";

// Register service worker
registerSW({
  onNeedRefresh() {
    console.log("[PWA] New content available, reload to update");
    // Could show UI prompt here in future
  },
  onOfflineReady() {
    console.log("[PWA] App ready to work offline");
  },
});

// Initialize IndexedDB and sync data before rendering app
initializeDatabase().then(async (result) => {
  if (!result.success) {
    console.error("[App] Database initialization failed:", result.error);
    // App will still render but offline features won't work
  } else {
    // Initialize multi-device sync service (orders, drafts, warehouse)
    await unifiedSyncService.initSync();

    // Trigger initial sync for customers, products, prices
    await syncService.initializeSync();
  }

  // Render app
  const root = document.getElementById("root");
  if (root) {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <AppRouter />
      </React.StrictMode>,
    );
  }
});
