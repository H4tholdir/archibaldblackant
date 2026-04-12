import { useState, useEffect, useMemo, Fragment } from "react";
import { getEnrichmentStats, getRecognitionBudget } from "../api/recognition";
import type { EnrichmentStats, BudgetState } from "../api/recognition";
import { Link } from "react-router-dom";
import "../styles/AdminPage.css";
import SyncControlPanel from "../components/SyncControlPanel";
import SyncMonitoringDashboard from "../components/SyncMonitoringDashboard";
import WebSocketMonitor from "../components/WebSocketMonitor";
import { AdminImpersonationPanel } from "../components/AdminImpersonationPanel";
import { KometListinoImporter } from "../components/KometListinoImporter";
import { FedExReportSection } from "../components/admin/FedExReportSection";
import { AdminModulesSection } from "../components/admin/AdminModulesSection";
import { useWebSocketContext } from "../contexts/WebSocketContext";
import { fetchWithRetry } from "../utils/fetch-with-retry";

interface AdminPageProps {
  onLogout: () => void;
  userName: string;
}

interface Job {
  jobId: string;
  type?: string;
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

const TYPE_GROUPS: Record<string, string[]> = {
  Ordini: ["submit-order", "edit-order", "delete-order", "send-to-verona"],
  Clienti: ["create-customer", "update-customer"],
  Download: ["download-ddt-pdf", "download-invoice-pdf"],
};

function getTypeLabel(type?: string): string {
  if (!type) return "—";
  for (const [group] of Object.entries(TYPE_GROUPS)) {
    if (TYPE_GROUPS[group].includes(type)) return group;
  }
  if (type.startsWith("sync-")) return "Sync";
  return type;
}

function getTypeBadgeColor(type?: string): string {
  const label = getTypeLabel(type);
  switch (label) {
    case "Ordini": return "#2563eb";
    case "Clienti": return "#7c3aed";
    case "Download": return "#0891b2";
    case "Sync": return "#6b7280";
    default: return "#6b7280";
  }
}

interface RetentionConfig {
  keepCompleted: number;
  keepFailed: number;
}

type OpProgress = { pct: number; label: string; done?: boolean; failed?: boolean }

export function AdminPage(_props: AdminPageProps) {
  const { subscribe } = useWebSocketContext();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);

  const [uploadingSubClients, setUploadingSubClients] = useState(false);
  const [subClientResult, setSubClientResult] = useState<any>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [cleaningUp, setCleaningUp] = useState(false);
  const [retentionConfig, setRetentionConfig] =
    useState<RetentionConfig | null>(null);
  const jobsPerPage = 20;

  const [enrichmentStats, setEnrichmentStats] = useState<EnrichmentStats | null>(null);
  const [recognitionBudget, setRecognitionBudget] = useState<BudgetState | null>(null);
  const [enqueuingIngestion, setEnqueuingIngestion] = useState(false);
  const [ingestionQueued, setIngestionQueued] = useState(false);
  const [enqueuingEnrich, setEnqueuingEnrich] = useState(false);
  const [enqueuingWebEnrich, setEnqueuingWebEnrich] = useState(false);
  const [enqueuingReExtract, setEnqueuingReExtract] = useState(false);
  const [reExtractQueued, setReExtractQueued] = useState(false);
  const [enqueuingVisualIndex, setEnqueuingVisualIndex] = useState(false);
  const [visualIndexQueued, setVisualIndexQueued] = useState(false);
  const [enqueuingCatalogPages, setEnqueuingCatalogPages] = useState(false);
  const [catalogPagesQueued, setCatalogPagesQueued] = useState(false);
  const [webImageFamilyCode, setWebImageFamilyCode] = useState('');
  const [webImageUrl, setWebImageUrl] = useState('');
  const [enqueuingWebImage, setEnqueuingWebImage] = useState(false);
  const [webImageQueued, setWebImageQueued] = useState(false);
  const [catalogFamilyCodes, setCatalogFamilyCodes] = useState<string[]>([]);

  const [ingestionProgress, setIngestionProgress] = useState<OpProgress | null>(null);
  const [enrichProgress, setEnrichProgress] = useState<OpProgress | null>(null);
  const [webEnrichProgress, setWebEnrichProgress] = useState<OpProgress | null>(null);
  const [reExtractProgress, setReExtractProgress] = useState<OpProgress | null>(null);
  const [visualProgress, setVisualProgress] = useState<OpProgress | null>(null);
  const [catalogPagesProgress, setCatalogPagesProgress] = useState<OpProgress | null>(null);
  const [webImageProgress, setWebImageProgress] = useState<OpProgress | null>(null);

