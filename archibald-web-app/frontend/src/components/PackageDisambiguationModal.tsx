import type { PackageSolution } from "../utils/orderParser";

interface PackageDisambiguationModalProps {
  articleCode: string;
  quantity: number;
  solutions: PackageSolution[];
  onSelect: (solution: PackageSolution) => void;
  onCancel: () => void;
}

export function PackageDisambiguationModal({
  articleCode,
  quantity,
  solutions,
  onSelect,
  onCancel,
}: PackageDisambiguationModalProps) {
  return (
    <div className="disambiguation-modal-overlay">
      <div className="disambiguation-modal">
        <h2>Seleziona Confezione</h2>
        <p>
          Articolo <strong>{articleCode}</strong>, quantità{" "}
          <strong>{quantity}</strong> pezzi
        </p>
        <p>Sono disponibili più soluzioni di confezionamento:</p>

        <div className="solutions-list">
          {solutions.map((solution, index) => (
            <button
              key={index}
              className={`solution-option ${solution.isOptimal ? "optimal" : ""}`}
              onClick={() => onSelect(solution)}
            >
              <div className="solution-header">
                <span className="package-count">
                  📦 {solution.totalPackages} confezioni totali
                </span>
                {solution.isOptimal && (
                  <span className="optimal-badge">✓ Raccomandato</span>
                )}
              </div>
              <div className="solution-breakdown">
                {solution.breakdown.map((item, i) => (
                  <span key={i}>
                    {item.count}× {item.packageContent}pz
                    {i < solution.breakdown.length - 1 && " + "}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>

        <button onClick={onCancel} className="cancel-btn">
          Annulla
        </button>
      </div>
    </div>
  );
}
