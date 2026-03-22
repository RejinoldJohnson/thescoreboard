import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getPlayers, createPlayer, deletePlayer,
  getTournaments, createTournament,
  getParticipants,
  getMatches, updateMatch, deleteMatch, rematchMatch,
  assignPlayerGroup, createManualMatch, createBye, createExhibitionMatch,
  logout,
} from "../api/client";

// ── Helpers ──────────────────────────────────────────────────
function getP1(match) { return match.participants?.find(p => p.position === 1); }
function getP2(match) { return match.participants?.find(p => p.position === 2); }

const GROUP_LABELS = {
  "Group A": "Men Under 30",
  "Group B": "Men Under 30",
  "Group C": "Men 30+",
  "Group D": "Boys U18 & Women",
};

// Player category tag — shown next to names in Group D (U18 Boy / Woman)
// and in Group A/B as "U30" context
function playerTag(player, groupName) {
  if (!player) return null;
  const sg = player.sub_group;
  if (groupName === "Group D" && sg) {
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, marginLeft: 5,
        background: sg === "women" ? "#fde8f0" : "#e8f0fd",
        color: sg === "women" ? "#c0392b" : "#2d5a27",
        padding: "1px 5px", borderRadius: 3,
      }}>
        {sg === "boys" ? "U18 Boy" : "Woman"}
      </span>
    );
  }
  if ((groupName === "Group A" || groupName === "Group B") && player.age) {
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, marginLeft: 5,
        background: "#f0f4ff", color: "#3a5cc7",
        padding: "1px 5px", borderRadius: 3,
      }}>
        U30
      </span>
    );
  }
  return null;
}

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
  const [pForm, setPForm]             = useState({ name: "", age: "", gender: "Male" });

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
      await createPlayer({
        name: pForm.name.trim(),
        age: parseInt(pForm.age) || null,
        gender: pForm.gender || null,
      });
      setPForm({ name: "", age: "", gender: "Male" });
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



  // ── Fixtures ──────────────────────────────────────────────────
  const handleAssignGroup = async (playerId, groupId) => {
    try {
      await assignPlayerGroup(activeTId, playerId, groupId);
      await loadTournamentData();
    } catch (e) { flash("Error: " + e.message, "err"); }
  };

  const handleCreateMatch = async (p1Id, p2Id, groupId, tableNum, unassignedIds, round, stage) => {
    try {
      for (const pid of (unassignedIds || [])) {
        await assignPlayerGroup(activeTId, pid, groupId);
      }
      await createManualMatch({
        tournament_id: activeTId,
        player1_id: p1Id,
        player2_id: p2Id,
        group_id: groupId ?? null,
        round: round || 1,
        stage: stage || "group",
        table_number: tableNum,
        status: "scheduled",
      });
      await loadTournamentData();
      flash("Match created!");
    } catch (e) { flash("Error: " + e.message, "err"); }
  };

  const handleCreateExhibition = async (p1Name, p2Name, tableNum) => {
    try {
      await createExhibitionMatch({
        tournament_id: activeTId,
        player1_name: p1Name,
        player2_name: p2Name,
        table_number: tableNum || 1,
      });
      await loadTournamentData();
      flash("Exhibition match created!");
    } catch (e) { flash("Error: " + e.message, "err"); }
  };

  const handleGiveBye = async (playerId, groupId, round) => {
    try {
      await createBye(activeTId, playerId, groupId, round);
      await loadTournamentData();
      flash("Bye given — player advances automatically.");
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
  // Does NOT reload tournament data — scores are already in local state (optimistic UI).
  // Data is only reloaded when a set is confirmed or match is finished.
  const handleSetUpdate = async (matchId, setUpdate) => {
    try {
      const { current_server, ...scoreOnly } = setUpdate;
      const payload = { set_update: scoreOnly };
      if (current_server != null) payload.current_server = current_server;
      await updateMatch(matchId, payload);
    }
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
                        <td>
                          {groupEntry ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <span style={{ background: "#eaf2e8", color: "#2d5a27", padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 700 }}>{groupEntry.group_name}</span>
                              <span style={{ fontSize: 11, color: "#7a6a50" }}>{GROUP_LABELS[groupEntry.group_name]}</span>
                            </span>
                          ) : <span style={{ color: "#7a6a50", fontSize: 12 }}>Unassigned</span>}
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
            )}
          </div>
        )}

        {currentTab === "groups" && (
          <div>
            {!activeTId ? <div className="empty">Create a tournament first.</div> : (
              <GroupAssigner
                groups={groups}
                players={players}
                onAssign={handleAssignGroup}
              />
            )}
          </div>
        )}

        {currentTab === "matches" && (
          <div>
            {!activeTId ? <div className="empty">Create a tournament first.</div> : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                  <span style={{ color: "#7a6a50", fontSize: 14 }}>{matches.length} matches total</span>
                </div>
                <FixtureBuilder
                  groups={groups}
                  players={players}
                  matches={matches}
                  tournamentId={activeTId}
                  onCreateMatch={handleCreateMatch}
                  onStart={async (matchId) => { await handlePatchMatch(matchId, { status: "live" }); setActiveMatchId(matchId); }}
                  onOpenScorer={(matchId) => setActiveMatchId(matchId)}
                  onDelete={handleDeleteMatch}
                  onRematch={handleRematch}
                  onPatch={handlePatchMatch}
                  onGiveBye={handleGiveBye}
                  onCreateExhibition={handleCreateExhibition}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* ── FULLSCREEN SCORER OVERLAY ─────────────────────── */}
      {activeMatchId && (() => {
        const m = matches.find(x => x.match_id === activeMatchId);
        if (!m) return null;
        // For exhibition matches, create synthetic participant objects from stored names
        const p1 = m.stage === "exhibition"
          ? { position: 1, player: { name: m.exhibition_p1 ?? "Player 1" }, is_winner: false, score: 0 }
          : getP1(m);
        const p2 = m.stage === "exhibition"
          ? { position: 2, player: { name: m.exhibition_p2 ?? "Player 2" }, is_winner: false, score: 0 }
          : getP2(m);
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
                onReload={loadTournamentData}
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
function LiveScorer({ match, p1, p2, onSetUpdate, onUndoSet, onServeChange, onReload, onFinish }) {
  const setsToWin = match?.sets_to_win ?? 2;

  const completedSets = (match?.sets ?? [])
    .filter(s => s.winner_position !== null && s.winner_position !== undefined)
    .sort((a, b) => a.set_number - b.set_number);

  const setsWonP1 = completedSets.filter(s => s.winner_position === 1).length;
  const setsWonP2 = completedSets.filter(s => s.winner_position === 2).length;

  const [adminSetNum, setAdminSetNum] = useState(1);
  const confirmedSetsWonP1 = completedSets.filter(s => s.winner_position === 1 && s.set_number < adminSetNum).length;
  const confirmedSetsWonP2 = completedSets.filter(s => s.winner_position === 2 && s.set_number < adminSetNum).length;
  const matchWinner = confirmedSetsWonP1 >= setsToWin ? 1 : confirmedSetsWonP2 >= setsToWin ? 2 : null;

  const [s1, setS1] = useState(0);
  const [s2, setS2] = useState(0);
  const [saving, setSaving] = useState(false);

  // ── Position swap ─────────────────────────────────────────────
  // swapped=false → left=P1(pos1), right=P2(pos2)
  // swapped=true  → left=P2(pos2), right=P1(pos1)
  // Auto-swaps after every confirmed set.
  // Manual override only allowed in Set 1 before any points scored.
  const [swapped, setSwapped] = useState(false);
  const [showSwapBanner, setShowSwapBanner] = useState(false);

  const leftPos  = swapped ? 2 : 1;   // backend position of visual left player
  const rightPos = swapped ? 1 : 2;   // backend position of visual right player
  const leftName  = (swapped ? p2 : p1)?.player?.name ?? "Player 1";
  const rightName = (swapped ? p1 : p2)?.player?.name ?? "Player 2";
  const leftScore  = leftPos  === 1 ? s1 : s2;
  const rightScore = rightPos === 1 ? s1 : s2;

  // Manual swap only before Set 1 has any points
  const canManualSwap = adminSetNum === 1 && s1 === 0 && s2 === 0;
  const handleManualSwap = () => { if (canManualSwap) setSwapped(v => !v); };

  useEffect(() => {
    const maxValid = completedSets.length + 1;
    if (adminSetNum > maxValid) {
      setAdminSetNum(maxValid);
      setS1(0); setS2(0);
    }
  }, [completedSets.length]); // eslint-disable-line

  // Serve tracking — tracks backend position 1/2
  const [set1FirstServer, setSet1FirstServer] = useState(1);
  const firstServerForSet = (n) => ((set1FirstServer - 1 + (n - 1)) % 2) + 1;
  const firstServer = firstServerForSet(adminSetNum);
  const isDeuce     = s1 >= 10 && s2 >= 10;
  const serving     = computeServe(s1, s2, firstServer);  // backend pos 1 or 2

  const curSetWinner = setWinner(s1, s2);  // backend pos 1 or 2

  // Keep legacy names for serve button compatibility
  const p1Name = p1?.player?.name ?? "Player 1";
  const p2Name = p2?.player?.name ?? "Player 2";

  // Score queue — we keep only the latest score and send it as soon as
  // the previous request finishes. This means the UI is NEVER blocked:
  // tapping +Point updates the score instantly, the API call fires in the background.
  // If the admin taps faster than the network, we just send the latest value.
  const latestScoreRef = useRef(null);
  const sendingScore   = useRef(false);

  const dispatchScore = useCallback((setNum, ns1, ns2, server) => {
    latestScoreRef.current = { setNum, ns1, ns2, server };
    if (sendingScore.current) return; // already in flight — latest will flush after
    const flush = async () => {
      while (latestScoreRef.current) {
        const { setNum: sn, ns1: n1, ns2: n2, server: srv } = latestScoreRef.current;
        latestScoreRef.current = null;
        sendingScore.current = true;
        try {
          // Include current_server with every score update so public portal
          // always shows the correct server in real time
          await onSetUpdate({ set_number: sn, score_p1: n1, score_p2: n2, current_server: srv });
        } catch(e) { /* silent — score will resync on next poll */ }
      }
      sendingScore.current = false;
    };
    flush();
  }, [onSetUpdate]);

  // +Point — left/right buttons map to visual positions → backend positions
  const addPoint = (side) => {
    if (matchWinner) return;
    const backendPos = side === "left" ? leftPos : rightPos;
    const ns1 = backendPos === 1 ? s1 + 1 : s1;
    const ns2 = backendPos === 2 ? s2 + 1 : s2;
    setS1(ns1); setS2(ns2);
    // Compute who will be serving AFTER this point and include in dispatch
    const newServing = computeServe(ns1, ns2, firstServer);
    dispatchScore(adminSetNum, ns1, ns2, newServing);
  };

  // Undo point — same visual→backend mapping
  const undoPoint = (side) => {
    if (matchWinner) return;
    const backendPos = side === "left" ? leftPos : rightPos;
    const ns1 = backendPos === 1 ? Math.max(0, s1 - 1) : s1;
    const ns2 = backendPos === 2 ? Math.max(0, s2 - 1) : s2;
    setS1(ns1); setS2(ns2);
    const newServing = computeServe(ns1, ns2, firstServer);
    dispatchScore(adminSetNum, ns1, ns2, newServing);
  };

  // Confirm set — auto-swap after confirming, show swap banner
  const confirmAndNext = async () => {
    if (!curSetWinner || saving) return;
    setSaving(true);
    try {
      await onSetUpdate({ set_number: adminSetNum, score_p1: s1, score_p2: s2 });
      await onReload();
      setAdminSetNum(n => n + 1);
      setS1(0); setS2(0);
      setSwapped(v => !v);       // auto-swap ends
      setShowSwapBanner(true);   // show banner
      setTimeout(() => setShowSwapBanner(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  // Undo last confirmed set — also reverses the swap
  const undoLastSet = async () => {
    if (completedSets.length === 0 || saving) return;
    const lastSet = completedSets[completedSets.length - 1];
    setSaving(true);
    try {
      await onUndoSet(lastSet.set_number);
      await onReload();
      setAdminSetNum(lastSet.set_number);
      setS1(0); setS2(0);
      setSet1FirstServer(1);     // reset serve — must be re-selected for replayed set
      setSwapped(v => !v);       // reverse the swap that happened when set was confirmed
      setShowSwapBanner(false);
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

      {/* Manual swap — only available before Set 1 has any points */}
      {canManualSwap && (
        <div style={{ textAlign: "center" }}>
          <button onClick={handleManualSwap} style={{
            background: "linear-gradient(135deg, #1a4a8a, #2d6abf)",
            border: "none", borderRadius: 8,
            color: "#fff", padding: "10px 24px", cursor: "pointer",
            fontSize: 14, fontWeight: 800, letterSpacing: 1,
            boxShadow: "0 2px 8px rgba(45,106,191,0.4)",
          }}>⇄ Swap Starting Positions</button>
          <div style={{ fontSize: 10, color: "#3a3a3a", marginTop: 5 }}>Only available before first point</div>
        </div>
      )}

      {/* Swap banner — shown briefly after each set */}
      {showSwapBanner && (
        <div style={{
          textAlign: "center", padding: "10px 16px",
          background: "#1a2a1a", border: "1.5px solid #2d5a27",
          borderRadius: 8, fontSize: 13, fontWeight: 700,
          color: "#4a9a47", letterSpacing: 1, animation: "fadeIn 0.3s ease",
        }}>
          ⇄ Players have swapped ends
        </div>
      )}

      {/* Sets scoreboard — uses visual left/right */}
      <div style={{
        display: "flex", alignItems: "stretch",
        background: "#1a1208", borderRadius: 10,
        border: "1px solid #2a1a0a", overflow: "hidden",
      }}>
        <div style={{ flex: 1, textAlign: "center", padding: "14px 10px" }}>
          <div style={{ fontSize: 11, color: "#7a6a50", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{leftName}</div>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif", fontSize: 64, fontWeight: 900, lineHeight: 1,
            color: matchWinner === leftPos ? "#d4a017" : (leftPos===1?setsWonP1:setsWonP2) > (leftPos===1?setsWonP2:setsWonP1) ? "#e8dfc8" : "#3a3a3a",
          }}>{leftPos === 1 ? setsWonP1 : setsWonP2}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", padding: "0 12px", color: "#2a2a2a", fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>SETS</div>
        <div style={{ flex: 1, textAlign: "center", padding: "14px 10px" }}>
          <div style={{ fontSize: 11, color: "#7a6a50", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{rightName}</div>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif", fontSize: 64, fontWeight: 900, lineHeight: 1,
            color: matchWinner === rightPos ? "#d4a017" : (rightPos===1?setsWonP1:setsWonP2) > (rightPos===1?setsWonP2:setsWonP1) ? "#e8dfc8" : "#3a3a3a",
          }}>{rightPos === 1 ? setsWonP1 : setsWonP2}</div>
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
              background: saving ? "#1a0a0a" : "#c0392b",
              color: saving ? "#555" : "#fff",
              border: "none", borderRadius: 6,
              padding: "6px 16px", cursor: saving ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 800, letterSpacing: 0.5,
            }}>↩ Undo Set</button>
          )}
        </div>
      )}

      {/* Serve selector — only changeable before first point of each set */}
      {!matchWinner && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ fontSize: 10, color: "#3a3a3a", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
            Set {adminSetNum} · First Serve
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {/* Show buttons in visual order: left side first, right side second */}
            {[leftPos, rightPos].map((backendPl, idx) => {
              const isServ      = serving === backendPl;
              const displayName = idx === 0 ? leftName : rightName;
              const isLeft      = idx === 0;
              const frozen      = s1 > 0 || s2 > 0;  // freeze once scoring starts
              const targetS1    = ((backendPl - 1 + (2 - ((adminSetNum - 1) % 2))) % 2) + 1;
              return (
                <button key={backendPl}
                  disabled={frozen}
                  onClick={async () => {
                    if (frozen) return;
                    setSet1FirstServer(targetS1);
                    await onServeChange(backendPl);
                  }}
                  style={{
                    padding: "6px 14px", borderRadius: 7, fontWeight: 800,
                    fontSize: 13,
                    cursor: frozen ? "default" : "pointer",
                    background: isServ ? "#d4a017" : "transparent",
                    color: isServ ? "#1a1208" : frozen ? "#2a2a2a" : "#777",
                    border: isServ ? "2px solid #d4a017" : "2px solid #2a2a2a",
                    opacity: frozen && !isServ ? 0.4 : 1,
                  }}
                >
                  {isLeft ? `🏓 ${displayName}` : `${displayName} 🏓`}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: "#333" }}>
            {s1 > 0 || s2 > 0 ? "Locked — serve changes automatically every 2 pts" : "Tap to select who serves first · auto-switches every 2 pts"}
          </div>
        </div>
      )}

      {/* Point scores — visual left/right */}
      {!matchWinner && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif", fontSize: 92, fontWeight: 900, lineHeight: 1,
              color: "#e8dfc8",
            }}>{leftScore}</div>
          </div>
          <div style={{ color: "#222", fontSize: 20, fontWeight: 700 }}>–</div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif", fontSize: 92, fontWeight: 900, lineHeight: 1,
              color: "#e8dfc8",
            }}>{rightScore}</div>
          </div>
        </div>
      )}

      {/* +Point / ↩ Undo — left and right sides map to visual positions */}
      {!matchWinner && (
        <div style={{ display: "flex", gap: 10 }}>
          {["left", "right"].map(side => {
            const isLeft     = side === "left";
            const backendPos = isLeft ? leftPos : rightPos;
            const name       = isLeft ? leftName : rightName;
            const score      = backendPos === 1 ? s1 : s2;
            const isServ     = serving === backendPos;
            const frozen     = !!curSetWinner;
            return (
              <div key={side} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700,
                              color: isServ ? "#d4a017" : "#555",
                              letterSpacing: 1, textTransform: "uppercase" }}>
                  {isServ ? "🏓 " : ""}{name}
                </div>
                <button
                  onClick={() => addPoint(side)}
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
                    transition: "opacity 0.1s",
                  }}
                >+ Point</button>
                <button
                  onClick={() => undoPoint(side)}
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
            {curSetWinner === leftPos ? leftName : rightName} wins Set {adminSetNum}
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
          🏆 {setsWonP1 >= setsToWin ? (leftPos===1?leftName:rightName) : (leftPos===2?leftName:rightName)} wins the match!
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
          ? `🏆 Confirm — ${setsWonP1 >= setsToWin ? (leftPos===1?leftName:rightName) : (leftPos===2?leftName:rightName)} Wins`
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



// ── GroupAssigner — drag players from unassigned pool into group cards ─────────
function GroupAssigner({ groups, players, onAssign }) {
  const [dragId, setDragId] = useState(null);
  const [overGroup, setOverGroup] = useState(null);

  // Build set of assigned player IDs
  const assignedIds = new Set(groups.flatMap(g => g.players.map(p => p.player_id)));
  const unassigned  = players.filter(p => !assignedIds.has(p.player_id));

  const GROUP_LABELS = {
    "Group A": "Men Under 30",
    "Group B": "Men Under 30",
    "Group C": "Men 30+",
    "Group D": "Boys U18 & Women",
  };

  const subBadge = (sg) => {
    if (!sg) return null;
    return (
      <span style={{
        marginLeft: 5, fontSize: 10, fontWeight: 700,
        background: sg === "women" ? "#fde8f0" : "#e8f0fd",
        color: sg === "women" ? "#c0392b" : "#2d5a27",
        padding: "1px 5px", borderRadius: 3,
      }}>
        {sg === "boys" ? "U18 Boy" : "Woman"}
      </span>
    );
  };

  const playerCard = (p, draggable = true, showRemove = false, groupId = null) => (
    <div
      key={p.player_id}
      draggable={draggable}
      onDragStart={() => setDragId(p.player_id)}
      onDragEnd={() => setDragId(null)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "7px 10px", marginBottom: 4,
        background: dragId === p.player_id ? "#d4f0d4" : "#fff",
        border: "1.5px solid #e8dfc8", borderRadius: 7,
        cursor: "grab", userSelect: "none",
        transition: "background .15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14 }}>⠿</span>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
          {subBadge(p.sub_group)}
          <span style={{ color: "#7a6a50", fontSize: 11, marginLeft: 5 }}>
            {p.gender ?? ""}{p.age ? `, ${p.age}y` : ""}
          </span>
        </div>
      </div>
      {showRemove && (
        <button
          onClick={() => onAssign(p.player_id, null)}
          style={{
            background: "transparent", border: "none", color: "#c0392b",
            cursor: "pointer", fontSize: 14, padding: "0 4px", flexShrink: 0,
          }}
          title="Remove from group"
        >✕</button>
      )}
    </div>
  );

  const dropZone = (groupId) => ({
    onDragOver: (e) => { e.preventDefault(); setOverGroup(groupId); },
    onDragLeave: () => setOverGroup(null),
    onDrop: (e) => {
      e.preventDefault();
      setOverGroup(null);
      if (dragId != null) onAssign(dragId, groupId);
    },
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "start" }}>

      {/* Left — unassigned pool */}
      <div style={{
        background: "#f5f0e8", borderRadius: 10,
        border: "2px dashed #cfc0a0", padding: 12,
        minHeight: 200,
        ...(overGroup === "unassigned" ? { borderColor: "#2d5a27", background: "#eaf2e8" } : {}),
      }}
        {...dropZone("unassigned")}
      >
        <div style={{ fontSize: 11, fontWeight: 800, color: "#7a6a50", letterSpacing: 2,
                      textTransform: "uppercase", marginBottom: 10 }}>
          Unassigned ({unassigned.length})
        </div>
        {unassigned.length === 0
          ? <div style={{ color: "#aaa", fontSize: 12, textAlign: "center", padding: "20px 0" }}>
              All players assigned
            </div>
          : unassigned.map(p => playerCard(p, true, false))
        }
      </div>

      {/* Right — group cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {groups.map(g => (
          <div
            key={g.group_id}
            style={{
              background: overGroup === g.group_id ? "#eaf2e8" : "#fff",
              border: overGroup === g.group_id ? "2px dashed #2d5a27" : "1.5px solid #cfc0a0",
              borderRadius: 10, padding: 12, minHeight: 160,
              transition: "border .15s, background .15s",
            }}
            {...dropZone(g.group_id)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 800, color: "#1a1208" }}>
                {g.group_name}
              </span>
              <span style={{ fontSize: 11, color: "#7a6a50" }}>{GROUP_LABELS[g.group_name]}</span>
            </div>
            {g.players.length === 0
              ? <div style={{ color: "#bbb", fontSize: 12, textAlign: "center", padding: "16px 0",
                              border: "1.5px dashed #e8dfc8", borderRadius: 6 }}>
                  Drop players here
                </div>
              : g.players.map(p => playerCard(p, true, true, g.group_id))
            }
          </div>
        ))}
      </div>

    </div>
  );
}


// ── FixtureBuilder — manual match creation per group ─────────────────────────
const GROUP_TABLE_MAP_FRONT = { "Group A": 1, "Group B": 2, "Group C": 1, "Group D": 2 };
const OPEN_GROUPS = new Set(["Group A", "Group B"]);

// Stage options for the Create Match form
const STAGE_OPTIONS = [
  { value: "group|1",   label: "Group Stage — Round 1",   stage: "group",   round: 1, isKO: false },
  { value: "group|2",   label: "Group Stage — Round 2",   stage: "group",   round: 2, isKO: false },
  { value: "group|3",   label: "Group Stage — Round 3",   stage: "group",   round: 3, isKO: false },
  { value: "group|4",   label: "Group Stage — Round 4",   stage: "group",   round: 4, isKO: false },
  { value: "quarter|1", label: "Quarter Finals",          stage: "quarter", round: 1, isKO: true  },
  { value: "semi|1",    label: "Semi Finals",             stage: "semi",    round: 1, isKO: true  },
  { value: "third|1",   label: "3rd Place",               stage: "third",   round: 1, isKO: true  },
  { value: "final|1",   label: "Final",                   stage: "final",   round: 1, isKO: true  },
  { value: "exhibition|1", label: "⭐ Exhibition Match",      stage: "exhibition", round: 1, isKO: false, isExhibition: true },
];

function FixtureBuilder({ groups, players, matches, onCreateMatch, onStart, onOpenScorer, onDelete, onRematch, onPatch, onGiveBye, onCreateExhibition }) {
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [stageKey, setStageKey]           = useState("group|1");
  const [p1, setP1]                       = useState("");
  const [p2, setP2]                       = useState("");
  const [exP1, setExP1]                   = useState("");
  const [exP2, setExP2]                   = useState("");
  const [tableNum, setTableNum]           = useState("1");
  const [editMatchId, setEditMatchId]     = useState(null);
  const [editTableNum, setEditTableNum]   = useState("1");

  const activeStage = STAGE_OPTIONS.find(s => s.value === stageKey) || STAGE_OPTIONS[0];
  const isKO = activeStage.isKO;
  const isExhibition = activeStage.isExhibition ?? false;

  const assignedIds      = new Set(groups.flatMap(g => g.players.map(p => p.player_id)));
  const unassignedPlayers = (players ?? []).filter(p => !assignedIds.has(p.player_id));

  // Groups A/B always selectable even with 0 assigned players
  const selectableGroups = groups.filter(g =>
    OPEN_GROUPS.has(g.group_name) || g.players.length >= 1
  );
  const activeGroup  = groups.find(g => g.group_id === selectedGroup) || selectableGroups[0];
  const isOpenGroup  = activeGroup && OPEN_GROUPS.has(activeGroup.group_name);

  const allGroupMatches = (gid) => matches.filter(m => m.group_id === gid && m.stage !== "bye");
  const allByeMatches   = (gid) => matches.filter(m => m.group_id === gid && m.stage === "bye");
  const ungrouped       = matches.filter(m => !m.group_id);

  // ── Round-aware group helpers ─────────────────────────────────
  // Current round = highest round among REAL matches only (NOT byes)
  const currentRound = (gid) => {
    const rounds = matches
      .filter(m => m.group_id === gid && m.stage !== "bye")
      .map(m => m.round ?? 1);
    return rounds.length ? Math.max(...rounds) : 1;
  };

  // Eliminated players = lost any completed group match
  const getEliminated = (gid) => new Set(
    matches
      .filter(m => m.group_id === gid && m.stage !== "bye" &&
                   (m.status === "done" || m.status === "completed"))
      .flatMap(m => (m.participants ?? [])
        .filter(p => !p.is_winner)
        .map(p => p.player?.player_id)
        .filter(Boolean))
  );

  // Players in a scheduled or live REAL match for a specific round (byes excluded)
  const inRoundScheduledOrLive = (gid, round) => new Set(
    matches
      .filter(m => m.group_id === gid && m.round === round && m.stage !== "bye" &&
                   (m.status === "scheduled" || m.status === "live"))
      .flatMap(m => m.participants?.map(p => p.player?.player_id).filter(Boolean) ?? [])
  );

  // Players already in a REAL match this round (byes excluded)
  // Bye recipients are intentionally NOT blocked — they must be schedulable for round 2
  const inRound = (gid, round) => new Set(
    matches
      .filter(m => m.group_id === gid && m.round === round && m.stage !== "bye")
      .flatMap(m => m.participants?.map(p => p.player?.player_id).filter(Boolean) ?? [])
  );

  // Current round for active group — used for display/bye detection only
  const activeRound = activeGroup ? currentRound(activeGroup.group_id) : 1;
  // Round being CREATED — driven by the stage selector dropdown
  const targetRound = isKO || isExhibition ? 1 : (activeStage?.round ?? activeRound);
  const elimActive  = activeGroup ? getEliminated(activeGroup.group_id) : new Set();
  const inCurRoundActive = activeGroup ? inRoundScheduledOrLive(activeGroup.group_id, targetRound) : new Set();

  // ── KO qualifier pool ─────────────────────────────────────────
  // For KO stages: show players who won or got a bye in the final round of their group
  // i.e. alive players (not eliminated) across all groups
  const koQualifiers = (() => {
    const result = [];
    for (const g of groups) {
      const elim = getEliminated(g.group_id);
      const lastRound = currentRound(g.group_id);
      // Players in the last round (won or got bye) = alive and appeared in last round
      const inLast = inRound(g.group_id, lastRound);
      for (const p of g.players) {
        if (!elim.has(p.player_id)) {
          // Must have appeared in last round (won a match or got a bye)
          const hasLastRound = inLast.has(p.player_id);
          // Also include if they never played at all (small group, straight to KO)
          const neverPlayed = !matches.some(m =>
            m.group_id === g.group_id &&
            (m.participants ?? []).some(mp => mp.player?.player_id === p.player_id)
          );
          if (hasLastRound || neverPlayed) {
            result.push({ ...p, _groupName: g.group_name });
          }
        }
      }
    }
    // Also include unassigned alive players
    const assignedSet = new Set(groups.flatMap(g => g.players.map(p => p.player_id)));
    for (const p of (players ?? [])) {
      if (!assignedSet.has(p.player_id)) result.push({ ...p, _groupName: "Unassigned" });
    }
    return result;
  })();

  // Players already in a scheduled/live KO match of the active stage
  const inKOStage = new Set(
    matches
      .filter(m => !m.group_id && m.stage === activeStage.stage &&
                   (m.status === "scheduled" || m.status === "live"))
      .flatMap(m => m.participants?.map(p => p.player?.player_id).filter(Boolean) ?? [])
  );
  const availableKOPlayers = koQualifiers.filter(p => !inKOStage.has(p.player_id));

  // Available players for new match = alive + not already in target round
  const availableGroupPlayers = (activeGroup?.players ?? []).filter(p =>
    !elimActive.has(p.player_id) &&
    !inRound(activeGroup?.group_id, targetRound).has(p.player_id)
  );
  const availableUnassigned = isOpenGroup
    ? unassignedPlayers.filter(p =>
        !inRound(activeGroup?.group_id, targetRound).has(p.player_id)
      )
    : [];

  // Byes for current round of a group = alive players not in any match this round
  const byesForCurrentRound = (group) => {
    const round = currentRound(group.group_id);
    const elim  = getEliminated(group.group_id);
    const inThisRound = inRound(group.group_id, round);  // real matches only
    // Also exclude players who already have a bye THIS round
    const byeThisRound = new Set(
      matches
        .filter(m => m.group_id === group.group_id && m.round === round && m.stage === "bye")
        .flatMap(m => m.participants?.map(p => p.player?.player_id).filter(Boolean) ?? [])
    );
    return group.players.filter(p =>
      !elim.has(p.player_id) &&
      !inThisRound.has(p.player_id) &&
      !byeThisRound.has(p.player_id)
    );
  };

  // Get rounds for a group sorted ascending
  const getRounds = (gid) => {
    const rounds = new Set(matches.filter(m => m.group_id === gid).map(m => m.round ?? 1));
    return [...rounds].sort((a, b) => a - b);
  };

  const handleAdd = () => {
    if (!p1 || !p2 || p1 === p2) return;
    if (!isKO && !activeGroup) return;
    const tbl = parseInt(tableNum) || (isKO ? 1 : GROUP_TABLE_MAP_FRONT[activeGroup?.group_name] || 1);
    const groupId = isKO ? null : activeGroup?.group_id;
    const unassignedToAssign = isKO ? [] :
      [parseInt(p1), parseInt(p2)].filter(id => !assignedIds.has(id));
    onCreateMatch(
      parseInt(p1), parseInt(p2), groupId, tbl,
      unassignedToAssign, activeStage.round, activeStage.stage
    );
    setP1(""); setP2("");
    setExP1(""); setExP2("");
  };

  const handleSaveEdit = (matchId) => {
    onPatch(matchId, { table_number: parseInt(editTableNum) || 1 });
    setEditMatchId(null);
  };

  const renderMatch = (m) => {
    const mp1    = m.participants?.find(p => p.position === 1);
    const mp2    = m.participants?.find(p => p.position === 2);
    const isLive = m.status === "live";
    const isDone = m.status === "done" || m.status === "completed";
    const isEdit = editMatchId === m.match_id;
    const cSets  = (m.sets ?? []).filter(s => setWinner(s.score_p1, s.score_p2) !== null).sort((a,b)=>a.set_number-b.set_number);
    const sw1    = cSets.filter(s => setWinner(s.score_p1,s.score_p2)===1).length;
    const sw2    = cSets.filter(s => setWinner(s.score_p1,s.score_p2)===2).length;
    const stagePill = m.stage === "quarter" ? "QF" : m.stage === "semi" ? "SF" : m.stage === "third" ? "3rd" : m.stage === "final" ? "F" : null;

    return (
      <div key={m.match_id} style={{
        background: "#fff", border: isLive ? "2px solid #c0392b" : "1.5px solid #e8dfc8",
        borderRadius: 8, padding: "10px 12px", marginBottom: 6,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              {mp1?.player?.name ?? "?"}
              {playerTag(mp1?.player, groups.find(g => g.group_id === m.group_id)?.group_name)}
            </span>
            <span style={{ color: "#7a6a50", fontWeight: 400, fontSize: 12 }}>vs</span>
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              {mp2?.player?.name ?? "?"}
              {playerTag(mp2?.player, groups.find(g => g.group_id === m.group_id)?.group_name)}
            </span>
            <span style={{ fontSize: 10, background: "#e8dfc8", color: "#6b4c2a", padding: "1px 5px", borderRadius: 3 }}>R{m.round}</span>
            {isEdit ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 11, color: "#7a6a50" }}>Table</span>
                <input type="number" min={1} max={2} value={editTableNum}
                  onChange={e => setEditTableNum(e.target.value)}
                  style={{ width: 44, padding: "2px 4px", border: "1.5px solid #d4a017", borderRadius: 4, fontSize: 12, textAlign: "center" }} />
                <button onClick={() => handleSaveEdit(m.match_id)} style={{ background: "#2d5a27", color: "#fff", border: "none", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>✓</button>
                <button onClick={() => setEditMatchId(null)} style={{ background: "transparent", color: "#999", border: "none", cursor: "pointer", fontSize: 12 }}>✕</button>
              </span>
            ) : (
              m.table_number && <span style={{ fontSize: 10, background: "#fdf6e0", color: "#d4a017", border: "1px solid #d4a017", padding: "1px 5px", borderRadius: 3 }}>Table {m.table_number}</span>
            )}
            {isLive && <span style={{ fontSize: 10, background: "#c0392b", color: "#fff", padding: "1px 5px", borderRadius: 3 }}>🔴 LIVE</span>}
            {isDone  && <span style={{ fontSize: 10, background: "#eaf2e8", color: "#2d5a27", padding: "1px 5px", borderRadius: 3 }}>✅ DONE</span>}
            {stagePill && <span style={{ fontSize: 10, background: "#fdf6e0", color: "#d4a017", padding: "1px 5px", borderRadius: 3, fontWeight: 800 }}>{stagePill}</span>}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {isDone && <span style={{ fontSize: 12, color: "#2d5a27", fontWeight: 700 }}>{sw1}–{sw2}</span>}
            {!isLive && !isDone && (
              <>
                <button onClick={() => { setEditMatchId(m.match_id); setEditTableNum(String(m.table_number || 1)); }}
                  style={{ background: "transparent", color: "#7a6a50", border: "1px solid #cfc0a0", borderRadius: 5, padding: "4px 8px", cursor: "pointer", fontSize: 11 }} title="Edit table">✏️</button>
                <button onClick={() => onStart(m.match_id)} style={{ background: "#c0392b", color: "#fff", border: "none", borderRadius: 5, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>▶ Start</button>
              </>
            )}
            {isLive  && <button onClick={() => onOpenScorer(m.match_id)} style={{ background: "#c0392b", color: "#fff", border: "none", borderRadius: 5, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>🎯 Score</button>}
            {isDone  && <button onClick={() => onRematch(m.match_id)} style={{ background: "transparent", color: "#d4a017", border: "1.5px solid #d4a017", borderRadius: 5, padding: "4px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>↩</button>}
            {!isDone && !isLive && <button onClick={() => onDelete(m.match_id)} style={{ background: "transparent", color: "#bbb", border: "1px solid #e8dfc8", borderRadius: 5, padding: "4px 8px", cursor: "pointer", fontSize: 12 }}>✕</button>}
          </div>
        </div>
        {isDone && cSets.length > 0 && (
          <div style={{ marginTop: 4, color: "#7a6a50", fontSize: 11 }}>
            {cSets.map(s => `${s.score_p1}–${s.score_p2}`).join("  ")}
          </div>
        )}
      </div>
    );
  };

  // Group by round for KO sections rendering (used later)
  const koStageMatches = (stage) => matches.filter(m => !m.group_id && m.stage === stage);

  return (
    <div>
      {/* ── Match creator ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 10 }}>Create Match</div>

        {/* Stage selector */}
        <div style={{ marginBottom: 10 }}>
          <select className="input" style={{ width: "100%" }}
            value={stageKey}
            onChange={e => { setStageKey(e.target.value); setP1(""); setP2(""); }}>
            <optgroup label="Group Stage">
              {STAGE_OPTIONS.filter(s => !s.isKO).map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </optgroup>
            <optgroup label="Knockout Stage">
              {STAGE_OPTIONS.filter(s => s.isKO).map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Group selector — only for group stage */}
        {!isKO && (
          <div style={{ marginBottom: 10 }}>
            <select className="input" style={{ width: "100%" }}
              value={activeGroup?.group_id ?? ""}
              onChange={e => { setSelectedGroup(parseInt(e.target.value)); setP1(""); setP2(""); }}>
              {selectableGroups.map(g => (
                <option key={g.group_id} value={g.group_id}>{g.group_name} — {GROUP_LABELS[g.group_name]}</option>
              ))}
            </select>
          </div>
        )}

        {isKO && (
          <div style={{ marginBottom: 8, padding: "6px 10px", background: "#fdf6e0",
                        border: "1px solid #e8d08a", borderRadius: 6, fontSize: 12, color: "#6b4c2a" }}>
            💡 Showing players who won or received a bye in their last group round
          </div>
        )}
        {!isKO && !isExhibition && isOpenGroup && availableUnassigned.length > 0 && (
          <div style={{ marginBottom: 8, padding: "6px 10px", background: "#fdf6e0",
                        border: "1px solid #e8d08a", borderRadius: 6, fontSize: 12, color: "#6b4c2a" }}>
            💡 Unassigned players shown below — they'll be auto-added to {activeGroup?.group_name}
          </div>
        )}

        {/* Exhibition form — free text names */}
        {isExhibition && (
          <div>
            <div style={{ marginBottom: 8, padding: "6px 10px", background: "#f0f4ff",
                          border: "1px solid #b8c8f0", borderRadius: 6, fontSize: 12, color: "#3a5cc7" }}>
              ⭐ Exhibition match — not counted in tournament standings
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input className="input" style={{ flex: 2, minWidth: 140 }}
                placeholder="Player 1 name…"
                value={exP1} onChange={e => setExP1(e.target.value)} />
              <span style={{ color: "#7a6a50", fontWeight: 700 }}>vs</span>
              <input className="input" style={{ flex: 2, minWidth: 140 }}
                placeholder="Player 2 name…"
                value={exP2} onChange={e => setExP2(e.target.value)} />
              <select className="input" style={{ width: 100 }}
                value={tableNum} onChange={e => setTableNum(e.target.value)}>
                <option value="1">Table 1</option>
                <option value="2">Table 2</option>
              </select>
              <button className="btn-primary"
                style={{ background: "#3a5cc7" }}
                disabled={!exP1.trim() || !exP2.trim() || exP1.trim() === exP2.trim()}
                onClick={() => {
                  onCreateExhibition(exP1.trim(), exP2.trim(), parseInt(tableNum) || 1);
                  setExP1(""); setExP2("");
                }}>
                + Add Exhibition
              </button>
            </div>
          </div>
        )}

        {!isExhibition && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {/* Player 1 */}
          <select className="input" style={{ flex: 2, minWidth: 140 }}
            value={p1} onChange={e => setP1(e.target.value)}>
            <option value="">Player 1…</option>
            {isKO ? (
              availableKOPlayers.map(p => (
                <option key={p.player_id} value={p.player_id}>
                  {p.name}{p._groupName ? ` (${p._groupName})` : ""}{p.age ? ` · ${p.age}y` : ""}
                </option>
              ))
            ) : (
              <>
                {availableGroupPlayers.length > 0 && (
                  <optgroup label="In group">
                    {availableGroupPlayers.map(p => (
                      <option key={p.player_id} value={p.player_id}>{p.name}</option>
                    ))}
                  </optgroup>
                )}
                {isOpenGroup && availableUnassigned.length > 0 && (
                  <optgroup label="Unassigned → will be added to group">
                    {availableUnassigned.map(p => (
                      <option key={p.player_id} value={p.player_id}>{p.name}{p.age ? ` (${p.age})` : ""}</option>
                    ))}
                  </optgroup>
                )}
              </>
            )}
          </select>

          <span style={{ color: "#7a6a50", fontWeight: 700 }}>vs</span>

          {/* Player 2 */}
          <select className="input" style={{ flex: 2, minWidth: 140 }}
            value={p2} onChange={e => setP2(e.target.value)}>
            <option value="">Player 2…</option>
            {isKO ? (
              availableKOPlayers.filter(p => p.player_id !== parseInt(p1)).map(p => (
                <option key={p.player_id} value={p.player_id}>
                  {p.name}{p._groupName ? ` (${p._groupName})` : ""}{p.age ? ` · ${p.age}y` : ""}
                </option>
              ))
            ) : (
              <>
                {availableGroupPlayers.filter(p => p.player_id !== parseInt(p1)).length > 0 && (
                  <optgroup label="In group">
                    {availableGroupPlayers.filter(p => p.player_id !== parseInt(p1)).map(p => (
                      <option key={p.player_id} value={p.player_id}>{p.name}</option>
                    ))}
                  </optgroup>
                )}
                {isOpenGroup && availableUnassigned.filter(p => p.player_id !== parseInt(p1)).length > 0 && (
                  <optgroup label="Unassigned → will be added to group">
                    {availableUnassigned.filter(p => p.player_id !== parseInt(p1)).map(p => (
                      <option key={p.player_id} value={p.player_id}>{p.name}{p.age ? ` (${p.age})` : ""}</option>
                    ))}
                  </optgroup>
                )}
              </>
            )}
          </select>

          {/* Table selector */}
          <select className="input" style={{ width: 100 }}
            value={tableNum} onChange={e => setTableNum(e.target.value)}>
            <option value="1">Table 1</option>
            <option value="2">Table 2</option>
          </select>

          <button className="btn-primary" onClick={handleAdd} disabled={!p1 || !p2 || p1 === p2}>
            + Add Match
          </button>
        </div>
        )}
      </div>

      {/* ── Group matches — grouped by round ── */}
      {groups.map(g => {
        const allGM    = allGroupMatches(g.group_id);
        const allByes  = allByeMatches(g.group_id);
        const rounds   = getRounds(g.group_id);
        const curRound = currentRound(g.group_id);
        // Pending byes = alive players not in any match this round
        const pendingByes = byesForCurrentRound(g);

        if (!allGM.length && !allByes.length && !pendingByes.length) return null;

        const totalLive = allGM.filter(m => m.status === "live").length;
        const totalDone = allGM.filter(m => m.status === "done" || m.status === "completed").length;

        return (
          <div key={g.group_id} style={{ marginBottom: 16 }}>
            {/* Group header */}
            <div style={{
              background: "#e8dfc8", borderRadius: "8px 8px 0 0",
              padding: "10px 16px", border: "1.5px solid #cfc0a0", borderBottom: "none",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 800, color: "#1a1208" }}>{g.group_name}</span>
                <span style={{ fontSize: 11, color: "#7a6a50" }}>{GROUP_LABELS[g.group_name]}</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {totalLive > 0 && <span style={{ fontSize: 11, background: "#c0392b", color: "#fff", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>🔴 {totalLive} LIVE</span>}
                {allGM.length > 0 && <span style={{ fontSize: 12, color: "#7a6a50" }}>{totalDone}/{allGM.length} done</span>}
              </div>
            </div>
            <div style={{ border: "1.5px solid #cfc0a0", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "10px 12px", background: "#faf7f2" }}>

              {/* Render each round */}
              {(rounds.length ? rounds : [curRound]).map(round => {
                const roundMatches = allGM.filter(m => (m.round ?? 1) === round);
                const roundByes    = allByes.filter(m => (m.round ?? 1) === round);
                const roundLive    = roundMatches.filter(m => m.status === "live").length;
                const roundDone    = roundMatches.filter(m => m.status === "done" || m.status === "completed").length;
                const allRoundDone = roundMatches.length > 0 &&
                  roundMatches.every(m => m.status === "done" || m.status === "completed");

                // For current round only: show pending byes
                const showPendingByes = round === curRound && pendingByes.length > 0;

                if (!roundMatches.length && !roundByes.length && !showPendingByes) return null;

                return (
                  <div key={round} style={{ marginBottom: 10 }}>
                    {/* Round label */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      marginBottom: 6, paddingBottom: 5,
                      borderBottom: "1px solid #e8dfc8",
                    }}>
                      <span style={{
                        fontFamily: "'Barlow Condensed',sans-serif",
                        fontSize: 13, fontWeight: 800, color: "#6b4c2a",
                        letterSpacing: 1, textTransform: "uppercase",
                      }}>Round {round}</span>
                      {roundLive > 0 && <span style={{ fontSize: 10, background: "#c0392b", color: "#fff", padding: "1px 6px", borderRadius: 3, fontWeight: 700 }}>🔴 LIVE</span>}
                      {allRoundDone && <span style={{ fontSize: 10, color: "#2d5a27", fontWeight: 700 }}>✓ complete</span>}
                      {roundMatches.length > 0 && !allRoundDone && <span style={{ fontSize: 10, color: "#7a6a50" }}>{roundDone}/{roundMatches.length} done</span>}
                    </div>

                    {/* Matches */}
                    {roundMatches.map(renderMatch)}

                    {/* Byes for this round */}
                    {roundByes.map(m => {
                      const bp = m.participants?.[0];
                      return (
                        <div key={m.match_id} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "7px 10px", marginBottom: 6,
                          background: "#fdf6e0", border: "1px solid #e8d08a", borderRadius: 7,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: "#d4a017", textTransform: "uppercase", letterSpacing: 1 }}>BYE R{round}</span>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{bp?.player?.name ?? "?"}</span>
                            {playerTag(bp?.player, g.group_name)}
                            <span style={{ fontSize: 11, color: "#2d5a27", fontWeight: 700 }}>✓ advances</span>
                          </div>
                          <button onClick={() => onDelete(m.match_id)} style={{
                            background: "transparent", color: "#bbb", border: "1px solid #e8dfc8",
                            borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontSize: 12,
                          }}>✕</button>
                        </div>
                      );
                    })}

                    {/* Pending byes — current round only, auto-detected */}
                    {showPendingByes && round === curRound && (
                      <div style={{
                        padding: "8px 10px", background: "#f5f0e8",
                        border: "1.5px dashed #cfc0a0", borderRadius: 7,
                        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#7a6a50" }}>Auto-bye Round {round}:</span>
                        {pendingByes.map(p => (
                          <button key={p.player_id}
                            onClick={() => onGiveBye(p.player_id, g.group_id, round)}
                            style={{
                              background: "#fff", border: "1.5px solid #d4a017", borderRadius: 6,
                              padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700,
                              color: "#6b4c2a", display: "inline-flex", alignItems: "center", gap: 4,
                            }}>
                            {p.name}
                            {playerTag(p, g.group_name)}
                            <span style={{ marginLeft: 4, fontSize: 10, color: "#d4a017" }}>→ bye</span>
                          </button>
                        ))}
                        <span style={{ fontSize: 10, color: "#7a6a50", fontStyle: "italic" }}>These players have no match this round — click to confirm bye</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ── KO matches ── */}
      {["quarter","semi","third","final"].map(stage => {
        const sm = ungrouped.filter(m => m.stage === stage);
        if (!sm.length) return null;
        const label = stage === "quarter" ? "🏆 Quarter Finals" : stage === "semi" ? "🏆 Semi Finals" : stage === "third" ? "🥉 3rd Place" : "🏆 Final";
        const live = sm.filter(m => m.status === "live").length;
        const done = sm.filter(m => m.status === "done" || m.status === "completed").length;
        return (
          <div key={stage} style={{ marginBottom: 16 }}>
            <div style={{
              background: "#fdf6e0", borderRadius: "8px 8px 0 0",
              padding: "10px 16px", border: "1.5px solid #d4a017", borderBottom: "none",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 800, color: "#d4a017" }}>{label}</span>
              <div style={{ display: "flex", gap: 8 }}>
                {live > 0 && <span style={{ fontSize: 11, background: "#c0392b", color: "#fff", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>🔴 {live} LIVE</span>}
                <span style={{ fontSize: 12, color: "#7a6a50" }}>{done}/{sm.length} done</span>
              </div>
            </div>
            <div style={{ border: "1.5px solid #d4a017", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "10px 12px", background: "#fffdf5" }}>
              {sm.map(renderMatch)}
            </div>
          </div>
        );
      })}

      {/* ── Exhibition matches ── */}
      {(() => {
        const em = matches.filter(m => m.stage === "exhibition");
        if (!em.length) return null;
        const live = em.filter(m => m.status === "live").length;
        const done = em.filter(m => m.status === "done" || m.status === "completed").length;
        return (
          <div style={{ marginBottom: 16 }}>
            <div style={{
              background: "#f0f4ff", borderRadius: "8px 8px 0 0",
              padding: "10px 16px", border: "1.5px solid #b8c8f0", borderBottom: "none",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 800, color: "#3a5cc7" }}>⭐ Exhibition Matches</span>
              <div style={{ display: "flex", gap: 8 }}>
                {live > 0 && <span style={{ fontSize: 11, background: "#c0392b", color: "#fff", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>🔴 {live} LIVE</span>}
                <span style={{ fontSize: 12, color: "#7a6a50" }}>{done}/{em.length} done</span>
              </div>
            </div>
            <div style={{ border: "1.5px solid #b8c8f0", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "10px 12px", background: "#f8f9ff" }}>
              {em.map(m => {
                const isLive = m.status === "live";
                const isDone = m.status === "done" || m.status === "completed";
                return (
                  <div key={m.match_id} style={{
                    background: "#fff", border: isLive ? "2px solid #c0392b" : "1.5px solid #b8c8f0",
                    borderRadius: 8, padding: "10px 12px", marginBottom: 6,
                    display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, background: "#f0f4ff", color: "#3a5cc7", padding: "1px 6px", borderRadius: 3, fontWeight: 800 }}>⭐ EXH</span>
                      <span>{m.exhibition_p1 ?? "?"}</span>
                      <span style={{ color: "#7a6a50", fontWeight: 400, fontSize: 12 }}>vs</span>
                      <span>{m.exhibition_p2 ?? "?"}</span>
                      {m.table_number && <span style={{ fontSize: 10, background: "#fdf6e0", color: "#d4a017", border: "1px solid #d4a017", padding: "1px 5px", borderRadius: 3 }}>Table {m.table_number}</span>}
                      {isLive && <span style={{ fontSize: 10, background: "#c0392b", color: "#fff", padding: "1px 5px", borderRadius: 3 }}>🔴 LIVE</span>}
                      {isDone  && <span style={{ fontSize: 10, background: "#eaf2e8", color: "#2d5a27", padding: "1px 5px", borderRadius: 3 }}>✅ DONE</span>}
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {!isLive && !isDone && (
                        <button onClick={() => onStart(m.match_id)} style={{ background: "#c0392b", color: "#fff", border: "none", borderRadius: 5, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>▶ Start</button>
                      )}
                      {isLive && (
                        <button onClick={() => onOpenScorer(m.match_id)} style={{ background: "#c0392b", color: "#fff", border: "none", borderRadius: 5, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>🎯 Score</button>
                      )}
                      {!isDone && !isLive && (
                        <button onClick={() => onDelete(m.match_id)} style={{ background: "transparent", color: "#bbb", border: "1px solid #e8dfc8", borderRadius: 5, padding: "4px 8px", cursor: "pointer", fontSize: 12 }}>✕</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {matches.length === 0 && (
        <div className="empty">No matches yet — create matches above.</div>
      )}
    </div>
  );
}