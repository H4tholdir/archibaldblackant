import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import SyncBars from "../components/SyncBars";
import "../styles/AdminPage.css";

interface AdminPageProps {
  onLogout: () => void;
  userName: string;
}

interface Job {
  jobId: string;
  status: string;
  userId: string;
  username: string;
  orderData: {
    customerName: string;
    items: Array<{ articleCode: string; quantity: number }>;
  };
  createdAt: number;
  result?: { orderId: string };
  error?: string;
}

export function AdminPage({ onLogout, userName }: AdminPageProps) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const jobsPerPage = 20;

  useEffect(() => {
    loadJobs();
    // Refresh jobs every 10 seconds
    const interval = setInterval(loadJobs, 10000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  const loadJobs = async () => {
    try {
      const jwt = localStorage.getItem("archibald_jwt");
      if (!jwt) return;

      const url = `/api/admin/jobs?limit=50&status=${statusFilter}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${jwt}` },
      });

      const data = await response.json();
      if (data.success) {
        setJobs(data.data);
      }
    } catch (error) {
      console.error("Error loading jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (jobId: string) => {
    const jwt = localStorage.getItem("archibald_jwt");
    if (!jwt) return;

    setRetryingJobId(jobId);

    try {
      const response = await fetch(`/api/admin/jobs/retry/${jobId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      });

      const data = await response.json();
      if (data.success) {
        alert(`Job retried successfully! New Job ID: ${data.data.newJobId}`);
        loadJobs();
      } else {
        alert(`Retry failed: ${data.error}`);
      }
    } catch (error) {
      console.error("Error retrying job:", error);
      alert("Error retrying job");
    } finally {
      setRetryingJobId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; color: string; text: string }> =
      {
        waiting: { bg: "#2196f3", color: "#fff", text: "Waiting" },
        active: { bg: "#ff9800", color: "#fff", text: "Active" },
        completed: { bg: "#4caf50", color: "#fff", text: "Completed" },
        failed: { bg: "#f44336", color: "#fff", text: "Failed" },
      };

    const style = styles[status] || {
      bg: "#9e9e9e",
      color: "#fff",
      text: status,
    };

    return (
      <span
        style={{
          backgroundColor: style.bg,
          color: style.color,
          padding: "4px 12px",
          borderRadius: "12px",
          fontSize: "12px",
          fontWeight: 600,
        }}
      >
        {style.text}
      </span>
    );
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Pagination
  const indexOfLastJob = currentPage * jobsPerPage;
  const indexOfFirstJob = indexOfLastJob - jobsPerPage;
  const currentJobs = jobs.slice(indexOfFirstJob, indexOfLastJob);
  const totalPages = Math.ceil(jobs.length / jobsPerPage);

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-left">
          <h1>📊 Archibald Admin</h1>
          <p>Pannello di Controllo</p>
        </div>
        <div className="admin-header-right">
          <button
            onClick={() => navigate("/")}
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <h2>📋 Jobs Queue</h2>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #ddd",
                  fontSize: "14px",
                }}
              >
                <option value="all">All Jobs</option>
                <option value="waiting">Waiting</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
              <button
                onClick={loadJobs}
                className="btn btn-secondary btn-sm"
                disabled={loading}
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <p>Loading jobs...</p>
          ) : jobs.length === 0 ? (
            <p style={{ color: "#666", textAlign: "center", padding: "2rem" }}>
              No jobs found
            </p>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "14px",
                  }}
                >
                  <thead>
                    <tr
                      style={{ backgroundColor: "#f5f5f5", textAlign: "left" }}
                    >
                      <th
                        style={{
                          padding: "12px",
                          borderBottom: "2px solid #ddd",
                        }}
                      >
                        Job ID
                      </th>
                      <th
                        style={{
                          padding: "12px",
                          borderBottom: "2px solid #ddd",
                        }}
                      >
                        User
                      </th>
                      <th
                        style={{
                          padding: "12px",
                          borderBottom: "2px solid #ddd",
                        }}
                      >
                        Customer
                      </th>
                      <th
                        style={{
                          padding: "12px",
                          borderBottom: "2px solid #ddd",
                        }}
                      >
                        Items
                      </th>
                      <th
                        style={{
                          padding: "12px",
                          borderBottom: "2px solid #ddd",
                        }}
                      >
                        Status
                      </th>
                      <th
                        style={{
                          padding: "12px",
                          borderBottom: "2px solid #ddd",
                        }}
                      >
                        Created
                      </th>
                      <th
                        style={{
                          padding: "12px",
                          borderBottom: "2px solid #ddd",
                        }}
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentJobs.map((job) => (
                      <tr
                        key={job.jobId}
                        style={{ borderBottom: "1px solid #eee" }}
                      >
                        <td
                          style={{
                            padding: "12px",
                            fontFamily: "monospace",
                            fontSize: "12px",
                          }}
                        >
                          {job.jobId.substring(0, 8)}...
                        </td>
                        <td style={{ padding: "12px" }}>{job.username}</td>
                        <td style={{ padding: "12px" }}>
                          {job.orderData.customerName}
                        </td>
                        <td style={{ padding: "12px" }}>
                          {job.orderData.items.length}
                        </td>
                        <td style={{ padding: "12px" }}>
                          {getStatusBadge(job.status)}
                          {job.error && (
                            <div
                              title={job.error}
                              style={{
                                fontSize: "11px",
                                color: "#f44336",
                                marginTop: "4px",
                                cursor: "help",
                                maxWidth: "200px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {job.error}
                            </div>
                          )}
                        </td>
                        <td
                          style={{
                            padding: "12px",
                            fontSize: "12px",
                            color: "#666",
                          }}
                        >
                          {formatDate(job.createdAt)}
                        </td>
                        <td style={{ padding: "12px" }}>
                          {job.status === "failed" && (
                            <button
                              onClick={() => handleRetry(job.jobId)}
                              disabled={retryingJobId === job.jobId}
                              className="btn btn-sm"
                              style={{
                                backgroundColor: "#ff9800",
                                color: "#fff",
                                border: "none",
                                padding: "6px 12px",
                                borderRadius: "6px",
                                cursor:
                                  retryingJobId === job.jobId
                                    ? "not-allowed"
                                    : "pointer",
                                opacity: retryingJobId === job.jobId ? 0.6 : 1,
                              }}
                            >
                              {retryingJobId === job.jobId ? "⏳" : "🔄 Retry"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    gap: "8px",
                    marginTop: "20px",
                  }}
                >
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="btn btn-secondary btn-sm"
                    style={{ opacity: currentPage === 1 ? 0.5 : 1 }}
                  >
                    Previous
                  </button>
                  <span
                    style={{
                      padding: "8px 12px",
                      fontSize: "14px",
                      color: "#666",
                    }}
                  >
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="btn btn-secondary btn-sm"
                    style={{ opacity: currentPage === totalPages ? 0.5 : 1 }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
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
        <p>v1.0.0 • Admin Panel • Solo per amministratori • Fresis Team</p>
      </footer>
    </div>
  );
}
