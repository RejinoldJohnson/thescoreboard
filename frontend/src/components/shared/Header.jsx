import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isLoggedIn } from "../../api/client";

export default function Header({ showSearch = false, onSearch, searchPlaceholder = "Search tournaments…" }) {
  const navigate = useNavigate();
  const [val, setVal] = useState("");
  
  // Initialize theme from localStorage or default to light
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "light";
  });

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      document.documentElement.setAttribute("data-theme", savedTheme);
      setTheme(savedTheme);
    }
  }, []);

  const handleSearch = (v) => { setVal(v); if (onSearch) onSearch(v); };

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
  };

  return (
    <header className="site-header" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
      <div className="header-row">
        <span className="header-brand" onClick={() => navigate("/")} style={{ color: "var(--ink)", cursor: "pointer", fontWeight: "bold" }}>
          The<span className="accent" style={{ color: "var(--primary)" }}>Score</span>Board
        </span>

        {showSearch && (
          <div style={{ flex:1, maxWidth:400, position:"relative", display:"flex", alignItems:"center", margin:"0 20px" }}>
            <span style={{ position:"absolute", left:12, fontSize:13, opacity:.5, pointerEvents:"none", color: "var(--ink)" }}>🔍</span>
            <input
              style={{
                width:"100%", background:"var(--input-bg)",
                border:"1.5px solid var(--input-border)", borderRadius:8,
                padding:"7px 32px 7px 34px", fontSize:13,
                fontFamily:"var(--font-body)", color:"var(--ink)", outline:"none",
              }}
              placeholder={searchPlaceholder}
              value={val}
              onChange={e => handleSearch(e.target.value)}
            />
            {val && (
              <button onClick={() => handleSearch("")}
                style={{ position:"absolute", right:10, background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:14 }}>
                ×
              </button>
            )}
          </div>
        )}

        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={toggleTheme} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"var(--ink)" }}>
            {theme === "light" ? "🌙" : "☀️"}
          </button>
          {isLoggedIn() ? (
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("/organiser")} style={{ color: "var(--ink)" }}>Dashboard</button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("/login")} style={{ color: "var(--ink)" }}>Log in</button>
          )}
        </div>
      </div>
    </header>
  );
}