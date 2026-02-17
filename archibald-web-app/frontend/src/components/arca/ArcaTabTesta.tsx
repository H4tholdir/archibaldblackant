import type { ArcaTestata, ArcaDestinazione } from "../../types/arca-data";
import { ArcaInput } from "./ArcaInput";

type ArcaTabTestaProps = {
  testata: ArcaTestata;
  destinazione?: ArcaDestinazione | null;
};

export function ArcaTabTesta({ testata, destinazione }: ArcaTabTestaProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {/* Riga 1: Esercizio, Magazzini */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <ArcaInput label="Esercizio" value={testata.ESERCIZIO} width="60px" />
        <ArcaInput label="Mag. Partenza" value={testata.MAGPARTENZ} width="60px" />
        <ArcaInput label="Mag. Arrivo" value={testata.MAGARRIVO} width="60px" />
      </div>
      {/* Riga 2: Agenti */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <ArcaInput label="Agente 1" value={testata.AGENTE} width="100px" />
        <ArcaInput label="Agente 2" value={testata.AGENTE2} width="100px" />
      </div>
      {/* Riga 3: Zona, Settore, Listino */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <ArcaInput label="Zona" value={testata.ZONA} width="80px" />
        <ArcaInput label="Settore" value={testata.SETTORE} width="80px" />
        <ArcaInput label="Listino" value={testata.LISTINO} width="40px" />
      </div>
      {/* Riga 4: Data Consegna, Commessa */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <ArcaInput
          label="Data Consegna"
          value={testata.DATACONSEG ?? ""}
          width="100px"
        />
        <ArcaInput label="Commessa" value={testata.COMMESSA} width="120px" />
      </div>
      {/* Riga 5: Destinazione diversa */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <ArcaInput label="Dest. Diversa" value={testata.DESTDIV} width="80px" />
      </div>
      {destinazione && (
        <div
          style={{
            marginTop: "4px",
            padding: "6px 8px",
            border: "1px solid #D4D0C8",
            backgroundColor: "#FAFAF5",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "4px", fontSize: "11px" }}>
            Destinazione Diversa
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
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
    </div>
  );
}
