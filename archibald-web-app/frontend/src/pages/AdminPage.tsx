import { useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo, Fragment } from "react";
import "../styles/AdminPage.css";
import SyncControlPanel from "../components/SyncControlPanel";
import SyncMonitoringDashboard from "../components/SyncMonitoringDashboard";
import WebSocketMonitor from "../components/WebSocketMonitor";
import { AdminImpersonationPanel } from "../components/AdminImpersonationPanel";
import { FresisDiscountManager } from "../components/FresisDiscountManager";

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
    items: Array<{
      articleCode: string;
      quantity: number;
      description?: string;
      productName?: string;
    }>;
  };
  createdAt: number;
  result?: { orderId: string };
  error?: string;
}

interface RetentionConfig {
  keepCompleted: number;
  keepFailed: number;
}

export function AdminPage({ onLogout, userName }: AdminPageProps) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [uploadingSubClients, setUploadingSubClients] = useState(false);
  const [subClientResult, setSubClientResult] = useState<any>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [cleaningUp, setCleaningUp] = useState(false);
  const [retentionConfig, setRetentionConfig] =
    useState<RetentionConfig | null>(null);
  const jobsPerPage = 20;

  useEffect(() => {
    loadJobs();
    loadRetentionConfig();
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

      if (!response.ok) return;

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

  const loadRetentionConfig = async () => {
    try {
      const jwt = localStorage.getItem("archibald_jwt");
      if (!jwt) return;

      const response = await fetch("/api/admin/jobs/retention", {
        headers: { Authorization: `Bearer ${jwt}` },
      });

      if (!response.ok) return;

      const data = await response.json();
      if (data.success) {
        setRetentionConfig(data.data);
      }
    } catch (error) {
      console.error("Error loading retention config:", error);
    }
  };

  const handleCleanup = async () => {
    if (!confirm("Rimuovere i job in eccesso rispetto alla retention?")) return;

    const jwt = localStorage.getItem("archibald_jwt");
    if (!jwt) return;

    setCleaningUp(true);
    try {
      const response = await fetch("/api/admin/jobs/cleanup", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      });

      const data = await response.json();
      if (data.success) {
        const { removedCompleted, removedFailed } = data.data;
        if (removedCompleted === 0 && removedFailed === 0) {
          alert("Nessun job in eccesso da rimuovere.");
        } else {
          alert(
            `Rimossi ${removedCompleted} completati e ${removedFailed} falliti.`,
          );
        }
        loadJobs();
      } else {
        alert(`Errore cleanup: ${data.error}`);
      }
    } catch (error) {
      console.error("Error cleaning up jobs:", error);
      alert("Errore durante il cleanup");
    } finally {
      setCleaningUp(false);
    }
  };

  const filteredJobs = useMemo(() => {
    if (!searchQuery.trim()) return jobs;
    const q = searchQuery.toLowerCase();
    return jobs.filter(
      (job) =>
        job.jobId?.toLowerCase().includes(q) ||
        job.username?.toLowerCase().includes(q) ||
        job.orderData?.customerName?.toLowerCase().includes(q) ||
        job.result?.orderId?.toLowerCase().includes(q) ||
        job.error?.toLowerCase().includes(q),
    );
  }, [jobs, searchQuery]);

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

  const handleCancel = async (jobId: string) => {
    if (!confirm("Sei sicuro di voler cancellare questo job?")) return;

    const jwt = localStorage.getItem("archibald_jwt");
    if (!jwt) return;

    setCancellingJobId(jobId);

    try {
      const response = await fetch(`/api/admin/jobs/cancel/${jobId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      });

      const data = await response.json();
      if (data.success) {
        loadJobs();
      } else {
        alert(`Cancel failed: ${data.error}`);
      }
    } catch (error) {
      console.error("Error cancelling job:", error);
      alert("Error cancelling job");
    } finally {
      setCancellingJobId(null);
    }
  };

  const handleExcelIvaUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const jwt = localStorage.getItem("archibald_jwt");
    if (!jwt) {
      alert("Devi effettuare il login");
      return;
    }

    setUploadingExcel(true);
    setUploadResult(null);

    try {
      // Upload Excel file with IVA data only
      const formData = new FormData();
      formData.append("file", file);
      formData.append("overwritePrices", "false"); // IVA only, don't overwrite prices

      const uploadResponse = await fetch("/api/prices/import-excel", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
        body: formData,
      });

      const uploadData = await uploadResponse.json();

      if (!uploadData.success) {
        alert(`❌ Errore upload IVA: ${uploadData.error}`);
        setUploadResult(uploadData);
        return;
      }

      setUploadResult({
        upload: uploadData.data,
      });

      alert(
        `✅ IVA caricata con successo!\n\n` +
          `📊 Totale righe: ${uploadData.data.totalRows}\n` +
          `✓ Prodotti matchati: ${uploadData.data.matchedRows}\n` +
          `🏷️  IVA aggiornate: ${uploadData.data.vatUpdatedCount}`,
      );
    } catch (error) {
      console.error("Excel IVA upload error:", error);
      alert(
        `❌ Errore durante l'upload: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setUploadingExcel(false);
      // Reset file input
      event.target.value = "";
    }
  };

  const handleSubClientImport = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const jwt = localStorage.getItem("archibald_jwt");
    if (!jwt) {
      alert("Devi effettuare il login");
      return;
    }

    setUploadingSubClients(true);
    setSubClientResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/subclients/import", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: formData,
      });

      const data = await response.json();

      if (!data.success) {
        alert(`Errore import sotto-clienti: ${data.error}`);
        setSubClientResult(data);
        return;
      }

      setSubClientResult(data.data);

      alert(
        `Import sotto-clienti completato!\n\n` +
          `Totale righe: ${data.data.totalRows}\n` +
          `Inseriti: ${data.data.inserted}\n` +
          `Aggiornati: ${data.data.updated}\n` +
          `Invariati: ${data.data.unchanged}\n` +
          `Eliminati: ${data.data.deleted}`,
      );
    } catch (error) {
      console.error("SubClient import error:", error);
      alert(
        `Errore durante l'import: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setUploadingSubClients(false);
      event.target.value = "";
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

  // Pagination uses filteredJobs
  const indexOfLastJob = currentPage * jobsPerPage;
  const indexOfFirstJob = indexOfLastJob - jobsPerPage;
  const currentJobs = filteredJobs.slice(indexOfFirstJob, indexOfLastJob);
  const totalPages = Math.ceil(filteredJobs.length / jobsPerPage);

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
          <SyncControlPanel />
        </section>

        <section className="admin-section">
          <WebSocketMonitor />
        </section>

        <section className="admin-section">
          <h2
            style={{ marginBottom: "16px", fontSize: "24px", fontWeight: 600 }}
          >
            📊 Sync Monitoring Dashboard
          </h2>
          <SyncMonitoringDashboard />
        </section>

        <section className="admin-section">
          <h2
            style={{ marginBottom: "16px", fontSize: "24px", fontWeight: 600 }}
          >
            👥 Admin Impersonation
          </h2>
          <AdminImpersonationPanel />
        </section>

        <section className="admin-section">
          <h2>📊 Carica Listino Excel (Solo IVA)</h2>
          <p className="admin-description">
            Carica un file Excel con dati IVA (Listino_2026_vendita.xlsx). Il
            file aggiorna solo i valori IVA dei prodotti. I prezzi vengono
            matchati automaticamente durante la sync prezzi.
          </p>

          <div
            style={{
              padding: "20px",
              border: "1px solid #ddd",
              borderRadius: "8px",
              backgroundColor: "#fafafa",
            }}
          >
            <div style={{ marginBottom: "16px" }}>
              <label
                htmlFor="excel-iva-upload"
                style={{
                  display: "block",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                Seleziona file Excel (.xlsx, .xls)
              </label>
              <input
                id="excel-iva-upload"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelIvaUpload}
                disabled={uploadingExcel}
                style={{
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  backgroundColor: "#fff",
                  cursor: uploadingExcel ? "not-allowed" : "pointer",
                }}
              />
            </div>

            {uploadingExcel && (
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "#e3f2fd",
                  borderRadius: "4px",
                  marginTop: "12px",
                }}
              >
                ⏳ Caricamento file Excel in corso...
              </div>
            )}

            {uploadResult && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "16px",
                  backgroundColor: "#d4edda",
                  border: "1px solid #28a745",
                  borderRadius: "4px",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 12px 0",
                    color: "#155724",
                  }}
                >
                  ✅ Upload completato
                </h3>

                <div style={{ display: "grid", gap: "8px", fontSize: "14px" }}>
                  <div>
                    <strong>Totale righe:</strong>{" "}
                    {uploadResult.upload?.totalRows || 0}
                  </div>
                  <div>
                    <strong>Prodotti matchati:</strong>{" "}
                    {uploadResult.upload?.matchedRows || 0}
                  </div>
                  <div>
                    <strong>IVA aggiornate:</strong>{" "}
                    {uploadResult.upload?.vatUpdatedCount || 0}
                  </div>
                </div>
              </div>
            )}

            <div
              style={{
                marginTop: "16px",
                padding: "12px",
                backgroundColor: "#e8f5e9",
                borderRadius: "4px",
                fontSize: "13px",
              }}
            >
              <strong>ℹ️ Info:</strong>
              <ul style={{ margin: "8px 0 0 20px", paddingLeft: 0 }}>
                <li>
                  Il file deve avere la struttura standard del listino Excel
                </li>
                <li>L'upload carica solo i dati IVA nel database</li>
                <li>
                  I prezzi vengono matchati automaticamente durante la sync
                  prezzi (barra arancione sopra)
                </li>
                <li>
                  Workflow: 1) Carica IVA da Excel → 2) Avvia sync prezzi → 3)
                  Matching automatico
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="admin-section">
          <h2>📋 Import Sotto-Clienti Fresis</h2>
          <p className="admin-description">
            Carica il file Excel con i sotto-clienti Fresis (clienti arca.xlsx).
            Il sistema importa/aggiorna tutti i record e rimuove quelli non più
            presenti nel file.
          </p>

          <div
            style={{
              padding: "20px",
              border: "1px solid #ddd",
              borderRadius: "8px",
              backgroundColor: "#fafafa",
            }}
          >
            <div style={{ marginBottom: "16px" }}>
              <label
                htmlFor="subclient-upload"
                style={{
                  display: "block",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                Seleziona file Excel (.xlsx, .xls)
              </label>
              <input
                id="subclient-upload"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleSubClientImport}
                disabled={uploadingSubClients}
                style={{
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  backgroundColor: "#fff",
                  cursor: uploadingSubClients ? "not-allowed" : "pointer",
                }}
              />
            </div>

            {uploadingSubClients && (
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "#fff3e0",
                  borderRadius: "4px",
                  marginTop: "12px",
                }}
              >
                Caricamento sotto-clienti in corso...
              </div>
            )}

            {subClientResult && subClientResult.totalRows !== undefined && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "16px",
                  backgroundColor: "#d4edda",
                  border: "1px solid #28a745",
                  borderRadius: "4px",
                }}
              >
                <h3 style={{ margin: "0 0 12px 0", color: "#155724" }}>
                  Import completato
                </h3>
                <div style={{ display: "grid", gap: "8px", fontSize: "14px" }}>
                  <div>
                    <strong>Totale righe:</strong> {subClientResult.totalRows}
                  </div>
                  <div>
                    <strong>Inseriti:</strong> {subClientResult.inserted}
                  </div>
                  <div>
                    <strong>Aggiornati:</strong> {subClientResult.updated}
                  </div>
                  <div>
                    <strong>Invariati:</strong> {subClientResult.unchanged}
                  </div>
                  <div>
                    <strong>Eliminati:</strong> {subClientResult.deleted}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="admin-section">
          <FresisDiscountManager />
        </section>

        <section className="admin-section">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <h2 style={{ margin: 0 }}>📋 Jobs Queue</h2>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="Cerca job, utente, cliente, ordine..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #ddd",
                  fontSize: "14px",
                  minWidth: "240px",
                }}
              />
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
                <option value="all">Tutti</option>
                <option value="waiting">Waiting</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
              <button
                onClick={handleCleanup}
                className="btn btn-sm"
                disabled={cleaningUp}
                style={{
                  backgroundColor: "#ff5722",
                  color: "#fff",
                  border: "none",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  cursor: cleaningUp ? "not-allowed" : "pointer",
                  opacity: cleaningUp ? 0.6 : 1,
                  fontSize: "13px",
                }}
              >
                {cleaningUp ? "Pulizia..." : "Pulisci eccesso"}
              </button>
              <button
                onClick={loadJobs}
                className="btn btn-secondary btn-sm"
                disabled={loading}
              >
                Refresh
              </button>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "16px",
              fontSize: "13px",
              color: "#666",
              marginBottom: "12px",
              flexWrap: "wrap",
            }}
          >
            <span>
              Totale caricati: <strong>{jobs.length}</strong>
            </span>
            {searchQuery && (
              <span>
                Filtrati: <strong>{filteredJobs.length}</strong>
              </span>
            )}
            {retentionConfig && (
              <span>
                Retention: max {retentionConfig.keepCompleted} completati, {retentionConfig.keepFailed} falliti
              </span>
            )}
          </div>

          {loading ? (
            <p>Caricamento job...</p>
          ) : filteredJobs.length === 0 ? (
            <p style={{ color: "#666", textAlign: "center", padding: "2rem" }}>
              {searchQuery ? "Nessun risultato per la ricerca" : "Nessun job trovato"}
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
                      <th style={{ padding: "10px 12px", borderBottom: "2px solid #ddd", width: "30px" }}></th>
                      <th style={{ padding: "10px 12px", borderBottom: "2px solid #ddd" }}>Job ID</th>
                      <th style={{ padding: "10px 12px", borderBottom: "2px solid #ddd" }}>User</th>
                      <th style={{ padding: "10px 12px", borderBottom: "2px solid #ddd" }}>Cliente</th>
                      <th style={{ padding: "10px 12px", borderBottom: "2px solid #ddd" }}>Status</th>
                      <th style={{ padding: "10px 12px", borderBottom: "2px solid #ddd" }}>Order ID</th>
                      <th style={{ padding: "10px 12px", borderBottom: "2px solid #ddd" }}>Data</th>
                      <th style={{ padding: "10px 12px", borderBottom: "2px solid #ddd" }}>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentJobs.map((job) => {
                      const isExpanded = expandedJobId === job.jobId;
                      return (
                        <Fragment key={job.jobId}>
                          <tr
                            onClick={() =>
                              setExpandedJobId(isExpanded ? null : job.jobId)
                            }
                            style={{
                              borderBottom: isExpanded ? "none" : "1px solid #eee",
                              cursor: "pointer",
                              backgroundColor: isExpanded ? "#f9f9f9" : "transparent",
                            }}
                          >
                            <td style={{ padding: "10px 12px", fontSize: "12px" }}>
                              {isExpanded ? "▼" : "▶"}
                            </td>
                            <td
                              style={{
                                padding: "10px 12px",
                                fontFamily: "monospace",
                                fontSize: "12px",
                              }}
                            >
                              {job.jobId.substring(0, 12)}
                            </td>
                            <td style={{ padding: "10px 12px" }}>{job.username || job.userId}</td>
                            <td style={{ padding: "10px 12px" }}>
                              {job.orderData?.customerName || "-"}
                            </td>
                            <td style={{ padding: "10px 12px" }}>
                              {getStatusBadge(job.status)}
                            </td>
                            <td
                              style={{
                                padding: "10px 12px",
                                fontFamily: "monospace",
                                fontSize: "12px",
                                color: job.result?.orderId ? "#333" : "#ccc",
                              }}
                            >
                              {job.result?.orderId || "-"}
                            </td>
                            <td
                              style={{
                                padding: "10px 12px",
                                fontSize: "12px",
                                color: "#666",
                              }}
                            >
                              {formatDate(job.createdAt)}
                            </td>
                            <td style={{ padding: "10px 12px" }}>
                              {job.status === "failed" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRetry(job.jobId);
                                  }}
                                  disabled={retryingJobId === job.jobId}
                                  className="btn btn-sm"
                                  style={{
                                    backgroundColor: "#ff9800",
                                    color: "#fff",
                                    border: "none",
                                    padding: "4px 10px",
                                    borderRadius: "6px",
                                    cursor:
                                      retryingJobId === job.jobId
                                        ? "not-allowed"
                                        : "pointer",
                                    opacity: retryingJobId === job.jobId ? 0.6 : 1,
                                    fontSize: "12px",
                                  }}
                                >
                                  {retryingJobId === job.jobId ? "..." : "Retry"}
                                </button>
                              )}
                              {(job.status === "active" || job.status === "waiting") && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCancel(job.jobId);
                                  }}
                                  disabled={cancellingJobId === job.jobId}
                                  className="btn btn-sm"
                                  style={{
                                    backgroundColor: "#f44336",
                                    color: "#fff",
                                    border: "none",
                                    padding: "4px 10px",
                                    borderRadius: "6px",
                                    cursor:
                                      cancellingJobId === job.jobId
                                        ? "not-allowed"
                                        : "pointer",
                                    opacity: cancellingJobId === job.jobId ? 0.6 : 1,
                                    fontSize: "12px",
                                  }}
                                >
                                  {cancellingJobId === job.jobId ? "..." : "Cancel"}
                                </button>
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr style={{ borderBottom: "1px solid #eee" }}>
                              <td colSpan={8} style={{ padding: "0 12px 16px 44px", backgroundColor: "#f9f9f9" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "13px", marginTop: "4px" }}>
                                  <div><strong>Job ID:</strong> <span style={{ fontFamily: "monospace" }}>{job.jobId}</span></div>
                                  <div><strong>User ID:</strong> <span style={{ fontFamily: "monospace" }}>{job.userId}</span></div>
                                </div>
                                {(job.orderData?.items?.length ?? 0) > 0 && (
                                  <div style={{ marginTop: "8px" }}>
                                    <strong style={{ fontSize: "13px" }}>Articoli ({job.orderData.items.length}):</strong>
                                    <div style={{ marginTop: "4px", fontSize: "12px", fontFamily: "monospace", maxHeight: "120px", overflowY: "auto" }}>
                                      {job.orderData.items.map((item, i) => (
                                        <div key={i}>
                                          {item.articleCode} x{item.quantity}
                                          {item.description && ` - ${item.description}`}
                                          {item.productName && ` (${item.productName})`}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {job.error && (
                                  <div style={{ marginTop: "8px", padding: "8px", backgroundColor: "#ffebee", borderRadius: "4px", fontSize: "12px", color: "#c62828", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                    <strong>Errore:</strong> {job.error}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

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
                    Prec.
                  </button>
                  <span
                    style={{
                      padding: "8px 12px",
                      fontSize: "14px",
                      color: "#666",
                    }}
                  >
                    Pagina {currentPage} di {totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="btn btn-secondary btn-sm"
                    style={{ opacity: currentPage === totalPages ? 0.5 : 1 }}
                  >
                    Succ.
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
              <h3>📊 Caricamento Excel IVA</h3>
              <p>
                Carica un file Excel (Listino_2026_vendita.xlsx) per aggiornare
                i valori IVA dei prodotti. Il sistema matcha automaticamente i
                prodotti per ID e Codice Articolo.
              </p>
            </div>
            <div className="info-card">
              <h3>🔄 Jobs Queue</h3>
              <p>
                Monitora lo stato degli ordini inviati dagli utenti. Puoi
                visualizzare, filtrare e ritentare ordini falliti dal pannello
                di gestione.
              </p>
            </div>
            <div className="info-card">
              <h3>🔐 Accesso Admin</h3>
              <p>
                Questo pannello è accessibile solo agli amministratori. Tutte le
                operazioni vengono tracciate per sicurezza e audit.
              </p>
            </div>
          </div>
        </section>

        {/* TODO_FUTURE_FEATURE: Sistema Whitelist e Moduli a Pagamento */}
        <section
          className="admin-section"
          style={{
            border: "2px dashed #ff9800",
            backgroundColor: "#fff3e0",
            opacity: 0.7,
          }}
        >
          <h2>🚧 Funzionalità Future (In Sviluppo)</h2>
          <div className="info-grid">
            <div className="info-card" style={{ backgroundColor: "#fffde7" }}>
              <h3>👥 Sistema Whitelist Utenti</h3>
              <p>
                <strong>Pianificato:</strong> Sistema di approvazione utenti con
                whitelist.
              </p>
              <ul
                style={{
                  textAlign: "left",
                  fontSize: "14px",
                  marginTop: "10px",
                }}
              >
                <li>Gestione richieste accesso da nuovi utenti</li>
                <li>
                  Assegnazione nome utente reale a username Archibald di login
                </li>
                <li>Whitelist con approvazione/rifiuto manuale admin</li>
                <li>Dashboard richieste pendenti</li>
              </ul>
              <div
                style={{
                  marginTop: "15px",
                  padding: "10px",
                  backgroundColor: "#fff9c4",
                  borderRadius: "4px",
                  fontSize: "13px",
                }}
              >
                <strong>💡 Note implementazione:</strong>
                <br />- Creare tabella users_whitelist nel database
                <br />- Endpoint API: /api/admin/whitelist
                <br />- UI: tabella con approve/reject buttons
                <br />- Email notifiche utenti approvati
              </div>
            </div>

            <div className="info-card" style={{ backgroundColor: "#e1f5fe" }}>
              <h3>💎 Moduli a Pagamento</h3>
              <p>
                <strong>Pianificato:</strong> Sistema di moduli premium con
                attivazione selettiva per utente.
              </p>
              <ul
                style={{
                  textAlign: "left",
                  fontSize: "14px",
                  marginTop: "10px",
                }}
              >
                <li>Frazionamento funzionalità in moduli separati</li>
                <li>Gestione abbonamenti e pagamenti</li>
                <li>Attivazione/disattivazione moduli per utente</li>
                <li>Dashboard monetizzazione e analytics</li>
              </ul>
              <div
                style={{
                  marginTop: "15px",
                  padding: "10px",
                  backgroundColor: "#b3e5fc",
                  borderRadius: "4px",
                  fontSize: "13px",
                }}
              >
                <strong>💡 Note implementazione:</strong>
                <br />- Definire moduli: Base, Gestione Magazzino, Analytics,
                Bot Telegram, ecc.
                <br />- Integrazione Stripe/PayPal per pagamenti
                <br />- Tabella user_subscriptions con expiry dates
                <br />- Middleware per verifica abilitazione moduli
                <br />- UI: checkbox toggle per assegnazione moduli admin
              </div>
            </div>

            <div className="info-card" style={{ backgroundColor: "#f3e5f5" }}>
              <h3>📊 Dashboard Amministrazione Avanzata</h3>
              <p>
                <strong>Pianificato:</strong> Vista unificata per gestione
                utenti e moduli.
              </p>
              <ul
                style={{
                  textAlign: "left",
                  fontSize: "14px",
                  marginTop: "10px",
                }}
              >
                <li>Tabella utenti con stato whitelist e moduli attivi</li>
                <li>Filtri avanzati (stato, moduli, date)</li>
                <li>Azioni bulk (attiva/disattiva moduli multipli)</li>
                <li>Export dati CSV per fatturazione</li>
              </ul>
            </div>
          </div>

          <div
            style={{
              marginTop: "20px",
              padding: "15px",
              backgroundColor: "#fff",
              borderRadius: "8px",
              border: "1px solid #ff9800",
            }}
          >
            <h3 style={{ marginTop: 0, color: "#e65100" }}>
              🔧 Istruzioni per Sviluppatori
            </h3>
            <p style={{ fontSize: "14px", lineHeight: "1.6" }}>
              <strong>Tag da cercare nel codice:</strong>{" "}
              <code style={{ backgroundColor: "#ffe0b2", padding: "2px 6px" }}>
                TODO_FUTURE_FEATURE
              </code>
            </p>
            <p style={{ fontSize: "14px", lineHeight: "1.6" }}>
              Quando si implementano queste funzionalità, cercare tutti i
              commenti con il tag{" "}
              <code style={{ backgroundColor: "#ffe0b2", padding: "2px 6px" }}>
                TODO_FUTURE_FEATURE
              </code>{" "}
              nel codebase e sostituire i placeholder con il codice effettivo.
            </p>
          </div>
        </section>
      </main>

      <footer className="admin-footer">
        <p>v1.0.0 • Admin Panel • Solo per amministratori • Fresis Team</p>
      </footer>
    </div>
  );
}
