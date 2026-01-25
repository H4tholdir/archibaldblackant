import { useState, useEffect } from "react";
import "./ExcelPriceManager.css";
import { productService } from "../services/products.service";
import { toastService } from "../services/toast.service";

interface ImportHistory {
  id: number;
  filename: string;
  uploadedAt: number;
  uploadedBy: string;
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  vatUpdatedCount: number;
  priceUpdatedCount: number;
  status: "completed" | "failed" | "processing";
  error?: string;
}

interface UnmatchedProduct {
  excelId: string;
  excelCodiceArticolo: string;
  excelDescrizione: string;
  reason: string;
}

export function ExcelPriceManager() {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [history, setHistory] = useState<ImportHistory[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [overwritePrices, setOverwritePrices] = useState(true);
  const [lastImport, setLastImport] = useState<any>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [unmatchedProducts, setUnmatchedProducts] = useState<
    UnmatchedProduct[]
  >([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const jwt = localStorage.getItem("archibald_jwt");
      if (!jwt) return;

      const response = await fetch("/api/prices/imports", {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setHistory(result.data);
      }
    } catch (error) {
      console.error("Failed to load import history:", error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      alert("Seleziona un file Excel");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const jwt = localStorage.getItem("archibald_jwt");
      if (!jwt) {
        alert("Devi effettuare il login");
        return;
      }

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("overwritePrices", overwritePrices.toString());

      // Simulate progress (since we don't have real upload progress)
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch("/api/prices/import-excel", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const result = await response.json();

      if (result.success) {
        setLastImport(result.data);
        setUnmatchedProducts(result.data.unmatchedProducts || []);
        alert(
          `✅ Import completato!\n\n` +
            `📊 Totale righe: ${result.data.totalRows}\n` +
            `✓ Prodotti matchati: ${result.data.matchedRows}\n` +
            `✗ Non matchati: ${result.data.unmatchedRows}\n` +
            `💰 Prezzi aggiornati: ${result.data.priceUpdatedCount}\n` +
            `🏷️  IVA aggiornate: ${result.data.vatUpdatedCount}`,
        );

        // Reload history
        loadHistory();

        // 🔄 Trigger immediate cache refresh
        try {
          await productService.syncProducts();
          toastService.success("✅ Cache aggiornata con nuovi prezzi e IVA");
        } catch (syncError) {
          console.error("[ExcelPriceManager] Cache sync failed:", syncError);
          toastService.warning(
            "⚠️ Import completato ma cache non aggiornata. Ricarica la pagina.",
          );
        }

        // Reset form
        setSelectedFile(null);
        setUploadProgress(0);

        // Show unmatched if any
        if (result.data.unmatchedRows > 0) {
          setShowUnmatched(true);
        }
      } else {
        alert(`❌ Errore: ${result.error}`);
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      alert(`❌ Errore durante l'upload: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    // Create sample Excel structure info
    alert(
      "📋 Struttura file Excel richiesta:\n\n" +
        "Colonna A: ID (es: 001627K0)\n" +
        "Colonna B: Codice Articolo (es: 1.204.005)\n" +
        "Colonna C: Descrizione\n" +
        "Colonna D: Nome Gruppi\n" +
        "Colonna E: Conf.\n" +
        "Colonna F: Prezzo di listino unit. (opzionale)\n" +
        "Colonna G: Prezzo di listino conf. (opzionale)\n" +
        "Colonna H: IVA (es: 22)\n\n" +
        "Nome file consigliato: Listino_2026_vendita.xlsx",
    );
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="excel-price-manager">
      <div className="manager-header">
        <h2>📊 Gestione Listino Prezzi Excel</h2>
        <p>
          Importa prezzi e IVA da file Excel. I dati Excel hanno priorità su
          Archibald.
        </p>
      </div>

      {/* Upload Section */}
      <div className="upload-section card">
        <h3>📤 Carica Nuovo Listino</h3>

        <div className="upload-controls">
          <div className="file-input-wrapper">
            <input
              type="file"
              id="excel-file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              disabled={uploading}
            />
            <label htmlFor="excel-file" className="file-input-label">
              {selectedFile ? (
                <>
                  📄 {selectedFile.name}
                  <span className="file-size">
                    ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </span>
                </>
              ) : (
                "Scegli file Excel (.xlsx, .xls)"
              )}
            </label>
          </div>

          <div className="option-checkbox">
            <input
              type="checkbox"
              id="overwrite-prices"
              checked={overwritePrices}
              onChange={(e) => setOverwritePrices(e.target.checked)}
              disabled={uploading}
            />
            <label htmlFor="overwrite-prices">
              Sovrascrivi prezzi esistenti da Archibald
            </label>
            <span className="option-help">
              (Raccomandato: i prezzi Excel hanno sempre priorità)
            </span>
          </div>
        </div>

        <div className="upload-actions">
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="btn btn-primary"
          >
            {uploading ? "⏳ Importando..." : "📤 Importa Listino"}
          </button>
          <button
            onClick={downloadTemplate}
            className="btn btn-secondary"
            disabled={uploading}
          >
            📋 Info Formato Excel
          </button>
        </div>

        {uploading && (
          <div className="upload-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="progress-text">{uploadProgress}%</span>
          </div>
        )}
      </div>

      {/* Last Import Results */}
      {lastImport && (
        <div className="last-import card">
          <h3>✅ Ultimo Import</h3>
          <div className="import-stats">
            <div className="stat">
              <span className="stat-label">Totale righe:</span>
              <span className="stat-value">{lastImport.totalRows}</span>
            </div>
            <div className="stat success">
              <span className="stat-label">✓ Matchati:</span>
              <span className="stat-value">{lastImport.matchedRows}</span>
            </div>
            <div className="stat warning">
              <span className="stat-label">✗ Non matchati:</span>
              <span className="stat-value">{lastImport.unmatchedRows}</span>
            </div>
            <div className="stat">
              <span className="stat-label">💰 Prezzi aggiornati:</span>
              <span className="stat-value">{lastImport.priceUpdatedCount}</span>
            </div>
            <div className="stat">
              <span className="stat-label">🏷️ IVA aggiornate:</span>
              <span className="stat-value">{lastImport.vatUpdatedCount}</span>
            </div>
          </div>

          {unmatchedProducts.length > 0 && (
            <div className="unmatched-section">
              <button
                onClick={() => setShowUnmatched(!showUnmatched)}
                className="btn btn-sm btn-warning"
              >
                {showUnmatched ? "▼" : "▶"} Mostra prodotti non matchati (
                {unmatchedProducts.length})
              </button>

              {showUnmatched && (
                <div className="unmatched-list">
                  <table>
                    <thead>
                      <tr>
                        <th>ID Excel</th>
                        <th>Codice Articolo</th>
                        <th>Descrizione</th>
                        <th>Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unmatchedProducts.map((product, idx) => (
                        <tr key={idx}>
                          <td>{product.excelId}</td>
                          <td>{product.excelCodiceArticolo}</td>
                          <td>{product.excelDescrizione}</td>
                          <td className="reason">{product.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Import History */}
      <div className="import-history card">
        <h3>📋 Storico Import</h3>
        {history.length === 0 ? (
          <p className="no-history">Nessun import effettuato</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>File</th>
                <th>Caricato da</th>
                <th>Righe</th>
                <th>Matchati</th>
                <th>Prezzi</th>
                <th>IVA</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.uploadedAt)}</td>
                  <td className="filename">{item.filename}</td>
                  <td>{item.uploadedBy || "N/A"}</td>
                  <td>{item.totalRows}</td>
                  <td>
                    {item.matchedRows}
                    {item.unmatchedRows > 0 && (
                      <span className="unmatched-badge">
                        -{item.unmatchedRows}
                      </span>
                    )}
                  </td>
                  <td>{item.priceUpdatedCount}</td>
                  <td>{item.vatUpdatedCount}</td>
                  <td>
                    <span className={`status-badge status-${item.status}`}>
                      {item.status === "completed"
                        ? "✓ Completato"
                        : item.status === "failed"
                          ? "✗ Errore"
                          : "⏳ In corso"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Help Section */}
      <div className="help-section card">
        <h3>❓ Come Funziona</h3>
        <ol>
          <li>
            <strong>Prepara il file Excel</strong> con le colonne richieste (ID,
            Codice Articolo, IVA, Prezzi)
          </li>
          <li>
            <strong>Carica il file</strong> usando il pulsante "Importa Listino"
          </li>
          <li>
            <strong>Matching automatico</strong>: il sistema matcha i prodotti
            per ID e Codice Articolo
          </li>
          <li>
            <strong>Priorità Excel</strong>: i dati del file Excel sovrascrivono
            sempre quelli di Archibald
          </li>
          <li>
            <strong>Audit completo</strong>: tutte le modifiche vengono
            tracciate in price_changes
          </li>
        </ol>

        <div className="priority-info">
          <strong>📌 Priorità Dati:</strong>
          <div className="priority-badge priority-high">
            1. Excel (questo file)
          </div>
          <div className="priority-badge priority-low">
            2. Archibald (scraping)
          </div>
        </div>
      </div>
    </div>
  );
}
