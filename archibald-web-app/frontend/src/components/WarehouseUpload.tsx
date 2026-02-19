import { useState, useEffect } from "react";
import {
  uploadWarehouseFile,
  getWarehouseMetadata,
  clearAllWarehouseData,
} from "../api/warehouse";
import type { WarehouseMetadata } from "../types/warehouse";

export function WarehouseUpload() {
  const [uploading, setUploading] = useState(false);
  const [metadata, setMetadata] = useState<WarehouseMetadata | null>(null);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
    errors?: string[];
  } | null>(null);
  const [showFormatGuide, setShowFormatGuide] = useState(false);

  // Load metadata on mount
  useEffect(() => {
    getWarehouseMetadata().then(setMetadata);
  }, []);

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const result = await uploadWarehouseFile(file);

      // Refresh metadata
      const newMetadata = await getWarehouseMetadata();
      setMetadata(newMetadata);

      setUploadResult({
        success: true,
        message: `✅ ${result.totalItems} articoli caricati da ${result.boxesCount} scatoli (${result.totalQuantity} pezzi totali)`,
        errors: result.errors.length > 0 ? result.errors : undefined,
      });
    } catch (error) {
      setUploadResult({
        success: false,
        message: `❌ Errore: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setUploading(false);
      // Reset file input
      event.target.value = "";
    }
  };

  const handleClear = async () => {
    if (
      !confirm(
        "Sei sicuro di voler cancellare tutti i dati del magazzino? Questa azione non può essere annullata.",
      )
    ) {
      return;
    }

    await clearAllWarehouseData();
    setMetadata(null);
    setUploadResult({
      success: true,
      message: "🗑️ Dati magazzino cancellati",
    });
  };

  return (
    <div className="warehouse-upload">
      <div className="warehouse-upload-header">
        <h3>📦 Gestione Magazzino</h3>
        <button
          type="button"
          className="btn-link"
          onClick={() => setShowFormatGuide(!showFormatGuide)}
        >
          {showFormatGuide ? "Nascondi" : "Mostra"} formato richiesto
        </button>
      </div>

      {/* Format Guide */}
      {showFormatGuide && (
        <div className="format-guide">
          <h4>📋 Formato File Excel Richiesto</h4>
          <div className="format-section">
            <h5>Struttura fogli:</h5>
            <ul>
              <li>
                Ogni <strong>foglio</strong> rappresenta uno{" "}
                <strong>scatolo</strong>
              </li>
              <li>
                Nomina i fogli: <code>SCATOLO 1</code>, <code>SCATOLO 2</code>,{" "}
                <code>SCATOLO 3</code>, etc.
              </li>
            </ul>
          </div>

          <div className="format-section">
            <h5>Colonne richieste:</h5>
            <table className="format-table">
              <thead>
                <tr>
                  <th>Colonna</th>
                  <th>Obbligatoria</th>
                  <th>Descrizione</th>
                  <th>Esempio</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>Codice Corretto</code>
                  </td>
                  <td>
                    <strong>SÌ</strong>
                  </td>
                  <td>Codice articolo corretto</td>
                  <td>H129FSQ.104.023</td>
                </tr>
                <tr>
                  <td>
                    <code>Descrizione</code>
                  </td>
                  <td>No</td>
                  <td>Descrizione articolo</td>
                  <td>FRESA CT</td>
                </tr>
                <tr>
                  <td>
                    <code>quantità</code>
                  </td>
                  <td>
                    <strong>SÌ</strong>
                  </td>
                  <td>Numero di pezzi disponibili</td>
                  <td>5</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="format-section">
            <h5>💡 Nota futura:</h5>
            <p className="format-note">
              In futuro, il sistema accetterà solo <code>codice manuale</code> +{" "}
              <code>quantità</code> e genererà automaticamente{" "}
              <code>Codice Corretto</code> e <code>Descrizione</code> tramite
              matching con il database prodotti, correggendo eventuali errori di
              battitura.
            </p>
          </div>
        </div>
      )}

      {/* Current Status */}
      {metadata && (
        <div className="warehouse-status">
          <h4>📊 Stato Attuale</h4>
          <div className="status-grid">
            <div className="status-item">
              <span className="status-label">File caricato:</span>
              <span className="status-value">{metadata.fileName}</span>
            </div>
            <div className="status-item">
              <span className="status-label">Data caricamento:</span>
              <span className="status-value">
                {new Date(metadata.uploadedAt).toLocaleString("it-IT")}
              </span>
            </div>
            <div className="status-item">
              <span className="status-label">Articoli totali:</span>
              <span className="status-value">{metadata.totalItems}</span>
            </div>
            <div className="status-item">
              <span className="status-label">Pezzi totali:</span>
              <span className="status-value">{metadata.totalQuantity}</span>
            </div>
            <div className="status-item">
              <span className="status-label">Scatoli:</span>
              <span className="status-value">{metadata.boxesCount}</span>
            </div>
          </div>
        </div>
      )}

      {/* Upload Section */}
      <div className="warehouse-actions">
        <div className="upload-input-wrapper">
          <label htmlFor="warehouse-file" className="btn btn-primary">
            {uploading ? "⏳ Caricamento..." : "📤 Carica File Excel"}
          </label>
          <input
            id="warehouse-file"
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            disabled={uploading}
            style={{ display: "none" }}
          />
        </div>

        {metadata && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleClear}
            disabled={uploading}
          >
            🗑️ Cancella Magazzino
          </button>
        )}
      </div>

      {/* Upload Result */}
      {uploadResult && (
        <div
          className={`upload-result ${uploadResult.success ? "success" : "error"}`}
        >
          <p>{uploadResult.message}</p>
          {uploadResult.errors && uploadResult.errors.length > 0 && (
            <details>
              <summary>
                ⚠️ {uploadResult.errors.length} errori durante il parsing
              </summary>
              <ul className="error-list">
                {uploadResult.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <style>{`
        .warehouse-upload {
          padding: 20px;
          background: #f9f9f9;
          border-radius: 8px;
          margin-bottom: 20px;
        }

        .warehouse-upload-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }

        .warehouse-upload-header h3 {
          margin: 0;
        }

        .btn-link {
          background: none;
          border: none;
          color: #007bff;
          cursor: pointer;
          text-decoration: underline;
        }

        .format-guide {
          background: white;
          padding: 15px;
          border-radius: 6px;
          margin-bottom: 15px;
          border-left: 4px solid #007bff;
        }

        .format-guide h4 {
          margin-top: 0;
        }

        .format-section {
          margin-bottom: 15px;
        }

        .format-section h5 {
          margin: 10px 0 5px 0;
          color: #333;
        }

        .format-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }

        .format-table th,
        .format-table td {
          padding: 8px;
          text-align: left;
          border: 1px solid #ddd;
        }

        .format-table th {
          background: #f0f0f0;
          font-weight: 600;
        }

        .format-table code {
          background: #f5f5f5;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: monospace;
        }

        .format-note {
          background: #fff3cd;
          padding: 10px;
          border-radius: 4px;
          border-left: 4px solid #ffc107;
          margin: 10px 0 0 0;
        }

        .warehouse-status {
          background: white;
          padding: 15px;
          border-radius: 6px;
          margin-bottom: 15px;
        }

        .warehouse-status h4 {
          margin-top: 0;
        }

        .status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 10px;
        }

        .status-item {
          display: flex;
          flex-direction: column;
        }

        .status-label {
          font-size: 0.85em;
          color: #666;
        }

        .status-value {
          font-weight: 600;
          color: #333;
        }

        .warehouse-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .upload-result {
          margin-top: 15px;
          padding: 12px;
          border-radius: 6px;
        }

        .upload-result.success {
          background: #d4edda;
          border-left: 4px solid #28a745;
        }

        .upload-result.error {
          background: #f8d7da;
          border-left: 4px solid #dc3545;
        }

        .upload-result p {
          margin: 0 0 10px 0;
        }

        .error-list {
          font-size: 0.9em;
          color: #721c24;
          margin: 5px 0 0 0;
        }

        @media (max-width: 768px) {
          .warehouse-upload-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
          }

          .status-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
