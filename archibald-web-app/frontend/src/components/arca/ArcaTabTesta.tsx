import type { ArcaTestata, ArcaDestinazione } from "../../types/arca-data";
import type { FresisHistoryOrder } from "../../db/schema";
import { ArcaInput } from "./ArcaInput";
import {
  ARCA_FONT,
  arcaEtchedBorder,
  arcaSectionLabel,
  formatArcaDate,
} from "./arcaStyles";

type ArcaTabTestaProps = {
  testata: ArcaTestata;
  destinazione?: ArcaDestinazione | null;
  order?: FresisHistoryOrder;
};

function fitWidth(value: string | number, minPx = 30): string {
  const len = String(value).length;
  return Math.max(minPx, len * 7 + 12) + "px";
}

export function ArcaTabTesta({ testata, destinazione, order }: ArcaTabTestaProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {/* Sezione 1: Dati Generali */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Dati Generali</span>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px", marginTop: "4px" }}>
          <ArcaInput label="Esercizio" value={testata.ESERCIZIO} width={fitWidth(testata.ESERCIZIO)} />
          <ArcaInput label="Tipo Doc" value={testata.TIPODOC} width={fitWidth(testata.TIPODOC)} />
          <ArcaInput label="Listino" value={testata.LISTINO} width={fitWidth(testata.LISTINO)} />
        </div>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px" }}>
          <ArcaInput label="Zona" value={testata.ZONA} width={fitWidth(testata.ZONA)} />
          <ArcaInput label="Data Consegna" value={formatArcaDate(testata.DATACONSEG)} width={fitWidth(formatArcaDate(testata.DATACONSEG))} />
        </div>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", alignItems: "center" }}>
          <ArcaInput label="Dest.Div." value={testata.DESTDIV} width={fitWidth(testata.DESTDIV)} />
        </div>
        {destinazione && (
          <div style={{ marginTop: "4px", padding: "2px 0", borderTop: "1px solid #D4D0C8" }}>
            <div style={{ ...ARCA_FONT, fontWeight: "bold", fontSize: "10px", marginBottom: "2px" }}>Destinazione Diversa</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              <ArcaInput label="Rag. Sociale" value={destinazione.RAGIONESOC} width={fitWidth(destinazione.RAGIONESOC, 100)} />
              <ArcaInput label="Indirizzo" value={destinazione.INDIRIZZO} width={fitWidth(destinazione.INDIRIZZO, 100)} />
              <div style={{ display: "flex", gap: "2px" }}>
                <ArcaInput label="CAP" value={destinazione.CAP} width={fitWidth(destinazione.CAP)} />
                <ArcaInput label="Loc." value={destinazione.LOCALITA} width={fitWidth(destinazione.LOCALITA, 60)} />
                <ArcaInput label="Prov." value={destinazione.PROVINCIA} width={fitWidth(destinazione.PROVINCIA)} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sezione 2: Ordine Madre (Fornitore = Fresis) */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Ordine Madre (Fornitore: Fresis)</span>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginTop: "4px", marginBottom: "2px" }}>
          <ArcaInput label="N. Ordine" value={order?.archibaldOrderNumber || ""} width={fitWidth(order?.archibaldOrderNumber || "", 60)} />
          <ArcaInput label="Stato" value={order?.currentState || ""} width={fitWidth(order?.currentState || "", 60)} />
        </div>
        {order?.ddtNumber && (
          <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px" }}>
            <ArcaInput label="DDT" value={order.ddtNumber} width={fitWidth(order.ddtNumber)} />
            <ArcaInput label="Data DDT" value={order.ddtDeliveryDate || ""} width={fitWidth(order.ddtDeliveryDate || "")} />
          </div>
        )}
        {order?.invoiceNumber && (
          <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px" }}>
            <ArcaInput label="Fattura" value={order.invoiceNumber} width={fitWidth(order.invoiceNumber)} />
            <ArcaInput label="Data Fatt." value={order.invoiceDate || ""} width={fitWidth(order.invoiceDate || "")} />
            <ArcaInput label="Importo" value={order.invoiceAmount || ""} width={fitWidth(order.invoiceAmount || "")} />
          </div>
        )}
        {order?.trackingNumber && (
          <div style={{ display: "flex", gap: "2px", flexWrap: "wrap" }}>
            <ArcaInput label="Tracking" value={order.trackingNumber} width={fitWidth(order.trackingNumber, 80)} />
            <ArcaInput label="Corriere" value={order.trackingCourier || ""} width={fitWidth(order.trackingCourier || "", 60)} />
          </div>
        )}
        {!order?.archibaldOrderNumber && (
          <div style={{ ...ARCA_FONT, color: "#999", fontStyle: "italic", marginTop: "4px" }}>
            Nessun ordine madre collegato
          </div>
        )}
      </div>

      {/* Sezione 3: Metadati */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Metadati</span>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginTop: "4px" }}>
          <ArcaInput label="Timestamp" value={formatArcaDate(testata.TIMESTAMP)} width={fitWidth(formatArcaDate(testata.TIMESTAMP))} />
          <ArcaInput label="Username" value={testata.USERNAME} width={fitWidth(testata.USERNAME)} />
        </div>
      </div>
    </div>
  );
}
