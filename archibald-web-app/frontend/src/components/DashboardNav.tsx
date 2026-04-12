import { Link, useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { HamburgerMenu } from "./HamburgerMenu";
import { NotificationBell } from "./NotificationBell";

export function DashboardNav() {
  const location = useLocation();
  const auth = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isNavHidden, setIsNavHidden] = useState(false);
  const lastScrollY = useRef(0);

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

  // On mobile at customer profile, nav is non-sticky so it scrolls away naturally.
  const navIsScrollable = isMobile && /^\/customers\/[^/]+/.test(location.pathname);

  // Reset hidden state on route change or viewport mode change
  useEffect(() => {
    setIsNavHidden(false);
    lastScrollY.current = 0;
  }, [location.pathname, isMobile]);

  // Hide-on-scroll: listen to .app-main scroll events (not on scrollable-nav pages)
  useEffect(() => {
    if (navIsScrollable) return;
    const appMain = document.querySelector('.app-main');
    if (!appMain) return;

    const handleScroll = () => {
      const currentY = appMain.scrollTop;
      if (currentY > lastScrollY.current + 8 && currentY > 50) {
        setIsNavHidden(true);
      } else if (currentY < lastScrollY.current - 8) {
        setIsNavHidden(false);
      }
      lastScrollY.current = currentY;
    };

    appMain.addEventListener('scroll', handleScroll, { passive: true });
    return () => appMain.removeEventListener('scroll', handleScroll);
  }, [location.pathname, isMobile, navIsScrollable]);

  const handleLogout = async () => {
    await auth.logout();
    setIsMenuOpen(false);
    // Force full page reload to clear all React state
    window.location.href = "/";
  };

  const handleLinkClick = (e: React.MouseEvent, path: string) => {
    if (location.pathname === path) {
      e.preventDefault();
      window.location.reload();
      return;
    }
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
    { path: "/recognition", label: "📷 Identifica strumento" },
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
        top: isNavHidden ? '-100px' : '0',
        zIndex: 100,
        overflowX: "auto",
        whiteSpace: "nowrap",
        transition: 'top 0.3s ease',
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
              onClick={(e) => handleLinkClick(e, link.path)}
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

        {/* Notification Bell */}
        <NotificationBell />

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
          position: navIsScrollable ? "relative" : "sticky",
          top: navIsScrollable ? 0 : (isNavHidden ? '-100px' : '0'),
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          transition: navIsScrollable ? undefined : 'top 0.3s ease',
        }}
      >
        {/* Logo — click → home */}
        <Link
          to="/"
          style={{
            display: "flex",
            alignItems: "center",
            textDecoration: "none",
          }}
        >
          <img
            src="/formicaneralogo.png"
            alt="Formicanera"
            style={{
              height: "44px",
              width: "44px",
              objectFit: "contain",
            }}
          />
        </Link>

        {/* Notification bell + Hamburger button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <NotificationBell />
          <HamburgerMenu
            isOpen={isMenuOpen}
            onToggle={() => setIsMenuOpen(!isMenuOpen)}
          />
        </div>
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
                    onClick={(e) => handleLinkClick(e, link.path)}
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
