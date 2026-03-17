import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getPlayers, createPlayer, deletePlayer,
  getTournaments, createTournament,
  getParticipants,
  getMatches, updateMatch, deleteMatch, generateFixtures, rematchMatch, triggerKnockout,
  setPlayerSeed,
  logout,
} from "../api/client";

// ── Helpers ──────────────────────────────────────────────────
function getP1(match) { return match.participants?.find(p => p.position === 1); }
function getP2(match) { return match.participants?.find(p => p.position === 2); }

const GROUP_LABELS = {
  "Group A": "Boys U18 & Women (all ages)",
  "Group B": "Men 18–29",
  "Group C": "Men 18–29",
  "Group D": "Men 30+",
};

// Determine winner of a single set
function setWinner(s1, s2) {
  if (s1 === 7 && s2 === 0) return 1;
  if (s2 === 7 && s1 === 0) return 2;
  if (s1 >= 11 && s1 - s2 >= 2) return 1;
  if (s2 >= 11 && s2 - s1 >= 2) return 2;
  return null;
}

// Compute who is currently serving within a set
function computeServe(s1, s2, firstServer) {
  const total   = s1 + s2;
  const isDeuce = s1 >= 10 && s2 >= 10;
  if (isDeuce) {
    const deuceTotal = total - 20;
    return deuceTotal % 2 === 0 ? firstServer : (firstServer === 1 ? 2 : 1);
  }
  const flips = Math.floor(total / 2);
  return flips % 2 === 0 ? firstServer : (firstServer === 1 ? 2 : 1);
}

