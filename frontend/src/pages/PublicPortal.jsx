import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getTournaments, getMatches, getParticipants } from "../api/client";

const POLL_INTERVAL = 5000;

function getP1(m) { return m.participants?.find(p => p.position === 1); }
function getP2(m) { return m.participants?.find(p => p.position === 2); }
function bucket(s) {
  if (s === "live") return "live";
  if (s === "done" || s === "completed") return "done";
  return "upcoming";
}

// Returns which position (1 or 2) is currently serving.
// Serve switches every 2 points; every 1 point at deuce (10-10+).
function getServe(s1, s2) {
  const total   = s1 + s2;
  const isDeuce = s1 >= 10 && s2 >= 10;
  if (isDeuce) return total % 2 === 0 ? 1 : 2;
  return Math.floor(total / 2) % 2 === 0 ? 1 : 2;
}

// Returns true if match has a winner (7-0 rule or first to 11 +2)
function hasWinner(s1, s2) {
  if (s1 === 7 && s2 === 0) return true;
  if (s2 === 7 && s1 === 0) return true;
  if (s1 >= 11 && s1 - s2 >= 2) return true;
  if (s2 >= 11 && s2 - s1 >= 2) return true;
  return false;
}

const GROUP_LABELS = {
  "Group A": "Men · Under 36",
  "Group B": "Men · Under 36",
  "Group C": "Men · Under 36",
  "Group D": "Men 36+ · Women all ages",
};

