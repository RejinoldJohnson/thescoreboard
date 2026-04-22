import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getSportPageData } from "../api/client";
import Header from "../components/shared/Header";
import TournamentCard from "../components/shared/TournamentCard";
import { SPORT_LABELS } from "../components/shared/TournamentCard";

const SPORT_URL_TO_KEY = {
  football:      "football",
  cricket:       "cricket",
  "table-tennis":"table_tennis",
  badminton:     "badminton",
};

const SPORT_ICONS = {
  football:     "⚽",
  cricket:      "🏏",
  table_tennis: "🏓",
  badminton:    "🏸",
};

// Per-sport accent color for the hero strip
const SPORT_ACCENT = {
  football:     "#22c55e",
  cricket:      "#FFCC00",
  table_tennis: "#FF6B35",
  badminton:    "#38bdf8",
};

const POLL_INTERVAL = 8000;

export default function SportPage() {
  const location = useLocation();
  const sportUrl = location.pathname.replace("/", "");
  const navigate = useNavigate();
  const [data,       setData]       = useState(null);
  const [filterCity, setFilterCity] = useState("");
  const [searchQ,    setSearchQ]    = useState("");

  const sportKey = SPORT_URL_TO_KEY[sportUrl];

  const fetchData = useCallback(() => {
    if (!sportUrl) return;
    getSportPageData(sportUrl, filterCity || null, searchQ || null)
      .then(setData).catch(console.error);
  }, [sportUrl, filterCity, searchQ]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  const tournaments      = data?.tournaments || [];
  const cities           = data?.cities || [];
  const liveTournaments  = tournaments.filter(t => t.status === "live");
  const upcoming         = tournaments.filter(t => t.status === "upcoming");
  const completed        = tournaments.filter(t => t.status === "completed");
  const totalLive        = tournaments.reduce((s, t) => s + (t.live_count || 0), 0);
  const accent           = SPORT_ACCENT[sportKey] || "var(--primary)";

  return (
    <div className="app">
      <Header
        showSearch
        onSearch={setSearchQ}
        searchPlaceholder={`Search ${SPORT_LABELS[sportKey] || sportUrl} tournaments…`}
      />

      {/* ── SPORT HERO STRIP ── */}
      <div style={{
        background: `linear-gradient(135deg, var(--bg) 0%, ${accent}15 50%, var(--bg) 100%)`,
        borderBottom: `2px solid ${accent}44`,
        padding: "20px 24px",
        position: "sticky",
        top: 56,
        zIndex: 90,
      }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, flexWrap:"wrap",className:"sport-hero" }}>
          {/* Left: sport info */}
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{
              width:56, height:56, borderRadius:12, flexShrink:0,
              background:`${accent}18`, border:`2px solid ${accent}44`,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:28,
            }}>
              {SPORT_ICONS[sportKey] || "🏅"}
            </div>
            <div>
              <div style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:900, textTransform:"uppercase", letterSpacing:-1, color:"var(--ink)", lineHeight:1 }}>
                {SPORT_LABELS[sportKey] || sportUrl}
              </div>
              <div style={{ fontSize:12, color:"var(--muted)", marginTop:4, display:"flex", alignItems:"center", gap:10 }}>
                <span>{tournaments.length} tournament{tournaments.length!==1?"s":""}</span>
                {totalLive > 0 && (
                  <span style={{ display:"flex", alignItems:"center", gap:5, color:"var(--primary)", fontWeight:700 }}>
                    <span className="live-dot" style={{ background:"var(--primary)", width:7, height:7 }}/>
                    {totalLive} live now
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: filters */}
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <button className="filter-pill active" onClick={() => navigate("/")} style={{ background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--border)" }}>← All Sports</button>
            {cities.length > 0 && (
              <select
                value={filterCity}
                onChange={e => setFilterCity(e.target.value)}
                style={{
                  background:"var(--surface)", border:"1px solid var(--border-mid)",
                  color:"var(--ink)", fontSize:11, fontWeight:700,
                  textTransform:"uppercase", letterSpacing:1,
                  padding:"5px 12px", borderRadius:4, cursor:"pointer", outline:"none",
                  fontFamily:"var(--font-body)",
                }}
              >
                <option value="">All Cities</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth:1100, margin:"0 auto", padding:"24px 24px" }}>
        {!data ? (
          <div className="empty">
            <div style={{ fontFamily:"var(--font-display)", fontSize:14, textTransform:"uppercase", letterSpacing:2, color:"var(--muted)" }}>Loading…</div>
          </div>
        ) : tournaments.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">{SPORT_ICONS[sportKey] || "🏆"}</div>
            <div className="empty-title">No {SPORT_LABELS[sportKey]} Tournaments Yet</div>
            <p style={{ fontSize:13, color:"var(--muted)", marginTop:4 }}>Check back soon or organize one!</p>
          </div>
        ) : (
          <>
            {liveTournaments.length > 0 && (
              <Section label="🔴 Live Now" tournaments={liveTournaments} sportUrl={sportUrl} navigate={navigate} accent={accent} />
            )}
            {upcoming.length > 0 && (
              <Section label="Upcoming" tournaments={upcoming} sportUrl={sportUrl} navigate={navigate} accent={accent} />
            )}
            {completed.length > 0 && (
              <Section label="Completed" tournaments={completed} sportUrl={sportUrl} navigate={navigate} accent={accent} />
            )}
          </>
        )}
      </div>

      <footer style={{ textAlign:"center", padding:"20px 24px", color:"var(--muted)", fontSize:12, borderTop:"1px solid var(--border)" }}>
        TheScoreBoard — {SPORT_LABELS[sportKey]} tournaments
      </footer>
    </div>
  );
}

function Section({ label, tournaments, sportUrl, navigate, accent }) {
  return (
    <div style={{ marginBottom:36 }}>
      <div className="section-label" style={{ color: "var(--ink)", fontWeight: "bold", borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "16px" }}>{label}</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:12 }}>
        {tournaments.map(t => (
          <TournamentCard key={t.tournament_id} tournament={t}
            onClick={() => navigate(`/${sportUrl}/tournament/${t.slug}`)} />
        ))}
      </div>
    </div>
  );
}