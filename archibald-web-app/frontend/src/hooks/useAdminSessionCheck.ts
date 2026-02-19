import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { fetchWithRetry } from "../utils/fetch-with-retry";

export function useAdminSessionCheck() {
  const [adminActive, setAdminActive] = useState(false);
  const [adminName, setAdminName] = useState("");
  const { user } = useAuth();

  useEffect(() => {
    if (!user || user.role === "admin") {
      return;
    }

    const checkAdminSession = async () => {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) return;

      try {
        const response = await fetchWithRetry("/api/admin/session/check", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        if (data.success) {
          setAdminActive(data.active);
          setAdminName(data.adminName || "");
        }
      } catch (error) {
        console.error("Admin session check error:", error);
      }
    };

    checkAdminSession();

    const interval = setInterval(checkAdminSession, 10000);

    return () => clearInterval(interval);
  }, [user]);

  return { adminActive, adminName };
}