  useEffect(() => {
    loadJobs();
    loadRetentionConfig();
    const interval = setInterval(loadJobs, 10000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  useEffect(() => {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) return;
    getEnrichmentStats(token).then(setEnrichmentStats).catch(console.error);
    getRecognitionBudget(token).then(setRecognitionBudget).catch(console.error);
    fetchWithRetry('/api/admin/catalog-family-codes', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json() as Promise<string[]>)
      .then(setCatalogFamilyCodes)
      .catch(console.error);
  }, []);

  useEffect(() => {
    const setterFor: Record<string, (v: OpProgress | null) => void> = {
      'catalog-ingestion':          setIngestionProgress,
      'catalog-product-enrichment': setEnrichProgress,
      'web-product-enrichment':     setWebEnrichProgress,
      're-extract-pictograms':      setReExtractProgress,
      'build-visual-index':         setVisualProgress,
      'index-catalog-pages':        setCatalogPagesProgress,
      'index-web-image':            setWebImageProgress,
    }

    const queuedSetterFor: Record<string, (v: boolean) => void> = {
      'catalog-ingestion':    setIngestionQueued,
      're-extract-pictograms': setReExtractQueued,
      'build-visual-index':   setVisualIndexQueued,
      'index-catalog-pages':  setCatalogPagesQueued,
      'index-web-image':      setWebImageQueued,
    }

    const unsubs = [
      subscribe('JOB_PROGRESS', (payload: unknown) => {
        const p = payload as Record<string, unknown>
        const setter = setterFor[p.type as string]
        if (!setter) return
        setter({ pct: (p.progress as number) ?? 0, label: (p.label as string) ?? '' })
      }),
      subscribe('JOB_COMPLETED', (payload: unknown) => {
        const p = payload as Record<string, unknown>
        const setter = setterFor[p.type as string]
        if (!setter) return
        setter({ pct: 100, label: 'Completato', done: true })
        queuedSetterFor[p.type as string]?.(false)
        setTimeout(() => setter(null), 4000)
      }),
      subscribe('JOB_FAILED', (payload: unknown) => {
        const p = payload as Record<string, unknown>
        const setter = setterFor[p.type as string]
        if (!setter) return
        setter({ pct: 0, label: 'Errore — operazione fallita', failed: true })
        queuedSetterFor[p.type as string]?.(false)
        setTimeout(() => setter(null), 6000)
      }),
    ]

    return () => unsubs.forEach(fn => fn())
  }, [subscribe])

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

  const loadRetentionConfig = async () => {
    try {
      const jwt = localStorage.getItem("archibald_jwt");
      if (!jwt) return;

      const response = await fetch("/api/admin/jobs/retention", {
        headers: { Authorization: `Bearer ${jwt}` },
      });

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
    let filtered = jobs;
    if (typeFilter !== "all") {
      filtered = filtered.filter((job) => {
        const label = getTypeLabel(job.type);
        return label === typeFilter;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (job) =>
          job.jobId.toLowerCase().includes(q) ||
          (job.username ?? "").toLowerCase().includes(q) ||
          (job.orderData?.customerName ?? "").toLowerCase().includes(q) ||
          job.result?.orderId?.toLowerCase().includes(q) ||
          job.error?.toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [jobs, searchQuery, typeFilter]);

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


  const handleStartIngestion = async () => {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) return;
    setEnqueuingIngestion(true);
    try {
      const res = await fetch("/api/operations/enqueue", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "catalog-ingestion", data: {} }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setIngestionQueued(true);
    } catch {
      alert("Errore nell'avvio dell'ingestion. Riprova.");
    } finally {
      setEnqueuingIngestion(false);
    }
  };

  const handleBulkEnrich = async () => {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) return;
    setEnqueuingEnrich(true);
    try {
      const res = await fetch("/api/operations/enqueue", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "catalog-product-enrichment", data: {} }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      alert("Errore nell'avvio dell'enrichment. Riprova.");
    } finally {
      setEnqueuingEnrich(false);
    }
  };

  const handleBulkWebEnrich = async () => {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) return;
    setEnqueuingWebEnrich(true);
    try {
      const res = await fetch("/api/operations/enqueue", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "web-product-enrichment", data: {} }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      alert("Errore nell'avvio del web enrichment. Riprova.");
    } finally {
      setEnqueuingWebEnrich(false);
    }
  };

  const handleReExtractPictograms = async () => {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) return;
    setEnqueuingReExtract(true);
    try {
      const res = await fetch("/api/operations/enqueue", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "re-extract-pictograms", data: {} }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReExtractQueued(true);
    } catch {
      alert("Errore nell'avvio della ri-estrazione pittogrammi. Riprova.");
    } finally {
      setEnqueuingReExtract(false);
    }
  };

  const handleBuildVisualIndex = async () => {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) return;
    setEnqueuingVisualIndex(true);
    try {
      const res = await fetch("/api/operations/enqueue", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "build-visual-index", data: {} }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setVisualIndexQueued(true);
    } catch {
      alert("Errore nell'avvio del visual index. Riprova.");
    } finally {
      setEnqueuingVisualIndex(false);
    }
  };

  const handleIndexCatalogPages = async () => {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) return;
    setEnqueuingCatalogPages(true);
    try {
      const res = await fetch("/api/operations/enqueue", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "index-catalog-pages", data: {} }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCatalogPagesQueued(true);
    } catch {
      alert("Errore nell'avvio dell'indicizzazione. Riprova.");
    } finally {
      setEnqueuingCatalogPages(false);
    }
  };

