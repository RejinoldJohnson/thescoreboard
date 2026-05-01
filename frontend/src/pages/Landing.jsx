import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getHomepageData, isLoggedIn } from "../api/client";
import { SPORT_LABELS, SPORT_ICONS } from "../components/shared/TournamentCard";

const SPORTS_CONFIG = [
  { key: "football",     url: "football" },
  { key: "cricket",      url: "cricket" },
  { key: "table_tennis", url: "table-tennis" },
  { key: "badminton",    url: "badminton" },
];

const POLL_INTERVAL = 10000;

export default function Landing() {
  const navigate = useNavigate();
  const [data,        setData]        = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQ,     setSearchQ]     = useState("");
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "light";
  });

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

  const sports    = data?.sports   || [];
  const trending  = data?.trending || [];
  const totalLive = data?.total_live_matches || 0;
  const sportStats = {};
  sports.forEach(s => { sportStats[s.sport_key] = s; });

  const dynamicTournamentCount = sports.reduce((acc, s) => acc + (s.tournament_count || 0), 0);
  const displayTournamentCount = dynamicTournamentCount > 0 ? dynamicTournamentCount : "12,000+";

  let allTournaments = [...trending];
  sports.forEach(s => { if (s.tournaments) allTournaments.push(...s.tournaments); });

  const seenIds = new Set();
  const displayTournaments = allTournaments.filter(t => {
    if (seenIds.has(t.tournament_id)) return false;
    seenIds.add(t.tournament_id);
    return true;
  }).slice(0, 6);

  return (
    <div className="app">
      {/* ── HEADER ── */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <div className="landing-logo" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
            The<span className="accent">Score</span>Board
          </div>

          <div className="landing-search-bar">
            <input
              type="text"
              className="landing-search-input"
              placeholder="Search tournaments, cities, sports..."
              value={searchInput}
              onChange={e => {
                setSearchInput(e.target.value);
                setSearchQ(e.target.value);
              }}
            />
          </div>

          <div className="landing-header-actions">
            <button className="landing-btn landing-btn-secondary" onClick={toggleTheme}>
              {theme === "light" ? "🌙" : "☀️"}
            </button>
            <button
              className="landing-btn landing-btn-secondary"
              onClick={() => navigate(isLoggedIn() ? "/organiser" : "/login")}
            >
              Organize
            </button>
            <button className="landing-btn landing-btn-primary" onClick={() => navigate("/")}>
              Find Tournaments
            </button>
          </div>
        </div>
      </header>

      {/* ── LIVE BANNER ── */}
      {totalLive > 0 && (
        <div className="landing-live-banner">
          <span className="landing-live-dot"></span>
          {totalLive} Match{totalLive !== 1 ? "es" : ""} Live Now
        </div>
      )}

      {/* ── HERO ── */}
      <section className="landing-hero">
        <div className="landing-hero-content">
          <h1>Discover <span className="highlight">Live Sports</span> Near You</h1>
          <p>Follow local tournaments, register to play, and track live scores in real-time</p>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <div className="landing-stats-bar">
        <div className="landing-stats-grid">
          <div>
            <div className="stat-num">{displayTournamentCount}</div>
            <div className="stat-label">Tournaments</div>
          </div>
          <div>
            <div className="stat-num">100,000+</div>
            <div className="stat-label">Players</div>
          </div>
          <div>
            <div className="stat-num">40+</div>
            <div className="stat-label">Cities</div>
          </div>
          <div>
            <div className="stat-num">{totalLive > 0 ? totalLive : "24"}</div>
            <div className="stat-label">Live Now</div>
          </div>
        </div>
      </div>

      {/* ── SPORTS GRID ── */}
      <section className="landing-sports-section">
        <h2 className="landing-section-title">Browse by Sport</h2>
        <div className="landing-sports-grid">
          {SPORTS_CONFIG.map(sport => {
            const stats      = sportStats[sport.key];
            const tournCount = stats?.tournament_count || 0;
            return (
              <div
                key={sport.key}
                className="landing-sport-card"
                onClick={() => navigate(`/${sport.url}`)}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>{SPORT_ICONS[sport.key]}</div>
                <div className="sport-name">{SPORT_LABELS[sport.key] || sport.key}</div>
                <div className="sport-count">
                  {tournCount > 0 ? `${tournCount} tournaments` : "Coming soon"}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── LIVE & FEATURED TOURNAMENTS ── */}
      <section className="landing-live-section">
        <h2 className="landing-section-title">Live & Featured Tournaments</h2>

        {!data ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: "40px 0" }}>
            Loading tournaments...
          </div>
        ) : displayTournaments.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: "40px 0" }}>
            No active tournaments found. Be the first to organize one!
          </div>
        ) : (
          <div className="landing-tournaments-grid">
            {displayTournaments.map(t => {
              const isLive = t.live_count > 0 || t.status?.toLowerCase() === "live";
              return (
                <div
                  key={t.tournament_id}
                  className={`landing-tourney-card${isLive ? " live" : ""}`}
                  onClick={() => navigate(`/t/${t.slug}`)}
                >
                  <div className={`tournament-badge${isLive ? " live" : " upcoming"}`}>
                    {isLive && <span className="landing-live-dot"></span>}
                    {isLive ? "LIVE" : "UPCOMING"}
                  </div>
                  <div className="tournament-name">{t.name}</div>
                  <div className="tournament-meta">
                    {t.city || "Location TBA"} · {isLive ? `${t.live_count} matches in progress` : "Registration Open"}<br />
                    {t.participants_count || t.total_players || 0} participants
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── FOOTER ── */}
      <footer className="landing-footer">
        <div className="landing-footer-content">
          <div className="footer-col">
            <h4>TheScoreBoard</h4>
            <p>Live tournament scores for every sport. Built for communities, trusted by organizers.</p>
          </div>
          <div className="footer-col">
            <h4>For Players</h4>
            <a href="#">Find Tournaments</a>
            <a href="#">Register to Play</a>
            <a href="#">Track Scores</a>
          </div>
          <div className="footer-col">
            <h4>For Organizers</h4>
            <a onClick={() => navigate(isLoggedIn() ? "/organiser" : "/login")} style={{ cursor: "pointer" }}>Create Tournament</a>
            <a href="#">Manage Events</a>
            <a href="#">How It Works</a>
          </div>
          <div className="footer-col">
            <h4>Sports</h4>
            <a onClick={() => navigate("/football")} style={{ cursor: "pointer" }}>Football</a>
            <a onClick={() => navigate("/cricket")} style={{ cursor: "pointer" }}>Cricket</a>
            <a onClick={() => navigate("/table-tennis")} style={{ cursor: "pointer" }}>Table Tennis</a>
            <a onClick={() => navigate("/badminton")} style={{ cursor: "pointer" }}>Badminton</a>
          </div>
        </div>
        <div className="landing-footer-bottom">
          © {new Date().getFullYear()} TheScoreBoard · Built for sports communities
        </div>
      </footer>
    </div>
  );
}