export default function AdminPortal({ onLogout }) {
  const { tab: urlTab } = useParams();
  const navigate = useNavigate();
  const validTabs = ["tournament", "players", "groups", "matches"];
  const currentTab = validTabs.includes(urlTab) ? urlTab : "tournament";

  const setTab = (t) => navigate(`/admin/${t}`, { replace: true });
  const [msg, setMsg] = useState({ text: "", type: "ok" });

  const [tournaments, setTournaments] = useState([]);
  const [activeTId, setActiveTId]     = useState(null);
  const [tForm, setTForm]             = useState({ name: "", sport_type: "Table Tennis", format: "Group + Knockout", is_active: true });

  const [players, setPlayers]         = useState([]);
  const [pForm, setPForm]             = useState({ name: "", age: "", gender: "Male", seed: "" });

  const [groups, setGroups]           = useState([]);
  const [matches, setMatches]         = useState([]);
  const [activeMatchId, setActiveMatchId] = useState(null);

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

  const handleTriggerKO = async () => {
    if (!activeTId) return;
    try {
      const r = await triggerKnockout(activeTId);
      loadTournamentData();
      flash(r.ko_matches_created > 0 ? `Knockout bracket created! ${r.ko_matches_created} matches.` : "KO already exists or not enough qualifiers.");
    } catch (e) { flash("Error: " + e.message, "err"); }
  };

  const handleRematch = async (matchId) => {
    try { await rematchMatch(matchId); loadTournamentData(); flash("Match reset — ready to replay."); }
    catch (e) { flash("Error: " + e.message, "err"); }
  };

  // ── Matches ───────────────────────────────────────────────────
  const handlePatchMatch = async (matchId, changes) => {
    try { await updateMatch(matchId, changes); loadTournamentData(); }
    catch (e) { flash("Error: " + e.message, "err"); }
  };

  // Sets-based update: sends { set_update: { set_number, score_p1, score_p2 } }
  const handleSetUpdate = async (matchId, setUpdate) => {
    try { await updateMatch(matchId, { set_update: setUpdate }); loadTournamentData(); }
    catch (e) { flash("Error saving set: " + e.message, "err"); }
  };

  // Update current server on backend — public portal reads this directly
  const handleServeChange = async (matchId, server) => {
    try { await updateMatch(matchId, { current_server: server }); }
    catch (e) { console.error("Error updating server:", e); }
  };

  // Undo last confirmed set — deletes it from the backend then reloads
  const handleUndoSet = async (matchId, setNumber) => {
    try {
      await updateMatch(matchId, { undo_set: setNumber });
      loadTournamentData();
      flash("Set undone.");
    } catch (e) { flash("Error undoing set: " + e.message, "err"); }
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
          background:  msg.type === "err" ? "#fdf0ee" : undefined,
          borderColor: msg.type === "err" ? "#c0392b" : undefined,
          color:       msg.type === "err" ? "#c0392b" : undefined,
        }}>
          {msg.text}
        </div>
      )}

      {activeTournament && (
        <div style={{ background: "#eaf2e8", borderBottom: "1.5px solid #cfc0a0", padding: "6px 20px" }}>
          <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#2d5a27", fontWeight: 700 }}>Active:</span>
            {tournaments.map(t => (
              <button key={t.tournament_id} onClick={() => setActiveTId(t.tournament_id)} style={{
                padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600,
                background: activeTId === t.tournament_id ? "#2d5a27" : "transparent",
                color:      activeTId === t.tournament_id ? "#fff" : "#6b4c2a",
                border:     `1.5px solid ${activeTId === t.tournament_id ? "#2d5a27" : "#cfc0a0"}`,
              }}>{t.name}</button>
            ))}
          </div>
        </div>
      )}

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
                    }}>{t.is_active ? "Active" : "Inactive"}</span>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {currentTab === "players" && (
          <div>
            <div className="card">
              <div className="card-title">Add Player</div>
              {!activeTId && <p style={{ color: "#c0392b", fontSize: 13, marginBottom: 10 }}>⚠️ Create a tournament first.</p>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input className="input" style={{ flex: 2, minWidth: 140 }} placeholder="Full name *"
                  value={pForm.name}
                  onChange={e => setPForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && handleAddPlayer()} />
                <input className="input" style={{ width: 70 }} placeholder="Age" type="number" min={1}
                  value={pForm.age} onChange={e => setPForm(f => ({ ...f, age: e.target.value }))} />
                <select className="input" style={{ width: 110 }} value={pForm.gender}
                  onChange={e => setPForm(f => ({ ...f, gender: e.target.value }))}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                <input className="input" style={{ width: 80 }} placeholder="Seed" type="number" min={1}
                  value={pForm.seed} onChange={e => setPForm(f => ({ ...f, seed: e.target.value }))} />
                <button className="btn-primary" onClick={handleAddPlayer}>Add Player</button>
              </div>
            </div>
            <div className="card-title" style={{ marginBottom: 8 }}>{players.length} Players</div>
            {players.length === 0 ? <div className="empty">No players yet.</div> : (
              <table className="table">
                <thead>
                  <tr>{["#", "Name", "Age", "Gender", "Group", "Actions"].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {players.map((p, i) => {
                    const groupEntry = groups.find(g => g.players.some(gp => gp.player_id === p.player_id));
                    return (
                      <tr key={p.player_id} className={i % 2 === 0 ? "tr-even" : "tr-odd"}>
                        <td style={{ color: "#7a6a50" }}>{i + 1}</td>
                        <td><strong>{p.name}</strong></td>
                        <td>{p.age ?? "—"}</td>
                        <td>{p.gender ?? "—"}</td>
                        <td>{groupEntry
                          ? <span style={{ background: "#eaf2e8", color: "#2d5a27", padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 700 }}>{groupEntry.group_name}</span>
                          : <span style={{ color: "#7a6a50", fontSize: 12 }}>—</span>
                        }</td>
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
            )}
          </div>
        )}

        {currentTab === "groups" && (
          <div>
            {!activeTId ? <div className="empty">Create a tournament first.</div> : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                  <p style={{ margin: 0, color: "#7a6a50", fontSize: 14 }}>Set seeds for strong players, then generate fixtures.</p>
                  <button className="btn-primary" onClick={handleGenerateFixtures}>⚡ Generate Fixtures</button>
                </div>
                {groups.length === 0 ? <div className="empty">No players added yet.</div>
                  : groups.map(g => (
                    <div key={g.group_id} className="card" style={{ marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                        <div>
                          <span className="card-title" style={{ display: "inline" }}>{g.group_name}</span>
                          <span style={{ marginLeft: 10, fontSize: 12, color: "#7a6a50" }}>{GROUP_LABELS[g.group_name] || ""}</span>
                        </div>
                        <span style={{ fontSize: 12, color: "#7a6a50" }}>{g.players.length} players</span>
                      </div>
                      {g.players.length === 0 ? <p style={{ color: "#7a6a50", fontSize: 13, margin: 0 }}>No players in this group.</p> : (
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
                                <td style={{ padding: "8px 10px", fontWeight: 600 }}>
                                  {p.name}
                                  {p.sub_group && (
                                    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700,
                                      background: p.sub_group === "women" ? "#fde8f0" : "#e8f0fd",
                                      color: p.sub_group === "women" ? "#c0392b" : "#2d5a27",
                                      padding: "1px 5px", borderRadius: 3 }}>
                                      {p.sub_group === "boys" ? "U18 Boy" : "Woman"}
                                    </span>
                                  )}
                                </td>
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
                      )}
                    </div>
                  ))
                }
              </>
            )}
          </div>
        )}

        {currentTab === "matches" && (
          <div>
            {!activeTId ? <div className="empty">Create a tournament first.</div> : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                  <span style={{ color: "#7a6a50", fontSize: 14 }}>{matches.length} matches total</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-primary" onClick={handleGenerateFixtures}>⚡ Generate Fixtures</button>
                    <button className="btn-primary" onClick={handleTriggerKO}
                      style={{ background: "#d4a017" }}>🏆 Trigger KO</button>
                  </div>
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
            )}
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
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 20px", background: "#1a0a0a",
              borderBottom: "1px solid #2a1a0a",
            }}>
              <div style={{ color: "#7a6a50", fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
                🔴 Live · {m.stage ?? "Group"} · R{m.round}
              </div>
              <button onClick={() => setActiveMatchId(null)} style={{
                background: "transparent", color: "#7a6a50",
                border: "1px solid #333", borderRadius: 6,
                padding: "5px 14px", cursor: "pointer", fontSize: 13,
              }}>✕ Close</button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 20px 24px" }}>
              <LiveScorer
                match={m}
                p1={p1}
                p2={p2}
                onSetUpdate={(setUpdate) => handleSetUpdate(m.match_id, setUpdate)}
                onUndoSet={(setNum) => handleUndoSet(m.match_id, setNum)}
                onServeChange={(server) => handleServeChange(m.match_id, server)}
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

// ── Live Scorer (Sets-Based) ──────────────────────────────────────────────────
function LiveScorer({ match, p1, p2, onSetUpdate, onUndoSet, onServeChange, onFinish }) {
  const setsToWin = match?.sets_to_win ?? 2;

  const completedSets = (match?.sets ?? [])
    .filter(s => s.winner_position !== null && s.winner_position !== undefined)
    .sort((a, b) => a.set_number - b.set_number);

  const setsWonP1 = completedSets.filter(s => s.winner_position === 1).length;
  const setsWonP2 = completedSets.filter(s => s.winner_position === 2).length;

  // Which set the admin is currently on — only advances when they confirm
  const [adminSetNum, setAdminSetNum] = useState(1);

  // matchWinner only becomes true after admin has confirmed the deciding set
  // (i.e. adminSetNum has advanced past it). Keeps scoring screen open until then.
  const confirmedSetsWonP1 = completedSets.filter(s => s.winner_position === 1 && s.set_number < adminSetNum).length;
  const confirmedSetsWonP2 = completedSets.filter(s => s.winner_position === 2 && s.set_number < adminSetNum).length;
  const matchWinner = confirmedSetsWonP1 >= setsToWin ? 1 : confirmedSetsWonP2 >= setsToWin ? 2 : null;

  // Local points for current set (always editable)
  const [s1, setS1] = useState(0);
  const [s2, setS2] = useState(0);
  const [saving, setSaving] = useState(false);

  // If a set is undone, go back to it with 0-0
  useEffect(() => {
    const maxValid = completedSets.length + 1;
    if (adminSetNum > maxValid) {
      setAdminSetNum(maxValid);
      setS1(0); setS2(0);
    }
  }, [completedSets.length]); // eslint-disable-line

  // Serve tracking
  const [set1FirstServer, setSet1FirstServer] = useState(1);
  const firstServerForSet = (n) => ((set1FirstServer - 1 + (n - 1)) % 2) + 1;
  const firstServer = firstServerForSet(adminSetNum);
  const isDeuce     = s1 >= 10 && s2 >= 10;
  const serving     = computeServe(s1, s2, firstServer);

  // Detect set winner from current local scores — purely for showing banner
  const curSetWinner = setWinner(s1, s2);

  const p1Name = p1?.player?.name ?? "Player 1";
  const p2Name = p2?.player?.name ?? "Player 2";

  // +Point — always works, no locking
  const addPoint = async (pl) => {
    if (matchWinner) return;
    const ns1 = pl === 1 ? s1 + 1 : s1;
    const ns2 = pl === 2 ? s2 + 1 : s2;
    setS1(ns1); setS2(ns2);
    await onSetUpdate({ set_number: adminSetNum, score_p1: ns1, score_p2: ns2 });
  };

  // Undo point — always works
  const undoPoint = async (pl) => {
    if (matchWinner) return;
    const ns1 = pl === 1 ? Math.max(0, s1 - 1) : s1;
    const ns2 = pl === 2 ? Math.max(0, s2 - 1) : s2;
    setS1(ns1); setS2(ns2);
    await onSetUpdate({ set_number: adminSetNum, score_p1: ns1, score_p2: ns2 });
  };

  // Confirm set — saves to backend and resets scores for next set.
  // Never finishes the match — admin must press Finish Match separately.
  const confirmAndNext = async () => {
    if (!curSetWinner || saving) return;
    setSaving(true);
    try {
      await onSetUpdate({ set_number: adminSetNum, score_p1: s1, score_p2: s2 });
      setAdminSetNum(n => n + 1);
      setS1(0); setS2(0);
    } finally {
      setSaving(false);
    }
  };

  // Undo last confirmed set
  const undoLastSet = async () => {
    if (completedSets.length === 0 || saving) return;
    const lastSet = completedSets[completedSets.length - 1];
    setSaving(true);
    try {
      await onUndoSet(lastSet.set_number);
      setAdminSetNum(lastSet.set_number);
      setS1(0); setS2(0);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: "#0f0a00", borderRadius: 12, padding: "20px",
      display: "flex", flexDirection: "column", gap: 14,
      maxWidth: 520, margin: "0 auto", width: "100%",
    }}>

      {/* Context */}
      <div style={{ textAlign: "center", fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
        Best of {setsToWin * 2 - 1} sets · Set {adminSetNum} · Round {match?.round}
      </div>

      {/* Sets scoreboard */}
      <div style={{
        display: "flex", alignItems: "stretch",
        background: "#1a1208", borderRadius: 10,
        border: "1px solid #2a1a0a", overflow: "hidden",
      }}>
        <div style={{ flex: 1, textAlign: "center", padding: "14px 10px" }}>
          <div style={{ fontSize: 11, color: "#7a6a50", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{p1Name}</div>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif", fontSize: 64, fontWeight: 900, lineHeight: 1,
            color: matchWinner === 1 ? "#d4a017" : setsWonP1 > setsWonP2 ? "#e8dfc8" : "#3a3a3a",
          }}>{setsWonP1}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", padding: "0 12px", color: "#2a2a2a", fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>SETS</div>
        <div style={{ flex: 1, textAlign: "center", padding: "14px 10px" }}>
          <div style={{ fontSize: 11, color: "#7a6a50", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{p2Name}</div>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif", fontSize: 64, fontWeight: 900, lineHeight: 1,
            color: matchWinner === 2 ? "#d4a017" : setsWonP2 > setsWonP1 ? "#e8dfc8" : "#3a3a3a",
          }}>{setsWonP2}</div>
        </div>
      </div>

      {/* Completed set history + undo */}
      {completedSets.length > 0 && (
        <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
          {completedSets.map((s, i) => {
            const w = s.winner_position;
            return (
              <div key={s.set_number} style={{
                background: "#1a1208", border: "1px solid #2a1a0a",
                borderRadius: 6, padding: "4px 10px", fontSize: 12,
                display: "flex", alignItems: "center", gap: 4,
              }}>
                <span style={{ color: "#3a3a3a", fontSize: 10, fontWeight: 700 }}>S{s.set_number}</span>
                <span style={{ color: w === 1 ? "#d4a017" : "#666", fontWeight: 800 }}>{s.score_p1}</span>
                <span style={{ color: "#333" }}>–</span>
                <span style={{ color: w === 2 ? "#d4a017" : "#666", fontWeight: 800 }}>{s.score_p2}</span>
              </div>
            );
          })}
          {!matchWinner && (
            <button onClick={undoLastSet} disabled={saving} style={{
              background: "transparent", color: "#c0392b",
              border: "1px solid #c0392b", borderRadius: 5,
              padding: "3px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700,
            }}>↩ Undo Set</button>
          )}
        </div>
      )}

      {/* Serve selector */}
      {!matchWinner && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ fontSize: 10, color: "#3a3a3a", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
            Set {adminSetNum} · Serving Now
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[1, 2].map(pl => {
              const isServ   = serving === pl;
              const name     = pl === 1 ? p1Name : p2Name;
              const targetS1 = ((pl - 1 + (2 - ((adminSetNum - 1) % 2))) % 2) + 1;
              return (
                <button key={pl}
                  onClick={async () => {
                    setSet1FirstServer(targetS1);
                    await onServeChange(pl);
                  }}
                  style={{
                    padding: "6px 14px", borderRadius: 7, fontWeight: 800,
                    fontSize: 13, cursor: "pointer",
                    background: isServ ? "#d4a017" : "transparent",
                    color: isServ ? "#1a1208" : "#777",
                    border: isServ ? "2px solid #d4a017" : "2px solid #2a2a2a",
                  }}
                >
                  {pl === 1 ? `🏓 ${name}` : `${name} 🏓`}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: "#333" }}>Tap to override · switches every 2 pts</div>
        </div>
      )}

      {/* Point scores — always white, no color changes */}
      {!matchWinner && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif", fontSize: 92, fontWeight: 900, lineHeight: 1,
              color: "#e8dfc8",
            }}>{s1}</div>
          </div>
          <div style={{ color: "#222", fontSize: 20, fontWeight: 700 }}>–</div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif", fontSize: 92, fontWeight: 900, lineHeight: 1,
              color: "#e8dfc8",
            }}>{s2}</div>
          </div>
        </div>
      )}

      {/* +Point freezes when set winner detected; ↩ Undo always active */}
      {!matchWinner && (
        <div style={{ display: "flex", gap: 10 }}>
          {[1, 2].map(pl => {
            const score  = pl === 1 ? s1 : s2;
            const isServ = serving === pl;
            const frozen = !!curSetWinner;
            return (
              <div key={pl} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <button
                  onClick={() => addPoint(pl)}
                  disabled={frozen}
                  style={{
                    width: "100%", padding: "16px 0",
                    background: frozen ? "#1a1a1a" : isServ ? "#3a7a33" : "#2d5a27",
                    color: frozen ? "#333" : "#fff",
                    border: isServ && !frozen ? "2px solid #d4a017" : "2px solid transparent",
                    borderRadius: 8,
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 20, fontWeight: 800,
                    cursor: frozen ? "not-allowed" : "pointer",
                    opacity: frozen ? 0.4 : 1,
                  }}
                >+ Point</button>
                <button
                  onClick={() => undoPoint(pl)}
                  disabled={score === 0}
                  style={{
                    width: "100%", padding: "7px 0",
                    background: "transparent", color: "#555",
                    border: "1px solid #222", borderRadius: 6,
                    fontSize: 12,
                    cursor: score === 0 ? "not-allowed" : "pointer",
                    opacity: score === 0 ? 0.3 : 1,
                  }}
                >↩ Undo</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Set winner banner + Confirm button — appears when set is won, stays until confirmed */}
      {!matchWinner && curSetWinner && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{
            textAlign: "center", padding: "10px",
            background: "#1a1208", borderRadius: 8, border: "1px solid #d4a017",
            fontSize: 13, fontWeight: 700, color: "#d4a017",
            letterSpacing: 1, textTransform: "uppercase",
          }}>
            {curSetWinner === 1 ? p1Name : p2Name} wins Set {adminSetNum}
          </div>
          <button onClick={confirmAndNext} disabled={saving} style={{
            width: "100%", padding: "14px 0",
            background: saving ? "#1a1a00" : "#d4a017",
            color: saving ? "#555" : "#1a1208",
            border: "none", borderRadius: 8,
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 17, fontWeight: 800, letterSpacing: 1,
            cursor: saving ? "not-allowed" : "pointer",
          }}>
            {saving ? "Saving…" : `✓ Confirm Set ${adminSetNum} → Next Set`}
          </button>
        </div>
      )}

      {/* Deuce / advantage — shown mid-set */}
      {!matchWinner && isDeuce && !curSetWinner && (
        <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: "#f87171", letterSpacing: 1, textTransform: "uppercase" }}>
          {s1 === s2 ? "Deuce" : s1 > s2 ? `Adv. ${p1Name}` : `Adv. ${p2Name}`}
        </div>
      )}

      {/* Match winner */}
      {matchWinner && (
        <div style={{ textAlign: "center", fontSize: 16, fontWeight: 700, color: "#d4a017", letterSpacing: 1, textTransform: "uppercase", padding: "8px 0" }}>
          🏆 {setsWonP1 >= setsToWin ? p1Name : p2Name} wins the match!
        </div>
      )}

      {/* Finish match */}
      <button onClick={onFinish} disabled={!matchWinner} style={{
        width: "100%", padding: "13px 0",
        background: matchWinner ? "#d4a017" : "#111",
        color: matchWinner ? "#1a1208" : "#2a2a2a",
        border: matchWinner ? "none" : "1px solid #1a1a1a",
        borderRadius: 8,
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 16, fontWeight: 800, letterSpacing: 1,
        cursor: matchWinner ? "pointer" : "not-allowed",
        transition: "background .2s",
      }}>
        {matchWinner
          ? `🏆 Confirm — ${setsWonP1 >= setsToWin ? p1Name : p2Name} Wins`
          : `Finish Match (first to ${setsToWin} sets)`
        }
      </button>
    </div>
  );
}


// ── Grouped Matches ───────────────────────────────────────────────────────────
function GroupedMatches({ groups, matches, onStart, onOpenScorer, onDelete, onRematch }) {
  const [openGroups, setOpenGroups] = useState(() => {
    const init = {};
    groups.forEach(g => { init[g.group_id] = true; });
    return init;
  });

  const toggleGroup  = (gid) => setOpenGroups(prev => ({ ...prev, [gid]: !prev[gid] }));
  const byGroup      = (gid) => matches.filter(m => m.group_id === gid);
  const ungrouped    = matches.filter(m => !m.group_id);

  // Get players with a bye in a specific round of a group
  const getByePlayers = (groupId, roundNum, allMatches, allGroups) => {
    const roundMatches = allMatches.filter(m =>
      m.group_id === groupId && m.round === roundNum && m.stage === "group"
    );
    if (!roundMatches.length) return [];
    const playersInMatches = new Set(
      roundMatches.flatMap(m => m.participants?.map(p => p.player_id) ?? [])
    );
    // Find all players in this group
    const group = allGroups.find(g => g.group_id === groupId);
    if (!group) return [];
    return group.players.filter(p => !playersInMatches.has(p.player_id));
  };

  const renderMatch = (m) => {
    const p1     = m.participants?.find(p => p.position === 1);
    const p2     = m.participants?.find(p => p.position === 2);
    const isLive = m.status === "live";
    const isDone = m.status === "done" || m.status === "completed";

    const cSets  = (m.sets ?? []).filter(s => setWinner(s.score_p1, s.score_p2) !== null).sort((a, b) => a.set_number - b.set_number);
    const sw1    = cSets.filter(s => setWinner(s.score_p1, s.score_p2) === 1).length;
    const sw2    = cSets.filter(s => setWinner(s.score_p1, s.score_p2) === 2).length;

    return (
      <div key={m.match_id} style={{
        background: "#fff",
        border: isLive ? "2px solid #c0392b" : "1.5px solid #e8dfc8",
        borderRadius: 8, padding: "12px 14px", marginBottom: 8,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
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
            {m.stage === "third" && <span style={{ fontSize: 11, background: "#e8f0fd", color: "#2d5a27", padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>🥉 3rd Place</span>}
            {isLive && <span style={{ fontSize: 11, background: "#c0392b", color: "#fff", padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>🔴 LIVE</span>}
            {isDone  && <span style={{ fontSize: 11, background: "#eaf2e8", color: "#2d5a27", padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>✅ DONE</span>}
          </div>
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
            {isDone && (
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

        {/* Done: winner + sets score */}
        {isDone && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "#eaf2e8", borderRadius: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>🏆</span>
            <span style={{ fontWeight: 700, color: "#2d5a27", fontSize: 14 }}>
              {p1?.is_winner ? p1?.player?.name : p2?.is_winner ? p2?.player?.name : "Complete"}
            </span>
            <span style={{ color: "#2d5a27", fontWeight: 800, fontSize: 14 }}>{sw1}–{sw2}</span>
            {cSets.length > 0 && (
              <span style={{ color: "#7a6a50", fontSize: 12 }}>
                ({cSets.map(s => `${s.score_p1}-${s.score_p2}`).join(", ")})
              </span>
            )}
          </div>
        )}

        {/* Live: sets progress */}
        {isLive && cSets.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#7a6a50", fontWeight: 700 }}>Sets {sw1}–{sw2}</span>
            {cSets.map(s => {
              const w = setWinner(s.score_p1, s.score_p2);
              return (
                <span key={s.set_number} style={{ fontSize: 11, color: "#7a6a50" }}>
                  S{s.set_number}: <span style={{ color: w === 1 ? "#2d5a27" : "#c0392b", fontWeight: 700 }}>{s.score_p1}–{s.score_p2}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {groups.map(g => {
        const gm     = byGroup(g.group_id);
        if (!gm.length) return null;
        const isOpen = openGroups[g.group_id] ?? true;
        const live   = gm.filter(m => m.status === "live").length;
        const done   = gm.filter(m => m.status === "done" || m.status === "completed").length;

        // Find rounds in this group and check for byes
        const groupRounds = [...new Set(gm.map(m => m.round))].sort();
        const byesByRound = {};
        groupRounds.forEach(r => {
          const byePlayers = getByePlayers(g.group_id, r, matches, groups);
          if (byePlayers.length > 0) byesByRound[r] = byePlayers;
        });

        return (
          <div key={g.group_id} style={{ marginBottom: 16 }}>
            <div onClick={() => toggleGroup(g.group_id)} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "#e8dfc8", borderRadius: isOpen ? "8px 8px 0 0" : 8,
              padding: "10px 16px", cursor: "pointer",
              border: "1.5px solid #cfc0a0",
              borderBottom: isOpen ? "none" : "1.5px solid #cfc0a0",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 800, color: "#1a1208", letterSpacing: 1 }}>{g.group_name}</span>
                {live > 0 && <span style={{ fontSize: 11, background: "#c0392b", color: "#fff", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>🔴 {live} LIVE</span>}
                <span style={{ fontSize: 12, color: "#7a6a50" }}>{done}/{gm.length} done</span>
              </div>
              <span style={{ color: "#7a6a50", fontSize: 16 }}>{isOpen ? "▲" : "▼"}</span>
            </div>
            {isOpen && (
              <div style={{ border: "1.5px solid #cfc0a0", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "12px", background: "#faf7f2" }}>
                {Object.entries(byesByRound).map(([round, byePlayers]) => (
                  <div key={round} style={{
                    marginBottom: 8, padding: "7px 12px",
                    background: "#fdf6e0", borderRadius: 6,
                    border: "1px solid #e8d08a",
                    display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#d4a017",
                                   textTransform: "uppercase", letterSpacing: 1 }}>
                      R{round} Bye:
                    </span>
                    {byePlayers.map(p => (
                      <span key={p.player_id} style={{
                        fontSize: 12, fontWeight: 700, color: "#6b4c2a",
                        background: "#fff", border: "1px solid #e8d08a",
                        padding: "2px 8px", borderRadius: 4,
                      }}>
                        {p.name} ✓ advances
                      </span>
                    ))}
                  </div>
                ))}
                {gm.map(renderMatch)}
              </div>
            )}
          </div>
        );
      })}

      {/* KO stages: Quarter Finals → Semi Finals → Final */}
      {["quarter", "semi", "third", "final"].map(stage => {
        const sm = ungrouped.filter(m => m.stage === stage);
        if (!sm.length) return null;
        const stageLabel = stage === "quarter" ? "🏆 Quarter Finals"
                         : stage === "semi"    ? "🏆 Semi Finals"
                         : stage === "third"   ? "🥉 3rd Place"
                         :                       "🏆 Final";
        const live = sm.filter(m => m.status === "live").length;
        const done = sm.filter(m => m.status === "done" || m.status === "completed").length;
        const isOpen = openGroups[`ko_${stage}`] ?? true;
        return (
          <div key={stage} style={{ marginBottom: 16 }}>
            <div onClick={() => setOpenGroups(prev => ({ ...prev, [`ko_${stage}`]: !prev[`ko_${stage}`] }))} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "#fdf6e0", borderRadius: isOpen ? "8px 8px 0 0" : 8,
              padding: "10px 16px", cursor: "pointer",
              border: "1.5px solid #d4a017",
              borderBottom: isOpen ? "none" : "1.5px solid #d4a017",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 800, color: "#d4a017", letterSpacing: 1 }}>{stageLabel}</span>
                {live > 0 && <span style={{ fontSize: 11, background: "#c0392b", color: "#fff", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>🔴 {live} LIVE</span>}
                <span style={{ fontSize: 12, color: "#7a6a50" }}>{done}/{sm.length} done</span>
              </div>
              <span style={{ color: "#d4a017", fontSize: 16 }}>{isOpen ? "▲" : "▼"}</span>
            </div>
            {isOpen && (
              <div style={{ border: "1.5px solid #d4a017", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "12px", background: "#fffdf5" }}>
                {sm.map(renderMatch)}
              </div>
            )}
          </div>
        );
      })}
      {/* Any truly ungrouped matches that don't match a known stage */}
      {ungrouped.filter(m => !["quarter","semi","third","final"].includes(m.stage)).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: "#e8dfc8", borderRadius: "8px 8px 0 0", padding: "10px 16px", border: "1.5px solid #cfc0a0", borderBottom: "none" }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 800, color: "#1a1208" }}>Other Matches</span>
          </div>
          <div style={{ border: "1.5px solid #cfc0a0", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "12px", background: "#faf7f2" }}>
            {ungrouped.filter(m => !["quarter","semi","third","final"].includes(m.stage)).map(renderMatch)}
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
      <input type="number" min={1} placeholder="—" value={val}
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