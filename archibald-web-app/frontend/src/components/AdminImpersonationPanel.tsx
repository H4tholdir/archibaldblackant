import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";

interface Agent {
  id: string;
  username: string;
  fullName: string;
  lastLoginAt: number | null;
}

/**
 * Panel for admin to select and impersonate an agent
 */
export function AdminImpersonationPanel() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    // Only load for non-impersonating admins
    if (user?.role === "admin" && !user.isImpersonating) {
      loadAgents();
    }
  }, [user]);

  const loadAgents = async () => {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/users?role=agent", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();

      if (data.success) {
        setAgents(data.users);
      } else {
        setError(data.error || "Errore nel caricamento agenti");
      }
    } catch (err) {
      console.error("Load agents error:", err);
      setError("Errore di rete");
    } finally {
      setLoading(false);
    }
  };

  const handleImpersonate = async (agentId: string) => {
    setLoading(true);
    setError(null);

    const token = localStorage.getItem("archibald_jwt");

    try {
      const response = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUserId: agentId }),
      });

      const data = await response.json();

      if (data.success) {
        // Replace JWT with impersonated token
        localStorage.setItem("archibald_jwt", data.token);
        // Reload app to refresh UI
        window.location.reload();
      } else {
        setError(data.error || "Errore durante l'impersonation");
      }
    } catch (err) {
      console.error("Impersonation error:", err);
      setError("Errore di rete");
    } finally {
      setLoading(false);
    }
  };

  // Only show for non-impersonating admins
  if (!user || user.role !== "admin" || user.isImpersonating) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">Impersona Agente</h2>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {loading && agents.length === 0 ? (
        <div className="text-center py-4 text-gray-500">
          Caricamento agenti...
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-4 text-gray-500">
          Nessun agente disponibile
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center justify-between p-3 border rounded hover:bg-gray-50 transition-colors"
            >
              <div>
                <div className="font-medium">{agent.fullName}</div>
                <div className="text-sm text-gray-500">@{agent.username}</div>
                {agent.lastLoginAt && (
                  <div className="text-xs text-gray-400">
                    Ultimo accesso:{" "}
                    {new Date(agent.lastLoginAt).toLocaleString("it-IT")}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleImpersonate(agent.id)}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading
                  ? "Caricamento..."
                  : `Lavora come ${agent.fullName.split(" ")[0]}`}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
