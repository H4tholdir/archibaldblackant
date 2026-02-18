import type { ArcaTestata, ArcaDestinazione } from "../../types/arca-data";
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
};

export function ArcaTabTesta({ testata, destinazione }: ArcaTabTestaProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {/* Sezione 1: Dati Generali */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Dati Generali</span>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px", marginTop: "4px" }}>
          <ArcaInput label="Esercizio" value={testata.ESERCIZIO} width="40px" />
          <ArcaInput label="Contabilita" value="001" width="30px" />
          <ArcaInput label="Tipo Doc" value={testata.TIPODOC} width="30px" />
        </div>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px" }}>
          <ArcaInput label="Mag.Partenza" value={testata.MAGPARTENZ} width="50px" />
          <ArcaInput label="Mag.Arrivo" value={testata.MAGARRIVO} width="50px" />
          <ArcaInput label="Listino" value={testata.LISTINO} width="20px" />
        </div>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px" }}>
          <ArcaInput label="Zona" value={testata.ZONA} width="30px" />
          <ArcaInput label="Settore" value={testata.SETTORE} width="30px" />
          <ArcaInput label="Tipo Fatt." value={testata.TIPOFATT} width="60px" />
        </div>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "2px" }}>
          <ArcaInput label="Data Consegna" value={formatArcaDate(testata.DATACONSEG)} width="62px" />
          <ArcaInput label="Commessa" value={testata.COMMESSA} width="80px" />
        </div>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", alignItems: "center" }}>
          <ArcaInput label="Dest.Div." value={testata.DESTDIV} width="30px" />
          <label style={{ ...ARCA_FONT, display: "flex", alignItems: "center", gap: "2px" }}>
            <input type="checkbox" checked={testata.TRIANGOLAZ} readOnly />
            Triangolazione
          </label>
          <label style={{ ...ARCA_FONT, display: "flex", alignItems: "center", gap: "2px" }}>
            <input type="checkbox" checked={testata.SCORPORO} readOnly />
            Scorporo
          </label>
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

      {/* Sezione 2: Documento Fornitore */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Documento Fornitore</span>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginTop: "4px" }}>
          <ArcaInput label="Num.Doc.Forn" value={testata.NUMERODOCF} width="100px" />
          <ArcaInput label="Data Doc.Forn" value={formatArcaDate(testata.DATADOCFOR)} width="62px" />
        </div>
      </div>

      {/* Sezione 3: Coordinate Bancarie */}
      <div style={{ ...arcaEtchedBorder, marginTop: "8px" }}>
        <span style={arcaSectionLabel}>Coordinate Bancarie</span>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginTop: "4px" }}>
          <ArcaInput label="Banca" value={testata.CODBANCA} width="20px" />
          <ArcaInput label="BIC" value={testata.CB_BIC} width="70px" />
          <ArcaInput label="Nazione" value={testata.CB_NAZIONE} width="22px" />
          <ArcaInput label="CIN UE" value={testata.CB_CIN_UE} width="22px" />
          <ArcaInput label="CIN IT" value={testata.CB_CIN_IT} width="18px" />
        </div>
        <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginTop: "2px" }}>
          <ArcaInput label="ABI+CAB" value={testata.ABICAB} width="75px" />
          <ArcaInput label="C/C" value={testata.CONTOCORR} width="110px" />
        </div>
      </div>

      {/* Sezione 4: Metadati */}
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
