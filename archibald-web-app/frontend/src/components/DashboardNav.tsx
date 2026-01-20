import { Link, useLocation } from "react-router-dom";

export function DashboardNav() {
  const location = useLocation();

  const links = [
    { path: "/", label: "🏠 Dashboard" },
    { path: "/profile", label: "👤 Profilo" },
    { path: "/order-form", label: "📝 Nuovo Ordine" },
    { path: "/orders", label: "📦 Storico" },
    { path: "/drafts", label: "📝 Bozze" },
    { path: "/pending", label: "📋 Pending" },
    { path: "/customers", label: "👥 Clienti" },
    { path: "/products", label: "📦 Articoli" },
    { path: "/prezzi-variazioni", label: "📊 Prezzi" },
    { path: "/admin", label: "🔧 Admin" },
  ];

  return (
    <nav
      style={{
        background: "#2c3e50",
        padding: "15px",
        position: "sticky",
        top: 0,
        zIndex: 100,
        overflowX: "auto",
        whiteSpace: "nowrap",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "15px",
          minWidth: "fit-content",
        }}
      >
        {links.map((link) => {
          const isActive = location.pathname === link.path;

          return (
            <Link
              key={link.path}
              to={link.path}
              style={{
                textDecoration: "none",
                color: "#fff",
                padding: "10px 15px",
                borderRadius: "5px",
                background: isActive ? "#3498db" : "transparent",
                fontWeight: isActive ? "bold" : "normal",
                transition: "all 0.2s",
                display: "inline-block",
                fontSize: "14px",
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
