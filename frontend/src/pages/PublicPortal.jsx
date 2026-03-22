import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getTournaments, getMatches, getParticipants } from "../api/client";

const POLL_INTERVAL = 5000;
const INSTAGRAM_HANDLE = "mary_matha_youth";

function getP1(m) { return m.participants?.find(p => p.position === 1); }
function getP2(m) { return m.participants?.find(p => p.position === 2); }
function bucket(s) {
  if (s === "live") return "live";
  if (s === "done" || s === "completed") return "done";
  return "upcoming";
}
// Player category tag
function playerCategoryTag(player, groupName) {
  if (!player) return null;
  const sg = player.sub_group;
  if (groupName === "Group D" && sg) {
    return (
      <span style={{
        fontSize: 9, fontWeight: 700, marginLeft: 4,
        background: sg === "women" ? "#fde8f0" : "#e8f0fd",
        color: sg === "women" ? "#c0392b" : "#2d5a27",
        padding: "1px 4px", borderRadius: 3,
      }}>
        {sg === "boys" ? "U18" : "W"}
      </span>
    );
  }
  return null;
}

function getServe(s1, s2) {
  const total = s1 + s2, isDeuce = s1 >= 10 && s2 >= 10;
  if (isDeuce) return total % 2 === 0 ? 1 : 2;
  return Math.floor(total / 2) % 2 === 0 ? 1 : 2;
}

// Returns first name only for scorecard display
function firstName(fullName) {
  if (!fullName) return fullName;
  return fullName.split(" ")[0];
}

const GROUP_LABELS = {
  "Group A": "Men Under 30",
  "Group B": "Men Under 30",
  "Group C": "Men 30+",
  "Group D": "Boys U18 & Women",
};

function activeSet(m) { return (m.sets ?? []).find(s => s.winner_position === null); }
function completedSets(m) {
  return (m.sets ?? []).filter(s => s.winner_position !== null).sort((a,b) => a.set_number - b.set_number);
}

// ── Responsive hook ───────────────────────────────────────────
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(typeof window !== "undefined" && window.innerWidth >= 900);
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 900);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isDesktop;
}