export default function PublicPortal() {
  const location = useLocation();
  const navigate  = useNavigate();
  const validTabs = ["schedule", "groups"];
  const hashTab   = location.hash.replace("#", "");
  const tab       = validTabs.includes(hashTab) ? hashTab : "schedule";
  const setTab    = (t) => navigate(`/#${t}`, { replace: true });

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
      const [m, g] = await Promise.all([
        getMatches(activeTId),
        getParticipants(activeTId),
      ]);
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

  const liveMatches  = matches.filter(m => bucket(m.status) === "live");
  const totalPlayers = groups.reduce((s, g) => s + g.players.length, 0);
  const activeTournament = tournaments.find(t => t.tournament_id === activeTId);
  const groupMatches = matches.filter(m => m.stage === "group");
  const koMatches    = matches.filter(m => m.stage !== "group");

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div>
            <div className="header-sub">🏓 Mary Matha Youth</div>
            <h1 className="header-title">{activeTournament?.name || "Table Tennis Open"}</h1>
          </div>
          {liveMatches.length > 0 && (
            <div className="live-badge"><span className="live-dot" /> LIVE</div>
          )}
        </div>
      </header>

      {/* Tournament selector */}
      {tournaments.length > 1 && (
        <div style={{ background: "#fff", borderBottom: "1.5px solid #cfc0a0", padding: "8px 16px" }}>
          <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {tournaments.map(t => (
              <button key={t.tournament_id} onClick={() => setActiveTId(t.tournament_id)} style={{
                padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600,
                background: activeTId === t.tournament_id ? "#2d5a27" : "transparent",
                color:      activeTId === t.tournament_id ? "#fff" : "#6b4c2a",
                border:     `1.5px solid ${activeTId === t.tournament_id ? "#2d5a27" : "#cfc0a0"}`,
              }}>{t.name}</button>
            ))}
          </div>
        </div>
      )}

      {/* Live banner */}
      {liveMatches.length > 0 && (
        <div className="live-banner">
          {liveMatches.map((m, i) => {
            const p1 = getP1(m); const p2 = getP2(m);
            const s1 = p1?.score ?? 0; const s2 = p2?.score ?? 0;
            const serving = hasWinner(s1, s2) ? null : getServe(s1, s2);
            const servingName = serving === 1 ? (p1?.player?.name ?? null) : serving === 2 ? (p2?.player?.name ?? null) : null;
            return (
              <div key={m.match_id ?? i} className="live-card">
                <span className="live-tag">LIVE</span>
                {m.table_number && (
                  <span style={{ fontSize: 11, background: "#e8dfc8", color: "#6b4c2a", padding: "2px 6px", borderRadius: 3, fontWeight: 700 }}>
                    Table {m.table_number}
                  </span>
                )}
                <span className="live-name">
                  {serving === 1 && <span style={{ marginRight: 3 }}>🏓</span>}
                  {p1?.player?.name ?? "?"}
                </span>
                <span className="live-score">{s1} – {s2}</span>
                <span className="live-name">
                  {p2?.player?.name ?? "?"}
                  {serving === 2 && <span style={{ marginLeft: 3 }}>🏓</span>}
                </span>
                {servingName && (
                  <span style={{ fontSize: 10, color: "#d4a017", fontWeight: 700, marginLeft: 4 }}>
                    ({servingName} serving)
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Stat strip */}
      <div style={{ background: "#fff", borderBottom: "1.5px solid #cfc0a0" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "10px 16px", display: "flex", gap: 20, flexWrap: "wrap" }}>
          <Stat label="Players"   value={totalPlayers} />
          <Stat label="Matches"   value={matches.length} />
          <Stat label="Live"      value={liveMatches.length} color="#c0392b" />
          <Stat label="Completed" value={matches.filter(m => bucket(m.status) === "done").length} color="#2d5a27" />
        </div>
      </div>

      {/* Tabs — only Schedule and Groups */}
      <div style={{ background: "#e8dfc8", borderBottom: "2px solid #cfc0a0" }}>
        <div className="tabs" style={{ background: "transparent", borderBottom: "none", margin: 0 }}>
          {[["schedule", "Schedule"], ["groups", "Groups"]].map(([t, label]) => (
            <button key={t} className={`tab ${tab === t ? "tab-active" : ""}`} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="content">

        {/* ── SCHEDULE ─────────────────────────────────────────── */}
        {tab === "schedule" && (
          <div>
            {matches.length === 0 ? (
              <div className="empty">No matches scheduled yet.</div>
            ) : (
              <>
                {/* Group stage — one section per group */}
                {groups.map(g => {
                  const gm = groupMatches.filter(m => m.group_id === g.group_id);
                  if (gm.length === 0) return null;

                  // Sort: live first, then upcoming (asc), then done (desc — most recent first)
                  const live     = gm.filter(m => bucket(m.status) === "live");
                  const upcoming = gm.filter(m => bucket(m.status) === "upcoming")
                                     .sort((a, b) => a.match_id - b.match_id);
                  const done     = gm.filter(m => bucket(m.status) === "done")
                                     .sort((a, b) => b.match_id - a.match_id);
                  const sorted   = [...live, ...upcoming, ...done];

                  return (
                    <div key={g.group_id} style={{ marginBottom: 28 }}>
                      <GroupHeader group={g} matches={gm} />
                      <Section matches={sorted} />
                    </div>
                  );
                })}

                {/* Knockout rounds — appear automatically once generated */}
                {koMatches.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{
                      fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, fontWeight: 800,
                      letterSpacing: 3, color: "#d4a017", textTransform: "uppercase",
                      margin: "24px 0 12px", display: "flex", alignItems: "center", gap: 10,
                    }}>
                      🏆 Knockout Stage
                      <span style={{ flex: 1, height: 1, background: "#cfc0a0", display: "block" }} />
                    </div>
                    {["quarter", "semi", "final"].map(stage => {
                      const sm = koMatches.filter(m => m.stage === stage);
                      if (!sm.length) return null;
                      const stageName = stage === "quarter" ? "Quarter Finals"
                                      : stage === "semi"    ? "Semi Finals"
                                      :                       "🏆 Final";
                      const live     = sm.filter(m => bucket(m.status) === "live");
                      const upcoming = sm.filter(m => bucket(m.status) === "upcoming").sort((a, b) => a.match_id - b.match_id);
                      const done     = sm.filter(m => bucket(m.status) === "done").sort((a, b) => b.match_id - a.match_id);
                      return <Section key={stage} label={stageName} matches={[...live, ...upcoming, ...done]} />;
                    })}

                    {/* Champion banner */}
                    {(() => {
                      const finalMatch = koMatches.find(m => m.stage === "final" && (m.status === "done" || m.status === "completed"));
                      const champion   = finalMatch?.participants?.find(p => p.is_winner);
                      if (!champion) return null;
                      return (
                        <div style={{ textAlign: "center", padding: "28px 16px", background: "#fdf6e0", borderRadius: 12, border: "2px solid #d4a017", marginTop: 20 }}>
                          <div style={{ fontSize: 44 }}>🏆</div>
                          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 28, fontWeight: 900, color: "#d4a017", letterSpacing: 2 }}>CHAMPION</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1208", marginTop: 6 }}>{champion.player?.name}</div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── GROUPS ───────────────────────────────────────────── */}
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
                    <div className="player-grid">
                      {g.players.map((p, i) => (
                        <div key={p.player_id ?? i} className="player-card">
                          <div className="player-num">#{String(i + 1).padStart(2, "0")}</div>
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

      <footer className="footer">
        Auto-refreshes every 5s
        {lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString()}`}
        {" · "}{totalPlayers} players
      </footer>
    </div>
  );
}

// ── Group header ──────────────────────────────────────────────
function GroupHeader({ group, matches = [], showCount = false }) {
  const live = matches.filter(m => m.status === "live").length;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10, paddingBottom: 8, borderBottom: "2px solid #cfc0a0" }}>
      <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20, fontWeight: 900, color: "#1a1208" }}>
        {group.group_name}
      </span>
      <span style={{ fontSize: 12, color: "#7a6a50", fontWeight: 600 }}>
        {GROUP_LABELS[group.group_name] || ""}
      </span>
      {live > 0 && (
        <span style={{ fontSize: 11, background: "#c0392b", color: "#fff", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>
          🔴 {live} LIVE
        </span>
      )}
      {showCount && <span style={{ fontSize: 12, color: "#7a6a50" }}>{group.players.length} players</span>}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
      <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 22, fontWeight: 800, color: color || "#1a1208" }}>{value}</span>
      <span style={{ fontSize: 11, color: "#7a6a50", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
    </div>
  );
}

function Section({ label = "", matches }) {
  return (
    <section style={{ marginBottom: 8 }}>
      {label && <div className="section-label">{label}</div>}
      {matches.map((m, i) => {
        const p1 = getP1(m); const p2 = getP2(m);
        const isDone = bucket(m.status) === "done";
        const isLive = bucket(m.status) === "live";
        const s1 = p1?.score ?? 0; const s2 = p2?.score ?? 0;
        const serving = isLive && !hasWinner(s1, s2) ? getServe(s1, s2) : null;
        const servingName = serving === 1 ? (p1?.player?.name ?? "?")
                          : serving === 2 ? (p2?.player?.name ?? "?")
                          : null;
        return (
          <div key={m.match_id ?? i} className={`match-row ${isLive ? "match-live" : ""}`}
               style={{ flexDirection: "column", alignItems: "stretch", gap: 0, padding: isLive ? "10px 12px" : undefined }}>

            {/* Main match row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 52 }}>
                <div className="match-round">R{m.round}</div>
                {m.table_number && (
                  <div style={{ fontSize: 10, color: "#7a6a50", fontWeight: 700, marginTop: 3 }}>T{m.table_number}</div>
                )}
              </div>
              <div className="match-players" style={{ flex: 1 }}>
                <span className={`match-player ${isDone && p1?.is_winner ? "winner" : ""}`}
                      style={{ fontWeight: serving === 1 ? 800 : undefined }}>
                  {p1?.player?.name ?? "?"}
                </span>
                <span className="match-vs">
                  {!isLive && !isDone ? "vs" : <strong>{s1} – {s2}</strong>}
                </span>
                <span className={`match-player ${isDone && p2?.is_winner ? "winner" : ""}`}
                      style={{ fontWeight: serving === 2 ? 800 : undefined }}>
                  {p2?.player?.name ?? "?"}
                </span>
              </div>
              {isLive && <span className="live-tag">LIVE</span>}
              {isDone  && <span className="done-tag">FT</span>}
            </div>

            {/* Serve indicator bar — only on live matches */}
            {isLive && servingName && (
              <div style={{
                marginTop: 8, padding: "5px 10px",
                background: "#1a1208", borderRadius: 6,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ fontSize: 14 }}>🏓</span>
                <span style={{ fontSize: 12, color: "#d4a017", fontWeight: 800 }}>
                  {servingName}
                </span>
                <span style={{ fontSize: 11, color: "#7a6a50", fontWeight: 600 }}>
                  to serve
                </span>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}