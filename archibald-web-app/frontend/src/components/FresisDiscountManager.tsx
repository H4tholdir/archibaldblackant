import { useState, useRef } from "react";
import { fresisDiscountService } from "../services/fresis-discount.service";
import { toastService } from "../services/toast.service";
import type { FresisArticleDiscount } from "../db/schema";
import * as XLSX from "xlsx";

export function FresisDiscountManager() {
  const [discounts, setDiscounts] = useState<FresisArticleDiscount[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDiscounts = async () => {
    const all = await fresisDiscountService.getAllDiscounts();
    setDiscounts(all);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

      const rows = rawRows.map((row) => {
        const trimmed: Record<string, any> = {};
        for (const key of Object.keys(row)) {
          trimmed[key.trim()] = row[key];
        }
        return trimmed;
      });

      const parsed: FresisArticleDiscount[] = [];

      for (const row of rows) {
        const id = String(row["ID"] || "").trim();
        const articleCode = String(row["Codice Articolo"] || "").trim();
        const discountRaw = row["Sconto %"] ?? row["Sconto%"] ?? row["Sconto"];
        const kpPriceRaw = row["Prezzo KP unit."] ?? row["Prezzo KP unit"];

        if (!id && !articleCode) continue;

        const discountPercent = parseFloat(String(discountRaw));
        if (isNaN(discountPercent)) continue;

        parsed.push({
          id: id || articleCode,
          articleCode,
          discountPercent,
          kpPriceUnit: kpPriceRaw ? parseFloat(String(kpPriceRaw)) : undefined,
        });
      }

      if (parsed.length === 0) {
        toastService.error("Nessuno sconto valido trovato nel file Excel");
        return;
      }

      const count = await fresisDiscountService.importDiscounts(parsed);
      await fresisDiscountService.uploadToServer(parsed);
      await loadDiscounts();

      toastService.success(`${count} sconti Fresis importati`);
    } catch (error) {
      console.error("[FresisDiscountManager] Import failed:", error);
      toastService.error("Errore durante l'importazione del file Excel");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div
      style={{
        padding: "1.5rem",
        background: "#f9fafb",
        borderRadius: "8px",
        marginBottom: "1.5rem",
      }}
    >
      <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "1rem" }}>
        Sconti Articolo Fresis
      </h3>
      <p
        style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "1rem" }}
      >
        Importa il file Excel con gli sconti per articolo Fresis. Colonne
        richieste: ID, Codice Articolo, Sconto %
      </p>

      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileUpload}
          disabled={loading}
          style={{ fontSize: "0.875rem" }}
        />
        <button
          onClick={loadDiscounts}
          style={{
            padding: "0.5rem 1rem",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: "500",
          }}
        >
          Mostra Sconti ({discounts.length})
        </button>
      </div>

      {discounts.length > 0 && (
        <div
          style={{ marginTop: "1rem", maxHeight: "300px", overflowY: "auto" }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.8125rem",
            }}
          >
            <thead>
              <tr style={{ background: "#e5e7eb" }}>
                <th style={{ padding: "0.5rem", textAlign: "left" }}>ID</th>
                <th style={{ padding: "0.5rem", textAlign: "left" }}>
                  Codice Articolo
                </th>
                <th style={{ padding: "0.5rem", textAlign: "right" }}>
                  Sconto %
                </th>
                <th style={{ padding: "0.5rem", textAlign: "right" }}>
                  Prezzo KP
                </th>
              </tr>
            </thead>
            <tbody>
              {discounts.slice(0, 100).map((d) => (
                <tr key={d.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td
                    style={{
                      padding: "0.375rem 0.5rem",
                      fontFamily: "monospace",
                    }}
                  >
                    {d.id}
                  </td>
                  <td style={{ padding: "0.375rem 0.5rem" }}>
                    {d.articleCode}
                  </td>
                  <td
                    style={{ padding: "0.375rem 0.5rem", textAlign: "right" }}
                  >
                    {d.discountPercent}%
                  </td>
                  <td
                    style={{ padding: "0.375rem 0.5rem", textAlign: "right" }}
                  >
                    {d.kpPriceUnit != null
                      ? `€${d.kpPriceUnit.toFixed(2)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {discounts.length > 100 && (
            <div
              style={{
                padding: "0.5rem",
                color: "#6b7280",
                fontSize: "0.8125rem",
              }}
            >
              ... e altri {discounts.length - 100} sconti
            </div>
          )}
        </div>
      )}
    </div>
  );
}
