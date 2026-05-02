import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function OrgHeader({ crumbs = [], right = null, user = null, onLogout = null }) {
  const navigate = useNavigate();
  
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
      <div className="header-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 56 }}>
        {/* Brand */}
        <span
          className="header-brand"
          onClick={() => navigate("/organiser")}
          style={{ color: "var(--ink)", cursor: "pointer" }}
        >
          The<span className="accent" style={{ color: "var(--primary)" }}>Score</span>Board
        </span>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {/* Username — hidden on mobile via CSS */}
          {user?.name && (
            <span className="user-name-desktop" style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>
              {user.name}
            </span>
          )}

          {right}

          <button
            onClick={toggleTheme}
            className="theme-toggle-btn"
            style={{
              background: "none", border: "1px solid var(--border)",
              borderRadius: 6, width: 32, height: 32,
              cursor: "pointer", color: "var(--ink)", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {theme === "light" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            )}
          </button>

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