  const handleIndexWebImage = async (imageBase64?: string) => {
    const token = localStorage.getItem("archibald_jwt");
    if (!token || !webImageFamilyCode.trim()) return;
    if (!imageBase64 && !webImageUrl.trim()) return;
    setEnqueuingWebImage(true);
    try {
      const data = imageBase64
        ? { familyCode: webImageFamilyCode.trim(), imageBase64 }
        : { familyCode: webImageFamilyCode.trim(), imageUrl: webImageUrl.trim() };
      const res = await fetch("/api/operations/enqueue", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "index-web-image", data }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setWebImageQueued(true);
    } catch {
      alert("Errore nell'avvio dell'indicizzazione. Riprova.");
    } finally {
      setEnqueuingWebImage(false);
    }
  };

  const handleWebImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      if (base64) void handleIndexWebImage(base64);
    };
    reader.readAsDataURL(file);
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

  function OpProgressBar({ progress }: { progress: OpProgress | null }) {
    if (!progress) return null
    const color = progress.failed ? '#d32f2f' : progress.done ? '#388e3c' : '#1976d2'
    return (
      <div style={{ gridColumn: '1 / -1', paddingTop: 4 }}>
        <div style={{ background: '#e0e0e0', borderRadius: 4, height: 6, overflow: 'hidden' }}>
          <div style={{
            width: `${progress.pct}%`, background: color,
            height: 6, borderRadius: 4,
            transition: 'width 0.4s ease',
          }} />
        </div>
        <div style={{ fontSize: 11, color, marginTop: 4 }}>{progress.label}</div>
      </div>
    )
  }

  // Pagination uses filteredJobs
  const indexOfLastJob = currentPage * jobsPerPage;
  const indexOfFirstJob = indexOfLastJob - jobsPerPage;
  const currentJobs = filteredJobs.slice(indexOfFirstJob, indexOfLastJob);
  const totalPages = Math.ceil(filteredJobs.length / jobsPerPage);

  return (
    <div className="admin-page">
      <main className="admin-main">
        <section className="admin-section">
          <Link
            to="/admin/access"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              background: "#1976d2",
              color: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Gestione accessi utenti
          </Link>
        </section>

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
          <FedExReportSection />
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
              <input autoComplete="off"
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
          <h2 style={{ marginBottom: "16px", fontSize: "20px", fontWeight: 600 }}>
            Catalogo & Enrichment
          </h2>

          <div style={{
            border: "1px solid #ddd", borderRadius: "8px",
            overflow: "hidden", fontSize: "14px",
          }}>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr auto auto",
              alignItems: "center", gap: "12px",
              padding: "12px 16px", borderBottom: "1px solid #eee",
              backgroundColor: "#fafafa",
            }}>
              <div>
                <strong>Catalog ingestion</strong>
                <div style={{ color: ingestionQueued ? "#1976d2" : "#666", fontSize: "12px", marginTop: 2 }}>
                  {ingestionQueued
                    ? "In corso — gira in background (~15-20 min)"
                    : enrichmentStats?.lastIngestedPage != null
                      ? `Ultima pag. ${enrichmentStats.lastIngestedPage}`
                      : "Non eseguita"}
                </div>
              </div>
              <div style={{ color: "#555", fontSize: "13px" }}>
                {enrichmentStats != null
                  ? `${enrichmentStats.totalCatalogEntries} / ~800 famiglie`
                  : "—"}
              </div>
              <button
                onClick={() => { void handleStartIngestion(); }}
                disabled={enqueuingIngestion || ingestionQueued}
                style={{
                  background: ingestionQueued ? "#999" : "#1976d2",
                  color: "#fff", border: "none",
                  borderRadius: "6px", padding: "6px 14px",
                  fontSize: "13px", fontWeight: 600,
                  cursor: (enqueuingIngestion || ingestionQueued) ? "not-allowed" : "pointer",
                  opacity: (enqueuingIngestion || ingestionQueued) ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {enqueuingIngestion ? "..." : ingestionQueued ? "Avviata" : "Avvia →"}
              </button>
              <OpProgressBar progress={ingestionProgress} />
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "1fr auto auto",
              alignItems: "center", gap: "12px",
              padding: "12px 16px", borderBottom: "1px solid #eee",
            }}>
              <div>
                <strong>Prodotti totali</strong>
              </div>
              <div style={{ color: "#555", fontSize: "13px" }}>
                {enrichmentStats?.totalProductDetails ?? "—"}
              </div>
              <div style={{ width: "80px" }} />
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "1fr auto auto",
              alignItems: "center", gap: "12px",
              padding: "12px 16px", borderBottom: "1px solid #eee",
            }}>
              <div>
                <strong>Pending catalog enrichment</strong>
              </div>
              <div style={{ color: enrichmentStats && enrichmentStats.pendingCatalogEnrichment > 0 ? "#e65100" : "#555", fontSize: "13px" }}>
                {enrichmentStats?.pendingCatalogEnrichment ?? "—"}
              </div>
              <button
                onClick={() => { void handleBulkEnrich(); }}
                disabled={enqueuingEnrich}
                style={{
                  background: "#388e3c", color: "#fff", border: "none",
                  borderRadius: "6px", padding: "6px 14px",
                  fontSize: "13px", fontWeight: 600,
                  cursor: enqueuingEnrich ? "not-allowed" : "pointer",
                  opacity: enqueuingEnrich ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {enqueuingEnrich ? "..." : "Bulk enrich →"}
              </button>
              <OpProgressBar progress={enrichProgress} />
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "1fr auto auto",
              alignItems: "center", gap: "12px",
              padding: "12px 16px", borderBottom: "1px solid #eee",
            }}>
              <div>
                <strong>Pending web enrichment</strong>
                <div style={{ color: "#666", fontSize: "12px", marginTop: 2 }}>
                  Immagini e risorse da komet.fr
                </div>
              </div>
              <div style={{ color: "#555", fontSize: "13px" }}>
                {enrichmentStats?.pendingWebEnrichment ?? "—"}
              </div>
              <button
                onClick={() => { void handleBulkWebEnrich(); }}
                disabled={enqueuingWebEnrich}
                style={{
                  background: "#0288d1",
                  color: "#fff", border: "none",
                  borderRadius: "6px", padding: "6px 14px",
                  fontSize: "13px", fontWeight: 600,
                  cursor: enqueuingWebEnrich ? "not-allowed" : "pointer",
                  opacity: enqueuingWebEnrich ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {enqueuingWebEnrich ? "..." : "Web enrich →"}
              </button>
              <OpProgressBar progress={webEnrichProgress} />
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "1fr auto auto",
              alignItems: "center", gap: "12px",
              padding: "12px 16px", borderBottom: "1px solid #eee",
            }}>
              <div>
                <strong>Ri-estrazione pittogrammi</strong>
                <div style={{ color: "#666", fontSize: "12px", marginTop: 2 }}>
                  Corregge pittogrammi incompleti (~810 famiglie, ~$3)
                </div>
              </div>
              <div />
              <button
                onClick={() => { void handleReExtractPictograms(); }}
                disabled={enqueuingReExtract}
                style={{
                  background: "#388e3c",
                  color: "#fff", border: "none",
                  borderRadius: "6px", padding: "6px 14px",
                  fontSize: "13px", fontWeight: 600,
                  cursor: enqueuingReExtract ? "not-allowed" : "pointer",
                  opacity: enqueuingReExtract ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {enqueuingReExtract ? "..." : reExtractQueued ? "In coda..." : "Ri-estrai →"}
              </button>
              <OpProgressBar progress={reExtractProgress} />
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "1fr auto auto",
              alignItems: "center", gap: "12px",
              padding: "12px 16px", borderBottom: "1px solid #eee",
            }}>
              <div>
                <strong>Visual index (campionario)</strong>
                <div style={{ color: visualIndexQueued ? "#1976d2" : "#666", fontSize: "12px", marginTop: 2 }}>
                  {visualIndexQueued
                    ? "In corso — gira in background (~5 min)"
                    : "Strip indicizzate con embedding Jina v4"}
                </div>
              </div>
              <div style={{ color: "#555", fontSize: "13px" }}>
                {enrichmentStats != null ? `${enrichmentStats.visualIndexCount} / 150` : "—"}
              </div>
              <button
                onClick={() => { void handleBuildVisualIndex(); }}
                disabled={enqueuingVisualIndex || visualIndexQueued}
                style={{
                  background: visualIndexQueued ? "#999" : "#7b1fa2",
                  color: "#fff", border: "none",
                  borderRadius: "6px", padding: "6px 14px",
                  fontSize: "13px", fontWeight: 600,
                  cursor: (enqueuingVisualIndex || visualIndexQueued) ? "not-allowed" : "pointer",
                  opacity: (enqueuingVisualIndex || visualIndexQueued) ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {enqueuingVisualIndex ? "..." : visualIndexQueued ? "Avviato" : "Indicizza →"}
              </button>
              <OpProgressBar progress={visualProgress} />
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "1fr auto auto",
              alignItems: "center", gap: "12px",
              padding: "12px 16px", borderBottom: "1px solid #eee",
            }}>
              <div>
                <strong>Visual index (pagine catalogo PDF)</strong>
                <div style={{ color: catalogPagesQueued ? "#1976d2" : "#666", fontSize: "12px", marginTop: 2 }}>
                  {catalogPagesQueued
                    ? "In corso — gira in background (~1h)"
                    : "Indicizza ogni pagina PDF per tutte le famiglie del catalogo"}
                </div>
              </div>
              <div style={{ color: "#555", fontSize: "13px" }}>1639 fam.</div>
              <button
                onClick={() => { void handleIndexCatalogPages(); }}
                disabled={enqueuingCatalogPages || catalogPagesQueued}
                style={{
                  background: catalogPagesQueued ? "#999" : "#7b1fa2",
                  color: "#fff", border: "none",
                  borderRadius: "6px", padding: "6px 14px",
                  fontSize: "13px", fontWeight: 600,
                  cursor: (enqueuingCatalogPages || catalogPagesQueued) ? "not-allowed" : "pointer",
                  opacity: (enqueuingCatalogPages || catalogPagesQueued) ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {enqueuingCatalogPages ? "..." : catalogPagesQueued ? "Avviato" : "Indicizza PDF →"}
              </button>
              <OpProgressBar progress={catalogPagesProgress} />
            </div>

            <div style={{
              padding: "12px 16px", borderBottom: "1px solid #eee",
            }}>
              <strong>Indicizza immagine per famiglia</strong>
              <div style={{ color: "#666", fontSize: "12px", marginTop: 2, marginBottom: 8 }}>
                Utile per prodotti discontinued (es. 227B) — URL immagine oppure carica file direttamente
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="text"
                  list="catalog-family-codes-list"
                  placeholder="Codice famiglia (es. 227B)"
                  value={webImageFamilyCode}
                  onChange={e => { setWebImageFamilyCode(e.target.value); setWebImageQueued(false); }}
                  style={{
                    padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc",
                    fontSize: 13, width: 180,
                  }}
                />
                <datalist id="catalog-family-codes-list">
                  {catalogFamilyCodes.map(fc => <option key={fc} value={fc} />)}
                </datalist>
                <input
                  type="text"
                  placeholder="URL immagine (opzionale)"
                  value={webImageUrl}
                  onChange={e => { setWebImageUrl(e.target.value); setWebImageQueued(false); }}
                  style={{
                    padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc",
                    fontSize: 13, flex: 1, minWidth: 160,
                  }}
                />
                <button
                  onClick={() => { void handleIndexWebImage(); }}
                  disabled={enqueuingWebImage || webImageQueued || !webImageFamilyCode.trim() || !webImageUrl.trim()}
                  style={{
                    background: webImageQueued ? "#999" : "#7b1fa2",
                    color: "#fff", border: "none",
                    borderRadius: "6px", padding: "6px 14px",
                    fontSize: "13px", fontWeight: 600,
                    cursor: (enqueuingWebImage || webImageQueued || !webImageFamilyCode.trim() || !webImageUrl.trim()) ? "not-allowed" : "pointer",
                    opacity: (enqueuingWebImage || webImageQueued || !webImageFamilyCode.trim() || !webImageUrl.trim()) ? 0.6 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {enqueuingWebImage ? "..." : webImageQueued ? "Avviato" : "Da URL →"}
                </button>
                <label style={{
                  background: webImageQueued || enqueuingWebImage || !webImageFamilyCode.trim() ? "#999" : "#0288d1",
                  color: "#fff", borderRadius: 6, padding: "6px 14px",
                  fontSize: 13, fontWeight: 600, cursor: (webImageQueued || enqueuingWebImage || !webImageFamilyCode.trim()) ? "not-allowed" : "pointer",
                  opacity: (webImageQueued || enqueuingWebImage || !webImageFamilyCode.trim()) ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}>
                  {enqueuingWebImage ? "..." : webImageQueued ? "Avviato" : "Carica file →"}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    disabled={webImageQueued || enqueuingWebImage || !webImageFamilyCode.trim()}
                    onChange={handleWebImageFileUpload}
                  />
                </label>
              </div>
              <OpProgressBar progress={webImageProgress} />
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "1fr auto auto",
              alignItems: "center", gap: "12px",
              padding: "12px 16px",
            }}>
              <div>
                <strong>Vision API — budget oggi</strong>
                <div style={{ color: "#666", fontSize: "12px", marginTop: 2 }}>
                  {recognitionBudget?.throttleLevel === "warning" && "⚠️ Avviso soglia"}
                  {recognitionBudget?.throttleLevel === "limited" && "🔴 Limite raggiunto"}
                </div>
              </div>
              <div style={{ color: "#555", fontSize: "13px" }}>
                {recognitionBudget != null
                  ? `${recognitionBudget.usedToday} / ${recognitionBudget.dailyLimit}`
                  : "—"}
              </div>
              <div style={{ width: "80px" }} />
            </div>
          </div>

          <div style={{
            marginTop: "12px", padding: "10px 14px",
            backgroundColor: "#fff8e1", borderRadius: "6px",
            fontSize: "12px", color: "#555", lineHeight: 1.5,
          }}>
            Costo stimato ingestion: ~$15–20 (Sonnet, una-tantum) &nbsp;·&nbsp;
            Costo per scan: ~$0.03 (catalog lookup + 2 pag. PDF)
          </div>

          <div style={{
            marginTop: "8px", padding: "10px 14px",
            backgroundColor: "#f3f4f6", borderRadius: "6px",
            fontSize: "12px", color: "#444", lineHeight: 1.6,
          }}>
            <strong>Quando rieseguire l&apos;ingestion:</strong> solo dopo aver caricato un nuovo PDF del catalogo Komet sul VPS
            (<code style={{ background: "#e5e7eb", padding: "1px 4px", borderRadius: 3 }}>/home/deploy/archibald-app/catalog/komet-catalog-2025.pdf</code>).
            L&apos;operazione legge tutte le ~780 pagine e popola il database delle famiglie prodotti.
            Dura circa ~90 minuti e non va interrotta. Al termine il contatore passerà da 0 a ~800 famiglie.
          </div>
        </section>

        <section className="admin-section">
          <KometListinoImporter />
        </section>

        {/* Sezione Gestione Moduli */}
        <section style={{ marginTop: '2rem' }}>
          <AdminModulesSection />
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
              <input autoComplete="off"
                type="search"
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
                  flex: 1,
                  minWidth: 0,
                }}
              />
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #ddd",
                  fontSize: "14px",
                }}
              >
                <option value="all">Tutti i tipi</option>
                <option value="Ordini">Ordini</option>
                <option value="Clienti">Clienti</option>
                <option value="Download">Download</option>
                <option value="Sync">Sync</option>
              </select>
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
                      <th style={{ padding: "10px 12px", borderBottom: "2px solid #ddd" }}>Tipo</th>
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
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                color: "#fff",
                                backgroundColor: getTypeBadgeColor(job.type),
                              }}>{getTypeLabel(job.type)}</span>
                            </td>
                            <td style={{ padding: "10px 12px" }}>{job.username ?? "—"}</td>
                            <td style={{ padding: "10px 12px" }}>
                              {job.orderData?.customerName ?? "—"}
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
                                {job.orderData.items?.length > 0 && (
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
