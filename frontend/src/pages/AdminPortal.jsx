import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getPlayers, createPlayer, deletePlayer,
  getTournaments, createTournament,
  getParticipants,
  getMatches, updateMatch, deleteMatch, generateFixtures, rematchMatch,
  setPlayerSeed,
  logout,
} from "../api/client";

// ── Helpers ──────────────────────────────────────────────────
function getP1(match) { return match.participants?.find(p => p.position === 1); }
function getP2(match) { return match.participants?.find(p => p.position === 2); }

const GROUP_LABELS = {
  "Group A": "Men · Under 36",
  "Group B": "Men · Under 36",
  "Group C": "Men · Under 36",
  "Group D": "Men 36+ · Women all ages",
};

export default function AdminPortal({ onLogout }) {
  const { tab: urlTab } = useParams();
  const navigate = useNavigate();
  const validTabs = ["tournament", "players", "groups", "matches"];
  const currentTab = validTabs.includes(urlTab) ? urlTab : "tournament";

  // Sync tab to URL
  const setTab = (t) => navigate(`/admin/${t}`, { replace: true });
  const [msg, setMsg]                 = useState({ text: "", type: "ok" });

  // Tournament
  const [tournaments, setTournaments] = useState([]);
  const [activeTId, setActiveTId]     = useState(null);
  const [tForm, setTForm]             = useState({ name: "", sport_type: "Table Tennis", format: "Group + Knockout", is_active: true });

  // Players
  const [players, setPlayers]         = useState([]);
  const [pForm, setPForm]             = useState({ name: "", age: "", gender: "Male", seed: "" });

  // Groups + Matches
  const [groups, setGroups]           = useState([]);
  const [matches, setMatches]         = useState([]);
  const [activeMatchId, setActiveMatchId] = useState(null); // fullscreen scorer

  const flash = (text, type = "ok") => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "ok" }), 3000);
  };
  const handleLogout = () => { logout(); onLogout(); };

  // ── Loaders ──────────────────────────────────────────────────
  const loadTournaments = useCallback(async () => {
    const ts = await getTournaments().catch(() => []);
    const list = Array.isArray(ts) ? ts : [];
    setTournaments(list);
    if (!activeTId) {
      const active = list.find(t => t.is_active) || list[0];
      if (active) setActiveTId(active.tournament_id);
    }
  }, [activeTId]);

  const loadPlayers = useCallback(async () => {
    const ps = await getPlayers().catch(() => []);
    setPlayers(Array.isArray(ps) ? ps : []);
  }, []);

  const loadTournamentData = useCallback(async () => {
    if (!activeTId) return;
    const [g, m] = await Promise.all([
      getParticipants(activeTId).catch(() => []),
      getMatches(activeTId).catch(() => []),
    ]);
    setGroups(Array.isArray(g) ? g : []);
    setMatches(Array.isArray(m) ? m : []);
  }, [activeTId]);

  useEffect(() => { loadTournaments(); loadPlayers(); }, []);
  useEffect(() => { loadTournamentData(); }, [loadTournamentData]);

  // ── Tournament ────────────────────────────────────────────────
  const handleCreateTournament = async () => {
    if (!tForm.name.trim()) return flash("Tournament name is required.", "err");
    try {
      const t = await createTournament(tForm);
      setActiveTId(t.tournament_id);
      loadTournaments();
      flash("Tournament created! 4 groups (A/B/C/D) are ready.");
    } catch (e) { flash("Error: " + e.message, "err"); }
  };

  // ── Players ───────────────────────────────────────────────────
  const handleAddPlayer = async () => {
    if (!pForm.name.trim()) return flash("Player name is required.", "err");
    if (!activeTId) return flash("Create a tournament first.", "err");
    try {
      const newPlayer = await createPlayer({
        name: pForm.name.trim(),
        age: parseInt(pForm.age) || null,
        gender: pForm.gender || null,
      });
      // If a seed was provided, set it immediately after registration
      if (pForm.seed && newPlayer?.player_id) {
        await setPlayerSeed(activeTId, newPlayer.player_id, parseInt(pForm.seed));
      }
      setPForm({ name: "", age: "", gender: "Male", seed: "" });
      await Promise.all([loadPlayers(), loadTournamentData()]);
      flash("Player added and assigned to their group!");
    } catch (e) { flash("Error: " + e.message, "err"); }
  };

  const handleDeletePlayer = async (id) => {
    if (!window.confirm("Delete this player permanently?")) return;
    try {
      await deletePlayer(id);
      await Promise.all([loadPlayers(), loadTournamentData()]);
      flash("Player deleted.");
    } catch (e) { flash("Error: " + e.message, "err"); }
  };

  // ── Seeds ─────────────────────────────────────────────────────
  const handleSetSeed = async (playerId, seed) => {
    try {
      await setPlayerSeed(activeTId, playerId, seed);
      loadTournamentData();
      flash(`Seed ${seed ? `set to ${seed}` : "cleared"}.`);
    } catch (e) { flash("Error: " + e.message, "err"); }
  };

  // ── Fixtures ──────────────────────────────────────────────────
  const handleGenerateFixtures = async () => {
    if (!activeTId) return;
    try {
      const r = await generateFixtures(activeTId);
      loadTournamentData();
      flash(r.matches_created > 0 ? `Generated ${r.matches_created} new matches!` : "All players already have matches.");
    } catch (e) { flash("Error: " + e.message, "err"); }
  };

  // ── Rematch ──────────────────────────────────────────────────
  const handleRematch = async (matchId) => {
    try { await rematchMatch(matchId); loadTournamentData(); flash("Match reset — ready to replay."); }
    catch (e) { flash("Error: " + e.message, "err"); }
  };

  // ── Matches ───────────────────────────────────────────────────
  const handlePatchMatch = async (matchId, changes) => {
    try { await updateMatch(matchId, changes); loadTournamentData(); }
    catch (e) { flash("Error: " + e.message, "err"); }
  };

  const handleDeleteMatch = async (matchId) => {
    if (!window.confirm("Delete this match?")) return;
    try { await deleteMatch(matchId); loadTournamentData(); flash("Match removed."); }
    catch (e) { flash("Error: " + e.message, "err"); }
  };

  const activeTournament = tournaments.find(t => t.tournament_id === activeTId);

  return (
    <div className="app">
      <header className="header header-admin">
        <div className="header-inner">
          <div>
            <div className="header-sub">Admin Panel</div>
            <h1 className="header-title">🏓 Tournament Manager</h1>
          </div>
          <button className="btn-ghost" onClick={handleLogout}>← Public View</button>
        </div>
      </header>

      {msg.text && (
        <div className="flash" style={{
          background:   msg.type === "err" ? "#fdf0ee" : undefined,
          borderColor:  msg.type === "err" ? "#c0392b" : undefined,
          color:        msg.type === "err" ? "#c0392b" : undefined,
        }}>
          {msg.text}
        </div>
      )}

      {/* Active tournament bar */}
      {activeTournament && (
        <div style={{ background: "#eaf2e8", borderBottom: "1.5px solid #cfc0a0", padding: "6px 20px" }}>
          <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#2d5a27", fontWeight: 700 }}>Active:</span>
            {tournaments.map(t => (
              <button key={t.tournament_id} onClick={() => setActiveTId(t.tournament_id)} style={{
                padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600,
                background: activeTId === t.tournament_id ? "#2d5a27" : "transparent",
                color:      activeTId === t.tournament_id ? "#fff"    : "#6b4c2a",
                border:     `1.5px solid ${activeTId === t.tournament_id ? "#2d5a27" : "#cfc0a0"}`,
              }}>{t.name}</button>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ background: "#e8dfc8", borderBottom: "2px solid #cfc0a0" }}>
        <div className="tabs" style={{ background: "transparent", borderBottom: "none", margin: 0 }}>
          {["tournament", "players", "groups", "matches"].map(t => (
            <button key={t} className={`tab ${currentTab === t ? "tab-active" : ""}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === "players" && players.length > 0 &&
                <span style={{ marginLeft: 5, fontSize: 11, color: "#7a6a50" }}>({players.length})</span>}
              {t === "matches" && matches.length > 0 &&
                <span style={{ marginLeft: 5, fontSize: 11, color: "#7a6a50" }}>({matches.length})</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="content">

        {/* ── TOURNAMENT TAB ─────────────────────────────────── */}
        {currentTab === "tournament" && (
          <div>
            <div className="card">
              <div className="card-title">Create New Tournament</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input className="input" style={{ flex: 2, minWidth: 160 }} placeholder="Tournament name *"
                  value={tForm.name}
                  onChange={e => setTForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && handleCreateTournament()} />
                <input className="input" style={{ flex: 1, minWidth: 120 }} placeholder="Format"
                  value={tForm.format}
                  onChange={e => setTForm(f => ({ ...f, format: e.target.value }))} />
                <button className="btn-primary" onClick={handleCreateTournament}>Create</button>
              </div>
              <p style={{ color: "#7a6a50", fontSize: 12, margin: "10px 0 0" }}>
                Creates 4 groups automatically: <strong>A</strong> (Boys ≤15) · <strong>B</strong> (Men 16–30) · <strong>C</strong> (Women ≤30) · <strong>D</strong> (All 31+)
              </p>
            </div>

            {tournaments.length === 0
              ? <div className="empty">No tournaments yet — create one above.</div>
              : tournaments.map(t => (
                <div key={t.tournament_id} className="card" style={{
                  marginBottom: 10, cursor: "pointer",
                  border: activeTId === t.tournament_id ? "2px solid #2d5a27" : undefined,
                }} onClick={() => setActiveTId(t.tournament_id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong style={{ fontSize: 16 }}>{t.name}</strong>
                      <span style={{ marginLeft: 10, fontSize: 12, color: "#7a6a50" }}>{t.format}</span>
                    </div>
                    <span style={{
                      fontSize: 12, padding: "3px 10px", borderRadius: 4, fontWeight: 700,
                      background: t.is_active ? "#eaf2e8" : "#f5f0e8",
                      color:      t.is_active ? "#2d5a27" : "#7a6a50",
                    }}>
                      {t.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* ── PLAYERS TAB ────────────────────────────────────── */}
        {currentTab === "players" && (
          <div>
            <div className="card">
              <div className="card-title">Add Player</div>
              {!activeTId && (
                <p style={{ color: "#c0392b", fontSize: 13, marginBottom: 10 }}>
                  ⚠️ Create a tournament first — players are auto-assigned to it on registration.
                </p>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input className="input" style={{ flex: 2, minWidth: 140 }} placeholder="Full name *"
                  value={pForm.name}
                  onChange={e => setPForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && handleAddPlayer()} />
                <input className="input" style={{ width: 70 }} placeholder="Age" type="number" min={1}
                  value={pForm.age}
                  onChange={e => setPForm(f => ({ ...f, age: e.target.value }))} />
                <select className="input" style={{ width: 110 }} value={pForm.gender}
                  onChange={e => setPForm(f => ({ ...f, gender: e.target.value }))}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                <input className="input" style={{ width: 80 }} placeholder="Seed" type="number" min={1}
                  value={pForm.seed}
                  onChange={e => setPForm(f => ({ ...f, seed: e.target.value }))} />
                <button className="btn-primary" onClick={handleAddPlayer}>Add Player</button>
              </div>
              <p style={{ color: "#7a6a50", fontSize: 12, margin: "10px 0 0" }}>
                Player is automatically placed in the correct group based on age &amp; gender. Seed is optional — leave blank if not applicable.
              </p>
            </div>

            <div className="card-title" style={{ marginBottom: 8 }}>{players.length} Players</div>
            {players.length === 0
              ? <div className="empty">No players yet.</div>
              : (
                <table className="table">
                  <thead>
                    <tr>{["#", "Name", "Age", "Gender", "Group", "Actions"].map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {players.map((p, i) => {
                      // Find which group this player is in for the active tournament
                      const groupEntry = groups.find(g => g.players.some(gp => gp.player_id === p.player_id));
                      return (
                        <tr key={p.player_id} className={i % 2 === 0 ? "tr-even" : "tr-odd"}>
                          <td style={{ color: "#7a6a50" }}>{i + 1}</td>
                          <td><strong>{p.name}</strong></td>
                          <td>{p.age ?? "—"}</td>
                          <td>{p.gender ?? "—"}</td>
                          <td>
                            {groupEntry
                              ? <span style={{ background: "#eaf2e8", color: "#2d5a27", padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 700 }}>{groupEntry.group_name}</span>
                              : <span style={{ color: "#7a6a50", fontSize: 12 }}>—</span>
                            }
                          </td>
                          <td>
                            <button onClick={() => handleDeletePlayer(p.player_id)} style={{
                              background: "transparent", color: "#c0392b", border: "1px solid #c0392b",
                              borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontSize: 12,
                            }}>Delete</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            }
          </div>
        )}

        {/* ── GROUPS TAB ─────────────────────────────────────── */}
        {currentTab === "groups" && (
          <div>
            {!activeTId
              ? <div className="empty">Create a tournament first.</div>
              : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                    <p style={{ margin: 0, color: "#7a6a50", fontSize: 14 }}>
                      Set seeds for strong players, then generate fixtures.
                    </p>
                    <button className="btn-primary" onClick={handleGenerateFixtures}>⚡ Generate Fixtures</button>
                  </div>

                  {groups.length === 0
                    ? <div className="empty">No players added yet.</div>
                    : groups.map(g => (
                      <div key={g.group_id} className="card" style={{ marginBottom: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                          <div>
                            <span className="card-title" style={{ display: "inline" }}>{g.group_name}</span>
                            <span style={{ marginLeft: 10, fontSize: 12, color: "#7a6a50" }}>{GROUP_LABELS[g.group_name] || ""}</span>
                          </div>
                          <span style={{ fontSize: 12, color: "#7a6a50" }}>{g.players.length} players</span>
                        </div>

                        {g.players.length === 0
                          ? <p style={{ color: "#7a6a50", fontSize: 13, margin: 0 }}>No players in this group.</p>
                          : (
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ background: "#f5f0e8" }}>
                                  {["Player", "Age", "Gender", "Seed", ""].map((h, i) => (
                                    <th key={i} style={{ padding: "7px 10px", fontSize: 12, textAlign: "left", color: "#7a6a50", fontWeight: 700 }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {g.players.map((p, i) => (
                                  <tr key={p.player_id} style={{ background: i % 2 === 0 ? "#fff" : "#f5f0e8" }}>
                                    <td style={{ padding: "8px 10px", fontWeight: 600 }}>{p.name}</td>
                                    <td style={{ padding: "8px 10px", color: "#7a6a50" }}>{p.age ?? "—"}</td>
                                    <td style={{ padding: "8px 10px", color: "#7a6a50" }}>{p.gender ?? "—"}</td>
                                    <td style={{ padding: "8px 10px" }}>
                                      <SeedInput playerId={p.player_id} currentSeed={p.seed} onSet={handleSetSeed} />
                                    </td>
                                    <td style={{ padding: "8px 10px" }}>
                                      {p.seed && (
                                        <span style={{ background: "#fdf6e0", color: "#d4a017", border: "1px solid #d4a017", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                                          🌱 Seed {p.seed}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )
                        }
                      </div>
                    ))
                  }
                </>
              )
            }
          </div>
        )}

        {/* ── MATCHES TAB ────────────────────────────────────── */}
        {currentTab === "matches" && (
          <div>
            {!activeTId
              ? <div className="empty">Create a tournament first.</div>
              : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                    <span style={{ color: "#7a6a50", fontSize: 14 }}>{matches.length} matches total</span>
                    <button className="btn-primary" onClick={handleGenerateFixtures}>⚡ Regenerate Fixtures</button>
                  </div>

                  {matches.length === 0
                    ? <div className="empty">No matches yet — go to Groups tab and click Generate Fixtures.</div>
                    : <GroupedMatches
                        groups={groups}
                        matches={matches}
                        onStart={async (matchId) => { await handlePatchMatch(matchId, { status: "live" }); setActiveMatchId(matchId); }}
                        onOpenScorer={(matchId) => setActiveMatchId(matchId)}
                        onDelete={handleDeleteMatch}
                        onRematch={handleRematch}
                      />
                  }
                </>
              )
            }
          </div>
        )}
      </div>

      {/* ── FULLSCREEN SCORER OVERLAY ─────────────────────── */}
      {activeMatchId && (() => {
        const m = matches.find(x => x.match_id === activeMatchId);
        if (!m) return null;
        const p1 = getP1(m);
        const p2 = getP2(m);
        return (
          <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "#0f0a00",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}>
            {/* Top bar */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 20px",
              background: "#1a0a0a",
              borderBottom: "1px solid #2a1a0a",
            }}>
              <div style={{ color: "#7a6a50", fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
                🔴 Live Match · R{m.round}
              </div>
              <button
                onClick={() => setActiveMatchId(null)}
                style={{
                  background: "transparent", color: "#7a6a50",
                  border: "1px solid #333", borderRadius: 6,
                  padding: "5px 14px", cursor: "pointer", fontSize: 13,
                }}
              >✕ Close Scorer</button>
            </div>

            {/* Scorer — fills remaining height */}
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 24px 24px" }}>
              <LiveScorer
                match={m}
                p1={p1}
                p2={p2}
                onScore={(s1, s2, status) => handlePatchMatch(m.match_id, { score_p1: s1, score_p2: s2, ...(status ? { status } : {}) })}
                onFinish={async () => {
                  await handlePatchMatch(m.match_id, { status: "done" });
                  setActiveMatchId(null);
                }}
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Live Scorer Component ─────────────────────────────────────────────────────
// Serve logic: serve switches every 2 points.
// At deuce (10-10+), serve switches every point.
// Returns 1 or 2 (which player is serving).
function getServe(s1, s2) {
  const total = s1 + s2;
  const isDeuce = s1 >= 10 && s2 >= 10;
  if (isDeuce) {
    // Alternate every point from deuce onward
    return total % 2 === 0 ? 1 : 2;
  }
  // Every 2 points, serve switches. Player 1 starts.
  return Math.floor(total / 2) % 2 === 0 ? 1 : 2;
}

function LiveScorer({ match, p1, p2, onScore, onFinish }) {
  const s1 = p1?.score ?? 0;
  const s2 = p2?.score ?? 0;

  const isDeuce = s1 >= 10 && s2 >= 10;

  // Win rules:
  // 7-0 → instant win
  // Otherwise first to 11 with 2-point lead (deuce rule)
  const winner = (() => {
    if (s1 === 7 && s2 === 0) return 1;
    if (s2 === 7 && s1 === 0) return 2;
    if (s1 >= 11 && s1 - s2 >= 2) return 1;
    if (s2 >= 11 && s2 - s1 >= 2) return 2;
    return null;
  })();

  // firstServer: who started serving (1 or 2). Admin can override.
  // Serve switches every 2 points from firstServer; every 1 point at deuce.
  const [firstServer, setFirstServer] = useState(1);

  const serving = winner ? null : (() => {
    const total = s1 + s2;
    if (isDeuce) {
      // At deuce, alternate every point. Base from firstServer at total=20.
      const deuceTotal = total - 20; // points played since 10-10
      return deuceTotal % 2 === 0 ? firstServer : (firstServer === 1 ? 2 : 1);
    }
    // Every 2 points, serve flips from firstServer
    const flips = Math.floor(total / 2);
    return flips % 2 === 0 ? firstServer : (firstServer === 1 ? 2 : 1);
  })();

  const addPoint = (player) => {
    if (winner) return;
    const ns1 = player === 1 ? s1 + 1 : s1;
    const ns2 = player === 2 ? s2 + 1 : s2;
    const isWin = (ns1 === 7 && ns2 === 0) || (ns2 === 7 && ns1 === 0)
               || (ns1 >= 11 && ns1 - ns2 >= 2)
               || (ns2 >= 11 && ns2 - ns1 >= 2);
    onScore(ns1, ns2, isWin ? "done" : undefined);
  };

  const undoPoint = (player) => {
    onScore(player === 1 ? Math.max(0, s1 - 1) : s1, player === 2 ? Math.max(0, s2 - 1) : s2);
  };

  const statusLabel = () => {
    if (winner) return winner === 1 ? `🏆 ${p1?.player?.name} wins!` : `🏆 ${p2?.player?.name} wins!`;
    if (isDeuce) {
      if (s1 === s2) return "Deuce";
      return s1 > s2 ? `Advantage ${p1?.player?.name}` : `Advantage ${p2?.player?.name}`;
    }
    return null;
  };

  const serveName = serving === 1 ? (p1?.player?.name ?? "P1") : (p2?.player?.name ?? "P2");
  const otherName = serving === 1 ? (p2?.player?.name ?? "P2") : (p1?.player?.name ?? "P1");

  return (
    <div style={{ background: "#0f0a00", borderRadius: 12, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Serve selector */}
      {!winner && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 11, color: "#7a6a50", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
            Serving Now
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {/* P1 serve button */}
            <button
              onClick={() => setFirstServer(1)}
              style={{
                padding: "8px 18px", borderRadius: 8, fontWeight: 800, fontSize: 14, cursor: "pointer",
                background: serving === 1 ? "#d4a017" : "transparent",
                color: serving === 1 ? "#1a1208" : "#aaa",
                border: serving === 1 ? "2px solid #d4a017" : "2px solid #444",
                transition: "all .15s",
              }}
            >
              🏓 {p1?.player?.name ?? "Player 1"}
            </button>
            {/* P2 serve button */}
            <button
              onClick={() => setFirstServer(2)}
              style={{
                padding: "8px 18px", borderRadius: 8, fontWeight: 800, fontSize: 14, cursor: "pointer",
                background: serving === 2 ? "#d4a017" : "transparent",
                color: serving === 2 ? "#1a1208" : "#aaa",
                border: serving === 2 ? "2px solid #d4a017" : "2px solid #444",
                transition: "all .15s",
              }}
            >
              {p2?.player?.name ?? "Player 2"} 🏓
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
            Tap to override · auto-switches every 2 pts
          </div>
        </div>
      )}

      {/* Score display */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24 }}>

        {/* Player 1 */}
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6 }}>
            {serving === 1 && !winner && (
              <span style={{ fontSize: 18 }} title="Serving">🏓</span>
            )}
            <div style={{ color: "#e8dfc8", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
              {p1?.player?.name ?? "Player 1"}
            </div>
          </div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 72, fontWeight: 900, color: winner === 1 ? "#d4a017" : "#fff", lineHeight: 1 }}>
            {s1}
          </div>
        </div>

        {/* Middle */}
        <div style={{ textAlign: "center", minWidth: 40 }}>
          <div style={{ color: "#7a6a50", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700 }}>–</div>
          {statusLabel() && (
            <div style={{
              marginTop: 8, fontSize: 11, fontWeight: 700, letterSpacing: 1,
              color: winner ? "#d4a017" : "#f87171",
              textTransform: "uppercase", textAlign: "center",
            }}>
              {statusLabel()}
            </div>
          )}
        </div>

        {/* Player 2 */}
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6 }}>
            <div style={{ color: "#e8dfc8", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
              {p2?.player?.name ?? "Player 2"}
            </div>
            {serving === 2 && !winner && (
              <span style={{ fontSize: 18 }} title="Serving">🏓</span>
            )}
          </div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 72, fontWeight: 900, color: winner === 2 ? "#d4a017" : "#fff", lineHeight: 1 }}>
            {s2}
          </div>
        </div>
      </div>

      {/* Point buttons */}
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        {/* P1 controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", flex: 1 }}>
          <button
            onClick={() => addPoint(1)} disabled={!!winner}
            style={{
              width: "100%", padding: "14px 0",
              background: winner ? "#333" : serving === 1 ? "#3a7a33" : "#2d5a27",
              color: "#fff", border: serving === 1 && !winner ? "2px solid #d4a017" : "2px solid transparent",
              borderRadius: 8, fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 18, fontWeight: 800, cursor: winner ? "not-allowed" : "pointer",
              opacity: winner ? 0.5 : 1,
            }}
          >+ Point</button>
          <button
            onClick={() => undoPoint(1)} disabled={s1 === 0}
            style={{
              width: "100%", padding: "8px 0", background: "transparent", color: "#7a6a50",
              border: "1px solid #333", borderRadius: 6, fontSize: 13,
              cursor: s1 === 0 ? "not-allowed" : "pointer", opacity: s1 === 0 ? 0.4 : 1,
            }}
          >↩ Undo</button>
        </div>

        {/* P2 controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", flex: 1 }}>
          <button
            onClick={() => addPoint(2)} disabled={!!winner}
            style={{
              width: "100%", padding: "14px 0",
              background: winner ? "#333" : serving === 2 ? "#3a7a33" : "#2d5a27",
              color: "#fff", border: serving === 2 && !winner ? "2px solid #d4a017" : "2px solid transparent",
              borderRadius: 8, fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 18, fontWeight: 800, cursor: winner ? "not-allowed" : "pointer",
              opacity: winner ? 0.5 : 1,
            }}
          >+ Point</button>
          <button
            onClick={() => undoPoint(2)} disabled={s2 === 0}
            style={{
              width: "100%", padding: "8px 0", background: "transparent", color: "#7a6a50",
              border: "1px solid #333", borderRadius: 6, fontSize: 13,
              cursor: s2 === 0 ? "not-allowed" : "pointer", opacity: s2 === 0 ? 0.4 : 1,
            }}
          >↩ Undo</button>
        </div>
      </div>

      {/* Finish button */}
      <button
        onClick={onFinish} disabled={!winner}
        style={{
          width: "100%", padding: "12px 0",
          background: winner ? "#d4a017" : "#222",
          color: winner ? "#1a1208" : "#555",
          border: "none", borderRadius: 8,
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 16, fontWeight: 800, letterSpacing: 1,
          cursor: winner ? "pointer" : "not-allowed", transition: "background .2s",
        }}
      >
        {winner ? `🏆 Finish — ${winner === 1 ? p1?.player?.name : p2?.player?.name} Wins` : "Finish Match (play until winner)"}
      </button>
    </div>
  );
}

// ── Grouped Matches Component ─────────────────────────────────────────────────
function GroupedMatches({ groups, matches, onStart, onOpenScorer, onDelete, onRematch }) {
  const [openGroups, setOpenGroups] = useState(() => {
    // Start with all groups open
    const init = {};
    groups.forEach(g => { init[g.group_id] = true; });
    return init;
  });

  const toggleGroup = (gid) => setOpenGroups(prev => ({ ...prev, [gid]: !prev[gid] }));

  // Match → group lookup via group_id on the match
  const matchesByGroup = (groupId) => matches.filter(m => m.group_id === groupId);
  // Unassigned matches (no group_id)
  const ungrouped = matches.filter(m => !m.group_id);

  const liveCount  = (gid) => matchesByGroup(gid).filter(m => m.status === "live").length;
  const doneCount  = (gid) => matchesByGroup(gid).filter(m => m.status === "done" || m.status === "completed").length;
  const totalCount = (gid) => matchesByGroup(gid).length;

  const renderMatch = (m) => {
    const p1 = m.participants?.find(p => p.position === 1);
    const p2 = m.participants?.find(p => p.position === 2);
    const isLive = m.status === "live";
    const isDone = m.status === "done" || m.status === "completed";

    return (
      <div key={m.match_id} style={{
        background: "#fff",
        border: isLive ? "2px solid #c0392b" : "1.5px solid #e8dfc8",
        borderRadius: 8, padding: "12px 14px", marginBottom: 8,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {/* Names + badges */}
          <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <span>{p1?.player?.name ?? "?"}</span>
            <span style={{ color: "#7a6a50", fontWeight: 400, fontSize: 13 }}>vs</span>
            <span>{p2?.player?.name ?? "?"}</span>
            <span style={{ fontSize: 11, background: "#e8dfc8", color: "#6b4c2a", padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>R{m.round}</span>
            {m.table_number && (
              <span style={{ fontSize: 11, background: "#fdf6e0", color: "#d4a017", border: "1px solid #d4a017", padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>
                Table {m.table_number}
              </span>
            )}
            {isLive && <span style={{ fontSize: 11, background: "#c0392b", color: "#fff", padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>🔴 LIVE</span>}
            {isDone  && <span style={{ fontSize: 11, background: "#eaf2e8", color: "#2d5a27", padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>✅ DONE</span>}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {!isLive && !isDone && (
              <button onClick={() => onStart(m.match_id)} style={{
                background: "#c0392b", color: "#fff", border: "none", borderRadius: 6,
                padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700,
              }}>▶ Start</button>
            )}
            {isLive && (
              <button onClick={() => onOpenScorer(m.match_id)} style={{
                background: "#c0392b", color: "#fff", border: "none", borderRadius: 6,
                padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700,
              }}>🎯 Score</button>
            )}
            {isDone && onRematch && (
              <button onClick={() => onRematch(m.match_id)} style={{
                background: "transparent", color: "#d4a017", border: "1.5px solid #d4a017",
                borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700,
              }}>↩ Rematch</button>
            )}
            {!isDone && (
              <button onClick={() => onDelete(m.match_id)} style={{
                background: "transparent", color: "#7a6a50", border: "1.5px solid #cfc0a0",
                borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 13,
              }}>✕</button>
            )}
          </div>
        </div>

        {/* Winner banner */}
        {isDone && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "#eaf2e8", borderRadius: 6, display: "flex", alignItems: "center", gap: 10 }}>
            <span>🏆</span>
            <span style={{ fontWeight: 700, color: "#2d5a27", fontSize: 14 }}>
              {p1?.is_winner ? p1?.player?.name : p2?.is_winner ? p2?.player?.name : "Complete"}
            </span>
            <span style={{ color: "#7a6a50", fontSize: 13 }}>{p1?.score} – {p2?.score}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {groups.map(g => {
        const gMatches = matchesByGroup(g.group_id);
        if (gMatches.length === 0) return null;
        const isOpen = openGroups[g.group_id] ?? true;
        const live = liveCount(g.group_id);
        const done = doneCount(g.group_id);
        const total = totalCount(g.group_id);

        return (
          <div key={g.group_id} style={{ marginBottom: 16 }}>
            {/* Group header — clickable to expand/collapse */}
            <div
              onClick={() => toggleGroup(g.group_id)}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "#e8dfc8", borderRadius: isOpen ? "8px 8px 0 0" : 8,
                padding: "10px 16px", cursor: "pointer",
                border: "1.5px solid #cfc0a0",
                borderBottom: isOpen ? "none" : "1.5px solid #cfc0a0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 800, color: "#1a1208", letterSpacing: 1 }}>
                  {g.group_name}
                </span>
                {live > 0 && (
                  <span style={{ fontSize: 11, background: "#c0392b", color: "#fff", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>
                    🔴 {live} LIVE
                  </span>
                )}
                <span style={{ fontSize: 12, color: "#7a6a50" }}>
                  {done}/{total} done
                </span>
              </div>
              <span style={{ color: "#7a6a50", fontSize: 16 }}>{isOpen ? "▲" : "▼"}</span>
            </div>

            {/* Match list */}
            {isOpen && (
              <div style={{
                border: "1.5px solid #cfc0a0", borderTop: "none",
                borderRadius: "0 0 8px 8px", padding: "12px",
                background: "#faf7f2",
              }}>
                {gMatches.map(renderMatch)}
              </div>
            )}
          </div>
        );
      })}

      {/* Ungrouped matches fallback */}
      {ungrouped.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: "#e8dfc8", borderRadius: "8px 8px 0 0", padding: "10px 16px", border: "1.5px solid #cfc0a0", borderBottom: "none" }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 800, color: "#1a1208" }}>Other Matches</span>
          </div>
          <div style={{ border: "1.5px solid #cfc0a0", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "12px", background: "#faf7f2" }}>
            {ungrouped.map(renderMatch)}
          </div>
        </div>
      )}
    </div>
  );
}

function SeedInput({ playerId, currentSeed, onSet }) {
  const [val, setVal] = useState(currentSeed ?? "");
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <input
        type="number" min={1} placeholder="—"
        value={val}
        onChange={e => setVal(e.target.value)}
        style={{ width: 48, padding: "3px 6px", background: "#f5f0e8", border: "1px solid #cfc0a0", borderRadius: 4, fontSize: 13 }}
      />
      <button onClick={() => onSet(playerId, parseInt(val) || null)} style={{
        background: "#d4a017", color: "#fff", border: "none", borderRadius: 4,
        padding: "3px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700,
      }}>Set</button>
    </div>
  );
}