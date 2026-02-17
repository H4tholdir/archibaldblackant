import { useState } from "react";
import type { Product } from "../api/products";
import { updateProductVat, updateProductPrice } from "../api/products";
import { formatPriceFromString } from "../utils/format-currency";

interface ProductCardProps {
  product: Product;
  expanded: boolean;
  onToggle: () => void;
}

export function ProductCard({
  product,
  expanded,
  onToggle,
}: ProductCardProps) {
  const [vatInput, setVatInput] = useState("");
  const [savingVat, setSavingVat] = useState(false);
  const [vatError, setVatError] = useState("");
  const [savedVat, setSavedVat] = useState<number | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceError, setPriceError] = useState("");
  const [savedPrice, setSavedPrice] = useState<number | null>(null);
  // Utility functions
  const formatCurrencyLocal = formatPriceFromString;

  const formatDate = (timestamp: number | null | undefined): string => {
    if (!timestamp) return "N/A";
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatDateString = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "N/A";
    // Handle various date formats from Archibald
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr; // Return original if invalid
      return date.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        overflow: "hidden",
        transition: "all 0.3s",
      }}
    >
      {/* Card Header */}
      <div
        onClick={onToggle}
        style={{
          padding: "16px 20px",
          cursor: "pointer",
          transition: "background-color 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#f5f5f5";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "#fff";
        }}
      >
        {/* Row 1: Name + badges + expand arrow */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "8px",
            marginBottom: "2px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", flex: 1 }}>
            <span style={{ fontSize: "17px", fontWeight: 700, color: "#333" }}>
              {product.name}
            </span>
            {product.hasPriceChange && (
              <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "10px", backgroundColor: "#fff3e0", color: "#e65100", whiteSpace: "nowrap" }}>
                {"📈"} Prezzo variato
              </span>
            )}
            {product.isNewThisYear && (
              <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "10px", backgroundColor: "#e3f2fd", color: "#1565c0", whiteSpace: "nowrap" }}>
                {"🆕"} Nuovo
              </span>
            )}
            {product.hasFieldChanges && (
              <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "10px", backgroundColor: "#f3e5f5", color: "#7b1fa2", whiteSpace: "nowrap" }}>
                {"🔄"} Modificato
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: "20px",
              color: "#1976d2",
              transition: "transform 0.3s",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              flexShrink: 0,
            }}
          >
            ▼
          </div>
        </div>

        {/* Row 2: Description */}
        <div style={{ fontSize: "13px", color: "#888", fontStyle: "italic", marginBottom: "6px" }}>
          {product.description || "Nessuna descrizione"}
        </div>

        {/* Row 3: Price + VAT */}
        <div style={{ fontSize: "14px", color: "#444", marginBottom: "4px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" }}>
          {(product.price === null || product.price === undefined || product.price === 0) ? (
            <span style={{ color: "#c62828" }}>{"⚠️"} Prezzo non disponibile</span>
          ) : (
            <>
              <span style={{ fontWeight: 600 }}>{formatCurrencyLocal(savedPrice ?? product.price)}</span>
              {(savedPrice !== null || product.priceSource) && (
                <span style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "4px", backgroundColor: "#f5f5f5", color: "#888" }}>
                  {savedPrice !== null ? "manual" : product.priceSource === "excel" ? "Excel" : product.priceSource === "manual" ? "manual" : "Archibald"}
                </span>
              )}
            </>
          )}
          <span style={{ color: "#ccc", margin: "0 4px" }}>·</span>
          {(product.vat !== undefined && product.vat !== null) || savedVat !== null ? (
            <>
              <span>IVA {savedVat ?? product.vat}%</span>
              {(savedVat !== null || product.vatSource) && (
                <span style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "4px", backgroundColor: "#f5f5f5", color: "#888" }}>
                  {savedVat !== null ? "manual" : product.vatSource}
                </span>
              )}
            </>
          ) : (
            <span style={{ color: "#c62828" }}>IVA non disponibile</span>
          )}
        </div>

        {/* Row 4: Package summary */}
        <div style={{ fontSize: "13px", color: "#666" }}>
          {"📦"}{" "}
          {(() => {
            const packages = product.variantPackages ?? (product.packageContent ? [product.packageContent] : []);
            if (packages.length === 0) return "Singolo";
            return packages.map((pkg: string) => {
              const lower = pkg.toLowerCase();
              if (lower === "1" || lower.startsWith("1 ")) return "Singolo";
              return `Conf. ${pkg}`;
            }).join(" · ");
          })()}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid #e0e0e0",
            padding: "20px",
            backgroundColor: "#fafafa",
          }}
        >
          {/* SECTION 1: Identificazione */}
          {(product.id ||
            product.searchName ||
            product.displayProductNumber ||
            product.productId) && (
            <div style={{ marginBottom: "20px" }}>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "12px",
                }}
              >
                🔍 Identificazione
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: "12px",
                  fontSize: "14px",
                }}
              >
                <div>
                  <strong style={{ color: "#666" }}>ID Articolo:</strong>{" "}
                  {product.id}
                </div>
                {product.searchName && (
                  <div>
                    <strong style={{ color: "#666" }}>Nome ricerca:</strong>{" "}
                    {product.searchName}
                  </div>
                )}
                {product.displayProductNumber && (
                  <div>
                    <strong style={{ color: "#666" }}>Numero prodotto:</strong>{" "}
                    {product.displayProductNumber}
                  </div>
                )}
                {product.productId && product.productId !== product.id && (
                  <div>
                    <strong style={{ color: "#666" }}>ID Prodotto:</strong>{" "}
                    {product.productId}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 2: Caratteristiche */}
          {(product.figure ||
            product.size ||
            product.packageContent ||
            product.groupCode ||
            product.productGroupId ||
            product.productGroupDescription ||
            product.bulkArticleId ||
            product.legPackage ||
            product.configurationId ||
            product.pcsStandardConfigurationId) && (
            <div style={{ marginBottom: "20px" }}>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "12px",
                }}
              >
                📐 Caratteristiche
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: "12px",
                  fontSize: "14px",
                }}
              >
                {product.figure && (
                  <div>
                    <strong style={{ color: "#666" }}>⭐ Figura:</strong>{" "}
                    <span style={{ fontWeight: 600, color: "#1976d2" }}>
                      {product.figure}
                    </span>
                  </div>
                )}
                {product.size && (
                  <div>
                    <strong style={{ color: "#666" }}>⭐ Grandezza:</strong>{" "}
                    <span style={{ fontWeight: 600, color: "#1976d2" }}>
                      {product.size}
                    </span>
                  </div>
                )}
                {product.packageContent && (
                  <div>
                    <strong style={{ color: "#666" }}>
                      ⭐ Contenuto imballaggio:
                    </strong>{" "}
                    <span style={{ fontWeight: 600, color: "#1976d2" }}>
                      {product.packageContent}
                    </span>
                  </div>
                )}
                {product.groupCode && (
                  <div>
                    <strong style={{ color: "#666" }}>Gruppo articolo:</strong>{" "}
                    {product.groupCode}
                  </div>
                )}
                {product.productGroupDescription && (
                  <div>
                    <strong style={{ color: "#666" }}>
                      Descrizione gruppo:
                    </strong>{" "}
                    {product.productGroupDescription}
                  </div>
                )}
                {product.productGroupId && (
                  <div>
                    <strong style={{ color: "#666" }}>
                      ID gruppo prodotti:
                    </strong>{" "}
                    {product.productGroupId}
                  </div>
                )}
                {product.bulkArticleId && (
                  <div>
                    <strong style={{ color: "#666" }}>
                      ID blocco articolo:
                    </strong>{" "}
                    {product.bulkArticleId}
                  </div>
                )}
                {product.legPackage && (
                  <div>
                    <strong style={{ color: "#666" }}>Pacco gamba:</strong>{" "}
                    {product.legPackage}
                  </div>
                )}
                {product.configurationId && (
                  <div>
                    <strong style={{ color: "#666" }}>
                      ID configurazione:
                    </strong>{" "}
                    {product.configurationId}
                  </div>
                )}
                {product.pcsStandardConfigurationId && (
                  <div>
                    <strong style={{ color: "#666" }}>
                      PCS ID configurazione:
                    </strong>{" "}
                    {product.pcsStandardConfigurationId}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 3: Quantità */}
          {(product.minQty !== undefined ||
            product.multipleQty !== undefined ||
            product.maxQty !== undefined ||
            product.standardQty ||
            product.defaultQty ||
            product.unitId) && (
            <div style={{ marginBottom: "20px" }}>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "12px",
                }}
              >
                📊 Quantità
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "12px",
                  fontSize: "14px",
                }}
              >
                {product.minQty !== undefined && product.minQty !== null && (
                  <div>
                    <strong style={{ color: "#666" }}>Qtà minima:</strong>{" "}
                    {product.minQty}
                  </div>
                )}
                {product.multipleQty !== undefined &&
                  product.multipleQty !== null && (
                    <div>
                      <strong style={{ color: "#666" }}>
                        Qtà in multipli:
                      </strong>{" "}
                      {product.multipleQty}
                    </div>
                  )}
                {product.maxQty !== undefined && product.maxQty !== null && (
                  <div>
                    <strong style={{ color: "#666" }}>Qtà massima:</strong>{" "}
                    {product.maxQty}
                  </div>
                )}
                {product.standardQty && (
                  <div>
                    <strong style={{ color: "#666" }}>⭐ Qtà standard:</strong>{" "}
                    <span style={{ fontWeight: 600, color: "#1976d2" }}>
                      {product.standardQty}
                    </span>
                  </div>
                )}
                {product.defaultQty && (
                  <div>
                    <strong style={{ color: "#666" }}>
                      ⭐ Qtà predefinita:
                    </strong>{" "}
                    <span style={{ fontWeight: 600, color: "#1976d2" }}>
                      {product.defaultQty}
                    </span>
                  </div>
                )}
                {product.unitId && (
                  <div>
                    <strong style={{ color: "#666" }}>Unità:</strong>{" "}
                    {product.unitId}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 4: Pricing & Sconti */}
          <div style={{ marginBottom: "20px" }}>
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#333",
                marginBottom: "12px",
              }}
            >
              💰 Prezzi e Sconti
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "12px",
                fontSize: "14px",
              }}
            >
              {savedPrice !== null ? (
                <div>
                  <strong style={{ color: "#666" }}>Prezzo:</strong>{" "}
                  {formatCurrencyLocal(savedPrice)}{" "}
                  <span
                    style={{
                      marginLeft: "8px",
                      fontSize: "12px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      backgroundColor: "#fff3e0",
                      color: "#f57c00",
                    }}
                  >
                    manual
                  </span>
                </div>
              ) : (product.price === null || product.price === undefined || product.price === 0) ? (
                <div>
                  <strong style={{ color: "#666" }}>Prezzo:</strong>{" "}
                  <span
                    style={{
                      color: "#c62828",
                      fontSize: "13px",
                      marginRight: "8px",
                    }}
                  >
                    Non disponibile
                  </span>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      marginTop: "4px",
                    }}
                  >
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="es. 12.50"
                      value={priceInput}
                      onChange={(e) => {
                        setPriceInput(e.target.value);
                        setPriceError("");
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: "100px",
                        padding: "4px 8px",
                        fontSize: "14px",
                        border: priceError
                          ? "1px solid #c62828"
                          : "1px solid #ccc",
                        borderRadius: "4px",
                        outline: "none",
                      }}
                    />
                    <span style={{ fontSize: "14px", color: "#666" }}>EUR</span>
                    <button
                      disabled={savingPrice || !priceInput}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const parsed = parseFloat(priceInput);
                        if (isNaN(parsed) || parsed < 0) {
                          setPriceError("Valore non valido (>= 0)");
                          return;
                        }
                        setSavingPrice(true);
                        setPriceError("");
                        try {
                          const token =
                            localStorage.getItem("archibald_jwt") || "";
                          await updateProductPrice(token, product.id, parsed);
                          setSavedPrice(parsed);
                          setPriceInput("");
                        } catch (err: any) {
                          setPriceError(err.message || "Errore salvataggio");
                        } finally {
                          setSavingPrice(false);
                        }
                      }}
                      style={{
                        padding: "4px 12px",
                        fontSize: "13px",
                        backgroundColor: savingPrice ? "#bdbdbd" : "#1976d2",
                        color: "#fff",
                        border: "none",
                        borderRadius: "4px",
                        cursor: savingPrice ? "not-allowed" : "pointer",
                      }}
                    >
                      {savingPrice ? "..." : "Salva"}
                    </button>
                  </div>
                  {priceError && (
                    <div
                      style={{
                        color: "#c62828",
                        fontSize: "12px",
                        marginTop: "4px",
                      }}
                    >
                      {priceError}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <strong style={{ color: "#666" }}>Prezzo:</strong>{" "}
                  {formatCurrencyLocal(product.price)}{" "}
                  {product.priceCurrency && product.priceCurrency !== "EUR" && (
                    <span style={{ color: "#999" }}>
                      ({product.priceCurrency})
                    </span>
                  )}
                  {product.priceSource && (
                    <span
                      style={{
                        marginLeft: "8px",
                        fontSize: "12px",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        backgroundColor:
                          product.priceSource === "excel" ? "#e3f2fd" : "#fff3e0",
                        color:
                          product.priceSource === "excel" ? "#1976d2" : "#f57c00",
                      }}
                    >
                      {product.priceSource === "excel" ? "Excel" : product.priceSource === "manual" ? "manual" : "Archibald"}
                    </span>
                  )}
                </div>
              )}
              {(product.vat !== undefined && product.vat !== null) ||
              savedVat !== null ? (
                <div>
                  <strong style={{ color: "#666" }}>IVA:</strong>{" "}
                  {savedVat !== null ? savedVat : product.vat}%{" "}
                  {(savedVat !== null || product.vatSource) && (
                    <span
                      style={{
                        marginLeft: "8px",
                        fontSize: "12px",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        backgroundColor:
                          savedVat !== null ? "#fff3e0" : "#e8f5e9",
                        color: savedVat !== null ? "#f57c00" : "#2e7d32",
                      }}
                    >
                      {savedVat !== null ? "manual" : product.vatSource}
                    </span>
                  )}
                </div>
              ) : (
                <div>
                  <strong style={{ color: "#666" }}>IVA:</strong>{" "}
                  <span
                    style={{
                      color: "#c62828",
                      fontSize: "13px",
                      marginRight: "8px",
                    }}
                  >
                    Non disponibile
                  </span>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      marginTop: "4px",
                    }}
                  >
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      placeholder="es. 22"
                      value={vatInput}
                      onChange={(e) => {
                        setVatInput(e.target.value);
                        setVatError("");
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: "70px",
                        padding: "4px 8px",
                        fontSize: "14px",
                        border: vatError
                          ? "1px solid #c62828"
                          : "1px solid #ccc",
                        borderRadius: "4px",
                        outline: "none",
                      }}
                    />
                    <span style={{ fontSize: "14px", color: "#666" }}>%</span>
                    <button
                      disabled={savingVat || !vatInput}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const parsed = parseFloat(vatInput);
                        if (isNaN(parsed) || parsed < 0 || parsed > 100) {
                          setVatError("Valore non valido (0-100)");
                          return;
                        }
                        setSavingVat(true);
                        setVatError("");
                        try {
                          const token =
                            localStorage.getItem("archibald_jwt") || "";
                          await updateProductVat(token, product.id, parsed);
                          setSavedVat(parsed);
                          setVatInput("");
                        } catch (err: any) {
                          setVatError(err.message || "Errore salvataggio");
                        } finally {
                          setSavingVat(false);
                        }
                      }}
                      style={{
                        padding: "4px 12px",
                        fontSize: "13px",
                        backgroundColor: savingVat ? "#bdbdbd" : "#1976d2",
                        color: "#fff",
                        border: "none",
                        borderRadius: "4px",
                        cursor: savingVat ? "not-allowed" : "pointer",
                      }}
                    >
                      {savingVat ? "..." : "Salva"}
                    </button>
                  </div>
                  {vatError && (
                    <div
                      style={{
                        color: "#c62828",
                        fontSize: "12px",
                        marginTop: "4px",
                      }}
                    >
                      {vatError}
                    </div>
                  )}
                </div>
              )}
              {product.priceUnit && (
                <div>
                  <strong style={{ color: "#666" }}>Unità prezzo:</strong>{" "}
                  {product.priceUnit}
                </div>
              )}
              {product.lineDiscount && (
                <div>
                  <strong style={{ color: "#666" }}>⭐ Sconto linea:</strong>{" "}
                  <span style={{ fontWeight: 600, color: "#1976d2" }}>
                    {product.lineDiscount}
                  </span>
                </div>
              )}
              {product.totalAbsoluteDiscount && (
                <div>
                  <strong style={{ color: "#666" }}>
                    ⭐ Sconto assoluto totale:
                  </strong>{" "}
                  <span style={{ fontWeight: 600, color: "#1976d2" }}>
                    {product.totalAbsoluteDiscount}
                  </span>
                </div>
              )}
              {product.purchPrice && (
                <div>
                  <strong style={{ color: "#666" }}>Prezzo acquisto:</strong>{" "}
                  {product.purchPrice}
                </div>
              )}
              {product.accountDescription && (
                <div>
                  <strong style={{ color: "#666" }}>Account:</strong>{" "}
                  {product.accountDescription}
                  {product.accountCode && (
                    <span style={{ color: "#999", marginLeft: "4px" }}>
                      ({product.accountCode})
                    </span>
                  )}
                </div>
              )}
              {product.priceValidFrom && product.priceValidTo && (
                <div>
                  <strong style={{ color: "#666" }}>Validità prezzo:</strong>{" "}
                  {product.priceValidFrom} → {product.priceValidTo}
                </div>
              )}
              {product.priceQtyFrom && product.priceQtyTo && (
                <div>
                  <strong style={{ color: "#666" }}>Range quantità:</strong>{" "}
                  {product.priceQtyFrom} - {product.priceQtyTo}
                </div>
              )}
            </div>
          </div>

          {/* SECTION 5: Metadati */}
          {(product.createdBy ||
            product.createdDate ||
            product.modifiedBy ||
            product.modifiedDatetime ||
            product.dataAreaId ||
            product.orderableArticle ||
            product.stopped) && (
            <div style={{ marginBottom: "20px" }}>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "12px",
                }}
              >
                🏷️ Metadati
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: "12px",
                  fontSize: "14px",
                }}
              >
                {product.createdBy && (
                  <div>
                    <strong style={{ color: "#666" }}>Creato da:</strong>{" "}
                    {product.createdBy}
                  </div>
                )}
                {product.createdDate && (
                  <div>
                    <strong style={{ color: "#666" }}>Data creazione:</strong>{" "}
                    {formatDateString(product.createdDate)}
                  </div>
                )}
                {product.modifiedBy && (
                  <div>
                    <strong style={{ color: "#666" }}>Modificato da:</strong>{" "}
                    {product.modifiedBy}
                  </div>
                )}
                {product.modifiedDatetime && (
                  <div>
                    <strong style={{ color: "#666" }}>Data modifica:</strong>{" "}
                    {formatDateString(product.modifiedDatetime)}
                  </div>
                )}
                {product.dataAreaId && (
                  <div>
                    <strong style={{ color: "#666" }}>DataAreaId:</strong>{" "}
                    {product.dataAreaId}
                  </div>
                )}
                {product.orderableArticle && (
                  <div>
                    <strong style={{ color: "#666" }}>
                      Articolo ordinabile:
                    </strong>{" "}
                    <span
                      style={{
                        color:
                          product.orderableArticle.toLowerCase() === "yes" ||
                          product.orderableArticle === "1"
                            ? "#2e7d32"
                            : "#c62828",
                        fontWeight: 600,
                      }}
                    >
                      {product.orderableArticle === "1"
                        ? "Sì"
                        : product.orderableArticle}
                    </span>
                  </div>
                )}
                {product.stopped && (
                  <div>
                    <strong style={{ color: "#666" }}>Fermato:</strong>{" "}
                    <span
                      style={{
                        color:
                          product.stopped.toLowerCase() === "yes" ||
                          product.stopped === "1"
                            ? "#c62828"
                            : "#2e7d32",
                        fontWeight: 600,
                      }}
                    >
                      {product.stopped === "1" ? "Sì" : product.stopped}
                    </span>
                  </div>
                )}
                {product.lastSync && (
                  <div>
                    <strong style={{ color: "#666" }}>Ultimo sync:</strong>{" "}
                    {formatDate(product.lastSync)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
