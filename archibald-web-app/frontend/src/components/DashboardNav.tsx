import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { HamburgerMenu } from "./HamburgerMenu";

export function DashboardNav() {
  const location = useLocation();
  const auth = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const isAdmin = auth.user?.role === "admin";

  // Handle window resize for responsive menu
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setIsMenuOpen(false); // Close menu when switching to desktop
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleLogout = async () => {
    await auth.logout();
    setIsMenuOpen(false);
    // Force full page reload to clear all React state
    window.location.href = "/";
  };

  const handleLinkClick = () => {
    if (isMobile) {
      setIsMenuOpen(false);
    }
  };

  // TODO_FUTURE_FEATURE: Moduli a Pagamento
  // Check user subscription modules here and conditionally render links
  // Example:
  // const hasWarehouseModule = auth.user?.modules?.includes('warehouse');
  // const hasAnalyticsModule = auth.user?.modules?.includes('analytics');
  // Then filter links based on enabled modules

  // Nuovo ordine dei link secondo le specifiche
  const links = [
    { path: "/", label: "🏠 Home" },
    {
      path: "/order",
      label: "📝 Nuovo Ordine",
      highlighted: true,
    }, // Evidenziato
    { path: "/pending-orders", label: "⏳ Ordini in Attesa" },
    { path: "/orders", label: "📚 Storico" },
    // TODO_FUTURE_FEATURE: This link should be conditional based on 'warehouse' module subscription
    { path: "/warehouse-management", label: "📦 Gestione Magazzino" },
    { path: "/customers", label: "👥 Clienti" },
    { path: "/products", label: "📦 Articoli" },
    { path: "/profile", label: "👤 Profilo" },
    { path: "/fresis-history", label: "📋 Storico Fresis" },
    { path: "/revenue-report", label: "📊 Rapporto Ricavi" },
  ];

  // Add admin link if user is admin
  if (isAdmin) {
    links.push({ path: "/admin", label: "🔧 Admin" });
  }

  // Desktop navbar
  const DesktopNav = () => (
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
          alignItems: "center",
        }}
      >
        {links.map((link) => {
          const isActive = location.pathname === link.path;

          return (
            <Link
              key={link.path}
              to={link.path}
              onClick={handleLinkClick}
              style={{
                textDecoration: "none",
                color: "#fff",
                padding: "10px 15px",
                borderRadius: "5px",
                background: link.highlighted
                  ? "#e67e22"
                  : isActive
                    ? "#3498db"
                    : "transparent",
                fontWeight: link.highlighted || isActive ? "bold" : "normal",
                transition: "all 0.2s",
                display: "inline-block",
                fontSize: "14px",
              }}
            >
              {link.label}
            </Link>
          );
        })}

        {/* Logout button */}
        <button
          onClick={handleLogout}
          style={{
            textDecoration: "none",
            color: "#fff",
            padding: "10px 15px",
            borderRadius: "5px",
            background: "#e74c3c",
            fontWeight: "normal",
            transition: "all 0.2s",
            display: "inline-block",
            fontSize: "14px",
            border: "none",
            cursor: "pointer",
          }}
        >
          🚪 Logout
        </button>
      </div>
    </nav>
  );

  // Mobile navbar with hamburger menu
  const MobileNav = () => (
    <>
      <nav
        style={{
          background: "#2c3e50",
          padding: "15px",
          position: "sticky",
          top: 0,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
          }}
        >
          <img
            src="/archibaldrework.png"
            alt="Archibald Rework"
            style={{
              height: "40px",
              width: "auto",
              maxWidth: "200px",
            }}
          />
        </div>

        {/* Hamburger button */}
        <HamburgerMenu
          isOpen={isMenuOpen}
          onToggle={() => setIsMenuOpen(!isMenuOpen)}
        />
      </nav>

      {/* Mobile drawer */}
      {isMenuOpen && (
        <>
          {/* Overlay */}
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.5)",
              zIndex: 999,
            }}
            onClick={() => setIsMenuOpen(false)}
          />

          {/* Drawer */}
          <div
            className="hamburger-menu"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "280px",
              maxWidth: "80vw",
              background: "#2c3e50",
              zIndex: 1000,
              overflowY: "auto",
              boxShadow: "-2px 0 10px rgba(0, 0, 0, 0.3)",
              animation: "slideIn 0.3s ease-out",
            }}
          >
            {/* User info header */}
            <div
              style={{
                padding: "20px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                background: "rgba(0, 0, 0, 0.2)",
              }}
            >
              <div
                style={{
                  color: "#fff",
                  fontSize: "16px",
                  fontWeight: "600",
                  marginBottom: "4px",
                }}
              >
                {auth.user?.fullName}
              </div>
              <div
                style={{
                  color: "rgba(255, 255, 255, 0.7)",
                  fontSize: "12px",
                }}
              >
                {auth.user?.username}
              </div>
            </div>

            {/* Menu links */}
            <div style={{ padding: "10px 0" }}>
              {links.map((link) => {
                const isActive = location.pathname === link.path;

                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={handleLinkClick}
                    style={{
                      textDecoration: "none",
                      color: "#fff",
                      padding: "15px 20px",
                      display: "block",
                      background: link.highlighted
                        ? "#e67e22"
                        : isActive
                          ? "#3498db"
                          : "transparent",
                      fontWeight: link.highlighted || isActive ? "bold" : "normal",
                      transition: "all 0.2s",
                      fontSize: "14px",
                      borderLeft: isActive
                        ? "4px solid #3498db"
                        : link.highlighted
                          ? "4px solid #e67e22"
                          : "4px solid transparent",
                    }}
                  >
                    {link.label}
                  </Link>
                );
              })}

              {/* Logout button */}
              <button
                onClick={handleLogout}
                style={{
                  textDecoration: "none",
                  color: "#fff",
                  padding: "15px 20px",
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  fontWeight: "normal",
                  transition: "all 0.2s",
                  fontSize: "14px",
                  border: "none",
                  borderLeft: "4px solid transparent",
                  cursor: "pointer",
                }}
              >
                🚪 Logout
              </button>
            </div>
          </div>

          {/* Slide-in animation */}
          <style>{`
            @keyframes slideIn {
              from {
                transform: translateX(100%);
              }
              to {
                transform: translateX(0);
              }
            }
          `}</style>
        </>
      )}
    </>
  );

  return isMobile ? <MobileNav /> : <DesktopNav />;
}
