import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

/**
 * Banner shown to admin when impersonating an agent
 */
export function ImpersonationBanner() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleStopImpersonating = async () => {
    setLoading(true);
    const token = localStorage.getItem("archibald_jwt");

    try {
      const response = await fetch("/api/admin/stop-impersonate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();

      if (data.success) {
        // Replace JWT with original admin token
        localStorage.setItem("archibald_jwt", data.token);
        // Reload app to refresh UI
        window.location.reload();
      } else {
        alert(data.error || "Errore durante il ritorno all'account admin");
      }
    } catch (error) {
      console.error("Stop impersonation error:", error);
      alert("Errore di rete");
    } finally {
      setLoading(false);
    }
  };

  if (!user?.isImpersonating) {
    return null;
  }

  return (
    <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between shadow-md">
      <div className="flex items-center space-x-2">
        <span className="text-xl">🔧</span>
        <span>
          Stai lavorando come <strong>{user.fullName}</strong>
          {user.realAdminName && (
            <span className="text-blue-200 ml-1">
              (Admin: {user.realAdminName})
            </span>
          )}
        </span>
      </div>
      <button
        onClick={handleStopImpersonating}
        disabled={loading}
        className="px-3 py-1 bg-white text-blue-600 rounded hover:bg-blue-50 disabled:opacity-50 transition-colors"
      >
        {loading ? "Caricamento..." : `Torna a ${user.realAdminName}`}
      </button>
    </div>
  );
}
