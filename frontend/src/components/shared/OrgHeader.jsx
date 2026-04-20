/**
 * OrgHeader — the persistent green header used across all organiser pages.
 *
 * Shows a breadcrumb trail that's always clickable:
 *   TheScoreBoard  ›  My Tournaments  ›  Tournament Name  ›  Event Name
 *
 * Props:
 *   crumbs: Array of { label, path } — renders as clickable breadcrumbs.
 *           Last item is non-clickable (current page).
 *   right:  Optional React node rendered on the right side (e.g. live badge, action button).
 *   user:   Optional user object with .name
 *   onLogout: Optional logout handler
 */
import { useNavigate } from "react-router-dom";

export default function OrgHeader({ crumbs = [], right = null, user = null, onLogout = null }) {
  const navigate = useNavigate();

  return (
    <header style={{
      background: "var(--green)",
      width: "100%",
      position: "sticky",
      top: 0,
      zIndex: 200,
      boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
    }}>
      {/* ── Top row: brand + user ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        height: 52,
        borderBottom: "1px solid rgba(255,255,255,0.1)",
      }}>
        {/* Brand */}
        <span
          onClick={() => navigate("/organiser")}
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 20,
            fontWeight: 900,
            color: "#fff",
            letterSpacing: 0.5,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          TheScoreBoard
        </span>

        {/* Right side — user + logout */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {user?.name && (
            <span style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.7)",
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {user.name}
            </span>
          )}
          {right}
          {onLogout && (
            <button
              onClick={onLogout}
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "1px",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.7)",
                background: "none",
                border: "1.5px solid rgba(255,255,255,0.25)",
                padding: "4px 12px",
                borderRadius: 5,
                cursor: "pointer",
                transition: "all .15s",
              }}
              onMouseOver={e => { e.target.style.color = "#fff"; e.target.style.borderColor = "rgba(255,255,255,0.6)"; }}
              onMouseOut={e => { e.target.style.color = "rgba(255,255,255,0.7)"; e.target.style.borderColor = "rgba(255,255,255,0.25)"; }}
            >
              Logout
            </button>
          )}
        </div>
      </div>

      {/* ── Breadcrumb row ── */}
      {crumbs.length > 0 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          height: 36,
          gap: 6,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}>
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {i > 0 && (
                  <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>›</span>
                )}
                <span
                  onClick={() => !isLast && crumb.path && navigate(crumb.path)}
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 13,
                    fontWeight: isLast ? 800 : 600,
                    letterSpacing: "0.5px",
                    color: isLast ? "#fff" : "rgba(255,255,255,0.6)",
                    cursor: isLast ? "default" : "pointer",
                    textTransform: "uppercase",
                    transition: "color .15s",
                    whiteSpace: "nowrap",
                  }}
                  onMouseOver={e => { if (!isLast) e.target.style.color = "rgba(255,255,255,0.9)"; }}
                  onMouseOut={e => { if (!isLast) e.target.style.color = "rgba(255,255,255,0.6)"; }}
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