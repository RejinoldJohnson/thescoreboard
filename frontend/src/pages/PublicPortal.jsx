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
function getServe(s1, s2) {
  const total = s1 + s2, isDeuce = s1 >= 10 && s2 >= 10;
  if (isDeuce) return total % 2 === 0 ? 1 : 2;
  return Math.floor(total / 2) % 2 === 0 ? 1 : 2;
}

const GROUP_LABELS = {
  "Group A": "Boys U18 & Women",
  "Group B": "Men 18–29",
  "Group C": "Men 18–29",
  "Group D": "Men 30+",
};

function activeSet(m) { return (m.sets ?? []).find(s => s.winner_position === null); }
function completedSets(m) {
  return (m.sets ?? []).filter(s => s.winner_position !== null).sort((a,b) => a.set_number - b.set_number);
}

export default function PublicPortal() {
  const location = useLocation();
  const navigate  = useNavigate();
  const validTabs = ["live", "schedule", "groups"];
  const hashTab   = location.hash.replace("#", "");

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
  const totalPlayers     = groups.reduce((s, g) => s + g.players.length, 0);
  const activeTournament = tournaments.find(t => t.tournament_id === activeTId);
  const groupMatches     = matches.filter(m => m.stage === "group");
  const koMatches        = matches.filter(m => m.stage !== "group");

  const defaultTab = liveMatches.length > 0 ? "live" : "schedule";
  const tab = validTabs.includes(hashTab) ? hashTab : defaultTab;
  const setTab = (t) => navigate(`/#${t}`, { replace: true });

  return (
    <div className="app" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>

      <header className="header">
        <div className="header-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src="/mmylogo.png" alt="logo"
              onError={e => { e.target.style.display = "none"; }}
              style={{ width: 44, height: 44, objectFit: "cover", borderRadius: "50%", flexShrink: 0, border: "2px solid rgba(255,255,255,0.3)" }} />
            <div>
              <div className="header-sub">🏓 Mary Matha Youth</div>
              <h1 className="header-title">{activeTournament?.name || "Table Tennis Open"}</h1>
            </div>
          </div>
          {liveMatches.length > 0 && (
            <div className="live-badge"><span className="live-dot" /> LIVE</div>
          )}
        </div>
      </header>

      {tournaments.length > 1 && (
        <div style={{ background: "#fff", borderBottom: "1.5px solid #cfc0a0", padding: "8px 16px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
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
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "10px 16px",
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
            {liveMatches.length === 0 ? (
              <div>
                <TournamentResults matches={matches} />
                <div className="empty" style={{ paddingTop: liveMatches.length === 0 ? 32 : 64 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🏓</div>
                  <div style={{ fontWeight: 700, color: "#2d5a27", fontSize: 16 }}>No live matches right now</div>
                  <div style={{ color: "#7a6a50", fontSize: 13, marginTop: 6 }}>Check the Schedule tab for upcoming matches</div>
                </div>
              </div>
            ) : (
              <div className="live-cards-grid" style={
                liveMatches.length === 1
                  ? { display: "flex", justifyContent: "center" }
                  : {}
              }>
                {liveMatches.map(m => (
                  <div key={m.match_id} style={liveMatches.length === 1
                    ? { width: "100%", maxWidth: 520 }
                    : {}
                  }>
                    <LiveCard m={m} groups={groups} />
                  </div>
                ))}
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
                  const gm = groupMatches.filter(m => m.group_id === g.group_id);
                  if (gm.length === 0) return null;
                  const live     = gm.filter(m => bucket(m.status) === "live");
                  const upcoming = gm.filter(m => bucket(m.status) === "upcoming").sort((a,b) => a.match_id - b.match_id);
                  const done     = gm.filter(m => bucket(m.status) === "done").sort((a,b) => b.match_id - a.match_id);
                  return (
                    <div key={g.group_id} style={{ marginBottom: 28 }}>
                      <GroupHeader group={g} matches={gm} />
                      <Section matches={[...live, ...upcoming, ...done]} />
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

      <footer style={{ background: "#2d5a27", borderTop: "2px solid #1e3d1a", padding: "12px 16px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex",
                      justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <a href={`https://instagram.com/${INSTAGRAM_HANDLE}`} target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 7, textDecoration: "none",
                     background: "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)",
                     padding: "6px 14px", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
              <circle cx="12" cy="12" r="4"/>
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
            </svg>
            @{INSTAGRAM_HANDLE}
          </a>
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
            Refreshes every 5s{lastUpdated && ` · ${lastUpdated.toLocaleTimeString()}`}
          </span>
        </div>
      </footer>
    </div>
  );
}

// ── LiveCard ──────────────────────────────────────────────────
function LiveCard({ m, groups }) {
  const p1 = getP1(m); const p2 = getP2(m);
  const active    = activeSet(m);
  const completed = completedSets(m);
  const setsWonP1 = completed.filter(s => s.winner_position === 1).length;
  const setsWonP2 = completed.filter(s => s.winner_position === 2).length;
  const liveP1        = active?.score_p1 ?? 0;
  const liveP2        = active?.score_p2 ?? 0;
  const currentSetNum = completed.length + 1;
  const p1Name        = p1?.player?.name ?? "Player 1";
  const p2Name        = p2?.player?.name ?? "Player 2";

  // Use backend current_server (set by admin) — this is the source of truth
  // Only fall back to calculation if admin hasn't set it yet
  const serving = (() => {
    if (m.current_server != null) return m.current_server;
    // Fallback: set-aware calculation
    // Odd sets (1,3,5) → P1 serves first; even sets (2,4) → P2 serves first
    const total = liveP1 + liveP2;
    const isDeuce = liveP1 >= 10 && liveP2 >= 10;
    const setFirstServer = currentSetNum % 2 === 1 ? 1 : 2;
    if (isDeuce) {
      return (total - 20) % 2 === 0 ? setFirstServer : (setFirstServer === 1 ? 2 : 1);
    }
    return Math.floor(total / 2) % 2 === 0 ? setFirstServer : (setFirstServer === 1 ? 2 : 1);
  })();

  // Set status text shown below the scores
  const hasWinner = (p1, p2) =>
    (p1===7&&p2===0)||(p2===7&&p1===0)||(p1>=11&&p1-p2>=2)||(p2>=11&&p2-p1>=2);
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
    return group?.group_name ?? "Group Stage";
  })();

  return (
    <div style={{ background: "#fff", border: "2px solid #c0392b", borderRadius: 14,
                  overflow: "hidden", boxShadow: "0 4px 20px rgba(192,57,43,0.1)" }}>

      {/* Header bar */}
      <div style={{ background: "#c0392b", padding: "8px 14px",
                    display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff",
                         display: "inline-block", animation: "blink 1.2s infinite" }} />
          <span style={{ color: "#fff", fontSize: 11, fontWeight: 800,
                         letterSpacing: 2, textTransform: "uppercase" }}>Live</span>
          <span style={{ color: "#fff", fontSize: 12, fontWeight: 800, marginLeft: 4 }}>
            {stageLine}
          </span>
        </div>
        {m.table_number && (
          <span style={{ color: "#fff", fontSize: 11, fontWeight: 700,
                         background: "rgba(255,255,255,0.2)", padding: "2px 8px", borderRadius: 4 }}>
            Table {m.table_number}
          </span>
        )}
      </div>

      {/* Sets won */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "16px 28px 0" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 40, fontWeight: 900,
                        lineHeight: 1, color: setsWonP1 > setsWonP2 ? "#2d5a27" : "#ccc" }}>
            {setsWonP1}
          </div>
          <div style={{ fontSize: 9, color: "#2d5a27", fontWeight: 800,
                        textTransform: "uppercase", letterSpacing: 1 }}>sets</div>
        </div>
        <div style={{ fontSize: 11, color: "#1a1208", fontWeight: 800,
                      letterSpacing: 1, textTransform: "uppercase" }}>
          Set {currentSetNum}
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 40, fontWeight: 900,
                        lineHeight: 1, color: setsWonP2 > setsWonP1 ? "#2d5a27" : "#ccc" }}>
            {setsWonP2}
          </div>
          <div style={{ fontSize: 9, color: "#2d5a27", fontWeight: 800,
                        textTransform: "uppercase", letterSpacing: 1 }}>sets</div>
        </div>
      </div>

      {/* Main score — ALWAYS 3 columns: P1 | dash | P2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr",
                    alignItems: "center", padding: "24px 28px 32px", gap: 16 }}>

        {/* P1 */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700,
                        color: serving === 1 ? "#2d5a27" : "#1a1208",
                        letterSpacing: 0, marginBottom: 8,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            {serving === 1 && (
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#2d5a27",
                             display: "inline-block", flexShrink: 0 }} />
            )}
            {p1Name}
          </div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900,
                        fontSize: "clamp(80px, 10vw, 140px)", lineHeight: 1,
                        color: "#1a1208" }}>
            {liveP1}
          </div>
        </div>

        {/* Centre dash + status */}
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#cfc0a0", fontSize: 24, fontWeight: 300, lineHeight: 1 }}>–</div>
          {isAtDeuce && (
            <div style={{ fontSize: 10, color: "#c0392b", fontWeight: 800, marginTop: 6,
                          textTransform: "uppercase", letterSpacing: 1 }}>Deuce</div>
          )}
          {isAdv && (
            <div style={{ fontSize: 9, color: "#d4a017", fontWeight: 800, marginTop: 6,
                          textTransform: "uppercase", letterSpacing: 1, lineHeight: 1.2,
                          maxWidth: 60 }}>Adv.<br/>{advName}</div>
          )}
          {setWinName && (
            <div style={{ fontSize: 9, color: "#2d5a27", fontWeight: 800, marginTop: 6,
                          textTransform: "uppercase", letterSpacing: 1, lineHeight: 1.2,
                          maxWidth: 60 }}>{setWinName}<br/>wins set</div>
          )}
          {!isAtDeuce && !isAdv && !setWinName && (
            <div style={{ fontSize: 9, color: "#aaa", fontWeight: 600, marginTop: 4,
                          textTransform: "uppercase", letterSpacing: 1 }}>pts</div>
          )}
        </div>

        {/* P2 */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700,
                        color: serving === 2 ? "#2d5a27" : "#1a1208",
                        letterSpacing: 0, marginBottom: 8,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            {p2Name}
            {serving === 2 && (
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#2d5a27",
                             display: "inline-block", flexShrink: 0 }} />
            )}
          </div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900,
                        fontSize: "clamp(80px, 10vw, 140px)", lineHeight: 1,
                        color: "#1a1208" }}>
            {liveP2}
          </div>
        </div>
      </div>

      {/* Completed set history */}
      {completed.length > 0 && (
        <div style={{ borderTop: "1px solid #f0e8d8", padding: "8px 16px",
                      display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap",
                      background: "#faf7f2" }}>
          {completed.map((s, i) => {
            const w = s.winner_position;
            return (
              <span key={i} style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px",
                                     borderRadius: 5, background: "#fff",
                                     border: "1px solid #e8dfc8", color: "#7a6a50" }}>
                <span style={{ fontSize: 9, color: "#bbb", marginRight: 3 }}>S{s.set_number}</span>
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
      {matches.map((m, i) => <MatchRow key={m.match_id ?? i} m={m} />)}
    </section>
  );
}

function MatchRow({ m }) {
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
  // Use backend current_server; fall back to set-aware local calculation
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

          {/* Players — always 3-column grid: P1 | score | P2 */}
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr auto 1fr",
                        alignItems: "center", gap: 4, minWidth: 0 }}>

            {/* P1 */}
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

            {/* Score */}
            <div style={{ textAlign: "center", padding: "0 6px", flexShrink: 0, minWidth: 52 }}>
              {isUpcoming && (
                <span style={{ color: "#bbb", fontSize: 12, fontWeight: 600 }}>vs</span>
              )}
              {isLive && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                  <span className="match-vs" style={{ color: "#c0392b", fontWeight: 800 }}>
                    {liveP1}–{liveP2}
                  </span>
                  <span style={{ fontSize: 9, color: "#7a6a50", fontWeight: 600 }}>
                    {setsWonP1}–{setsWonP2} sets
                  </span>
                </div>
              )}
              {isDone && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                  <span className="match-vs" style={{ fontWeight: 800 }}>
                    {setsWonP1}–{setsWonP2}
                  </span>
                  <span style={{ fontSize: 9, color: "#7a6a50", fontWeight: 600 }}>sets</span>
                </div>
              )}
            </div>

            {/* P2 */}
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

        {/* Per-set breakdown for done matches */}
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

      {/* Title */}
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

      {/* Champion — big, centred, prominent */}
      <div style={{
        background: "linear-gradient(135deg, #d4a017, #f0c040)",
        borderRadius: 16,
        padding: "28px 24px",
        marginBottom: 20,
        boxShadow: "0 4px 20px rgba(212,160,23,0.3)",
      }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🥇</div>
        <div style={{
          fontFamily: "'Barlow Condensed',sans-serif",
          fontSize: "clamp(32px, 5vw, 56px)",
          fontWeight: 900, color: "#fff",
          lineHeight: 1, letterSpacing: 1,
          textShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}>
          {champion.player?.name ?? "—"}
        </div>
        <div style={{
          fontFamily: "'Barlow Condensed',sans-serif",
          fontSize: 13, fontWeight: 800, letterSpacing: 3,
          color: "rgba(255,255,255,0.8)", textTransform: "uppercase", marginTop: 8,
        }}>Champion</div>
      </div>

      {/* Runner up + 3rd place side by side */}
      <div style={{
        display: "grid",
        gridTemplateColumns: third ? "1fr 1fr" : "1fr",
        gap: 12,
      }}>
        {runnerUp && (
          <div style={{
            background: "#fff",
            border: "2px solid #bbb",
            borderRadius: 14,
            padding: "20px 16px",
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🥈</div>
            <div style={{
              fontFamily: "'Barlow Condensed',sans-serif",
              fontSize: "clamp(20px, 3vw, 32px)",
              fontWeight: 900, color: "#1a1208", lineHeight: 1,
            }}>
              {runnerUp.player?.name ?? "—"}
            </div>
            <div style={{
              fontSize: 11, fontWeight: 800, letterSpacing: 2,
              color: "#888", textTransform: "uppercase", marginTop: 6,
            }}>Runner Up</div>
          </div>
        )}
        {third && (
          <div style={{
            background: "linear-gradient(135deg, #fdf0e8, #fff5ef)",
            border: "2px solid #cd7f32",
            borderRadius: 14,
            padding: "20px 16px",
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🥉</div>
            <div style={{
              fontFamily: "'Barlow Condensed',sans-serif",
              fontSize: "clamp(20px, 3vw, 32px)",
              fontWeight: 900, color: "#1a1208", lineHeight: 1,
            }}>
              {third.player?.name ?? "—"}
            </div>
            <div style={{
              fontSize: 11, fontWeight: 800, letterSpacing: 2,
              color: "#a0522d", textTransform: "uppercase", marginTop: 6,
            }}>3rd Place</div>
          </div>
        )}
      </div>
    </div>
  );
}