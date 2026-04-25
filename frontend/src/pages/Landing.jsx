import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getHomepageData, isLoggedIn } from "../api/client";
import TournamentCard from "../components/shared/TournamentCard";
import { SPORT_LABELS, SPORT_ICONS } from "../components/shared/TournamentCard";

const SPORTS_CONFIG = [
  { key: "football",     url: "football",     icon: "⚽" },
  { key: "cricket",      url: "cricket",      icon: "🏏" },
  { key: "table_tennis", url: "table-tennis", icon: "🏓" },
  { key: "badminton",    url: "badminton",    icon: "🏸" },
];

const POLL_INTERVAL = 10000;

export default function Landing() {
  const navigate = useNavigate();
  const [data,        setData]        = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQ,     setSearchQ]     = useState("");
  const [theme, setTheme] = useState(document.documentElement.getAttribute("data-theme") || "light");

  const fetchData = useCallback(() => {
    getHomepageData(searchQ || null).then(setData).catch(console.error);
  }, [searchQ]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
  };

  const sports     = data?.sports || [];
  const trending   = data?.trending || [];
  const totalLive  = data?.total_live_matches || 0;
  const sportStats = {};
  sports.forEach(s => { sportStats[s.sport_key] = s; });

  return (
    <div className="app">
      {/* ── HEADER ── */}
      <header className="site-header" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div className="header-row">
          {/* Brand */}
          <span className="header-brand" onClick={() => navigate("/")} style={{ color: "var(--ink)", cursor: "pointer", fontWeight: "bold" }}>
            The<span className="accent" style={{ color: "var(--primary)" }}>Score</span>Board
          </span>

          {/* Search */}
          <div style={{ flex:1, maxWidth:440, position:"relative", display:"flex", alignItems:"center", margin:"0 20px" }} className="header-search">
            <span style={{ position:"absolute", left:12, fontSize:14, opacity:.5, pointerEvents:"none", color: "var(--ink)" }}>🔍</span>
            <input
              style={{
                width:"100%", background:"var(--input-bg)",
                border:"1.5px solid var(--input-border)", borderRadius:8,
                padding:"8px 34px 8px 36px", fontSize:13, fontFamily:"var(--font-body)",
                color:"var(--ink)", outline:"none", transition:"all .2s",
              }}
              placeholder="Search tournaments, cities…"
              value={searchInput}
              onChange={e => { setSearchInput(e.target.value); setSearchQ(e.target.value); }}
              onFocus={e => { e.target.style.borderColor="var(--primary)"; }}
              onBlur={e => { e.target.style.borderColor="var(--input-border)"; }}
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(""); setSearchQ(""); }}
                style={{ position:"absolute", right:10, background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:14 }}>
                ×
              </button>
            )}
          </div>

          {/* Right */}
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button onClick={toggleTheme} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"var(--ink)", marginRight: "10px" }}>
              {theme === "light" ? "🌙" : "☀️"}
            </button>
            {totalLive > 0 && <div className="live-badge"><span className="live-dot"/>{totalLive} LIVE</div>}
            <button
              className="btn btn-gradient btn-sm"
              onClick={() => navigate(isLoggedIn() ? "/organiser" : "/login")}
            >
              {isLoggedIn() ? "Dashboard" : "Organise →"}
            </button>
          </div>
        </div>
      </header>

      {/* ── SPORT CARDS STRIP ── */}
      <div style={{
        background: "var(--hero-bg)",
        borderBottom: "2px solid var(--border)",
        padding: "20px 0",
      }}>
        <div style={{
          maxWidth:1200, margin:"0 auto", padding:"0 24px",
          display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))", gap:12,
        }}>
          {SPORTS_CONFIG.map(sport => {
            const stats     = sportStats[sport.key];
            const liveCount = stats?.live_count || 0;
            const tournCount= stats?.tournament_count || 0;
            return (
              <div
                key={sport.key}
                onClick={() => navigate(`/${sport.url}`)}
                style={{
                  background:"var(--surface)",
                  border:"1.5px solid var(--border)",
                  borderRadius:12, padding:"20px 12px 16px",
                  textAlign:"center", cursor:"pointer",
                  transition:"all .2s", position:"relative", overflow:"hidden",
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background="var(--primary-dim)";
                  e.currentTarget.style.borderColor="var(--primary)";
                  e.currentTarget.style.transform="translateY(-3px)";
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background="var(--surface)";
                  e.currentTarget.style.borderColor="var(--border)";
                  e.currentTarget.style.transform="translateY(0)";
                }}
              >
                <div style={{ fontSize:36, marginBottom:8 }}>{sport.icon}</div>
                <div style={{ fontFamily:"var(--font-display)", fontSize:13, fontWeight:900, textTransform:"uppercase", letterSpacing:1, color:"var(--ink)" }}>
                  {SPORT_LABELS[sport.key]}
                </div>
                <div style={{ fontSize:11, color:"var(--muted)", marginTop:4 }}>
                  {tournCount > 0 ? `${tournCount} tournament${tournCount!==1?"s":""}` : "Coming soon"}
                </div>
                {liveCount > 0 && (
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:4, marginTop:8, fontSize:11, fontWeight:700, color:"var(--primary)" }}>
                    <span className="live-dot" style={{ background:"var(--primary)", width:6, height:6 }}/>{liveCount} live
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── LIVE BAR ── */}
      {totalLive > 0 && (
        <div style={{
          background:"var(--primary)", padding:"10px 24px",
          display:"flex", alignItems:"center", justifyContent:"center", gap:10,
        }}>
          <span className="live-dot" style={{ background:"#FFF" }}/>
          <span style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:12, letterSpacing:3, color:"#FFF", textTransform:"uppercase" }}>
            {totalLive} Match{totalLive!==1?"es":""} Live Now
          </span>
        </div>
      )}

      {/* ── CONTENT ── */}
      <div style={{ maxWidth:1200, margin:"0 auto", padding:"24px 24px" }}>
        {!data ? (
          <div className="empty" style={{ color:"var(--muted)" }}>Loading…</div>
        ) : sports.length === 0 && trending.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🏟️</div>
            <div className="empty-title">No Tournaments Yet</div>
            <p style={{ fontSize:13, color:"var(--muted)" }}>Be the first to organize one!</p>
          </div>
        ) : (
          <>
            {SPORTS_CONFIG.map(sport => {
              const sd = sportStats[sport.key];
              if (!sd || !sd.tournaments?.length) return null;
              return (
                <div key={sport.key} style={{ marginBottom:36 }}>
                  {/* Section header */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, paddingBottom:10, borderBottom:"2px solid var(--border)" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontSize:22 }}>{sport.icon}</span>
                      <span style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:900, textTransform:"uppercase", letterSpacing:-0.5, color:"var(--ink)" }}>
                        {SPORT_LABELS[sport.key]}
                      </span>
                      {sd.live_count > 0 && (
                        <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, fontWeight:700, color:"var(--primary)" }}>
                          <span className="live-dot" style={{ background:"var(--primary)", width:7, height:7 }}/>{sd.live_count} live
                        </div>
                      )}
                    </div>
                    <button
                      style={{ background:"none", border:"none", color:"var(--primary)", fontFamily:"var(--font-display)", fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:1, cursor:"pointer" }}
                      onClick={() => navigate(`/${sport.url}`)}>
                      View all →
                    </button>
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }} className="tournament-grid">
                    {sd.tournaments.slice(0,3).map(t => (
                      <TournamentCard key={t.tournament_id} tournament={t}
                        onClick={() => navigate(`/${sport.url}/tournament/${t.slug}`)} />
                    ))}
                  </div>
                </div>
              );
            })}

            {trending.length > 0 && sports.length === 0 && (
              <div>
                <div className="section-label">All Tournaments</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }} className="tournament-grid">
                  {trending.map(t => (
                    <TournamentCard key={t.tournament_id} tournament={t} onClick={() => navigate(`/t/${t.slug}`)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── FAB ── */}
      <button
        onClick={() => navigate(isLoggedIn() ? "/organiser" : "/register")}
        style={{
          position:"fixed", bottom:24, right:24, zIndex:200,
          display:"flex", alignItems:"center", gap:8,
          background:"var(--primary)", border:"none", borderRadius:50,
          padding:"14px 22px", cursor:"pointer",
          fontFamily:"var(--font-display)", fontSize:13, fontWeight:800,
          textTransform:"uppercase", letterSpacing:1, color:"#FFF",
          boxShadow:"0 4px 20px rgba(255,107,53,0.45)", transition:"all .2s",
        }}
        onMouseOver={e => { e.currentTarget.style.transform="scale(1.05)"; e.currentTarget.style.boxShadow="0 8px 28px rgba(255,107,53,0.6)"; }}
        onMouseOut={e => { e.currentTarget.style.transform="scale(1)"; e.currentTarget.style.boxShadow="0 4px 20px rgba(255,107,53,0.45)"; }}
      >
        <span style={{ fontSize:18 }}>+</span>
        <span>Organize</span>
      </button>

      <footer style={{ textAlign:"center", padding:"24px", color:"var(--muted)", fontSize:12, borderTop:"1px solid var(--border)", marginTop:32 }}>
        TheScoreBoard — Live tournament scores for every sport
      </footer>
    </div>
  );
}