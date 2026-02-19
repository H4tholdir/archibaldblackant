import React from "react";
import ReactDOM from "react-dom/client";
import AppRouter from "./AppRouter";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
import { jwtRefreshService } from "./services/jwt-refresh-service";

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log("[PWA] New content available, reloading...");
    updateSW(true);
  },
  onOfflineReady() {
    console.log("[PWA] App ready to work offline");
  },
  onRegistered(registration) {
    console.log("[PWA] Service Worker registered");
    if (registration) {
      setInterval(() => {
        registration.update();
      }, 60000);
    }
  },
});

const token = localStorage.getItem("archibald_jwt");
if (token) {
  jwtRefreshService.start();
  console.log("[App] JWT auto-refresh service started");
}

window.addEventListener("storage", (event) => {
  if (event.key === "archibald_jwt") {
    if (event.newValue === null) {
      jwtRefreshService.stop();
      console.log("[App] JWT auto-refresh service stopped (logout)");
    } else if (event.oldValue === null && event.newValue) {
      jwtRefreshService.start();
      console.log("[App] JWT auto-refresh service started (login)");
    }
  }
});

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <AppRouter />
    </React.StrictMode>,
  );
}
