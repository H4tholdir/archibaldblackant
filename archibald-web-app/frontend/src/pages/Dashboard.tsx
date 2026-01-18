import { useAuth } from "../hooks/useAuth";
import { DashboardNav } from "../components/DashboardNav";

export function Dashboard() {
  const auth = useAuth();

  return (
    <>
      {/* Navigation Bar - Full width, sticky */}
      <DashboardNav />

      {/* Dashboard Content */}
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "20px",
        }}
      >
      {/* Header Section */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "30px",
          flexWrap: "wrap",
          gap: "15px",
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 5px 0", fontSize: "28px", fontWeight: "600" }}>
            Dashboard
          </h1>
          <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>
            Benvenuto, {auth.user?.fullName}
          </p>
        </div>
      </div>

      {/* Widget Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: "20px",
        }}
        className="dashboard-grid"
      >
        {/* Widget Placeholder 1 */}
        <div
          style={{
            border: "2px dashed #ccc",
            borderRadius: "8px",
            padding: "20px",
            minHeight: "200px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#999",
            fontSize: "14px",
          }}
        >
          Widget 1 - Placeholder
        </div>

        {/* Widget Placeholder 2 */}
        <div
          style={{
            border: "2px dashed #ccc",
            borderRadius: "8px",
            padding: "20px",
            minHeight: "200px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#999",
            fontSize: "14px",
          }}
        >
          Widget 2 - Placeholder
        </div>

        {/* Widget Placeholder 3 */}
        <div
          style={{
            border: "2px dashed #ccc",
            borderRadius: "8px",
            padding: "20px",
            minHeight: "200px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#999",
            fontSize: "14px",
          }}
        >
          Widget 3 - Placeholder
        </div>
      </div>

      {/* Responsive Grid Media Query via inline style tag */}
      <style>{`
        @media (min-width: 768px) {
          .dashboard-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
      `}</style>
      </div>
    </>
  );
}
