import { useState, useRef } from "react";

interface ArcaImportModalProps {
  onClose: () => void;
  onImportComplete: () => void;
}

interface ImportStats {
  totalInvoices: number;
  totalRows: number;
  totalClients: number;
  skippedNonInvoice: number;
}

export function ArcaImportModal({
  onClose,
  onImportComplete,
}: ArcaImportModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    stats: ImportStats;
    errors: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasDT = files.some((f) => f.name.toUpperCase().endsWith("DT.DBF"));
  const hasDR = files.some((f) => f.name.toUpperCase().endsWith("DR.DBF"));
  const hasCF = files.some((f) => f.name.toUpperCase().endsWith("CF.DBF"));
  const isValid = hasDT && hasDR && hasCF;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setResult(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!isValid) return;

    setUploading(true);
    setError(null);

    try {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        setError("Non autenticato");
        return;
      }

      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }

      const response = await fetch("/api/fresis-history/import-arca", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        setError(json.error || "Errore durante l'importazione");
        return;
      }

      setResult({
        stats: json.stats,
        errors: json.errors || [],
      });
    } catch (err) {
      console.error("[ArcaImportModal] Upload failed:", err);
      setError("Errore di rete durante l'importazione");
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (result) {
      onImportComplete();
    }
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: "white",
          borderRadius: "12px",
          padding: "1.5rem",
          maxWidth: "500px",
          width: "90%",
          maxHeight: "80vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, fontSize: "1.25rem" }}>Importa da Arca</h2>

        {!result ? (
          <>
            <p style={{ fontSize: "0.85rem", color: "#6b7280" }}>
              Seleziona i file DBF esportati dal gestionale Arca. Servono
              almeno: <strong>*DT.DBF</strong> (teste documento),{" "}
              <strong>*DR.DBF</strong> (righe documento),{" "}
              <strong>*CF.DBF</strong> (clienti). Opzionale:{" "}
              <strong>*AR.DBF</strong> (articoli).
            </p>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".dbf,.DBF"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: "0.5rem 1rem",
                background: "#f3f4f6",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.875rem",
                marginBottom: "0.75rem",
              }}
            >
              Seleziona file DBF...
            </button>

            {files.length > 0 && (
              <div style={{ marginBottom: "0.75rem" }}>
                <div
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: "600",
                    marginBottom: "0.25rem",
                  }}
                >
                  File selezionati:
                </div>
                {files.map((f, i) => {
                  const name = f.name.toUpperCase();
                  const isDT = name.endsWith("DT.DBF");
                  const isDR = name.endsWith("DR.DBF");
                  const isCF = name.endsWith("CF.DBF");
                  const isAR = name.endsWith("AR.DBF");
                  const tag = isDT
                    ? "DT"
                    : isDR
                      ? "DR"
                      : isCF
                        ? "CF"
                        : isAR
                          ? "AR"
                          : "?";

                  return (
                    <div
                      key={i}
                      style={{
                        fontSize: "0.8rem",
                        padding: "0.2rem 0",
                        color: tag === "?" ? "#dc2626" : "#374151",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          width: "30px",
                          fontWeight: "600",
                          color: tag === "?" ? "#dc2626" : "#2563eb",
                        }}
                      >
                        {tag}
                      </span>
                      {f.name} ({(f.size / 1024).toFixed(0)} KB)
                    </div>
                  );
                })}

                {!isValid && (
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "#dc2626",
                      marginTop: "0.5rem",
                    }}
                  >
                    Mancano:{" "}
                    {[
                      !hasDT && "*DT.DBF",
                      !hasDR && "*DR.DBF",
                      !hasCF && "*CF.DBF",
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: "0.5rem",
                  background: "#fee2e2",
                  borderRadius: "4px",
                  color: "#dc2626",
                  fontSize: "0.85rem",
                  marginBottom: "0.75rem",
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={handleUpload}
                disabled={!isValid || uploading}
                style={{
                  padding: "0.5rem 1rem",
                  background: !isValid || uploading ? "#9ca3af" : "#7c3aed",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: !isValid || uploading ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                }}
              >
                {uploading ? "Importazione in corso..." : "Importa"}
              </button>
              <button
                onClick={handleClose}
                disabled={uploading}
                style={{
                  padding: "0.5rem 1rem",
                  background: "#e5e7eb",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  cursor: uploading ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                }}
              >
                Annulla
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                padding: "0.75rem",
                background: "#f0fdf4",
                borderRadius: "6px",
                border: "1px solid #86efac",
                marginBottom: "0.75rem",
              }}
            >
              <div
                style={{
                  fontWeight: "600",
                  color: "#166534",
                  marginBottom: "0.25rem",
                }}
              >
                Importazione completata
              </div>
              <div style={{ fontSize: "0.85rem" }}>
                Importate {result.stats.totalInvoices} fatture,{" "}
                {result.stats.totalRows} righe, {result.stats.totalClients}{" "}
                clienti
              </div>
              {result.stats.skippedNonInvoice > 0 && (
                <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                  Saltati {result.stats.skippedNonInvoice} documenti non-fattura
                </div>
              )}
            </div>

            {result.errors.length > 0 && (
              <div style={{ marginBottom: "0.75rem" }}>
                <div
                  style={{
                    fontWeight: "600",
                    fontSize: "0.85rem",
                    color: "#dc2626",
                    marginBottom: "0.25rem",
                  }}
                >
                  Avvisi ({result.errors.length}):
                </div>
                <div
                  style={{
                    maxHeight: "150px",
                    overflow: "auto",
                    fontSize: "0.75rem",
                    background: "#fef2f2",
                    padding: "0.5rem",
                    borderRadius: "4px",
                  }}
                >
                  {result.errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleClose}
              style={{
                padding: "0.5rem 1rem",
                background: "#16a34a",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.875rem",
                fontWeight: "600",
              }}
            >
              Chiudi
            </button>
          </>
        )}
      </div>
    </div>
  );
}
