import { useState, useEffect, useRef } from "react";
import { useKeyboardScroll } from "../hooks/useKeyboardScroll";
import {
  manualAddItem,
  validateArticleCode,
  getWarehouseBoxes,
} from "../api/warehouse";
import { toastService } from "../services/toast.service";

type ValidatedProduct = {
  id: string;
  name: string;
  description?: string | null;
  packageContent?: string | null;
  confidence?: number;
};

export interface AddItemManuallyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddItemManuallyModal({
  isOpen,
  onClose,
  onSuccess,
}: AddItemManuallyModalProps) {
  const [articleCode, setArticleCode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [selectedBox, setSelectedBox] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [availableBoxes, setAvailableBoxes] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [articleConfirmed, setArticleConfirmed] = useState(false);
  const {
    scrollFieldIntoView,
    modalOverlayKeyboardStyle,
    keyboardPaddingStyle,
  } = useKeyboardScroll();
  const [validationState, setValidationState] = useState<{
    status: "idle" | "valid" | "warning" | "invalid";
    confidence: number;
    matchedProduct: ValidatedProduct | null;
    suggestions: ValidatedProduct[];
    message?: string;
  }>({
    status: "idle",
    confidence: 0,
    matchedProduct: null,
    suggestions: [],
  });

  const quantityRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLSelectElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  // Load boxes when modal opens
  useEffect(() => {
    if (isOpen) {
      loadBoxes();
    }
  }, [isOpen]);

  const loadBoxes = async () => {
    try {
      const boxes = await getWarehouseBoxes();
      const boxNames = boxes.map((b) => b.name);
      setAvailableBoxes(boxNames);
      if (boxNames.length > 0) {
        setSelectedBox(boxNames[0]);
      }
    } catch (error) {
      console.error("Load boxes error:", error);
      toastService.error("Errore caricamento scatoli");
    }
  };

  // Reset form quando il modal si apre
  useEffect(() => {
    if (isOpen) {
      setArticleCode("");
      setQuantity("1");
      setDescription("");
      setHighlightedIndex(-1);
      setArticleConfirmed(false);
      setValidationState({
        status: "idle",
        confidence: 0,
        matchedProduct: null,
        suggestions: [],
      });
    }
  }, [isOpen]);

  // Debounce validation (500ms) - Real-time fuzzy matching
  useEffect(() => {
    if (!articleCode.trim() || loading || articleConfirmed) {
      if (!articleCode.trim()) {
        setValidationState({
          status: "idle",
          confidence: 0,
          matchedProduct: null,
          suggestions: [],
        });
        setDescription("");
      }
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await validateArticleCode(articleCode.trim());

        const matchedProduct = result.matchedProduct as ValidatedProduct | null;
        const { confidence } = result;
        const suggestions = result.suggestions as ValidatedProduct[];

        let status: "valid" | "warning" | "invalid" = "invalid";
        if (confidence >= 0.7) {
          status = "valid";
          setDescription(matchedProduct?.description || matchedProduct?.name || "");
        } else if (confidence >= 0.3) {
          status = "warning";
          setDescription("");
        } else {
          status = "invalid";
          setDescription("");
        }

        setValidationState({ status, confidence, matchedProduct, suggestions });
        setHighlightedIndex(-1);
      } catch (error) {
        console.error("Validation error:", error);
        setValidationState({
          status: "idle",
          confidence: 0,
          matchedProduct: null,
          suggestions: [],
        });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [articleCode, loading, articleConfirmed]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const qty = parseInt(quantity, 10);

    if (!articleCode.trim()) {
      toastService.error("Codice articolo obbligatorio");
      return;
    }

    if (!qty || qty <= 0) {
      toastService.error("Quantità deve essere maggiore di 0");
      return;
    }

    if (!selectedBox) {
      toastService.error("Seleziona uno scatolo");
      return;
    }

    setLoading(true);

    try {
      await manualAddItem(articleCode.trim(), qty, selectedBox);
      toastService.success("Articolo aggiunto");
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

  const selectSuggestion = (product: ValidatedProduct) => {
    setArticleCode(product.name);
    setDescription(product.description || "");
    setArticleConfirmed(true);
    setValidationState({
      status: "valid",
      confidence: 1.0,
      matchedProduct: product,
      suggestions: [],
    });
    setHighlightedIndex(-1);
    setTimeout(() => quantityRef.current?.focus(), 0);
  };

  const showSuggestions = !articleConfirmed && validationState.suggestions.length > 0;
  const visibleSuggestions = showSuggestions
    ? validationState.suggestions.slice(0, 5)
    : [];

  const handleArticleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < visibleSuggestions.length - 1 ? prev + 1 : 0,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : visibleSuggestions.length - 1,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < visibleSuggestions.length) {
          selectSuggestion(visibleSuggestions[highlightedIndex]);
        } else if (visibleSuggestions.length > 0) {
          selectSuggestion(visibleSuggestions[0]);
        }
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      setArticleConfirmed(true);
      setTimeout(() => quantityRef.current?.focus(), 0);
    }
  };

  const handleArticleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setArticleCode(e.target.value);
    setArticleConfirmed(false);
  };

  const handleQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      boxRef.current?.focus();
    }
  };

  const handleBoxKeyDown = (e: React.KeyboardEvent<HTMLSelectElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitRef.current?.focus();
    }
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
      return { ...baseStyle, backgroundColor: "#d4edda", color: "#155724" };
    } else if (confidence >= 0.3) {
      return { ...baseStyle, backgroundColor: "#fff3cd", color: "#856404" };
    } else {
      return { ...baseStyle, backgroundColor: "#f8d7da", color: "#721c24" };
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
        ...modalOverlayKeyboardStyle,
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
        <div style={{ padding: "24px 24px 16px 24px", borderBottom: "1px solid #e0e0e0" }}>
          <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#333", margin: 0 }}>
            Aggiungi Articolo Manuale
          </h2>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: "24px", ...keyboardPaddingStyle }}>
            {/* Article Code */}
            <div style={{ marginBottom: "20px", position: "relative" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#333", marginBottom: "8px" }}>
                Codice Articolo *
              </label>
              <input
                type="text"
                value={articleCode}
                onChange={handleArticleChange}
                onKeyDown={handleArticleKeyDown}
                onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
                placeholder="es: H129FSQ.104.023"
                disabled={loading}
                autoComplete="off"
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
                    ? `Match esatto (${Math.round(validationState.confidence * 100)}%)`
                    : validationState.confidence >= 0.3
                      ? `Match parziale (${Math.round(validationState.confidence * 100)}%)`
                      : `Nessun match`}
                </div>
              )}
              {validationState.status === "invalid" && (
                <div style={{ marginTop: "6px", fontSize: "12px", color: "#856404" }}>
                  Articolo non presente a catalogo. Puoi comunque aggiungerlo manualmente.
                </div>
              )}

              {/* Suggestions dropdown */}
              {showSuggestions && (
                <div
                  style={{
                    marginTop: "4px",
                    border: "1px solid #ddd",
                    borderRadius: "6px",
                    backgroundColor: "#fff",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    overflow: "hidden",
                  }}
                >
                  {visibleSuggestions.map((product, idx) => (
                    <div
                      key={product.id}
                      onClick={() => selectSuggestion(product)}
                      style={{
                        padding: "10px 12px",
                        cursor: "pointer",
                        fontSize: "13px",
                        backgroundColor: idx === highlightedIndex ? "#e8f0fe" : "#fff",
                        borderBottom: idx < visibleSuggestions.length - 1 ? "1px solid #f0f0f0" : "none",
                      }}
                    >
                      <strong>{product.name}</strong>
                      {product.description && (
                        <span style={{ color: "#555", marginLeft: "6px" }}>
                          {product.description}
                        </span>
                      )}
                      {product.packageContent && (
                        <span style={{ color: "#888", marginLeft: "6px" }}>
                          ({product.packageContent})
                        </span>
                      )}
                      {product.confidence != null && (
                        <span style={{ color: "#999", marginLeft: "6px", fontSize: "11px" }}>
                          {Math.round(product.confidence * 100)}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Description */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#333", marginBottom: "8px" }}>
                Descrizione
                {validationState.confidence >= 0.7 && (
                  <span style={{ marginLeft: "8px", fontSize: "12px", color: "#155724", fontWeight: 400 }}>
                    (auto-compilato)
                  </span>
                )}
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
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
                  backgroundColor: validationState.confidence >= 0.7 ? "#f0f0f0" : "#fff",
                  cursor: validationState.confidence >= 0.7 ? "not-allowed" : "text",
                }}
              />
            </div>

            {/* Quantity */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#333", marginBottom: "8px" }}>
                Quantità *
              </label>
              <input
                ref={quantityRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={handleQuantityKeyDown}
                onFocus={(e) => {
                  scrollFieldIntoView(e.target as HTMLElement);
                  e.target.select();
                }}
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
              <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#333", marginBottom: "8px" }}>
                Scatolo *
              </label>
              <select
                ref={boxRef}
                value={selectedBox}
                onChange={(e) => setSelectedBox(e.target.value)}
                onKeyDown={handleBoxKeyDown}
                onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
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
                  Nessuno scatolo disponibile. Crea uno scatolo nella sezione
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
              ref={submitRef}
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
