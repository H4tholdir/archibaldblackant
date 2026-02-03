import { useState, useEffect } from "react";
import {
  addWarehouseItemManually,
  validateWarehouseItemCode,
  type ManualAddItemResult,
  type Product,
} from "../services/warehouse-service";
import { toastService } from "../services/toast.service";
import { unifiedSyncService } from "../services/unified-sync-service";

export interface AddItemManuallyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  availableBoxes: string[];
}

export function AddItemManuallyModal({
  isOpen,
  onClose,
  onSuccess,
  availableBoxes,
}: AddItemManuallyModalProps) {
  const [articleCode, setArticleCode] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selectedBox, setSelectedBox] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [validationState, setValidationState] = useState<{
    status: "idle" | "valid" | "warning" | "invalid";
    confidence: number;
    matchedProduct: Product | null;
    suggestions: Product[];
    message?: string;
  }>({
    status: "idle",
    confidence: 0,
    matchedProduct: null,
    suggestions: [],
  });

  // Reset form quando il modal si apre
  useEffect(() => {
    if (isOpen) {
      setArticleCode("");
      setQuantity(1);
      setSelectedBox(availableBoxes[0] || "");
      setDescription("");
      setValidationState({
        status: "idle",
        confidence: 0,
        matchedProduct: null,
        suggestions: [],
      });
    }
  }, [isOpen, availableBoxes]);

  // Debounce validation (500ms) - Real-time fuzzy matching
  useEffect(() => {
    if (!articleCode.trim() || loading) {
      // Reset validation state if empty
      setValidationState({
        status: "idle",
        confidence: 0,
        matchedProduct: null,
        suggestions: [],
      });
      setDescription("");
      return;
    }

    const timer = setTimeout(async () => {
      try {
        // Call validation API for real-time fuzzy matching
        const result = await validateWarehouseItemCode(articleCode.trim());

        const { matchedProduct, confidence, suggestions } = result;

        // Update validation state based on confidence
        let status: "valid" | "warning" | "invalid" = "invalid";
        if (confidence >= 0.7) {
          status = "valid";
          // Auto-fill description for high confidence matches
          setDescription(
            matchedProduct?.name || matchedProduct?.description || "",
          );
        } else if (confidence >= 0.3) {
          status = "warning";
          setDescription(""); // Allow manual entry
        } else {
          status = "invalid";
          setDescription(""); // Allow manual entry
        }

        setValidationState({
          status,
          confidence,
          matchedProduct,
          suggestions,
        });
      } catch (error) {
        console.error("Validation error:", error);
        // On error, reset to idle (don't block user)
        setValidationState({
          status: "idle",
          confidence: 0,
          matchedProduct: null,
          suggestions: [],
        });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [articleCode, loading]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    // Validation
    if (!articleCode.trim()) {
      toastService.error("Codice articolo obbligatorio");
      return;
    }

    if (quantity <= 0) {
      toastService.error("Quantità deve essere maggiore di 0");
      return;
    }

    if (!selectedBox) {
      toastService.error("Seleziona uno scatolo");
      return;
    }

    setLoading(true);

    try {
      const result: ManualAddItemResult = await addWarehouseItemManually(
        articleCode.trim(),
        quantity,
        selectedBox,
      );

      // Update validation state to show match result
      setValidationState({
        status:
          result.confidence >= 0.7
            ? "valid"
            : result.confidence >= 0.3
              ? "warning"
              : "invalid",
        confidence: result.confidence,
        matchedProduct: result.matchedProduct,
        suggestions: result.suggestions,
        message: result.warning,
      });

      // Show success toast
      const confidencePercent = Math.round(result.confidence * 100);
      if (result.confidence >= 0.7) {
        toastService.success(
          `✅ Articolo aggiunto (Match: ${confidencePercent}%)`,
        );
      } else if (result.confidence >= 0.3) {
        toastService.warning(
          result.warning || `⚠️ Match parziale (${confidencePercent}%)`,
        );
      } else {
        toastService.warning(
          result.warning || "⚠️ Articolo aggiunto con codice personalizzato",
        );
      }

      // Trigger sync and callback
      await unifiedSyncService.syncAll();
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Add item error:", error);
      toastService.error(
        error instanceof Error
          ? error.message
          : "Errore durante aggiunta articolo",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (product: Product) => {
    // Set article code using product.name (the article code, not variant)
    setArticleCode(product.name);
    // Pre-fill description and validation state immediately
    setDescription(product.description || "");
    setValidationState({
      status: "valid",
      confidence: 1.0, // Perfect match since user clicked suggestion
      matchedProduct: product,
      suggestions: [],
    });
  };

  if (!isOpen) return null;

  const getBadgeStyle = (): React.CSSProperties | undefined => {
    const { status, confidence } = validationState;
    if (status === "idle") return undefined;

    const baseStyle = {
      padding: "6px 12px",
      borderRadius: "6px",
      fontSize: "13px",
      fontWeight: 600,
      marginTop: "8px",
      display: "inline-block",
    };

    if (confidence >= 0.7) {
      return {
        ...baseStyle,
        backgroundColor: "#d4edda",
        color: "#155724",
      };
    } else if (confidence >= 0.3) {
      return {
        ...baseStyle,
        backgroundColor: "#fff3cd",
        color: "#856404",
      };
    } else {
      return {
        ...baseStyle,
        backgroundColor: "#f8d7da",
        color: "#721c24",
      };
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "16px",
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "12px",
          maxWidth: "600px",
          width: "100%",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
          animation: "modalSlideIn 0.3s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px 24px 16px 24px",
            borderBottom: "1px solid #e0e0e0",
          }}
        >
          <h2
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#333",
              margin: 0,
            }}
          >
            ➕ Aggiungi Articolo Manuale
          </h2>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: "24px" }}>
            {/* Article Code */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#333",
                  marginBottom: "8px",
                }}
              >
                Codice Articolo *
              </label>
              <input
                type="text"
                value={articleCode}
                onChange={(e) => setArticleCode(e.target.value)}
                placeholder="es: H129FSQ.104.023"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #ccc",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                }}
              />
              {validationState.status !== "idle" && (
                <div style={getBadgeStyle()}>
                  {validationState.confidence >= 0.7
                    ? `🟢 Match esatto (${Math.round(validationState.confidence * 100)}%)`
                    : validationState.confidence >= 0.3
                      ? `🟡 Match parziale (${Math.round(validationState.confidence * 100)}%)`
                      : `🔴 Nessun match`}
                </div>
              )}
            </div>

            {/* Suggestions */}
            {validationState.suggestions.length > 0 && (
              <div
                style={{
                  marginBottom: "20px",
                  padding: "12px",
                  backgroundColor: "#fff3cd",
                  borderRadius: "6px",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    marginBottom: "8px",
                  }}
                >
                  Suggerimenti:
                </div>
                {validationState.suggestions.slice(0, 3).map((product) => (
                  <div
                    key={product.id}
                    onClick={() => handleSuggestionClick(product)}
                    style={{
                      padding: "8px",
                      cursor: "pointer",
                      borderRadius: "4px",
                      marginBottom: "4px",
                      backgroundColor: "#fff",
                      fontSize: "13px",
                    }}
                  >
                    <strong>{product.name}</strong>
                    {product.packageContent && ` (${product.packageContent})`}
                    {product.id && (
                      <span style={{ color: "#666", marginLeft: "8px" }}>
                        [{product.id}]
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Description */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#333",
                  marginBottom: "8px",
                }}
              >
                Descrizione
                {validationState.confidence >= 0.7 && (
                  <span
                    style={{
                      marginLeft: "8px",
                      fontSize: "12px",
                      color: "#155724",
                      fontWeight: 400,
                    }}
                  >
                    (auto-compilato)
                  </span>
                )}
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  validationState.confidence >= 0.7
                    ? "Auto-compilato da database"
                    : "Inserisci descrizione manualmente"
                }
                disabled={loading || validationState.confidence >= 0.7}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #ccc",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                  backgroundColor:
                    validationState.confidence >= 0.7 ? "#f0f0f0" : "#fff",
                  cursor:
                    validationState.confidence >= 0.7 ? "not-allowed" : "text",
                }}
              />
            </div>

            {/* Quantity */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#333",
                  marginBottom: "8px",
                }}
              >
                Quantità *
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #ccc",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Box Selection */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#333",
                  marginBottom: "8px",
                }}
              >
                Scatolo *
              </label>
              <select
                value={selectedBox}
                onChange={(e) => setSelectedBox(e.target.value)}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #ccc",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                }}
              >
                <option value="">Seleziona scatolo...</option>
                {availableBoxes.map((box) => (
                  <option key={box} value={box}>
                    {box}
                  </option>
                ))}
              </select>
              {availableBoxes.length === 0 && (
                <div
                  style={{
                    marginTop: "8px",
                    padding: "8px",
                    backgroundColor: "#fff3cd",
                    border: "1px solid #ffc107",
                    borderRadius: "4px",
                    fontSize: "12px",
                    color: "#856404",
                  }}
                >
                  ⚠️ Nessuno scatolo disponibile. Crea uno scatolo nella sezione
                  "Gestione Scatoli" prima di aggiungere articoli.
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid #e0e0e0",
              display: "flex",
              gap: "12px",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                border: "1px solid #ccc",
                borderRadius: "6px",
                backgroundColor: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                border: "none",
                borderRadius: "6px",
                backgroundColor: "#4caf50",
                color: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Aggiunta..." : "Aggiungi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
