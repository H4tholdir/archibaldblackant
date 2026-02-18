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

export function ArcaTabTesta({ testata, destinazione, order }: ArcaTabTestaProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {/* Sezione 1: Dati Generali */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Dati Generali</span>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px", marginTop: "4px" }}>
          <ArcaInput label="Esercizio" value={testata.ESERCIZIO} width="40px" />
          <ArcaInput label="Tipo Doc" value={testata.TIPODOC} width="30px" />
          <ArcaInput label="Listino" value={testata.LISTINO} width="20px" />
        </div>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px" }}>
          <ArcaInput label="Zona" value={testata.ZONA} width="30px" />
          <ArcaInput label="Data Consegna" value={formatArcaDate(testata.DATACONSEG)} width="62px" />
        </div>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", alignItems: "center" }}>
          <ArcaInput label="Dest.Div." value={testata.DESTDIV} width="30px" />
        </div>
        {destinazione && (
          <div style={{ marginTop: "4px", padding: "2px 0", borderTop: "1px solid #D4D0C8" }}>
            <div style={{ ...ARCA_FONT, fontWeight: "bold", fontSize: "10px", marginBottom: "2px" }}>Destinazione Diversa</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              <ArcaInput label="Rag. Sociale" value={destinazione.RAGIONESOC} width="200px" />
              <ArcaInput label="Indirizzo" value={destinazione.INDIRIZZO} width="200px" />
              <div style={{ display: "flex", gap: "2px" }}>
                <ArcaInput label="CAP" value={destinazione.CAP} width="50px" />
                <ArcaInput label="Loc." value={destinazione.LOCALITA} width="120px" />
                <ArcaInput label="Prov." value={destinazione.PROVINCIA} width="25px" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sezione 2: Ordine Madre (Fornitore = Fresis) */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Ordine Madre (Fornitore: Fresis)</span>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginTop: "4px", marginBottom: "2px" }}>
          <ArcaInput label="N. Ordine" value={order?.archibaldOrderNumber || ""} width="80px" />
          <ArcaInput label="Stato" value={order?.currentState || ""} width="100px" />
        </div>
        {order?.ddtNumber && (
          <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px" }}>
            <ArcaInput label="DDT" value={order.ddtNumber} width="80px" />
            <ArcaInput label="Data DDT" value={order.ddtDeliveryDate || ""} width="62px" />
          </div>
        )}
        {order?.invoiceNumber && (
          <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px" }}>
            <ArcaInput label="Fattura" value={order.invoiceNumber} width="80px" />
            <ArcaInput label="Data Fatt." value={order.invoiceDate || ""} width="62px" />
            <ArcaInput label="Importo" value={order.invoiceAmount || ""} width="80px" />
          </div>
        )}
        {order?.trackingNumber && (
          <div style={{ display: "flex", gap: "2px", flexWrap: "wrap" }}>
            <ArcaInput label="Tracking" value={order.trackingNumber} width="120px" />
            <ArcaInput label="Corriere" value={order.trackingCourier || ""} width="80px" />
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
          <ArcaInput label="Timestamp" value={formatArcaDate(testata.TIMESTAMP)} width="62px" />
          <ArcaInput label="Username" value={testata.USERNAME} width="100px" />
        </div>
      </div>
    </div>
  );
}
