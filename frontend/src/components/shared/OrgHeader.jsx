import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function OrgHeader({ crumbs = [], right = null, user = null, onLogout = null }) {
  const navigate = useNavigate();
  
  console.log("🔍 OrgHeader render:", { user, onLogout: !!onLogout, crumbs });
  
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "light";
  });

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (!savedTheme) {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", savedTheme);
      setTheme(savedTheme);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
  };

  return (
    <header className="site-header org-header" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
      {/* ── Row 1: brand + controls ── */}
      <div className="header-row">
        {/* Brand wrapper */}
        <div className="org-header-brand">
          <span
            className="header-brand"
            onClick={() => navigate("/organiser")}
            style={{ color: "var(--ink)", cursor: "pointer", fontWeight: "bold" }}
          >
            The<span className="accent" style={{ color: "var(--primary)" }}>Score</span>Board
          </span>
        </div>

        {/* Controls wrapper */}
        <div className="org-header-right">
        {console.log("🎨 Rendering org-header-right, onLogout =", !!onLogout)}
          {/* Theme toggle */}
          <button 
            onClick={toggleTheme} 
            className="theme-toggle-btn"
            style={{ 
              background: "none", 
              border: "none", 
              cursor: "pointer", 
              fontSize: 18, 
              color: "var(--ink)", 
              flexShrink: 0 
            }}
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
          
          {/* Username (desktop only) */}
          {user?.name && (
            <span className="user-name user-name-desktop" style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>
              {user.name}
            </span>
          )}
          
          {/* Right slot (if any custom content) */}
          {right}
          
          {/* Logout button */}
          {onLogout && (
            <button 
              className="btn btn-ghost btn-sm org-logout-btn" 
              onClick={onLogout}
              style={{ color: "var(--ink)" }}
            >
              Logout
            </button>
          )}
        </div>
      </div>

      {/* ── Row 2: breadcrumbs ── */}
      {crumbs.length > 0 && (
        <div className="breadcrumb-row" style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)", padding: "8px 20px" }}>
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {i > 0 && <span className="breadcrumb-sep" style={{ color: "var(--muted)" }}>›</span>}
                <span
                  className={`breadcrumb-item${isLast ? " current" : ""}`}
                  onClick={() => !isLast && crumb.path && navigate(crumb.path)}
                  style={{ color: isLast ? "var(--ink)" : "var(--muted)", cursor: isLast ? "default" : "pointer", fontSize: 13 }}
                >
                  {crumb.label}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </header>
  );
}