export default function PublicPortal() {
  const location = useLocation();
  const navigate  = useNavigate();
  const validTabs = ["live", "schedule", "groups"];
  const hashTab   = location.hash.replace("#", "");
  const isDesktop = useIsDesktop();

  const [tournaments, setTournaments] = useState([]);
  const [activeTId, setActiveTId]     = useState(null);
  const [matches, setMatches]         = useState([]);
  const [groups, setGroups]           = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    getTournaments().then(ts => {
      const list = Array.isArray(ts) ? ts : [];
      setTournaments(list);
      const active = list.find(t => t.is_active) || list[0];
      if (active) setActiveTId(active.tournament_id);
    }).catch(console.error);
  }, []);

  const fetchAll = useCallback(async () => {
    if (!activeTId) return;
    try {
      const [m, g] = await Promise.all([getMatches(activeTId), getParticipants(activeTId)]);
      setMatches(Array.isArray(m) ? m : []);
      setGroups(Array.isArray(g) ? g : []);
      setLastUpdated(new Date());
    } catch (e) { console.error(e); }
  }, [activeTId]);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchAll]);

  const liveMatches      = matches.filter(m => bucket(m.status) === "live");

  // If no matches are currently live, show the most recently completed group/KO matches
  // as winner cards — they stay visible until the next match goes live.
  // We find the last "batch" by taking done matches sorted by match_id descending,
  // then include all done matches from the same round+group as the most recent one.
  const recentlyDoneCards = (() => {
    if (liveMatches.length > 0) return [];
    const done = matches
      .filter(m => (m.status === "done" || m.status === "completed") && m.stage !== "bye")
      .sort((a, b) => b.match_id - a.match_id);
    if (!done.length) return [];
    const latest = done[0];
    // Show all done matches from same round & group (or same stage for KO)
    return done.filter(m =>
      m.round === latest.round &&
      m.group_id === latest.group_id &&
      m.stage === latest.stage
    );
  })();

  // What we actually show in the live tab cards area
  const displayMatches = liveMatches.length > 0 ? liveMatches : recentlyDoneCards;
  const totalPlayers     = groups.reduce((s, g) => s + g.players.length, 0);
  const activeTournament = tournaments.find(t => t.tournament_id === activeTId);
  const groupMatches     = matches.filter(m => m.stage === "group");
  const byeMatches       = matches.filter(m => m.stage === "bye");
  const koMatches        = matches.filter(m => m.stage !== "group" && m.stage !== "bye");

  // Stay on live tab if there are live OR recently completed matches to display
  const defaultTab = displayMatches.length > 0 ? "live" : "schedule";
  const tab = validTabs.includes(hashTab) ? hashTab : defaultTab;
  const setTab = (t) => navigate(`/#${t}`, { replace: true });

  return (
    <div className="app" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>

      <header className="header">
        <div className="header-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src="/mmylogo.png" alt="logo"
              onError={e => { e.target.style.display = "none"; }}
              style={{ width: 52, height: 52, objectFit: "cover", borderRadius: "50%", flexShrink: 0, border: "2px solid rgba(255,255,255,0.3)" }} />
            <div>
              <div className="header-sub">🏓 Mary Matha Youth</div>
              <h1 className="header-title">{activeTournament?.name || "Table Tennis Open"}</h1>
            </div>
          </div>
          {/* Right side — Instagram + LIVE badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <a
              href="https://www.instagram.com/mary_matha_youth"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)",
                borderRadius: 8, padding: "6px 12px",
                textDecoration: "none", color: "#fff",
                fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
                flexShrink: 0,
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              @mary_matha_youth
            </a>
            {liveMatches.length > 0 && (
              <div className="live-badge"><span className="live-dot" /> LIVE</div>
            )}
          </div>
        </div>
      </header>

      {tournaments.length > 1 && (
        <div style={{ background: "#fff", borderBottom: "1.5px solid #cfc0a0", padding: "8px 16px" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {tournaments.map(t => (
              <button key={t.tournament_id} onClick={() => setActiveTId(t.tournament_id)} style={{
                padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600,
                background: activeTId === t.tournament_id ? "#2d5a27" : "transparent",
                color:      activeTId === t.tournament_id ? "#fff"    : "#6b4c2a",
                border:     `1.5px solid ${activeTId === t.tournament_id ? "#2d5a27" : "#cfc0a0"}`,
              }}>{t.name}</button>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: "#fff", borderBottom: "1.5px solid #cfc0a0" }}>
        <div style={{ padding: "10px 16px",
                      display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <Stat label="Players"   value={totalPlayers} />
          <Stat label="Matches"   value={matches.length} />
          <Stat label="Live"      value={liveMatches.length} color="#c0392b" />
          <Stat label="Completed" value={matches.filter(m => bucket(m.status) === "done").length} color="#2d5a27" />
        </div>
      </div>

      <div style={{ background: "#e8dfc8", borderBottom: "2px solid #cfc0a0" }}>
        <div className="tabs" style={{ background: "transparent", borderBottom: "none", margin: 0 }}>
          <button className={`tab ${tab === "live" ? "tab-active" : ""}`} onClick={() => setTab("live")}>
            Live
            {liveMatches.length > 0 && (
              <span style={{ marginLeft: 5, background: "#c0392b", color: "#fff",
                             borderRadius: 8, padding: "1px 6px", fontSize: 10, fontWeight: 800 }}>
                {liveMatches.length}
              </span>
            )}
          </button>
          {[["schedule", "Schedule"], ["groups", "Groups"]].map(([t, label]) => (
            <button key={t} className={`tab ${tab === t ? "tab-active" : ""}`} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="content" style={{ flex: 1 }}>

        {tab === "live" && (
          <div>
            {displayMatches.length === 0 ? (
              <div>
                <TournamentResults matches={matches} />
                <div className="empty" style={{ paddingTop: 32 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🏓</div>
                  <div style={{ fontWeight: 700, color: "#2d5a27", fontSize: 16 }}>No live matches right now</div>
                  <div style={{ color: "#7a6a50", fontSize: 13, marginTop: 6 }}>Check the Schedule tab for upcoming matches</div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: isDesktop ? "row" : "column", gap: 24, alignItems: "flex-start" }}>
                <div style={{
                  flex: 1, minWidth: 0,
                  display: "grid",
                  gridTemplateColumns: isDesktop && displayMatches.length > 1
                    ? `repeat(${Math.min(displayMatches.length, 2)}, 1fr)`
                    : "1fr",
                  gap: 16,
                }}>
                  {displayMatches.map(m => (
                    <LiveCard key={m.match_id} m={m} groups={groups} />
                  ))}
                </div>
                {isDesktop && <UpcomingPanel matches={matches} groups={groups} />}
              </div>
            )}
          </div>
        )}

        {tab === "schedule" && (
          <div>
            {matches.length === 0 ? (
              <div className="empty">No matches scheduled yet.</div>
            ) : (
              <>
                {/* KO stages first: Final → SF → QF */}
                {koMatches.length > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{
                      fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, fontWeight: 800,
                      letterSpacing: 3, color: "#d4a017", textTransform: "uppercase",
                      margin: "0 0 12px", display: "flex", alignItems: "center", gap: 10,
                    }}>
                      🏆 Knockout Stage
                      <span style={{ flex: 1, height: 1, background: "#cfc0a0", display: "block" }} />
                    </div>
                    {["final", "third", "semi", "quarter"].map(stage => {
                      const sm = koMatches.filter(m => m.stage === stage);
                      if (!sm.length) return null;
                      const stageName = stage === "final" ? "🏆 Final" : stage === "third" ? "🥉 3rd Place" : stage === "semi" ? "Semi Finals" : "Quarter Finals";
                      const live     = sm.filter(m => bucket(m.status) === "live");
                      const upcoming = sm.filter(m => bucket(m.status) === "upcoming").sort((a,b) => a.match_id - b.match_id);
                      const done     = sm.filter(m => bucket(m.status) === "done").sort((a,b) => b.match_id - a.match_id);
                      return <Section key={stage} label={stageName} matches={[...live, ...upcoming, ...done]} />;
                    })}
                  </div>
                )}
                {/* Group stage below KO */}
                {groups.map(g => {
                  const gm    = groupMatches.filter(m => m.group_id === g.group_id);
                  const gbyes = byeMatches.filter(m => m.group_id === g.group_id);
                  if (gm.length === 0 && gbyes.length === 0) return null;

                  // Group by round
                  const roundNums = [...new Set([...gm, ...gbyes].map(m => m.round ?? 1))].sort((a,b)=>a-b);

                  return (
                    <div key={g.group_id} style={{ marginBottom: 28 }}>
                      <GroupHeader group={g} matches={gm} />
                      {roundNums.map(round => {
                        const rm    = gm.filter(m => (m.round ?? 1) === round);
                        const rbyes = gbyes.filter(m => (m.round ?? 1) === round);
                        const live     = rm.filter(m => bucket(m.status) === "live");
                        const upcoming = rm.filter(m => bucket(m.status) === "upcoming").sort((a,b) => a.match_id - b.match_id);
                        const done     = rm.filter(m => bucket(m.status) === "done").sort((a,b) => b.match_id - a.match_id);
                        return (
                          <div key={round} style={{ marginBottom: 12 }}>
                            <div style={{
                              fontSize: 11, fontWeight: 800, color: "#7a6a50",
                              letterSpacing: 2, textTransform: "uppercase",
                              marginBottom: 6, paddingLeft: 2,
                            }}>Round {round}</div>
                            <Section label={g.group_name} matches={[...live, ...upcoming, ...done, ...rbyes]} />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {(() => {
                      const finalMatch = koMatches.find(m => m.stage === "final" && (m.status === "done" || m.status === "completed"));
                      const champion   = finalMatch?.participants?.find(p => p.is_winner);
                      if (!champion) return null;
                      return (
                        <div style={{ textAlign: "center", padding: "28px 16px", background: "#fdf6e0",
                                      borderRadius: 12, border: "2px solid #d4a017", marginTop: 20,
                                      maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
                          <div style={{ fontSize: 44 }}>🏆</div>
                          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 28,
                                        fontWeight: 900, color: "#d4a017", letterSpacing: 2 }}>CHAMPION</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1208", marginTop: 6 }}>
                            {champion.player?.name}
                          </div>
                        </div>
                      );
                    })()}
              </>
            )}
          </div>
        )}

        {tab === "groups" && (
          <div>
            {groups.length === 0 ? (
              <div className="empty">No groups set up yet.</div>
            ) : (
              groups.map(g => {
                if (g.players.length === 0) return null;
                return (
                  <div key={g.group_id} style={{ marginBottom: 28 }}>
                    <GroupHeader group={g} showCount />
                    <div className="player-grid-desktop">
                      {g.players.map((p, i) => (
                        <div key={p.player_id ?? i} className="player-card">
                          <div className="player-num">#{String(i+1).padStart(2,"0")}</div>
                          <div className="player-name">{p.name}</div>
                          <div className="player-club">{p.gender ?? ""}{p.age ? `, ${p.age}y` : ""}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

     <footer style={{ borderTop: "3px solid #d4a017" }}>

  {/* Main sponsor bar */}
  <div style={{ background: "#2d5a27", display: "flex", alignItems: "stretch", overflow: "hidden", flexWrap: "wrap", minHeight: 110 }}>

    {/* Photo */}
    <div style={{ width: "clamp(80px, 9vw, 120px)", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.2)" }}>
      <img src="/sponsortt.png" alt="C.F. Joyson"
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }}
        onError={e => e.target.style.display = "none"} />
    </div>

    {/* Name block */}
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 24px 16px 20px", flexShrink: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 4, color: "#d4a017", textTransform: "uppercase", marginBottom: 4, opacity: 0.85 }}>Title Sponsor</div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(28px, 3.5vw, 44px)", fontWeight: 900, color: "#fff", letterSpacing: 1, lineHeight: 1 }}>C.F. Joyson</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 600, marginTop: 4 }}>Life Planner &amp; Insurance Advisor</div>
      <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
        {["TATA AIA Life", "Star Health"].map(s => (
          <span key={s} style={{ fontSize: 9, fontWeight: 700, color: "#d4a017", background: "rgba(212,160,23,0.12)", border: "1px solid rgba(212,160,23,0.3)", padding: "2px 8px", borderRadius: 20, letterSpacing: 0.5 }}>{s}</span>
        ))}
      </div>
    </div>

    {/* Vertical divider */}
    <div style={{ width: 1, background: "rgba(255,255,255,0.08)", alignSelf: "stretch", flexShrink: 0 }} />

    {/* Contact details — fills the centre */}
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 24px", gap: 32, flexWrap: "wrap" }}>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(212,160,23,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 15 }}>📞</span>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#d4a017", letterSpacing: 0.5 }}>9323983926</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>93244 48154</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(212,160,23,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 15 }}>✉️</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>cfjoyson@gmail.com</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(212,160,23,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 15 }}>🌐</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>cfjoyson.tataaiapartner.com</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(212,160,23,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 15 }}>🛡️</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>Life · Health · General Insurance</div>
        </div>
      </div>

    </div>

    {/* Vertical divider */}
    <div style={{ width: 1, background: "rgba(255,255,255,0.08)", alignSelf: "stretch", flexShrink: 0 }} />

    {/* Stats */}
    <div style={{ display: "flex", alignItems: "center", padding: "0 8px", flexShrink: 0 }}>
      {[["700+", "Happy Clients"], ["450+", "Claims Settled"], ["15+", "Yrs Experience"]].map(([num, label]) => (
        <div key={num} style={{ textAlign: "center", padding: "10px 20px", borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(22px, 2.5vw, 34px)", fontWeight: 900, color: "#d4a017", lineHeight: 1 }}>{num}</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1.5, marginTop: 3 }}>{label}</div>
        </div>
      ))}
    </div>
  </div>

  {/* Ticker */}
  <div style={{ background: "#e8dfc8", borderTop: "1.5px solid #cfc0a0", overflow: "hidden", position: "relative", padding: "8px 0" }}>
    <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 40, zIndex: 2, pointerEvents: "none", background: "linear-gradient(to right, #e8dfc8, transparent)" }} />
    <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 40, zIndex: 2, pointerEvents: "none", background: "linear-gradient(to left, #e8dfc8, transparent)" }} />
    <div style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", animation: "sponsorTicker 22s linear infinite" }}>
      {[0, 1].map(copy => (
        <span key={copy} style={{ display: "inline-flex", alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "0 28px", fontSize: 12, fontWeight: 600, color: "#7a6a50" }}>📞 <strong style={{ color: "#2d5a27" }}>9323983926</strong> / 93244 48154</span>
          <span style={{ color: "#d4a017", fontSize: 10 }}>✦</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "0 28px", fontSize: 12, fontWeight: 600, color: "#7a6a50" }}>✉️ <strong style={{ color: "#2d5a27" }}>cfjoyson@gmail.com</strong></span>
          <span style={{ color: "#d4a017", fontSize: 10 }}>✦</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "0 28px", fontSize: 12, fontWeight: 600, color: "#7a6a50" }}>🌐 <strong style={{ color: "#2d5a27" }}>cfjoyson.tataaiapartner.com</strong></span>
          <span style={{ color: "#d4a017", fontSize: 10 }}>✦</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "0 28px", fontSize: 12, fontWeight: 600, color: "#7a6a50" }}>🛡️ TATA AIA Life · Star Health · General Insurance</span>
          <span style={{ color: "#d4a017", fontSize: 10 }}>✦</span>
        </span>
      ))}
    </div>
  </div>

  <style>{`@keyframes sponsorTicker { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
</footer>
    </div>
  );
}

// ── UpcomingPanel — desktop only right column ─────────────────
function UpcomingPanel({ matches, groups }) {
  const scheduled = matches
    .filter(m => m.status === "scheduled" || m.status === "upcoming")
    .sort((a, b) => a.match_id - b.match_id);

  // Next 2 from table 1, next 2 from table 2
  const t1 = scheduled.filter(m => m.table_number === 1).slice(0, 2);
  const t2 = scheduled.filter(m => m.table_number === 2).slice(0, 2);
  // Interleave: t1[0], t2[0], t1[1], t2[1] so tables alternate
  const upcoming = [t1[0], t2[0], t1[1], t2[1]].filter(Boolean);

  if (!upcoming.length) return null;
  return (
    <div style={{
      width: 280, flexShrink: 0,
      background: "#faf7f2", border: "1.5px solid #e8dfc8",
      borderRadius: 12, padding: 16,
      position: "sticky", top: 16,
      maxHeight: "calc(100vh - 180px)", overflowY: "auto",
    }}>
      <div style={{
        fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, fontWeight: 800,
        letterSpacing: 3, color: "#6b4c2a", textTransform: "uppercase",
        marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid #e8dfc8",
      }}>⏳ Up Next</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {upcoming.map(m => {
          const p1 = getP1(m); const p2 = getP2(m);
          const group = groups?.find(g => g.group_id === m.group_id);
          const stageLabel = m.stage === "quarter" ? "QF" : m.stage === "semi" ? "SF"
                           : m.stage === "final" ? "Final" : m.stage === "third" ? "3rd" : `R${m.round}`;
          return (
            <div key={m.match_id} style={{ background: "#fff", borderRadius: 8, border: "1.5px solid #e8dfc8", padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: "#6b4c2a", background: "#f5f0e8", padding: "2px 6px", borderRadius: 3, letterSpacing: 1, textTransform: "uppercase" }}>{stageLabel}</span>
                {m.table_number && <span style={{ fontSize: 9, fontWeight: 700, color: "#d4a017", background: "#fdf6e0", padding: "2px 6px", borderRadius: 3, border: "1px solid #e8d08a" }}>Table {m.table_number}</span>}
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1208", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{firstName(p1?.player?.name) ?? "?"}</span>
                <span style={{ fontSize: 10, color: "#bbb", flexShrink: 0 }}>vs</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>{firstName(p2?.player?.name) ?? "?"}</span>
              </div>
              {group && <div style={{ fontSize: 10, color: "#7a6a50", marginTop: 3 }}>{group.group_name}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── LiveCard — CHANGE 2: bigger fonts + CHANGE 3: match winner banner ─────────
function LiveCard({ m, groups }) {
  const p1 = getP1(m); const p2 = getP2(m);
  const active    = activeSet(m);
  const completed = completedSets(m);
  const setsWonP1 = completed.filter(s => s.winner_position === 1).length;
  const setsWonP2 = completed.filter(s => s.winner_position === 2).length;
  const liveP1        = active?.score_p1 ?? 0;
  const liveP2        = active?.score_p2 ?? 0;
  const currentSetNum = completed.length + 1;
  const p1FullName    = p1?.player?.name ?? "Player 1";
  const p2FullName    = p2?.player?.name ?? "Player 2";
  const p1Name        = firstName(p1FullName);   // first name only for scorecard
  const p2Name        = firstName(p2FullName);

  // Match winner detection — use is_winner for done matches, sets count for live
  const setsToWin    = m.sets_to_win ?? 2;
  const isDoneMatch  = m.status === "done" || m.status === "completed";
  const matchWinner  = isDoneMatch
    ? (p1?.is_winner ? 1 : p2?.is_winner ? 2 : null)
    : (setsWonP1 >= setsToWin ? 1 : setsWonP2 >= setsToWin ? 2 : null);
  const matchWinName = matchWinner === 1 ? p1FullName : matchWinner === 2 ? p2FullName : null;

  const serving = (() => {
    if (m.current_server != null) return m.current_server;
    const total = liveP1 + liveP2;
    const setFirstServer = currentSetNum % 2 === 1 ? 1 : 2;
    if (liveP1 >= 10 && liveP2 >= 10) {
      return (total - 20) % 2 === 0 ? setFirstServer : (setFirstServer === 1 ? 2 : 1);
    }
    return Math.floor(total / 2) % 2 === 0 ? setFirstServer : (setFirstServer === 1 ? 2 : 1);
  })();

  const hasWinner = (a, b) => (a===7&&b===0)||(b===7&&a===0)||(a>=11&&a-b>=2)||(b>=11&&b-a>=2);
  const isAtDeuce  = liveP1 >= 10 && liveP2 >= 10 && liveP1 === liveP2 && !hasWinner(liveP1, liveP2);
  const isAdv      = liveP1 >= 10 && liveP2 >= 10 && liveP1 !== liveP2 && !hasWinner(liveP1, liveP2);
  const advName    = isAdv ? (liveP1 > liveP2 ? p1Name : p2Name) : null;
  const setWon     = hasWinner(liveP1, liveP2);
  const setWinName = setWon ? (liveP1 > liveP2 ? p1Name : p2Name) : null;

  const group = groups?.find(g => g.group_id === m.group_id);
  const stageLine = (() => {
    if (m.stage === "quarter") return "Quarter Final";
    if (m.stage === "semi")    return "Semi Final";
    if (m.stage === "final")   return "Final";
    if (m.stage === "third")   return "3rd Place";
    return group?.group_name ?? "Group Stage";
  })();

  return (
    <div style={{ background: "#fff",
                  border: `2px solid ${matchWinner ? "#d4a017" : "#c0392b"}`,
                  borderRadius: 14, overflow: "hidden",
                  boxShadow: `0 4px 20px ${matchWinner ? "rgba(212,160,23,0.2)" : "rgba(192,57,43,0.1)"}`,
                  marginBottom: 16,
                  maxWidth: 680, width: "100%", margin: "0 auto 16px" }}>

      {/* Header bar */}
      <div style={{ background: matchWinner ? "#d4a017" : "#c0392b", padding: "8px 12px",
                    display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {matchWinner
            ? <span style={{ fontSize: 16 }}>🏆</span>
            : <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", display: "inline-block", animation: "blink 1.2s infinite" }} />}
          <span style={{ color: "#fff", fontSize: 12, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }}>
            {matchWinner ? "Match Over" : "Live"}
          </span>
          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 700 }}>· {stageLine}</span>
        </div>
        {m.table_number && (
          <span style={{ color: "#fff", fontSize: 13, fontWeight: 800,
                         background: "rgba(255,255,255,0.2)", padding: "3px 10px", borderRadius: 4 }}>
            Table {m.table_number}
          </span>
        )}
      </div>

      {/* CHANGE 3: Match winner banner — stays on screen until next match starts */}
      {matchWinner && (
        <div style={{ background: "linear-gradient(135deg,#fdf6e0,#fff8e8)",
                      padding: "18px 12px", textAlign: "center", borderBottom: "1px solid #e8d08a" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#d4a017",
                        letterSpacing: 3, textTransform: "uppercase", marginBottom: 8 }}>🏆 Winner</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif",
                        fontSize: "clamp(36px, 6vw, 68px)", fontWeight: 900, color: "#1a1208", lineHeight: 1 }}>
            {matchWinName}
          </div>
          <div style={{ fontSize: 14, color: "#7a6a50", marginTop: 10, fontWeight: 600 }}>
            {setsWonP1}–{setsWonP2} sets
            {completed.length > 0 && (
              <span style={{ marginLeft: 10 }}>
                ({completed.map(s => `${s.score_p1}-${s.score_p2}`).join(", ")})
              </span>
            )}
          </div>
        </div>
      )}

      {/* Sets scoreboard — centred, not full-width */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center",
                    gap: 24, padding: "14px 16px 0" }}>
        <div style={{ textAlign: "center", minWidth: 60 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif",
                        fontSize: "clamp(36px, 4vw, 60px)", fontWeight: 900, lineHeight: 1,
                        color: matchWinner === 1 ? "#d4a017" : setsWonP1 > setsWonP2 ? "#2d5a27" : "#ccc" }}>
            {setsWonP1}
          </div>
          <div style={{ fontSize: 11, color: "#7a6a50", fontWeight: 900, textTransform: "uppercase", letterSpacing: 2 }}>SETS</div>
        </div>
        <div style={{ fontSize: 13, color: "#4a3a28", fontWeight: 900, letterSpacing: 2,
                      textTransform: "uppercase", padding: "0 16px", textAlign: "center", minWidth: 80 }}>
          {matchWinner ? "Final" : `Set ${currentSetNum}`}
        </div>
        <div style={{ textAlign: "center", minWidth: 60 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif",
                        fontSize: "clamp(36px, 4vw, 60px)", fontWeight: 900, lineHeight: 1,
                        color: matchWinner === 2 ? "#d4a017" : setsWonP2 > setsWonP1 ? "#2d5a27" : "#ccc" }}>
            {setsWonP2}
          </div>
          <div style={{ fontSize: 11, color: "#7a6a50", fontWeight: 900, textTransform: "uppercase", letterSpacing: 2 }}>SETS</div>
        </div>
      </div>

      {/* CHANGE 2: Point scores — much bigger fonts, hidden when match over */}
      {!matchWinner && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr",
                      alignItems: "center", padding: "16px 4px 20px", gap: 0 }}>
          {/* P1 */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(24px, 3.5vw, 48px)", fontWeight: 900, marginBottom: 8,
                          color: serving === 1 ? "#2d5a27" : "#1a1208",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                          letterSpacing: 2, textTransform: "uppercase" }}>
              {serving === 1 && <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#2d5a27", display: "inline-block", flexShrink: 0 }} />}
              {p1Name}
            </div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, lineHeight: 1,
                          fontSize: "clamp(80px, 11vw, 160px)", color: "#1a1208" }}>
              {liveP1}
            </div>
          </div>

          {/* Centre */}
          <div style={{ textAlign: "center", minWidth: 56 }}>
            <div style={{ color: "#cfc0a0", fontSize: 28, fontWeight: 300 }}>–</div>
            {isAtDeuce  && <div style={{ fontSize: 11, color: "#c0392b", fontWeight: 800, marginTop: 8, textTransform: "uppercase", letterSpacing: 1 }}>Deuce</div>}
            {isAdv      && <div style={{ fontSize: 10, color: "#d4a017", fontWeight: 800, marginTop: 8, textTransform: "uppercase", letterSpacing: 1, lineHeight: 1.3 }}>Adv.<br/>{advName}</div>}
            {setWinName && <div style={{ fontSize: 10, color: "#2d5a27", fontWeight: 800, marginTop: 8, textTransform: "uppercase", letterSpacing: 1, lineHeight: 1.3 }}>{setWinName}<br/>wins set</div>}
            {!isAtDeuce && !isAdv && !setWinName && <div style={{ fontSize: 10, color: "#aaa", fontWeight: 600, marginTop: 6, textTransform: "uppercase", letterSpacing: 1 }}>pts</div>}
          </div>

          {/* P2 */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(24px, 3.5vw, 48px)", fontWeight: 900, marginBottom: 8,
                          color: serving === 2 ? "#2d5a27" : "#1a1208",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                          letterSpacing: 2, textTransform: "uppercase" }}>
              {p2Name}
              {serving === 2 && <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#2d5a27", display: "inline-block", flexShrink: 0 }} />}
            </div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, lineHeight: 1,
                          fontSize: "clamp(80px, 11vw, 160px)", color: "#1a1208" }}>
              {liveP2}
            </div>
          </div>
        </div>
      )}

      {/* Player names when match over — winner bold, loser crossed out */}
      {matchWinner && (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 32px 20px" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: matchWinner === 1 ? "#1a1208" : "#bbb",
                         textDecoration: matchWinner === 2 ? "line-through" : "none" }}>{p1Name}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: matchWinner === 2 ? "#1a1208" : "#bbb",
                         textDecoration: matchWinner === 1 ? "line-through" : "none" }}>{p2Name}</span>
        </div>
      )}

      {/* Completed set history */}
      {completed.length > 0 && (
        <div style={{ borderTop: "1px solid #f0e8d8", padding: "8px 16px",
                      display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap",
                      background: "#faf7f2" }}>
          {completed.map((s, i) => {
            const w = s.winner_position;
            return (
              <span key={i} style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px",
                                     borderRadius: 5, background: "#fff", border: "1px solid #e8dfc8", color: "#7a6a50" }}>
                <span style={{ fontSize: 10, color: "#bbb", marginRight: 3 }}>S{s.set_number}</span>
                <span style={{ color: w===1 ? "#2d5a27" : "#bbb" }}>{s.score_p1}</span>
                <span style={{ color: "#ddd", margin: "0 2px" }}>–</span>
                <span style={{ color: w===2 ? "#2d5a27" : "#bbb" }}>{s.score_p2}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── GroupHeader ───────────────────────────────────────────────
function GroupHeader({ group, matches = [], showCount = false }) {
  const live = matches.filter(m => m.status === "live").length;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                  marginBottom: 10, paddingBottom: 8, borderBottom: "2px solid #cfc0a0" }}>
      <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20,
                     fontWeight: 900, color: "#1a1208" }}>
        {group.group_name}
      </span>
      <span style={{ fontSize: 12, color: "#7a6a50", fontWeight: 600 }}>
        {GROUP_LABELS[group.group_name] || ""}
      </span>
      {live > 0 && (
        <span style={{ fontSize: 11, background: "#c0392b", color: "#fff",
                       padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>
          🔴 {live} LIVE
        </span>
      )}
      {showCount && (
        <span style={{ fontSize: 12, color: "#7a6a50" }}>{group.players.length} players</span>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
      <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 22,
                     fontWeight: 800, color: color || "#1a1208" }}>{value}</span>
      <span style={{ fontSize: 11, color: "#7a6a50", fontWeight: 600,
                     textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
    </div>
  );
}

function Section({ label = "", matches }) {
  return (
    <section style={{ marginBottom: 8 }}>
      {label && <div className="section-label">{label}</div>}
      {matches.map((m, i) => <MatchRow key={m.match_id ?? i} m={m} groupName={label} />)}
    </section>
  );
}

function MatchRow({ m, groupName }) {
  // Special rendering for bye
  if (m.stage === "bye") {
    const bp = m.participants?.[0];
    return (
      <div style={{
        background: "#fff", borderRadius: 10,
        border: "1.5px solid #e8d08a",
        padding: "10px 16px", marginBottom: 8,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 800, color: "#d4a017",
          background: "#fdf6e0", padding: "2px 7px", borderRadius: 4,
          letterSpacing: 1, textTransform: "uppercase",
        }}>BYE</span>
        <span style={{ fontWeight: 700, fontSize: 14 }}>
          {bp?.player?.name ?? "—"}
          {playerCategoryTag(bp?.player, groupName)}
        </span>
        <span style={{ fontSize: 12, color: "#2d5a27", fontWeight: 700 }}>✓ advances</span>
      </div>
    );
  }

  const p1 = getP1(m); const p2 = getP2(m);
  const isDone     = bucket(m.status) === "done";
  const isLive     = bucket(m.status) === "live";
  const isUpcoming = bucket(m.status) === "upcoming";

  const completed = completedSets(m);
  const active    = activeSet(m);
  const setsWonP1 = completed.filter(s => s.winner_position === 1).length;
  const setsWonP2 = completed.filter(s => s.winner_position === 2).length;
  const liveP1    = active?.score_p1 ?? 0;
  const liveP2    = active?.score_p2 ?? 0;
  const serving = isLive
    ? (m.current_server != null ? m.current_server : getServe(liveP1, liveP2))
    : null;

  const p1IsWinner = isDone && p1?.is_winner;
  const p2IsWinner = isDone && p2?.is_winner;
  const p1IsLoser  = isDone && !p1?.is_winner;
  const p2IsLoser  = isDone && !p2?.is_winner;

  const stagePill = m.stage === "quarter" ? "QF"
                  : m.stage === "semi"    ? "SF"
                  : m.stage === "final"   ? "F"
                  : m.stage === "third"   ? "3rd" : null;

  return (
    <div className={`match-row ${isLive ? "match-live" : ""}`}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>

          {/* Pill */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
                        minWidth: 44, flexShrink: 0, gap: 2 }}>
            <div className="match-round">{stagePill ?? `R${m.round}`}</div>
            {m.table_number && (
              <div style={{ fontSize: 9, color: "#d4a017", fontWeight: 700,
                            background: "#fdf6e0", padding: "1px 4px", borderRadius: 3,
                            border: "1px solid #e8d08a" }}>
                T{m.table_number}
              </div>
            )}
          </div>

          {/* Players */}
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr auto 1fr",
                        alignItems: "center", gap: 4, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4,
                          justifyContent: "flex-end", minWidth: 0, overflow: "hidden" }}>
              {p1IsWinner && <span style={{ fontSize: 11, flexShrink: 0 }}>🏆</span>}
              {isLive && serving === 1 && (
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#2d5a27",
                               display: "inline-block", flexShrink: 0 }} />
              )}
              <span className={`match-player ${p1IsWinner ? "winner" : ""}`}
                    style={{ textAlign: "right", opacity: p1IsLoser ? 0.35 : 1,
                             textDecoration: p1IsLoser ? "line-through" : "none",
                             color: p1IsLoser ? "#bbb" : undefined }}>
                {p1?.player?.name ?? "?"}
              </span>
            </div>
            <div style={{ textAlign: "center", padding: "0 6px", flexShrink: 0, minWidth: 52 }}>
              {isUpcoming && <span style={{ color: "#bbb", fontSize: 12, fontWeight: 600 }}>vs</span>}
              {isLive && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                  <span className="match-vs" style={{ color: "#c0392b", fontWeight: 800 }}>{liveP1}–{liveP2}</span>
                  <span style={{ fontSize: 9, color: "#7a6a50", fontWeight: 600 }}>{setsWonP1}–{setsWonP2} sets</span>
                </div>
              )}
              {isDone && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                  <span className="match-vs" style={{ fontWeight: 800 }}>{setsWonP1}–{setsWonP2}</span>
                  <span style={{ fontSize: 9, color: "#7a6a50", fontWeight: 600 }}>sets</span>
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4,
                          justifyContent: "flex-start", minWidth: 0, overflow: "hidden" }}>
              {isLive && serving === 2 && (
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#2d5a27",
                               display: "inline-block", flexShrink: 0 }} />
              )}
              <span className={`match-player ${p2IsWinner ? "winner" : ""}`}
                    style={{ textAlign: "left", opacity: p2IsLoser ? 0.35 : 1,
                             textDecoration: p2IsLoser ? "line-through" : "none",
                             color: p2IsLoser ? "#bbb" : undefined }}>
                {p2?.player?.name ?? "?"}
              </span>
              {p2IsWinner && <span style={{ fontSize: 11, flexShrink: 0 }}>🏆</span>}
            </div>
          </div>

          {/* Badge */}
          <div style={{ flexShrink: 0 }}>
            {isLive && <span className="live-tag">LIVE</span>}
            {isDone  && <span className="done-tag">FT</span>}
            {isUpcoming && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#7a6a50",
                             background: "#f5f0e8", border: "1px solid #cfc0a0",
                             padding: "2px 7px", borderRadius: 4,
                             textTransform: "uppercase", letterSpacing: 1 }}>Next</span>
            )}
          </div>
        </div>

        {isDone && completed.length > 0 && (
          <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap", paddingLeft: 52 }}>
            {completed.map((s, i) => (
              <span key={i} style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px",
                                     borderRadius: 3, background: "#f5f0e8", color: "#7a6a50" }}>
                <span style={{ color: s.winner_position===1 ? "#2d5a27" : "#bbb" }}>{s.score_p1}</span>
                <span style={{ color: "#ccc", margin: "0 1px" }}>–</span>
                <span style={{ color: s.winner_position===2 ? "#2d5a27" : "#bbb" }}>{s.score_p2}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TournamentResults — shown on Live tab when no matches are live ────────────
function TournamentResults({ matches }) {
  const finalMatch = matches.find(m => m.stage === "final" && (m.status === "done" || m.status === "completed"));
  const thirdMatch = matches.find(m => m.stage === "third" && (m.status === "done" || m.status === "completed"));

  if (!finalMatch) return null;

  const champion = finalMatch.participants?.find(p => p.is_winner);
  const runnerUp = finalMatch.participants?.find(p => !p.is_winner);
  const third    = thirdMatch?.participants?.find(p => p.is_winner);

  if (!champion) return null;

  return (
    <div style={{
      background: "linear-gradient(135deg, #fdf6e0 0%, #fff 60%)",
      border: "2px solid #d4a017",
      borderRadius: 20,
      padding: "36px 32px 40px",
      marginBottom: 28,
      textAlign: "center",
      boxShadow: "0 8px 40px rgba(212,160,23,0.15)",
    }}>
      <div style={{
        fontFamily: "'Barlow Condensed',sans-serif",
        fontSize: 15, fontWeight: 800, letterSpacing: 4,
        color: "#d4a017", textTransform: "uppercase",
        marginBottom: 32,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
      }}>
        <span style={{ flex: 1, height: 1, background: "#e8d08a", display: "block" }} />
        🏆 Tournament Results
        <span style={{ flex: 1, height: 1, background: "#e8d08a", display: "block" }} />
      </div>
      <div style={{
        background: "linear-gradient(135deg, #d4a017, #f0c040)",
        borderRadius: 16, padding: "28px 24px", marginBottom: 20,
        boxShadow: "0 4px 20px rgba(212,160,23,0.3)",
      }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🥇</div>
        <div style={{
          fontFamily: "'Barlow Condensed',sans-serif",
          fontSize: "clamp(32px, 5vw, 56px)",
          fontWeight: 900, color: "#fff", lineHeight: 1, letterSpacing: 1,
          textShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}>{champion.player?.name ?? "—"}</div>
        <div style={{
          fontFamily: "'Barlow Condensed',sans-serif",
          fontSize: 13, fontWeight: 800, letterSpacing: 3,
          color: "rgba(255,255,255,0.8)", textTransform: "uppercase", marginTop: 8,
        }}>Champion</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: third ? "1fr 1fr" : "1fr", gap: 12 }}>
        {runnerUp && (
          <div style={{ background: "#fff", border: "2px solid #bbb", borderRadius: 14, padding: "20px 16px" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🥈</div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "clamp(20px, 3vw, 32px)", fontWeight: 900, color: "#1a1208", lineHeight: 1 }}>{runnerUp.player?.name ?? "—"}</div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: "#888", textTransform: "uppercase", marginTop: 6 }}>Runner Up</div>
          </div>
        )}
        {third && (
          <div style={{ background: "linear-gradient(135deg, #fdf0e8, #fff5ef)", border: "2px solid #cd7f32", borderRadius: 14, padding: "20px 16px" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🥉</div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: "clamp(20px, 3vw, 32px)", fontWeight: 900, color: "#1a1208", lineHeight: 1 }}>{third.player?.name ?? "—"}</div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: "#a0522d", textTransform: "uppercase", marginTop: 6 }}>3rd Place</div>
          </div>
        )}
      </div>
    </div>
  );
}