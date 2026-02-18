import type { ArcaTestata, ArcaDestinazione } from "../../types/arca-data";
import { ArcaInput } from "./ArcaInput";
import {
  arcaEtchedBorder,
  arcaSectionLabel,
  formatArcaDate,
} from "./arcaStyles";

type ArcaTabTestaProps = {
  testata: ArcaTestata;
  destinazione?: ArcaDestinazione | null;
};

export function ArcaTabTesta({ testata, destinazione }: ArcaTabTestaProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {/* Dati Generali */}
      <div style={arcaEtchedBorder}>
        <span style={arcaSectionLabel}>Dati Generali</span>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px", marginBottom: "4px" }}>
          <ArcaInput label="Esercizio" value={testata.ESERCIZIO} width="60px" />
          <ArcaInput label="Contabilita" value={testata.CODCNT} width="50px" />
          <ArcaInput label="Tipo Doc." value={testata.TIPODOC} width="40px" />
          <ArcaInput label="Tipo Fatt." value={testata.TIPOFATT} width="40px" />
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
          <ArcaInput label="Mag. Partenza" value={testata.MAGPARTENZ} width="60px" />
          <ArcaInput label="Mag. Arrivo" value={testata.MAGARRIVO} width="60px" />
          <ArcaInput label="Listino" value={testata.LISTINO} width="40px" />
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
          <ArcaInput label="Agente 1" value={testata.AGENTE} width="100px" />
          <ArcaInput label="Agente 2" value={testata.AGENTE2} width="100px" />
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
          <ArcaInput label="Zona" value={testata.ZONA} width="80px" />
          <ArcaInput label="Settore" value={testata.SETTORE} width="80px" />
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
          <ArcaInput label="Data Consegna" value={formatArcaDate(testata.DATACONSEG)} width="100px" />
          <ArcaInput label="Commessa" value={testata.COMMESSA} width="120px" />
          <ArcaInput label="Dest. Diversa" value={testata.DESTDIV} width="80px" />
        </div>
      </div>

      {/* Destinazione Diversa (se presente) */}
      {destinazione && (
        <div style={arcaEtchedBorder}>
          <span style={arcaSectionLabel}>Destinazione Diversa</span>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
            <ArcaInput label="Rag. Sociale" value={destinazione.RAGIONESOC} width="200px" />
            <ArcaInput label="Indirizzo" value={destinazione.INDIRIZZO} width="200px" />
            <div style={{ display: "flex", gap: "8px" }}>
              <ArcaInput label="CAP" value={destinazione.CAP} width="50px" />
              <ArcaInput label="Loc." value={destinazione.LOCALITA} width="120px" />
              <ArcaInput label="Prov." value={destinazione.PROVINCIA} width="30px" />
            </div>
          </div>
        </div>
      )}

      {/* Documento Fornitore */}
      <div style={arcaEtchedBorder}>
        <span style={arcaSectionLabel}>Documento Fornitore</span>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
          <ArcaInput label="Numero Doc. F." value={testata.NUMERODOCF} width="100px" />
          <ArcaInput label="Data Doc. F." value={formatArcaDate(testata.DATADOCFOR)} width="100px" />
        </div>
      </div>

      {/* Coordinate Bancarie */}
      <div style={arcaEtchedBorder}>
        <span style={arcaSectionLabel}>Coordinate Bancarie</span>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px", marginBottom: "4px" }}>
          <ArcaInput label="Cod. Banca" value={testata.CODBANCA} width="80px" />
          <ArcaInput label="BIC" value={testata.CB_BIC} width="80px" />
          <ArcaInput label="Nazione" value={testata.CB_NAZIONE} width="30px" />
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <ArcaInput label="CIN UE" value={testata.CB_CIN_UE} width="30px" />
          <ArcaInput label="CIN IT" value={testata.CB_CIN_IT} width="30px" />
          <ArcaInput label="ABI/CAB" value={testata.ABICAB} width="80px" />
          <ArcaInput label="C/C" value={testata.CONTOCORR} width="100px" />
        </div>
      </div>

      {/* Metadati */}
      <div style={arcaEtchedBorder}>
        <span style={arcaSectionLabel}>Metadati</span>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
          <ArcaInput label="Timestamp" value={testata.TIMESTAMP ?? ""} width="140px" />
          <ArcaInput label="Username" value={testata.USERNAME} width="100px" />
        </div>
      </div>
    </div>
  );
}
