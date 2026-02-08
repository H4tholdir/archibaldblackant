import React from "react";
import ReactDOM from "react-dom/client";
import AppRouter from "./AppRouter";
import "./index.css";
import { initializeDatabase } from "./db/database";
import { registerSW } from "virtual:pwa-register";
import { syncService } from "./services/sync.service";
import { unifiedSyncService } from "./services/unified-sync-service";
import { jwtRefreshService } from "./services/jwt-refresh-service";

// Register service worker with auto-update
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log("[PWA] New content available, reloading...");
    // Auto-reload immediately when new version is available
    updateSW(true);
  },
  onOfflineReady() {
    console.log("[PWA] App ready to work offline");
  },
  onRegistered(registration) {
    console.log("[PWA] Service Worker registered");
    // Check for updates every 60 seconds
    if (registration) {
      setInterval(() => {
        registration.update();
      }, 60000);
    }
  },
});

// Initialize IndexedDB and sync data before rendering app
initializeDatabase().then(async (result) => {
  if (!result.success) {
    console.error("[App] Database initialization failed:", result.error);
    // App will still render but offline features won't work
  } else {
    // Initialize multi-device sync service (orders, warehouse)
    await unifiedSyncService.initSync();

    // Trigger initial sync for customers, products, prices
    await syncService.initializeSync();
  }

  // Start JWT auto-refresh service if token exists
  const token = localStorage.getItem("archibald_jwt");
  if (token) {
    jwtRefreshService.start();
    console.log("[App] JWT auto-refresh service started");
  }

  // Stop JWT refresh service when token is removed (logout)
  window.addEventListener("storage", (event) => {
    if (event.key === "archibald_jwt") {
      if (event.newValue === null) {
        // Token removed = logout
        jwtRefreshService.stop();
        console.log("[App] JWT auto-refresh service stopped (logout)");
      } else if (event.oldValue === null && event.newValue) {
        // Token added = login
        jwtRefreshService.start();
        console.log("[App] JWT auto-refresh service started (login)");
      }
    }
  });

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
