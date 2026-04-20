import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getWorkspace, transitionTournament,
  createPlayer, addPlayerToEvent,
  createGroup, generateFixtures,
  updateMatchStatus, updateScore, undoSet, rematchMatch, deleteMatch,
  getMe, clearToken,
} from "../../../api/client";
import TTScorer from "../../../components/scoring/TTScorer";
import OrgHeader from "../../../components/shared/OrgHeader";

// ── Sport metadata ────────────────────────────────────────────
const SPORT_META = {
  table_tennis: { icon: "🏓", label: "Table Tennis", type: "individual", scoreUnit: "Sets"  },
  badminton:    { icon: "🏸", label: "Badminton",    type: "individual", scoreUnit: "Sets"  },
  cricket:      { icon: "🏏", label: "Cricket",      type: "team",       scoreUnit: "Runs"  },
  football:     { icon: "⚽", label: "Football",     type: "team",       scoreUnit: "Goals" },
};

// API helpers for teams (not in client.js yet)
const API = import.meta.env.VITE_API_URL || "/api";
const tok = () => localStorage.getItem("tsb_token");
const apiFetch = (path, opts = {}) =>
  fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}`, ...(opts.headers || {}) },
  }).then(async r => {
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || r.status); }
    return r.status === 204 ? null : r.json();
  });

const createTeamAPI    = (orgId, d) => apiFetch(`/orgs/${orgId}/teams`, { method: "POST", body: JSON.stringify(d) });
const addTeamToEvent   = (eId, tId) => apiFetch(`/events/${eId}/teams?team_id=${tId}`, { method: "POST" });
const removeTeamFromEvent = (eId, tId) => apiFetch(`/events/${eId}/teams/${tId}`, { method: "DELETE" });
const getEventTeams    = (eId) => apiFetch(`/events/${eId}/teams`);
const finishMatchAPI   = (mId, winPos) => apiFetch(`/matches/${mId}/finish`, { method: "POST", body: JSON.stringify({ winner_position: winPos }) });

export default function EventWorkspace() {
  const { tournamentId, eventId } = useParams();
  const navigate = useNavigate();

  const [data,        setData]        = useState(null);
  const [user,        setUser]        = useState(null);
  const [tab,         setTab]         = useState("overview");
  const [msg,         setMsg]         = useState("");
  const [activeMatch, setActiveMatch] = useState(null);
  const [eventTeams,  setEventTeams]  = useState([]);

  // Individual forms
  const [pForm,      setPForm]      = useState({ name: "", age: "", gender: "Male" });
  const [groupName,  setGroupName]  = useState("");

  // Team forms
  const [teamForm,    setTeamForm]    = useState({ name: "", contact_name: "", contact_phone: "" });
  const [teamMembers, setTeamMembers] = useState([{ name: "", role: "captain" }]);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3000); };

  const loadData = useCallback(async () => {
    try {
      const d = await getWorkspace(tournamentId);
      setData(d);
    } catch (e) { console.error(e); }
  }, [tournamentId]);

  const loadTeams = useCallback(async () => {
    try { const teams = await getEventTeams(eventId); setEventTeams(teams || []); }
    catch (e) { console.error(e); }
  }, [eventId]);

  useEffect(() => {
    getMe().then(setUser).catch(() => { clearToken(); navigate("/login"); });
    loadData();
  }, [loadData]);

  useEffect(() => {
    // Load teams whenever data changes, using eventId directly
    // (currentEvent is not available here yet)
    if (!data) return;
    const ev = data.events?.find((e) => e.event_id === parseInt(eventId));
    if (ev?.participant_type === "team") loadTeams();
  }, [data, eventId]);

  if (!data) return (
    <div className="auth-wrap">
      <div style={{ color: "var(--muted)", fontFamily: "'Barlow Condensed',sans-serif", fontSize: 18, fontWeight: 700 }}>Loading…</div>
    </div>
  );

  const { tournament: t, events } = data;
  const currentEvent = events.find((e) => e.event_id === parseInt(eventId)) || events[0];

  if (!currentEvent) return (
    <div className="auth-wrap">
      <div style={{ color: "var(--muted)" }}>Event not found.</div>
    </div>
  );

  const sm         = SPORT_META[currentEvent.sport_key] || { icon: "🏅", label: currentEvent.sport_key, type: "individual" };
  const isTeam     = currentEvent.participant_type === "team";
  const TABS       = isTeam
    ? ["overview", "teams", "fixtures", "live"]
    : ["overview", "players", "fixtures", "live"];

  // Tab label overrides per sport
  const tabLabel = (tb) => {
    if (tb === "live" && currentEvent.sport_key === "cricket")  return "Innings";
    if (tb === "live" && currentEvent.sport_key === "football") return "Match Day";
    return tb.charAt(0).toUpperCase() + tb.slice(1);
  };

  // ── Handlers ─────────────────────────────────────────────────
  const handleAddPlayer = async () => {
    if (!pForm.name.trim()) return flash("Name required.");
    try {
      const p = await createPlayer({ name: pForm.name.trim(), age: parseInt(pForm.age) || null, gender: pForm.gender });
      await addPlayerToEvent(currentEvent.event_id, p.player_id);
      setPForm({ name: "", age: "", gender: "Male" });
      loadData(); flash("Player added!");
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    try { await createGroup(currentEvent.event_id, groupName.trim()); setGroupName(""); loadData(); flash("Group created!"); }
    catch (e) { flash("Error: " + e.message); }
  };

  const handleAddTeamMember = () => setTeamMembers((p) => [...p, { name: "", role: "player" }]);
  const handleRemoveTeamMember = (i) => setTeamMembers((p) => p.filter((_, idx) => idx !== i));
  const handleTeamMemberChange = (i, field, val) =>
    setTeamMembers((p) => p.map((m, idx) => idx === i ? { ...m, [field]: val } : m));

  const handleCreateTeam = async () => {
    if (!teamForm.name.trim()) return flash("Team name required.");
    const validMembers = teamMembers.filter((m) => m.name.trim());
    if (!validMembers.length) return flash("Add at least one player.");
    try {
      const orgId = t.org_id || 1;
      const team = await createTeamAPI(orgId, {
        name: teamForm.name.trim(),
        contact_name: teamForm.contact_name.trim(),
        contact_phone: teamForm.contact_phone.trim(),
        sport_key: currentEvent.sport_key,
        members: validMembers,
      });
      await addTeamToEvent(currentEvent.event_id, team.team_id);
      setTeamForm({ name: "", contact_name: "", contact_phone: "" });
      setTeamMembers([{ name: "", role: "captain" }]);
      loadTeams(); flash("Team added!");
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleGenerateFixtures = async () => {
    try { const r = await generateFixtures(currentEvent.event_id); loadData(); flash(`${r.matches_created} matches created!`); }
    catch (e) { flash("Error: " + e.message); }
  };

  const handleMatchAction = async (matchId, action) => {
    try {
      if      (action === "start")   { await updateMatchStatus(matchId, { status: "live" }); setActiveMatch(matchId); }
      else if (action === "score")   setActiveMatch(matchId);
      else if (action === "rematch") await rematchMatch(matchId);
      else if (action === "delete")  { if (confirm("Delete this match?")) await deleteMatch(matchId); }
      loadData();
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleScore = async (matchId, s1, s2, server) => {
    await updateScore(matchId, { score_p1: s1, score_p2: s2, current_server: server });
    loadData();
  };

  const handleFinishMatch = async (matchId, winPos) => {
    try { await finishMatchAPI(matchId, winPos); loadData(); setActiveMatch(null); flash("Match finished!"); }
    catch (e) { flash("Error: " + e.message); }
  };

  const activeMatchData  = activeMatch ? currentEvent.matches?.find((m) => m.match_id === activeMatch) : null;

  const liveCount = currentEvent.matches?.filter((m) => m.status === "live").length || 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }
        .ew-content { max-width: 1100px; margin: 0 auto; padding: 20px 24px; }
        .ew-tabs { background: var(--cream); border-bottom: 2px solid var(--border); padding: 0 24px; display: flex; overflow-x: auto; scrollbar-width: none; }
        .ew-tabs::-webkit-scrollbar { display: none; }
        .ew-tab { background: none; border: none; border-bottom: 3px solid transparent; color: var(--muted); cursor: pointer; padding: 11px 18px; font-family: 'Barlow Condensed', sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; transition: all .15s; margin-bottom: -2px; white-space: nowrap; min-height: 44px; display: flex; align-items: center; gap: 6px; }
        .ew-tab:hover { color: var(--ink); }
        .ew-tab.active { color: var(--green); border-bottom-color: var(--green); }
        .ew-tab-badge { background: var(--live-red); color: #fff; font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 800; }
        .ew-card { background: #fff; border: 1.5px solid var(--border); border-radius: 8px; padding: 16px 18px; margin-bottom: 14px; }
        .ew-card-title { font-family: 'Barlow Condensed', sans-serif; font-size: 12px; font-weight: 800; letter-spacing: 2px; color: var(--green); text-transform: uppercase; margin-bottom: 12px; }
        .ew-form-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .ew-section-lbl { font-family: 'Barlow Condensed', sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 2.5px; color: var(--muted); text-transform: uppercase; margin: 20px 0 10px; display: flex; align-items: center; gap: 8px; }
        .ew-section-lbl::after { content: ''; flex: 1; height: 1px; background: var(--border); }
        .ew-group-box { background: var(--cream); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; }
        .ew-group-title { font-family: 'Barlow Condensed', sans-serif; font-size: 13px; font-weight: 800; color: var(--ink); letter-spacing: .5px; text-transform: uppercase; margin-bottom: 6px; }
        .ew-player-chip { font-size: 12px; background: #fff; padding: 3px 9px; border-radius: 4px; border: 1px solid var(--border); display: inline-block; margin: 2px; }
        .ew-team-card { background: #fff; border: 1.5px solid var(--border); border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; }
        .ew-team-name { font-family: 'Barlow Condensed', sans-serif; font-size: 16px; font-weight: 900; color: var(--ink); }
        .ew-roster { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
        .ew-roster-chip { font-size: 11px; padding: 3px 8px; border-radius: 4px; background: var(--green-bg); color: var(--green); border: 1px solid #2d5a2730; font-weight: 600; }
        .ew-roster-chip.cap { background: var(--yellow-bg); color: #a07010; border-color: #d4a01750; }
        .ew-member-row { display: grid; grid-template-columns: 1fr 120px 28px; gap: 6px; margin-bottom: 6px; align-items: center; }
        .ew-add-member { background: none; border: 1.5px dashed var(--border); color: var(--muted); border-radius: 6px; padding: 7px; cursor: pointer; font-family: 'Barlow Condensed', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; width: 100%; margin-top: 4px; transition: all .15s; }
        .ew-add-member:hover { border-color: var(--green); color: var(--green); }
        .ew-match-row { background: #fff; border: 1.5px solid var(--border); border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; transition: border-color .15s; }
        .ew-match-row.live { border-color: var(--live-red); background: var(--live-bg); }
        .ew-match-teams { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .ew-pname { font-family: 'Barlow Condensed', sans-serif; font-size: 16px; font-weight: 900; color: var(--ink); }
        .ew-pname.win { color: var(--green); }
        .ew-vscore { font-family: 'Barlow Condensed', sans-serif; font-size: 20px; font-weight: 900; min-width: 60px; text-align: center; }
        .ew-match-actions { display: flex; gap: 5px; margin-top: 8px; justify-content: flex-end; }
        .ew-sets { display: flex; gap: 4px; margin-top: 6px; }
        .ew-set { font-size: 11px; padding: 2px 6px; border-radius: 3px; font-weight: 700; font-family: 'Barlow Condensed', sans-serif; }
        .ew-flash { position: fixed; top: 100px; left: 50%; transform: translateX(-50%); background: var(--ink); color: #fff; font-family: 'Barlow Condensed', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 9px 20px; border-radius: 6px; z-index: 999; box-shadow: 0 4px 16px rgba(0,0,0,.2); }
        @media(max-width:768px){ .ew-content,.ew-tabs { padding-left:14px; padding-right:14px; } }
      `}</style>

      <OrgHeader
        user={user}
        onLogout={() => { clearToken(); navigate("/", { replace: true }); }}
        crumbs={[
          { label: "My Tournaments", path: "/organiser" },
          { label: t.name, path: `/organiser/tournament/${tournamentId}` },
          { label: `${sm.icon} ${currentEvent.name}` },
        ]}
        right={
          liveCount > 0 ? (
            <div className="live-badge">
              <span className="live-dot" style={{ background: "#fff" }} /> {liveCount} LIVE
            </div>
          ) : null
        }
      />

      {msg && <div className="ew-flash">{msg}</div>}

      {/* ── TABS ── */}
      <div className="ew-tabs">
        {TABS.map((tb) => (
          <button key={tb} className={`ew-tab${tab === tb ? " active" : ""}`} onClick={() => setTab(tb)}>
            {tabLabel(tb)}
            {tb === "live" && liveCount > 0 && <span className="ew-tab-badge">{liveCount}</span>}
          </button>
        ))}
      </div>

      <div className="ew-content">

        {/* ══ OVERVIEW ══════════════════════════════════════════ */}
        {tab === "overview" && (
          <div>
            {/* Event info card */}
            <div className="ew-card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 10, background: "var(--green-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
                  {sm.icon}
                </div>
                <div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20, fontWeight: 900, color: "var(--ink)" }}>
                    {currentEvent.name}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>
                    {sm.label} · {currentEvent.format.replace(/_/g, " ")} · {isTeam ? "Team sport" : "Individual"}
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                {[
                  { label: isTeam ? "Teams" : "Players", value: currentEvent.player_count },
                  { label: "Matches", value: currentEvent.match_count },
                  { label: "Done", value: `${currentEvent.done_count||0}/${currentEvent.match_count}` },
                  { label: "Live", value: liveCount, color: liveCount > 0 ? "var(--live-red)" : undefined },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: "var(--cream)", borderRadius: 6, padding: "10px 12px" }}>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 22, fontWeight: 900, color: color || "var(--ink)" }}>{value}</div>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "var(--muted)", textTransform: "uppercase" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn-primary" onClick={() => setTab(isTeam ? "teams" : "players")}>
                {isTeam ? "Manage Teams" : "Add Players"}
              </button>
              <button className="btn-outline" onClick={() => setTab("fixtures")}>
                Fixtures
              </button>
              {liveCount > 0 && (
                <button className="btn-danger" style={{ background: "var(--live-red)", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 6, fontFamily: "'Barlow Condensed',sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" }}
                  onClick={() => setTab("live")}>
                  🔴 Score Live Matches
                </button>
              )}
            </div>
          </div>
        )}

        {/* ══ INDIVIDUAL: PLAYERS ═══════════════════════════════ */}
        {tab === "players" && !isTeam && (
          <div>
            <div className="ew-card">
              <div className="ew-card-title">Add Player</div>
              <div className="ew-form-row">
                <input className="input" placeholder="Player name" style={{ flex: 2, minWidth: 140 }}
                  value={pForm.name} onChange={(e) => setPForm((f) => ({ ...f, name: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && handleAddPlayer()} />
                <input className="input" placeholder="Age" type="number" style={{ width: 72 }}
                  value={pForm.age} onChange={(e) => setPForm((f) => ({ ...f, age: e.target.value }))} />
                <select className="input" style={{ width: 100 }} value={pForm.gender}
                  onChange={(e) => setPForm((f) => ({ ...f, gender: e.target.value }))}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                <button className="btn-primary" onClick={handleAddPlayer}>Add</button>
              </div>
            </div>

            <div className="ew-card">
              <div className="ew-card-title">Groups</div>
              <div className="ew-form-row" style={{ marginBottom: 12 }}>
                <input className="input" placeholder="Group name (e.g. Group A)" style={{ flex: 1 }}
                  value={groupName} onChange={(e) => setGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()} />
                <button className="btn-primary" onClick={handleCreateGroup}>Create Group</button>
              </div>
              {currentEvent.groups?.map((g) => (
                <div key={g.group_id} className="ew-group-box">
                  <div className="ew-group-title">{g.name} <span style={{ fontWeight: 400, fontSize: 12, color: "var(--muted)", textTransform: "none" }}>({g.players?.length || 0} players)</span></div>
                  <div>{(g.players || []).map((p) => <span key={p.player_id} className="ew-player-chip">{p.name}</span>)}</div>
                </div>
              ))}
              {currentEvent.ungrouped_players?.length > 0 && (
                <div className="ew-group-box" style={{ marginTop: 8 }}>
                  <div className="ew-group-title" style={{ color: "var(--muted)" }}>Ungrouped ({currentEvent.ungrouped_players.length})</div>
                  <div>{currentEvent.ungrouped_players.map((p) => (
                    <span key={p.player_id} className="ew-player-chip" style={{ background: "var(--yellow-bg)", color: "#a07010" }}>{p.name}</span>
                  ))}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ TEAM SPORT: TEAMS ═════════════════════════════════ */}
        {tab === "teams" && isTeam && (
          <div>
            {/* Add team form */}
            <div className="ew-card">
              <div className="ew-card-title">Register a Team</div>
              <div className="ew-form-row" style={{ marginBottom: 12 }}>
                <input className="input" placeholder="Team name *" style={{ flex: 2, minWidth: 140 }}
                  value={teamForm.name} onChange={(e) => setTeamForm((f) => ({ ...f, name: e.target.value }))} />
                <input className="input" placeholder="Contact name" style={{ flex: 1, minWidth: 110 }}
                  value={teamForm.contact_name} onChange={(e) => setTeamForm((f) => ({ ...f, contact_name: e.target.value }))} />
                <input className="input" placeholder="Phone" style={{ flex: 1, minWidth: 100 }}
                  value={teamForm.contact_phone} onChange={(e) => setTeamForm((f) => ({ ...f, contact_phone: e.target.value }))} />
              </div>
              <div style={{ fontSize: 11, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>
                Squad Roster
              </div>
              {teamMembers.map((m, i) => (
                <div key={i} className="ew-member-row">
                  <input className="input" placeholder={i === 0 ? "Captain name *" : `Player ${i + 1}`}
                    value={m.name} onChange={(e) => handleTeamMemberChange(i, "name", e.target.value)} />
                  <select className="input" value={m.role} onChange={(e) => handleTeamMemberChange(i, "role", e.target.value)}>
                    <option value="captain">Captain</option>
                    <option value="player">Player</option>
                    {currentEvent.sport_key === "football" && <option value="goalkeeper">Goalkeeper</option>}
                    {currentEvent.sport_key === "cricket"  && <option value="wicketkeeper">Wicketkeeper</option>}
                    {currentEvent.sport_key === "cricket"  && <option value="bowler">Bowler</option>}
                  </select>
                  <button style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 18 }}
                    onClick={() => handleRemoveTeamMember(i)} disabled={teamMembers.length === 1}>×</button>
                </div>
              ))}
              <button className="ew-add-member" onClick={handleAddTeamMember}>+ Add Player</button>
              <div style={{ marginTop: 14, textAlign: "right" }}>
                <button className="btn-primary" onClick={handleCreateTeam}>Register Team</button>
              </div>
            </div>

            {/* Enrolled teams */}
            <div className="ew-section-lbl">{eventTeams.length} team{eventTeams.length !== 1 ? "s" : ""} registered</div>
            {eventTeams.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)" }}>
                <div style={{ fontSize: 32, marginBottom: 8, opacity: .4 }}>🏟️</div>
                No teams registered yet.
              </div>
            ) : (
              eventTeams.map((ep) => ep.team && (
                <div key={ep.team.team_id} className="ew-team-card">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div className="ew-team-name">{ep.team.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>
                        {ep.team.contact_name}{ep.team.contact_phone ? ` · ${ep.team.contact_phone}` : ""}
                        {" · "}{ep.team.member_count} players
                      </div>
                    </div>
                    <button className="btn-sm btn-outline" style={{ color: "var(--live-red)", borderColor: "var(--live-red)" }}
                      onClick={async () => { await removeTeamFromEvent(currentEvent.event_id, ep.team.team_id); loadTeams(); flash("Team removed."); }}>
                      Remove
                    </button>
                  </div>
                  <div className="ew-roster">
                    {ep.team.members?.map((m) => (
                      <span key={m.tm_id} className={`ew-roster-chip${m.role === "captain" ? " cap" : ""}`}>
                        {m.role === "captain" ? "© " : ""}{m.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ══ FIXTURES ══════════════════════════════════════════ */}
        {tab === "fixtures" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 14, color: "var(--muted)", fontWeight: 700 }}>
                {currentEvent.match_count} matches
              </span>
              <button className="btn-primary" onClick={handleGenerateFixtures}>⚡ Generate Fixtures</button>
            </div>

            {!currentEvent.matches?.length ? (
              <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--muted)" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🗓️</div>
                {isTeam ? "Add teams, then generate fixtures." : "Add players to groups, then generate fixtures."}
              </div>
            ) : (
              <>
                {currentEvent.groups?.map((g) => {
                  const gm = currentEvent.matches.filter((m) => m.group_id === g.group_id);
                  if (!gm.length) return null;
                  return (
                    <div key={g.group_id} style={{ marginBottom: 16 }}>
                      <div className="section-label">{g.name} · {gm.length} matches</div>
                      {gm.map((m) => <MatchCard key={m.match_id} match={m} onAction={handleMatchAction} sportKey={currentEvent.sport_key} />)}
                    </div>
                  );
                })}
                {currentEvent.matches.filter((m) => !m.group_id).map((m) => (
                  <MatchCard key={m.match_id} match={m} onAction={handleMatchAction} sportKey={currentEvent.sport_key} />
                ))}
              </>
            )}
          </div>
        )}

        {/* ══ LIVE / INNINGS / MATCH DAY ════════════════════════ */}
        {tab === "live" && (
          <div>
            {!currentEvent.match_count ? (
              <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--muted)" }}>Generate fixtures first.</div>
            ) : (
              (() => {
                const live      = currentEvent.matches?.filter((m) => m.status === "live")      || [];
                const scheduled = currentEvent.matches?.filter((m) => m.status === "scheduled") || [];
                const done      = currentEvent.matches?.filter((m) => m.status === "done")      || [];
                const sorted    = [...live, ...scheduled, ...done];
                return sorted.map((m) => (
                  <MatchCard key={m.match_id} match={m} onAction={handleMatchAction}
                    sportKey={currentEvent.sport_key} onFinish={handleFinishMatch} showScore />
                ));
              })()
            )}
          </div>
        )}
      </div>

      {/* TT / Badminton scorer overlay */}
      {activeMatch && activeMatchData && ["table_tennis","badminton"].includes(currentEvent.sport_key) && (
        <TTScorer
          match={activeMatchData}
          config={currentEvent.sport_config || {}}
          onScore={(s1, s2, srv) => handleScore(activeMatch, s1, s2, srv)}
          onUndoSet={() => { undoSet(activeMatch).then(loadData); }}
          onClose={() => { setActiveMatch(null); loadData(); }}
        />
      )}

      {/* Cricket / Football scorer overlay */}
      {activeMatch && activeMatchData && ["cricket","football"].includes(currentEvent.sport_key) && (
        <SimpleScorer
          match={activeMatchData}
          sportKey={currentEvent.sport_key}
          config={currentEvent.sport_config || {}}
          onScore={(s1, s2, extra) => updateScore(activeMatch, { score_p1: s1, score_p2: s2, ...extra }).then(loadData)}
          onFinish={(wp) => handleFinishMatch(activeMatch, wp)}
          onClose={() => { setActiveMatch(null); loadData(); }}
        />
      )}
    </div>
  );
}

// ── MatchCard ─────────────────────────────────────────────────
function MatchCard({ match: m, onAction, sportKey, onFinish, showScore }) {
  const isLive = m.status === "live";
  const isDone = m.status === "done";
  const sets   = m.sets || [];
  const ls     = m.live_state || {};

  return (
    <div className={`ew-match-row${isLive ? " live" : ""}`}>
      <div className="ew-match-teams">
        <span className={`ew-pname${m.player_1?.is_winner ? " win" : ""}`}>{m.player_1?.name || "TBD"}</span>
        <div style={{ textAlign: "center" }}>
          <div className="ew-vscore" style={{ color: isLive ? "var(--live-red)" : isDone ? "var(--green)" : "var(--muted)", fontSize: isLive || isDone ? 20 : 14 }}>
            {isLive || isDone ? `${m.player_1?.score??0}–${m.player_2?.score??0}` : "vs"}
          </div>
          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
            {isLive && <span style={{ fontSize: 10, background: "var(--live-red)", color: "#fff", padding: "1px 6px", borderRadius: 3, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800 }}>LIVE</span>}
            {isDone  && <span style={{ fontSize: 10, background: "var(--green-bg)", color: "var(--green)", padding: "1px 6px", borderRadius: 3, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800 }}>DONE</span>}
          </div>
          {isLive && sportKey === "cricket" && ls.overs && (
            <div style={{ fontSize: 11, color: "var(--live-red)", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700 }}>{ls.overs} ov</div>
          )}
          {isLive && sportKey === "football" && ls.minute && (
            <div style={{ fontSize: 11, color: "var(--live-red)", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700 }}>{ls.minute}'</div>
          )}
        </div>
        <span className={`ew-pname${m.player_2?.is_winner ? " win" : ""}`} style={{ textAlign: "right" }}>{m.player_2?.name || "TBD"}</span>
      </div>

      {/* Set chips */}
      {sets.length > 0 && (isLive || isDone) && ["table_tennis","badminton"].includes(sportKey) && (
        <div className="ew-sets">
          {sets.map((s) => (
            <span key={s.set_number} className="ew-set"
              style={{ background: s.is_complete ? "var(--green-bg)" : "var(--yellow-bg)", color: s.is_complete ? "var(--green)" : "#a07010" }}>
              S{s.set_number}: {s.score_p1}-{s.score_p2}
            </span>
          ))}
        </div>
      )}

      {/* Cricket innings */}
      {sportKey === "cricket" && sets.length > 0 && (
        <div style={{ marginTop: 6, display: "flex", gap: 14, fontSize: 12, color: "var(--muted)" }}>
          {sets.map((s) => (
            <span key={s.set_number}>
              <strong style={{ fontFamily: "'Barlow Condensed',sans-serif", color: "var(--ink)" }}>Inn {s.set_number}:</strong>{" "}
              {s.score_p1}/{s.score_p2}{s.is_complete ? " ✓" : ""}
            </span>
          ))}
          {sets.length === 2 && sets[0]?.is_complete && !sets[1]?.is_complete && (
            <span style={{ color: "var(--green)", fontWeight: 700 }}>Target: {sets[0].score_p1 + 1}</span>
          )}
        </div>
      )}

      {isDone && (
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--green)", fontFamily: "'Barlow Condensed',sans-serif", marginTop: 6 }}>
          🏆 {m.player_1?.is_winner ? m.player_1?.name : m.player_2?.is_winner ? m.player_2?.name : "Draw"}
        </div>
      )}

      <div className="ew-match-actions">
        {m.status === "scheduled" && <button className="btn-sm btn-danger" onClick={() => onAction(m.match_id, "start")}>▶ Start</button>}
        {isLive && <button className="btn-sm btn-danger" onClick={() => onAction(m.match_id, "score")}>Score</button>}
        {isDone && <button className="btn-sm btn-outline" onClick={() => onAction(m.match_id, "rematch")}>Rematch</button>}
        {!isDone && <button className="btn-sm btn-outline" style={{ color: "var(--muted)" }} onClick={() => onAction(m.match_id, "delete")}>✕</button>}
      </div>
    </div>
  );
}

// ── SimpleScorer — Cricket & Football ─────────────────────────
function SimpleScorer({ match: m, sportKey, config, onScore, onFinish, onClose }) {
  const isCricket  = sportKey === "cricket";
  const isFootball = sportKey === "football";
  const sets       = m.sets || [];
  const ls         = m.live_state || {};

  const [s1, setS1]       = useState(m.player_1?.score ?? 0);
  const [s2, setS2]       = useState(m.player_2?.score ?? 0);
  const [overs, setOvers] = useState(ls.overs || "");
  const [minute, setMin]  = useState(ls.minute || 0);
  const [half, setHalf]   = useState(ls.half || 1);

  const overlay = {
    position: "fixed", inset: 0, background: "rgba(26,18,8,.75)",
    zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
  };
  const box = {
    background: "#fff", borderRadius: 12, padding: 28,
    width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto",
    boxShadow: "0 12px 40px rgba(0,0,0,.25)",
  };
  const lbl = { fontSize: 11, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 5, display: "block" };

  return (
    <div style={overlay}>
      <div style={box}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, letterSpacing: 2, color: "var(--muted)", fontWeight: 800, textTransform: "uppercase", marginBottom: 2 }}>
              {isCricket ? "Innings Scorer" : "Match Scorer"}
            </div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 18, fontWeight: 900, color: "var(--ink)" }}>
              {m.player_1?.name} vs {m.player_2?.name}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "var(--sand)", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 16, color: "var(--muted)" }}>×</button>
        </div>

        {isCricket && (
          <div>
            <div style={{ background: "var(--green-bg)", border: "1px solid #2d5a2730", borderRadius: 7, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
              <strong style={{ fontFamily: "'Barlow Condensed',sans-serif", color: "var(--green)", fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase" }}>
                Innings {sets.filter((s) => s.is_complete).length + 1}
              </strong>
              {sets.length === 2 && sets[0]?.is_complete && (
                <div style={{ color: "var(--green)", marginTop: 4 }}>Target: {sets[0].score_p1 + 1}</div>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <span style={lbl}>Runs</span>
                <input type="number" className="input" style={{ width: "100%", textAlign: "center", fontSize: 24, fontWeight: 900 }} value={s1} onChange={(e) => setS1(+e.target.value || 0)} min={0} />
              </div>
              <div>
                <span style={lbl}>Wickets</span>
                <input type="number" className="input" style={{ width: "100%", textAlign: "center", fontSize: 24, fontWeight: 900 }} value={s2} onChange={(e) => setS2(+e.target.value || 0)} min={0} max={10} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <span style={lbl}>Overs</span>
              <input type="text" className="input" style={{ width: "100%" }} placeholder="e.g. 12.3" value={overs} onChange={(e) => setOvers(e.target.value)} />
            </div>
            <button className="btn-primary" style={{ width: "100%", marginBottom: 8 }} onClick={() => onScore(s1, s2, { overs })}>Update Score</button>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button className="btn-outline" onClick={() => onFinish(null)}>
                {sets.filter((s) => s.is_complete).length === 0 ? "End 1st Innings" : "End Match"}
              </button>
              <button className="btn-outline" style={{ color: "var(--live-red)", borderColor: "var(--live-red)" }} onClick={() => { onScore(s1, s2, { overs }); onFinish(null); }}>
                All Out
              </button>
            </div>
          </div>
        )}

        {isFootball && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center", marginBottom: 20 }}>
              {[
                { name: m.player_1?.name, score: s1, setScore: setS1 },
                null,
                { name: m.player_2?.name, score: s2, setScore: setS2 },
              ].map((side, idx) =>
                side ? (
                  <div key={idx} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 600 }}>{side.name}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <button onClick={() => side.setScore((v) => Math.max(0, v - 1))} style={{ width: 32, height: 32, border: "1.5px solid var(--border)", borderRadius: 6, background: "none", cursor: "pointer", fontSize: 18 }}>−</button>
                      <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 42, fontWeight: 900, color: "var(--ink)", minWidth: 48, textAlign: "center" }}>{side.score}</span>
                      <button onClick={() => side.setScore((v) => v + 1)} style={{ width: 32, height: 32, border: "1.5px solid var(--green)", borderRadius: 6, background: "var(--green)", cursor: "pointer", fontSize: 18, color: "#fff" }}>+</button>
                    </div>
                  </div>
                ) : (
                  <div key={idx} style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 900, color: "var(--muted)", textAlign: "center" }}>vs</div>
                )
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <span style={lbl}>Minute</span>
                <input type="number" className="input" style={{ width: "100%" }} min={0} max={120} value={minute} onChange={(e) => setMin(+e.target.value || 0)} />
              </div>
              <div>
                <span style={lbl}>Half</span>
                <select className="input" style={{ width: "100%" }} value={half} onChange={(e) => setHalf(+e.target.value)}>
                  <option value={1}>1st Half</option>
                  <option value={2}>2nd Half</option>
                </select>
              </div>
            </div>
            <button className="btn-primary" style={{ width: "100%", marginBottom: 8 }} onClick={() => onScore(s1, s2, { minute, half })}>Update Score</button>
            <button className="btn-outline" style={{ width: "100%" }} onClick={() => onFinish(s1 > s2 ? 1 : s2 > s1 ? 2 : null)}>Full Time</button>
          </div>
        )}
      </div>
    </div>
  );
}