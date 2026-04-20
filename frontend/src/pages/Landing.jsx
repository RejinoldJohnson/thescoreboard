import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getHomepageData, isLoggedIn } from "../api/client";
import TournamentCard from "../components/shared/TournamentCard";
import { SPORT_LABELS, SPORT_ICONS } from "../components/shared/TournamentCard";

const SPORTS_CONFIG = [
  { key: "football",    url: "football",     icon: "⚽", color: "#1a8f3f" },
  { key: "cricket",     url: "cricket",      icon: "🏏", color: "#d4a017" },
  { key: "table_tennis",url: "table-tennis", icon: "🏓", color: "#c0392b" },
  { key: "badminton",   url: "badminton",    icon: "🏸", color: "#2d7abf" },
];

const POLL_INTERVAL = 10000;

export default function Landing() {
  const navigate = useNavigate();
  const [data,    setData]    = useState(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchData = useCallback(() => {
    getHomepageData(searchQ || null)
      .then(setData)
      .catch(console.error);
  }, [searchQ]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  const sports     = data?.sports     || [];
  const trending   = data?.trending   || [];
  const totalLive  = data?.total_live_matches || 0;
  const sportStats = {};
  sports.forEach((s) => { sportStats[s.sport_key] = s; });

  return (
    <div className="app">
      <style>{`
        /* ── Full-width header fix ── */
        .tsb-landing-header {
          background: var(--green);
          box-shadow: 0 2px 8px rgba(0,0,0,0.18);
          position: sticky; top: 0; z-index: 100;
          width: 100%;
        }
        .tsb-landing-header-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 24px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .tsb-landing-brand {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 24px; font-weight: 900; color: #fff;
          letter-spacing: 0.5px; white-space: nowrap; cursor: pointer;
          flex-shrink: 0;
        }
        .tsb-landing-search {
          flex: 1; max-width: 440px; position: relative; display: flex; align-items: center;
        }
        .tsb-landing-search-icon {
          position: absolute; left: 11px; font-size: 13px;
          pointer-events: none; opacity: 0.55;
        }
        .tsb-landing-search input {
          width: 100%;
          background: rgba(255,255,255,0.15);
          border: 1.5px solid rgba(255,255,255,0.2);
          border-radius: 8px;
          padding: 7px 32px 7px 32px;
          font-size: 13px; font-family: 'DM Sans', sans-serif;
          color: #fff; outline: none; transition: all .2s;
        }
        .tsb-landing-search input::placeholder { color: rgba(255,255,255,0.5); }
        .tsb-landing-search input:focus {
          background: rgba(255,255,255,0.25);
          border-color: rgba(255,255,255,0.45);
        }
        .tsb-landing-search-clear {
          position: absolute; right: 8px; background: none; border: none;
          color: rgba(255,255,255,0.6); cursor: pointer; font-size: 14px; padding: 2px;
        }
        .tsb-landing-nav-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .tsb-landing-dashboard-btn {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 13px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;
          color: #fff; background: none;
          border: 2px solid rgba(255,255,255,0.4);
          padding: 6px 16px; border-radius: 5px; cursor: pointer; transition: all .15s;
          white-space: nowrap;
        }
        .tsb-landing-dashboard-btn:hover { border-color: #fff; background: rgba(255,255,255,0.1); }

        /* sport cards full-width */
        .tsb-sport-section {
          background: linear-gradient(135deg, #1a3a18 0%, #2d5a27 50%, #1a3a18 100%);
          padding: 20px 0;
          width: 100%;
        }
        .tsb-sport-section-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 24px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        /* content full-width */
        .tsb-landing-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px 24px;
        }

        @media(max-width:900px){
          .tsb-landing-search { max-width: 240px; }
          .tsb-sport-section-inner { grid-template-columns: repeat(2,1fr); gap:8px; }
        }
        @media(max-width:600px){
          .tsb-landing-header-inner { padding: 0 14px; height: 52px; }
          .tsb-landing-brand { font-size: 19px; }
          .tsb-landing-search { max-width: 160px; }
          .tsb-landing-search input { font-size:12px; padding: 6px 28px 6px 28px; }
          .tsb-sport-section-inner { padding: 0 14px; gap: 8px; }
          .tsb-landing-content { padding: 14px; }
        }
      `}</style>

      {/* ── HEADER — full width, brand left, search center, dashboard right ── */}
      <header className="tsb-landing-header">
        <div className="tsb-landing-header-inner">
          <span className="tsb-landing-brand" onClick={() => navigate("/")}>
            TheScoreBoard
          </span>

          <div className="tsb-landing-search">
            <span className="tsb-landing-search-icon">🔍</span>
            <input
              placeholder="Search tournaments, cities…"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setSearchQ(e.target.value);
              }}
            />
            {searchInput && (
              <button className="tsb-landing-search-clear"
                onClick={() => { setSearchInput(""); setSearchQ(""); }}>
                ×
              </button>
            )}
          </div>

          <div className="tsb-landing-nav-right">
            <button
              className="tsb-landing-dashboard-btn"
              onClick={() => navigate(isLoggedIn() ? "/organiser" : "/login")}
            >
              {isLoggedIn() ? "Dashboard" : "Organise →"}
            </button>
          </div>
        </div>
      </header>

      {/* ── SPORT CARDS ── */}
      <div className="tsb-sport-section">
        <div className="tsb-sport-section-inner">
          {SPORTS_CONFIG.map((sport) => {
            const stats      = sportStats[sport.key];
            const liveCount  = stats?.live_count        || 0;
            const tournCount = stats?.tournament_count  || 0;
            return (
              <div
                key={sport.key}
                className="sport-card"
                onClick={() => navigate(`/${sport.url}`)}
                style={{ "--sport-color": sport.color }}
              >
                <div className="sport-card-icon">{sport.icon}</div>
                <div className="sport-card-name">{SPORT_LABELS[sport.key]}</div>
                <div className="sport-card-count">
                  {tournCount > 0
                    ? `${tournCount} tournament${tournCount !== 1 ? "s" : ""}`
                    : "Coming soon"}
                </div>
                {liveCount > 0 && (
                  <div className="sport-card-live">
                    <span className="live-dot" /> {liveCount} live
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── LIVE BANNER ── */}
      {totalLive > 0 && (
        <div className="live-now-bar">
          <span className="live-dot" />
          <span style={{ fontWeight: 800, letterSpacing: 1 }}>
            {totalLive} MATCH{totalLive !== 1 ? "ES" : ""} LIVE NOW
          </span>
        </div>
      )}

      {/* ── CONTENT ── */}
      <div className="tsb-landing-content">
        {!data ? (
          <div className="empty">Loading…</div>
        ) : sports.length === 0 && trending.length === 0 ? (
          <div className="empty">
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏟️</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No tournaments yet</div>
            <div style={{ fontSize: 14, color: "var(--muted)" }}>Be the first to organize one!</div>
          </div>
        ) : (
          <>
            {SPORTS_CONFIG.map((sport) => {
              const sd = sportStats[sport.key];
              if (!sd || sd.tournaments.length === 0) return null;
              return (
                <div key={sport.key} className="sport-section">
                  <div className="sport-section-header">
                    <div className="sport-section-title">
                      <span style={{ fontSize: 20 }}>{sport.icon}</span>
                      <span>{SPORT_LABELS[sport.key]}</span>
                      {sd.live_count > 0 && (
                        <span className="sport-section-live">
                          <span className="live-dot" /> {sd.live_count} live
                        </span>
                      )}
                    </div>
                    <button className="sport-section-more" onClick={() => navigate(`/${sport.url}`)}>
                      View all →
                    </button>
                  </div>
                  <div className="tournament-grid">
                    {sd.tournaments.slice(0, 3).map((t) => (
                      <TournamentCard
                        key={t.tournament_id}
                        tournament={t}
                        onClick={() => navigate(`/${sport.url}/tournament/${t.slug}`)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {trending.length > 0 && sports.length === 0 && (
              <div className="sport-section">
                <div className="sport-section-header">
                  <div className="sport-section-title">
                    <span style={{ fontSize: 20 }}>🏆</span>
                    <span>All Tournaments</span>
                  </div>
                </div>
                <div className="tournament-grid">
                  {trending.map((t) => (
                    <TournamentCard
                      key={t.tournament_id}
                      tournament={t}
                      onClick={() => navigate(`/t/${t.slug}`)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── FAB ── */}
      <button
        className="fab"
        onClick={() => navigate(isLoggedIn() ? "/organiser" : "/register")}
        title="Organize a Tournament"
      >
        <span style={{ fontSize: 20 }}>+</span>
        <span className="fab-label">Organize</span>
      </button>

      <footer className="footer">
        TheScoreBoard — Live tournament scores for every sport
      </footer>
    </div>
  );
}