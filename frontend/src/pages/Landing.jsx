import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getHomepageData, isLoggedIn } from "../api/client";
import TournamentCard, { SPORT_LABELS } from "../components/shared/TournamentCard";

const SPORT_ABBREV = { table_tennis: "🏓", badminton: "🏸", cricket: "🏏", football: "⚽" };

const SPORTS_CONFIG = [
  { key: "football",     url: "football",     color: "#22c55e" },
  { key: "cricket",      url: "cricket",      color: "#D97706" },
  { key: "table_tennis", url: "table-tennis", color: "#FF6B35" },
  { key: "badminton",    url: "badminton",    color: "#38bdf8" },
];

const POLL_INTERVAL = 5000;

export default function Landing() {
  const navigate = useNavigate();
  const [data,  setData]  = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");

  const fetchingRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const d = await getHomepageData();
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  };

  const sports     = data?.sports || [];
  const trending   = data?.trending || [];
  const totalLive  = data?.total_live_matches || 0;
  const sportStats = {};
  sports.forEach(s => { sportStats[s.sport_key] = s; });

  const totalTournaments = sports.reduce((a, s) => a + (s.tournament_count || 0), 0);

  // Deduplicated top 6 tournaments for the showcase grid
  const seenIds = new Set();
  const showcaseTournaments = [...trending, ...sports.flatMap(s => s.tournaments || [])]
    .filter(t => { if (seenIds.has(t.tournament_id)) return false; seenIds.add(t.tournament_id); return true; })
    .slice(0, 6);

  return (
    <div className="app" style={{ minHeight: "100vh" }}>

      {/* ── HEADER ── */}
      <header style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        position: "sticky", top: 0, zIndex: 200,
      }}>
        <div style={{
          maxWidth: 1200, margin: "0 auto", padding: "0 16px",
          height: 60, display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 12,
        }}>
          {/* Brand */}
          <div
            onClick={() => navigate("/")}
            style={{
              fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 900,
              color: "var(--ink)", whiteSpace: "nowrap", cursor: "pointer",
              textTransform: "uppercase", letterSpacing: -0.5, lineHeight: 1, flexShrink: 0,
            }}
          >
            The<span style={{ color: "var(--primary)" }}>Score</span>Board
          </div>

          {/* Right actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {totalLive > 0 && (
              <div className="landing-live-chip" style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "var(--primary)", color: "#fff",
                padding: "5px 12px", borderRadius: 6,
                fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800,
                letterSpacing: 1.5, textTransform: "uppercase",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", animation: "pulse 1.5s infinite", display: "inline-block" }}/>
                {totalLive} Live
              </div>
            )}
            <button onClick={toggleTheme} style={{
              background: "none", border: "1px solid var(--border)",
              borderRadius: 6, width: 34, height: 34, cursor: "pointer",
              color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {theme === "light" ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              )}
            </button>
            <button
              onClick={() => navigate(isLoggedIn() ? "/organiser" : "/login")}
              style={{
                background: isLoggedIn() ? "var(--elevated)" : "var(--primary)",
                color: isLoggedIn() ? "var(--ink)" : "#fff",
                border: "none", borderRadius: 7, padding: "7px 14px",
                fontFamily: "var(--font-body)", fontSize: "clamp(11px,3vw,13px)", fontWeight: 700,
                cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.2s",
              }}
            >
              {isLoggedIn() ? "Dashboard" : "Organise →"}
            </button>
          </div>
        </div>
      </header>


      {/* ── HERO ── */}
      <section className="landing-hero" style={{
        background: "var(--surface)",
        padding: "64px 24px 52px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Decorative background accent */}
        <div style={{
          position: "absolute", top: -80, right: -80,
          width: 400, height: 400, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,107,53,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}/>
        <div style={{
          position: "absolute", bottom: -60, left: -60,
          width: 300, height: 300, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,204,0,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}/>

        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center", position: "relative" }}>
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: "clamp(32px, 6vw, 52px)",
            fontWeight: 900, lineHeight: 1.1, letterSpacing: -2,
            color: "var(--ink)", marginBottom: 20,
            animation: "fadeUp 0.5s ease 0.1s both",
          }}>
            Discover <span style={{ color: "var(--primary)" }}>Live Sports</span>
            <br />Near You
          </h1>

          <p style={{
            fontSize: 17, color: "var(--muted)", lineHeight: 1.7, marginBottom: 36,
            maxWidth: 520, margin: "0 auto 36px",
            animation: "fadeUp 0.5s ease 0.2s both",
          }}>
            Find local tournaments, register to play, and follow live scores — all in one place.
          </p>

          {/* CTA buttons */}
          <div style={{ animation: "fadeUp 0.5s ease 0.3s both" }}>
            <button
              onClick={() => navigate(isLoggedIn() ? "/organiser" : "/register")}
              style={{
                background: "var(--primary)", color: "#fff",
                border: "none", borderRadius: 9, padding: "14px 36px",
                fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: 0.5, cursor: "pointer",
                boxShadow: "0 4px 20px rgba(255,107,53,0.35)", transition: "all 0.2s",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(255,107,53,0.45)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(255,107,53,0.35)"; }}
            >
              {isLoggedIn() ? "Go to Dashboard" : "Organise a Tournament →"}
            </button>
          </div>
        </div>
      </section>

      {/* ── TOURNAMENTS SHOWCASE ── */}
      <section style={{
        padding: "48px 24px",
        background: "var(--surface)",
        borderTop: "2px solid var(--border)",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: "clamp(20px,3vw,28px)",
                fontWeight: 900, color: "var(--ink)", letterSpacing: -1,
              }}>
                {totalLive > 0 ? "Live & Featured" : "Featured Tournaments"}
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                {totalLive > 0 ? `${totalLive} matches in progress` : "Upcoming events near you"}
              </div>
            </div>
            <button
              onClick={() => navigate("/")}
              style={{
                background: "none", border: "1px solid var(--border)",
                color: "var(--muted)", borderRadius: 6, padding: "7px 16px",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: 1,
                transition: "all 0.2s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--primary)"; e.currentTarget.style.borderColor = "var(--primary)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
            >
              View All →
            </button>
          </div>

          {!data ? (
            /* Skeleton loading state */
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ borderRadius: 12, overflow: "hidden", border: "2px solid var(--border)" }}>
                  <div className="skeleton" style={{ height: 6 }}/>
                  <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div className="skeleton" style={{ height: 12, width: "40%" }}/>
                    <div className="skeleton" style={{ height: 20, width: "70%" }}/>
                    <div className="skeleton" style={{ height: 12, width: "55%" }}/>
                    <div className="skeleton" style={{ height: 12, width: "45%", marginTop: 4 }}/>
                  </div>
                </div>
              ))}
            </div>
          ) : showcaseTournaments.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ width: 48, height: 48, borderRadius: 8, background: "var(--elevated)", margin: "0 auto 16px", opacity: 0.3 }} />
              <div style={{
                fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900,
                textTransform: "uppercase", letterSpacing: -0.5, color: "var(--ink)", marginBottom: 8,
              }}>No Tournaments Yet</div>
              <p style={{ color: "var(--muted)", fontSize: 13 }}>Be the first to organize one!</p>
              <button
                onClick={() => navigate(isLoggedIn() ? "/organiser" : "/register")}
                style={{
                  marginTop: 20, background: "var(--primary)", color: "#fff",
                  border: "none", borderRadius: 8, padding: "12px 24px",
                  fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800,
                  textTransform: "uppercase", letterSpacing: 1, cursor: "pointer",
                }}
              >
                Get Started →
              </button>
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))",
              gap: 16,
            }}>
              {showcaseTournaments.map(t => (
                <TournamentCard
                  key={t.tournament_id}
                  tournament={t}
                  onClick={() => navigate(`/t/${t.slug}`)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── SPORTS GRID ── */}
      <section style={{ padding: "48px 24px", background: "var(--bg)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: "clamp(22px,3vw,30px)",
              fontWeight: 900, color: "var(--ink)", letterSpacing: -1,
            }}>Browse by Sport</div>
            <div style={{ color: "var(--muted)", fontSize: 14, marginTop: 6 }}>
              Pick your game and find tournaments nearby
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            {SPORTS_CONFIG.map(sport => {
              const stats      = sportStats[sport.key];
              const tournCount = stats?.tournament_count || 0;
              const liveCount  = stats?.live_count || 0;
              return (
                <div key={sport.key} onClick={() => navigate(`/${sport.url}`)}
                  style={{
                    background: "var(--surface)", border: "2px solid var(--border)",
                    borderTop: `3px solid ${sport.color}`,
                    borderRadius: 12, padding: "28px 20px",
                    textAlign: "center", cursor: "pointer",
                    transition: "all 0.25s", position: "relative", overflow: "hidden",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(0,0,0,0.1)"; e.currentTarget.style.borderColor = sport.color; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "var(--border)"; }}
                >
                  <div style={{
                    width: 48, height: 48, borderRadius: 10,
                    background: sport.color, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 900,
                    margin: "0 auto 10px", letterSpacing: -0.5,
                  }}>
                    {SPORT_ABBREV[sport.key] || sport.key.slice(0,2).toUpperCase()}
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink)", marginBottom: 6 }}>
                    {SPORT_LABELS[sport.key]}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {tournCount > 0 ? `${tournCount} tournament${tournCount !== 1 ? "s" : ""}` : "Coming soon"}
                  </div>
                  {liveCount > 0 && (
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 10, fontWeight: 800, color: "var(--primary)", textTransform: "uppercase", letterSpacing: 1 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary)", animation: "pulse 1.5s infinite", display: "inline-block" }}/>
                      {liveCount} live
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        background: "var(--elevated)", borderTop: "2px solid var(--border)",
        padding: "40px 24px 28px",
      }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto",
          display: "grid", gap: 40,
        }} className="landing-footer-content">
          <div>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 900,
              textTransform: "uppercase", letterSpacing: -0.5, marginBottom: 12,
              color: "var(--ink)",
            }}>
              The<span style={{ color: "var(--primary)" }}>Score</span>Board
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.8, marginBottom: 0 }}>
              Live tournament scores for every sport. Built for communities, trusted by organizers.
            </p>
          </div>
          {[
            {
              title: "For Players",
              links: [
                { label: "Find Tournaments", action: () => {} },
                { label: "Register to Play", action: () => {} },
                { label: "Live Scores",      action: () => {} },
              ],
            },
            {
              title: "For Organizers",
              links: [
                { label: "Create Tournament", action: () => navigate(isLoggedIn() ? "/organiser" : "/login") },
                { label: "Dashboard",         action: () => navigate(isLoggedIn() ? "/organiser" : "/login") },
                { label: "How It Works",      action: () => {} },
              ],
            },
            {
              title: "Sports",
              links: SPORTS_CONFIG.map(s => ({ label: SPORT_LABELS[s.key], action: () => navigate(`/${s.url}`) })),
            },
          ].map(col => (
            <div key={col.title} className="footer-col">
              <h4>{col.title}</h4>
              {col.links.map(l => (
                <a key={l.label} onClick={l.action} style={{ cursor: "pointer" }}>{l.label}</a>
              ))}
            </div>
          ))}
        </div>
        <div style={{
          maxWidth: 1100, margin: "24px auto 0", paddingTop: 20,
          borderTop: "1px solid var(--border)", textAlign: "center",
          color: "var(--muted)", fontSize: 12,
        }}>
          © {new Date().getFullYear()} TheScoreBoard · Built for sports communities
        </div>
      </footer>

      {/* ── FAB (mobile organise button) ── */}
      <button
        onClick={() => navigate(isLoggedIn() ? "/organiser" : "/register")}
        style={{
          position: "fixed", bottom: 24, right: 20, zIndex: 100,
          alignItems: "center", gap: 8,
          background: "var(--primary)", color: "#fff",
          border: "none", borderRadius: 50, padding: "13px 22px",
          fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800,
          textTransform: "uppercase", letterSpacing: 1,
          boxShadow: "0 4px 20px rgba(255,107,53,0.5)", cursor: "pointer",
          transition: "all 0.2s",
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.05)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "none"; }}
        className="fab-hide-desktop"
      >
        + Organise
      </button>
    </div>
  );
}
