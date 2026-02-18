import type { ArcaTestata, ArcaDestinazione } from "../../types/arca-data";
import { ArcaInput } from "./ArcaInput";
import {
  ARCA_FONT,
  arcaEtchedBorder,
  arcaSectionLabel,
  arcaGreyHeader,
  arcaDescriptionRed,
  formatArcaDate,
} from "./arcaStyles";

type ArcaTabTestaProps = {
  testata: ArcaTestata;
  destinazione?: ArcaDestinazione | null;
};

export function ArcaTabTesta({ testata, destinazione }: ArcaTabTestaProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {/* Layout 2 colonne: Rif.Doc + Magazzino (sinistra) | Dati ulteriori (destra) */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {/* Colonna sinistra */}
        <div style={{ flex: 1, minWidth: "260px" }}>
          {/* Rif. Doc. Cliente/Fornitore */}
          <div style={arcaGreyHeader}>Rif. Doc. Cliente/Fornitore</div>
          <div style={{ ...arcaEtchedBorder, marginTop: 0, padding: "6px" }}>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "3px" }}>
              <ArcaInput label="Numero" value={testata.NUMERODOCF} width="100px" />
              <ArcaInput label="Data" value={formatArcaDate(testata.DATADOCFOR)} width="80px" />
            </div>
          </div>

          {/* Magazzino */}
          <div style={{ ...arcaGreyHeader, marginTop: "4px" }}>Magazzino</div>
          <div style={{ ...arcaEtchedBorder, marginTop: 0, padding: "6px" }}>
            <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "3px" }}>
              <span style={{ ...ARCA_FONT, fontWeight: "bold" }}>Causale</span>
            </div>
            <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "3px" }}>
              <ArcaInput value={testata.CODCAUMAG} width="30px" />
              <span style={arcaDescriptionRed}>{testata.CODCAUMAG ? "Scarico per Vendita" : ""}</span>
            </div>
            <div style={{ ...ARCA_FONT, fontWeight: "bold", marginBottom: "2px" }}>di Partenza</div>
            <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "3px" }}>
              <ArcaInput value={testata.MAGPARTENZ} width="50px" />
              <span style={arcaDescriptionRed}>{testata.MAGPARTENZ ? "Carico Merce" : ""}</span>
            </div>
            <div style={{ ...ARCA_FONT, fontWeight: "bold", marginBottom: "2px" }}>di Arrivo</div>
            <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
              <ArcaInput value={testata.MAGARRIVO} width="50px" />
              <span style={arcaDescriptionRed}>{testata.MAGARRIVO ? "Carico Merce" : ""}</span>
            </div>
          </div>
        </div>

        {/* Colonna destra */}
        <div style={{ flex: 1, minWidth: "260px" }}>
          <div style={arcaGreyHeader}>Dati ulteriori</div>
          <div style={{ ...arcaEtchedBorder, marginTop: 0, padding: "6px" }}>
            {/* Agenti */}
            <div style={{ ...ARCA_FONT, fontWeight: "bold", marginBottom: "2px" }}>Agenti</div>
            <div style={{ display: "flex", gap: "6px", marginBottom: "4px" }}>
              <ArcaInput value={testata.AGENTE} width="40px" />
              <ArcaInput value={testata.AGENTE2} width="40px" />
            </div>
            {/* Zona */}
            <div style={{ ...ARCA_FONT, fontWeight: "bold", marginBottom: "2px" }}>Zona</div>
            <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "4px" }}>
              <ArcaInput value={testata.ZONA} width="30px" />
              <span style={arcaDescriptionRed}>{testata.ZONA || ""}</span>
            </div>
            {/* Settore */}
            <div style={{ ...ARCA_FONT, fontWeight: "bold", marginBottom: "2px" }}>Settore</div>
            <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "4px" }}>
              <ArcaInput value={testata.SETTORE} width="30px" />
            </div>
            {/* Listino */}
            <div style={{ ...ARCA_FONT, fontWeight: "bold", marginBottom: "2px" }}>Listino</div>
            <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
              <ArcaInput value={testata.LISTINO} width="20px" />
              <span style={arcaDescriptionRed}>{testata.LISTINO ? `Listino ${testata.LISTINO}` : ""}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Data Consegna + Destinazione Diversa + Tipo Vendita */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <ArcaInput label="Data Consegna" value={formatArcaDate(testata.DATACONSEG)} width="80px" />
        <ArcaInput label="Destinazione Diversa" value={testata.DESTDIV} width="30px" />
        <div style={{ flex: 1 }} />
        <ArcaInput label="Commessa" value={testata.COMMESSA} width="80px" />
      </div>

      {/* Destinazione Diversa (se presente) */}
      {destinazione && (
        <div style={{ ...arcaEtchedBorder, padding: "6px" }}>
          <span style={arcaSectionLabel}>Destinazione Diversa</span>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginTop: "4px" }}>
            <ArcaInput label="Rag. Sociale" value={destinazione.RAGIONESOC} width="200px" />
            <ArcaInput label="Indirizzo" value={destinazione.INDIRIZZO} width="200px" />
            <div style={{ display: "flex", gap: "6px" }}>
              <ArcaInput label="CAP" value={destinazione.CAP} width="50px" />
              <ArcaInput label="Loc." value={destinazione.LOCALITA} width="120px" />
              <ArcaInput label="Prov." value={destinazione.PROVINCIA} width="25px" />
            </div>
          </div>
        </div>
      )}

      {/* IBAN */}
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ ...ARCA_FONT, fontWeight: "bold" }}>IBAN</span>
        <ArcaInput label="Paese" value={testata.CB_NAZIONE} width="22px" />
        <ArcaInput label="Cin Ue" value={testata.CB_CIN_UE} width="22px" />
        <ArcaInput label="Cin IT" value={testata.CB_CIN_IT} width="18px" />
        <ArcaInput label="Abi-Cab" value={testata.ABICAB} width="75px" />
        <ArcaInput label="Conto Corrente" value={testata.CONTOCORR} width="110px" />
        <ArcaInput label="BIC" value={testata.CB_BIC} width="70px" />
      </div>

      {/* Flags + Metadati */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <ArcaInput label="Tipo Fatt." value={testata.TIPOFATT} width="40px" />
        <ArcaInput label="Esercizio" value={testata.ESERCIZIO} width="40px" />
        <label style={{ ...ARCA_FONT, display: "flex", alignItems: "center", gap: "3px" }}>
          <input type="checkbox" checked={testata.TRIANGOLAZ} readOnly />
          Triangolazione
        </label>
        <label style={{ ...ARCA_FONT, display: "flex", alignItems: "center", gap: "3px" }}>
          <input type="checkbox" checked={testata.SCORPORO} readOnly />
          Scorporo
        </label>
      </div>
    </div>
  );
}
