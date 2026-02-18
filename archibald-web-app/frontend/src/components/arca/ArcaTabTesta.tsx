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
    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
      {/* Layout 2 colonne: Left (W≈209) | Right (W≈409) from DocDoc_.sct */}
      <div style={{ display: "flex", gap: "2px", flexWrap: "wrap" }}>
        {/* Colonna sinistra (Shape1: W=209) */}
        <div style={{ width: "209px", minWidth: "209px", flexShrink: 0 }}>
          {/* Rif. Doc. Cliente/Fornitore (Label5: W=207) */}
          <div style={arcaGreyHeader}>Rif. Doc. Cliente/Fornitore</div>
          <div style={{ ...arcaEtchedBorder, marginTop: 0, marginBottom: "1px", padding: "3px 4px" }}>
            <div style={{ display: "flex", gap: "2px", flexWrap: "wrap" }}>
              <ArcaInput label="Numero" value={testata.NUMERODOCF} width="79px" />
              <ArcaInput label="Data" value={formatArcaDate(testata.DATADOCFOR)} width="44px" />
            </div>
          </div>

          {/* Magazzino (W=208, H=139) */}
          <div style={{ ...arcaGreyHeader, marginTop: "1px" }}>Magazzino</div>
          <div style={{ ...arcaEtchedBorder, marginTop: 0, marginBottom: "1px", padding: "3px 4px" }}>
            <div style={{ ...ARCA_FONT, fontWeight: "bold", marginBottom: "1px" }}>Causale</div>
            <div style={{ display: "flex", gap: "2px", alignItems: "center", marginBottom: "1px" }}>
              <ArcaInput value={testata.CODCAUMAG} width="36px" />
              <span style={arcaDescriptionRed}>{testata.CODCAUMAG ? "Scarico per Vendita" : ""}</span>
            </div>
            <div style={{ ...ARCA_FONT, fontWeight: "bold", marginBottom: "1px" }}>di Partenza</div>
            <div style={{ display: "flex", gap: "2px", alignItems: "center", marginBottom: "1px" }}>
              <ArcaInput value={testata.MAGPARTENZ} width="50px" />
              <span style={arcaDescriptionRed}>{testata.MAGPARTENZ ? "Carico Merce" : ""}</span>
            </div>
            <div style={{ ...ARCA_FONT, fontWeight: "bold", marginBottom: "1px" }}>di Arrivo</div>
            <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
              <ArcaInput value={testata.MAGARRIVO} width="50px" />
              <span style={arcaDescriptionRed}>{testata.MAGARRIVO ? "Carico Merce" : ""}</span>
            </div>
          </div>
        </div>

        {/* Colonna destra: Dati ulteriori (W=409, H=195) */}
        <div style={{ flex: 1, minWidth: "240px" }}>
          <div style={arcaGreyHeader}>Dati ulteriori</div>
          <div style={{ ...arcaEtchedBorder, marginTop: 0, marginBottom: "1px", padding: "3px 4px" }}>
            <div style={{ ...ARCA_FONT, fontWeight: "bold", marginBottom: "1px" }}>Agenti</div>
            <div style={{ display: "flex", gap: "2px", marginBottom: "1px" }}>
              <ArcaInput value={testata.AGENTE} width="40px" />
              <ArcaInput value={testata.AGENTE2} width="40px" />
            </div>
            <div style={{ ...ARCA_FONT, fontWeight: "bold", marginBottom: "1px" }}>Zona</div>
            <div style={{ display: "flex", gap: "2px", alignItems: "center", marginBottom: "1px" }}>
              <ArcaInput value={testata.ZONA} width="30px" />
              <span style={arcaDescriptionRed}>{testata.ZONA || ""}</span>
            </div>
            <div style={{ ...ARCA_FONT, fontWeight: "bold", marginBottom: "1px" }}>Settore</div>
            <div style={{ display: "flex", gap: "2px", alignItems: "center", marginBottom: "1px" }}>
              <ArcaInput value={testata.SETTORE} width="30px" />
            </div>
            <div style={{ ...ARCA_FONT, fontWeight: "bold", marginBottom: "1px" }}>Listino</div>
            <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
              <ArcaInput value={testata.LISTINO} width="20px" />
              <span style={arcaDescriptionRed}>{testata.LISTINO ? `Listino ${testata.LISTINO}` : ""}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Data Consegna (W=76) + Destinazione Diversa (W=227) + Commessa (W=180) */}
      <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", alignItems: "center" }}>
        <ArcaInput label="Data Consegna" value={formatArcaDate(testata.DATACONSEG)} width="50px" />
        <ArcaInput label="Destinazione Diversa" value={testata.DESTDIV} width="30px" labelStyle={{ backgroundColor: "#00FFFF" }} />
        <div style={{ flex: 1 }} />
        <ArcaInput label="Commessa" value={testata.COMMESSA} width="80px" />
      </div>

      {/* Destinazione Diversa (se presente) */}
      {destinazione && (
        <div style={{ ...arcaEtchedBorder, padding: "3px 4px" }}>
          <span style={arcaSectionLabel}>Destinazione Diversa</span>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px", marginTop: "2px" }}>
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

      {/* IBAN */}
      <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ ...ARCA_FONT, fontWeight: "bold" }}>IBAN</span>
        <ArcaInput label="Paese" value={testata.CB_NAZIONE} width="22px" />
        <ArcaInput label="Cin Ue" value={testata.CB_CIN_UE} width="22px" />
        <ArcaInput label="Cin IT" value={testata.CB_CIN_IT} width="18px" />
        <ArcaInput label="Abi-Cab" value={testata.ABICAB} width="75px" />
        <ArcaInput label="Conto Corrente" value={testata.CONTOCORR} width="110px" />
        <ArcaInput label="BIC" value={testata.CB_BIC} width="70px" />
      </div>

      {/* Tipo Fatt (W=109), Flags - posizionati a destra come in Arca (Left=516) */}
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
        <ArcaInput label="Tipo Fatt." value={testata.TIPOFATT} width="60px" />
        <ArcaInput label="Esercizio" value={testata.ESERCIZIO} width="40px" />
        <label style={{ ...ARCA_FONT, display: "flex", alignItems: "center", gap: "2px" }}>
          <input type="checkbox" checked={testata.TRIANGOLAZ} readOnly />
          Triangolazione
        </label>
        <label style={{ ...ARCA_FONT, display: "flex", alignItems: "center", gap: "2px" }}>
          <input type="checkbox" checked={testata.SCORPORO} readOnly />
          Scorporo
        </label>
      </div>
    </div>
  );
}
