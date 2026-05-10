import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getWorkspace,
  createPlayer, addPlayerToEvent, assignPlayerGroup, removePlayerFromEvent,
  createGroup, generateFixtures,
  updateMatchStatus, updateScore, undoSet, rematchMatch, deleteMatch,
  getMe, clearToken,
} from "../../../api/client";
import TTScorer        from "../../../components/scoring/TTScorer";
import BadmintonScorer from "../../../components/scoring/BadmintonScorer";
import CricketScorer   from "../../../components/scoring/CricketScorer";
import FootballScorer  from "../../../components/scoring/FootballScorer";
import OrgHeader       from "../../../components/shared/OrgHeader";
import { IndividualTab, DoublesTab, TeamTab } from "../../../components/shared/ParticipantsTab";

const SPORT_META = {
  table_tennis: { abbrev: "TT", label: "Table Tennis" },
  badminton:    { abbrev: "BD", label: "Badminton"    },
  cricket:      { abbrev: "CR", label: "Cricket"      },
  football:     { abbrev: "FB", label: "Football"     },
};

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

const createTeamAPI       = (orgId, d) => apiFetch(`/orgs/${orgId}/teams`, { method: "POST", body: JSON.stringify(d) });
const addTeamToEvent      = (eId, tId) => apiFetch(`/events/${eId}/teams?team_id=${tId}`, { method: "POST" });
const removeTeamFromEvent = (eId, tId) => apiFetch(`/events/${eId}/teams/${tId}`, { method: "DELETE" });
const getEventTeams       = (eId)      => apiFetch(`/events/${eId}/teams`);
const finishMatchAPI      = (mId, wp)  => apiFetch(`/matches/${mId}/finish`, { method: "POST", body: JSON.stringify({ winner_position: wp }) });

export default function EventWorkspace() {
  const { tournamentId, eventId } = useParams();
  const navigate = useNavigate();

  const [data,               setData]               = useState(null);
  const [user,               setUser]               = useState(null);
  const [tab,                setTab]                = useState("overview");
  const [msg,                setMsg]                = useState("");
  const [activeMatch,        setActiveMatch]        = useState(null);
  const [eventTeams,         setEventTeams]         = useState([]);
  const [standings,          setStandings]          = useState(null);
  const [thirdPlace,         setThirdPlace]         = useState(false);
  const [numGroups,          setNumGroups]          = useState(4);
  const [qualifiersPerGroup, setQualifiersPerGroup] = useState(2);

  const flash = (txt) => { setMsg(txt); setTimeout(() => setMsg(""), 3000); };

  const loadData = useCallback(async () => {
    try { setData(await getWorkspace(tournamentId)); }
    catch (e) { console.error(e); }
  }, [tournamentId]);

  const loadTeams = useCallback(async () => {
    try { setEventTeams(await getEventTeams(eventId) || []); }
    catch (e) { console.error(e); }
  }, [eventId]);

  const loadStandings = useCallback(async () => {
    try { setStandings(await apiFetch(`/orgs/events/${eventId}/standings`)); }
    catch (e) { console.error(e); }
  }, [eventId]);

  useEffect(() => {
    getMe().then(setUser).catch(() => { clearToken(); navigate("/login"); });
    loadData();
  }, [loadData]);
  
  // ── FIX: derive participant_type from raw data, NOT from currentEvent ──
  useEffect(() => {
    if (!data) return;
    const ev = data.events?.find(e => e.event_id === parseInt(eventId));
    if (ev?.participant_type === "team" || ev?.participant_type === "doubles_pair") loadTeams();
    if (ev?.format === "round_robin") loadStandings();
  }, [data, eventId, loadTeams, loadStandings]);

  if (!data) return (
    <div className="auth-wrap">
      <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)" }}>Loading…</div>
    </div>
  );

  const { tournament: t, events } = data;
  const currentEvent = events.find(e => e.event_id === parseInt(eventId)) || events[0];

  if (!currentEvent) return (
    <div className="auth-wrap">
      <div style={{ color: "var(--muted)" }}>Event not found.</div>
    </div>
  );

  const sm         = SPORT_META[currentEvent.sport_key] || { abbrev: currentEvent.sport_key?.slice(0,2).toUpperCase() || "?", label: currentEvent.sport_key };
  const pType      = currentEvent.participant_type;       // "individual" | "doubles_pair" | "team"
  const isIndividual = pType === "individual";
  const isDoubles    = pType === "doubles_pair";
  const isTeam       = pType === "team";

  // Tab label for participant slot: pairs / teams / players
  const pTab = isDoubles ? "pairs" : isTeam ? "teams" : "players";
  const showStandings = currentEvent.format === "round_robin";
  const TABS = ["overview", pTab, "fixtures", ...(showStandings ? ["standings"] : []), "live"];

  const tabLabel = (tb) => {
    if (tb === "live"       && currentEvent.sport_key === "cricket")  return "Innings";
    if (tb === "live"       && currentEvent.sport_key === "football") return "Match Day";
    if (tb === "pairs")      return "Pairs";
    if (tb === "teams")      return "Teams";
    if (tb === "players")    return "Players";
    if (tb === "standings")  return "Standings";
    return tb.charAt(0).toUpperCase() + tb.slice(1);
  };

  const liveCount       = currentEvent.matches?.filter(m => m.status === "live").length || 0;
  const activeMatchData = activeMatch ? currentEvent.matches?.find(m => m.match_id === activeMatch) : null;

  // ── Participant handlers ──────────────────────────────────

  const handleAddPlayer = async (form) => {
    try {
      const p = await createPlayer({ name: form.name.trim(), age: parseInt(form.age) || null, gender: form.gender });
      await addPlayerToEvent(currentEvent.event_id, p.player_id, form.group_id ? parseInt(form.group_id) : null);
      loadData(); flash("Player added!");
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleAssignGroup = async (playerId, groupId) => {
    try {
      await assignPlayerGroup(currentEvent.event_id, playerId, groupId);
      loadData(); flash(groupId ? "Player assigned to group." : "Player removed from group.");
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleRemovePlayer = async (playerId) => {
    try {
      await removePlayerFromEvent(currentEvent.event_id, playerId);
      loadData(); flash("Player removed.");
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleCreateGroup = async (name) => {
    try { await createGroup(currentEvent.event_id, name); loadData(); flash("Group created!"); }
    catch (e) { flash("Error: " + e.message); }
  };

  // Doubles — captain is contact, stored as Team with 2 members
  const handleAddPair = async (form) => {
    // Guard: ensure org_id exists
  if (!t.org_id) {
    flash("Error: Organization ID missing. Please reload the page.");
    console.error("Tournament data:", t);
    return;
  }

    try {
      const team = await createTeamAPI(t.org_id || 1, {
        name:          form.pair_name,
        contact_phone: form.contact_phone || "",
        sport_key:     currentEvent.sport_key,
        members: [
          { name: form.player1_name.trim(), role: "player1" },
          { name: form.player2_name.trim(), role: "player2" },
        ],
      });
      await addTeamToEvent(currentEvent.event_id, team.team_id);
      loadTeams(); flash("Pair added!");
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleRemovePair = async (teamId) => {
    try { await removeTeamFromEvent(currentEvent.event_id, teamId); loadTeams(); flash("Pair removed."); }
    catch (e) { flash("Error: " + e.message); }
  };

  // Team — captain IS the contact person (no separate contact fields)
  const handleAddTeam = async (form, members) => {
    if (!t.org_id) {
      flash("Error: Organization ID missing. Please reload the page.");
      console.error("Tournament data:", t);
      return;
    }
    // Captain is first member with role="captain" — use their name as contact_name
    const captain = members.find(m => m.role === "captain") || members[0];
    try {
      const team = await createTeamAPI(t.org_id , {
        name:          form.name.trim(),
        contact_name:  captain?.name || "",   // captain = contact
        contact_phone: form.contact_phone?.trim() || "",
        sport_key:     currentEvent.sport_key,
        members,
      });
      await addTeamToEvent(currentEvent.event_id, team.team_id);
      loadTeams(); flash("Team added!");
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleRemoveTeam = async (teamId) => {
    try { await removeTeamFromEvent(currentEvent.event_id, teamId); loadTeams(); flash("Team removed."); }
    catch (e) { flash("Error: " + e.message); }
  };

  // Fixtures + scoring
  const handleGenerateFixtures = async () => {
    try {
      const r = await generateFixtures(currentEvent.event_id, thirdPlace);
      loadData();
      if (showStandings) loadStandings();
      flash(`${r.matches_created} matches created!`);
    }
    catch (e) { flash("Error: " + e.message); }
  };

  const handleGenerateGroups = async () => {
    try {
      const r = await apiFetch(`/events/${currentEvent.event_id}/generate-groups?num_groups=${numGroups}`, { method: "POST" });
      loadData();
      flash(`${r.groups_created} groups created, ${r.matches_created} matches generated!`);
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleGenerateKnockout = async () => {
    try {
      const r = await apiFetch(
        `/events/${currentEvent.event_id}/generate-knockout-from-groups?qualifiers_per_group=${qualifiersPerGroup}&third_place=${thirdPlace}`,
        { method: "POST" }
      );
      loadData();
      const warn = r.warning ? ` ⚠ ${r.warning}` : "";
      flash(`Knockout bracket created — ${r.matches_created} matches, ${r.qualifiers} qualifiers.${warn}`);
    } catch (e) { flash("Error: " + e.message); }
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

  const handleSetConfig = async (matchId, setsToWin) => {
    try {
      await updateMatchStatus(matchId, { status: "scheduled", sets_to_win: setsToWin });
      loadData();
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleScore = async (matchId, s1, s2, server) => {
    await updateScore(matchId, { score_p1: s1, score_p2: s2, current_server: server });
    loadData();
  };

  const handleFinishMatch = async (matchId, winPos) => {
    try {
      await finishMatchAPI(matchId, winPos);
      loadData();
      if (showStandings) loadStandings();
      setActiveMatch(null);
      flash("Match finished!");
    }
    catch (e) { flash("Error: " + e.message); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <OrgHeader
        user={user}
        onLogout={() => { clearToken(); navigate("/", { replace: true }); }}
        crumbs={[
          { label: "My Tournaments", path: "/organiser" },
          { label: t.name, path: `/organiser/tournament/${tournamentId}` },
          { label: currentEvent.name },
        ]}
        right={liveCount > 0 ? (
          <div className="live-badge"><span className="live-dot" /> {liveCount} LIVE</div>
        ) : null}
      />

      {msg && <div className="flash success">{msg}</div>}

      {/* ── TABS ── */}
      <div className="tabs">
        {TABS.map(tb => (
          <button key={tb} className={`tab${tab === tb ? " active" : ""}`} onClick={() => setTab(tb)}>
            {tabLabel(tb)}
            {tb === "live" && liveCount > 0 && <span className="tab-badge">{liveCount}</span>}
          </button>
        ))}
      </div>

      <div className="workspace-content" style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 24px" }}>

        {/* ══ OVERVIEW ══════════════════════════════════════════ */}
        {tab === "overview" && (
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: 10, background: "var(--primary-dim)", border: "1px solid rgba(255,107,53,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 900, color: "var(--primary)", flexShrink: 0 }}>
                  {sm.abbrev}
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900, textTransform: "uppercase", letterSpacing: -0.5, color: "var(--ink)" }}>
                    {currentEvent.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span>{sm.label}</span>
                    <span>·</span>
                    <span>{currentEvent.format.replace(/_/g, " ")}</span>
                    <span>·</span>
                    <span className={`pill ${isDoubles ? "pill-gold" : isTeam ? "pill-orange" : "pill-green"}`}>
                      {isDoubles ? "Doubles Pairs" : isTeam ? "Team Sport" : "Individual"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="stats-grid" style={{ marginBottom: 0 }}>
                {[
                  { label: isDoubles ? "Pairs" : isTeam ? "Teams" : "Players", value: currentEvent.player_count },
                  { label: "Matches", value: currentEvent.match_count },
                  { label: "Done",    value: `${currentEvent.done_count || 0}/${currentEvent.match_count}` },
                  { label: "Live",    value: liveCount, color: liveCount > 0 ? "var(--primary)" : undefined },
                ].map(({ label, value, color }) => (
                  <div key={label} className="stat-card" style={{ margin: 0 }}>
                    <div className="stat-num" style={color ? { color } : {}}>{value}</div>
                    <div className="stat-label">{label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} className="event-actions">
              <button className="btn btn-primary" onClick={() => setTab(pTab)}>
                {isDoubles ? "Manage Pairs" : isTeam ? "Manage Teams" : "Add Players"}
              </button>
              <button className="btn btn-outline" onClick={() => setTab("fixtures")}>Fixtures</button>
              {liveCount > 0 && (
                <button className="btn btn-danger" onClick={() => setTab("live")}>Score Live</button>
              )}
            </div>
          </div>
        )}

        {/* ══ PARTICIPANTS ══════════════════════════════════════
            Exactly ONE of these renders based on participant_type.
            The old inline form has been removed entirely.
        ════════════════════════════════════════════════════════ */}

        {tab === "players" && isIndividual && (
          <IndividualTab
            event={currentEvent}
            onAddPlayer={handleAddPlayer}
            onCreateGroup={handleCreateGroup}
            onAssignGroup={handleAssignGroup}
            onRemovePlayer={handleRemovePlayer}
            flash={flash}
          />
        )}

        {tab === "pairs" && isDoubles && (
          <DoublesTab
            event={currentEvent}
            pairs={eventTeams}
            onAddPair={handleAddPair}
            onRemovePair={handleRemovePair}
            flash={flash}
          />
        )}

        {tab === "teams" && isTeam && (
          <TeamTab
            event={currentEvent}
            teams={eventTeams}
            onAddTeam={handleAddTeam}
            onRemoveTeam={handleRemoveTeam}
            flash={flash}
          />
        )}

        {/* ══ FIXTURES ══════════════════════════════════════════ */}
        {tab === "fixtures" && (
          <div>
            {currentEvent.format === "group_knockout" ? (
              <GroupKnockoutFixtures
                event={currentEvent}
                numGroups={numGroups}
                setNumGroups={setNumGroups}
                qualifiersPerGroup={qualifiersPerGroup}
                setQualifiersPerGroup={setQualifiersPerGroup}
                thirdPlace={thirdPlace}
                setThirdPlace={setThirdPlace}
                onGenerateGroups={handleGenerateGroups}
                onGenerateKnockout={handleGenerateKnockout}
                onAction={handleMatchAction}
                onSetConfig={handleSetConfig}
                sportKey={currentEvent.sport_key}
              />
            ) : (
              <>
                {/* ── Control bar (non-group_knockout) ── */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
                    {currentEvent.match_count} matches
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {currentEvent.format === "direct_knockout" && (
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>
                        <input type="checkbox" checked={thirdPlace} onChange={e => setThirdPlace(e.target.checked)} style={{ cursor: "pointer" }} />
                        3rd place match
                      </label>
                    )}
                    <button className="btn btn-primary" onClick={handleGenerateFixtures}>Generate Fixtures</button>
                  </div>
                </div>

                {/* ── Match display ── */}
                {!currentEvent.matches?.length ? (
                  <div className="empty">
                    <div className="empty-icon"></div>
                    {isTeam || isDoubles
                      ? `Add ${isDoubles ? "pairs" : "teams"}, then generate fixtures.`
                      : "Add players, then generate fixtures."}
                  </div>
                ) : currentEvent.format === "direct_knockout" ? (
                  <KnockoutBracket matches={currentEvent.matches} onAction={handleMatchAction} onSetConfig={handleSetConfig} sportKey={currentEvent.sport_key} />
                ) : (
                  <>
                    {currentEvent.groups?.map(g => {
                      const gm = currentEvent.matches.filter(m => m.group_id === g.group_id);
                      if (!gm.length) return null;
                      return (
                        <div key={g.group_id} style={{ marginBottom: 20 }}>
                          <div className="section-label">{g.name} · {gm.length} matches</div>
                          {gm.map(m => <MatchCard key={m.match_id} match={m} onAction={handleMatchAction} onSetConfig={handleSetConfig} sportKey={currentEvent.sport_key} />)}
                        </div>
                      );
                    })}
                    {currentEvent.matches.filter(m => !m.group_id).map(m => (
                      <MatchCard key={m.match_id} match={m} onAction={handleMatchAction} onSetConfig={handleSetConfig} sportKey={currentEvent.sport_key} />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ══ STANDINGS (round_robin / group_knockout) ═══════════ */}
        {tab === "standings" && (
          <div>
            {!standings ? (
              <div className="empty">Loading standings…</div>
            ) : !standings.groups?.length || standings.groups.every(g => !g.rows?.length) ? (
              <div className="empty">No completed matches yet. Standings will appear as matches finish.</div>
            ) : standings.groups.map((group, gi) => (
              <div key={gi} style={{ marginBottom: 24 }}>
                {standings.groups.length > 1 && (
                  <div className="section-label" style={{ marginBottom: 10 }}>{group.name}</div>
                )}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "var(--surface-2, var(--surface))" }}>
                        {["#", "Name", "MP", "W", "L", "SW", "SL", "PF", "PA", "Pts"].map(h => (
                          <th key={h} style={{ padding: "8px 10px", textAlign: h === "Name" ? "left" : "center", fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, i) => (
                        <tr key={row.participant_id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "var(--surface)" }}>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--muted)", fontWeight: 700 }}>{i + 1}</td>
                          <td style={{ padding: "9px 10px", fontWeight: 600, color: "var(--ink)" }}>{row.name}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--muted)" }}>{row.matches_played}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--green, #22c55e)", fontWeight: 700 }}>{row.wins}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--red, #ef4444)" }}>{row.losses}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--muted)" }}>{row.sets_won}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--muted)" }}>{row.sets_lost}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--muted)" }}>{row.points_for}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--muted)" }}>{row.points_against}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 900, color: "var(--primary)" }}>{row.ranking_points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)", display: "flex", gap: 12 }}>
                  <span>MP = Matches Played</span>
                  <span>W/L = Wins/Losses</span>
                  <span>SW/SL = Sets Won/Lost</span>
                  <span>PF/PA = Points For/Against</span>
                  <span>Pts = Ranking Points (W=2)</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ LIVE / INNINGS / MATCH DAY ════════════════════════ */}
        {tab === "live" && (
          <div>
            {!currentEvent.match_count ? (
              <div className="empty">Generate fixtures first.</div>
            ) : (() => {
              const live      = currentEvent.matches?.filter(m => m.status === "live")      || [];
              const scheduled = currentEvent.matches?.filter(m => m.status === "scheduled") || [];
              const done      = currentEvent.matches?.filter(m => m.status === "done")      || [];
              return [...live, ...scheduled, ...done].map(m => (
                <MatchCard key={m.match_id} match={m} onAction={handleMatchAction} onSetConfig={handleSetConfig}
                  sportKey={currentEvent.sport_key} />
              ));
            })()}
          </div>
        )}
      </div>

      {/* ── SCORER OVERLAYS ── */}
      {activeMatch && activeMatchData && currentEvent.sport_key === "table_tennis" && (
        <TTScorer match={activeMatchData} config={currentEvent.sport_config || {}}
          onScore={(s1, s2, srv) => handleScore(activeMatch, s1, s2, srv)}
          onUndoSet={() => { undoSet(activeMatch).then(loadData); }}
          onClose={() => { setActiveMatch(null); loadData(); loadStandings(); }} />
      )}
      {activeMatch && activeMatchData && currentEvent.sport_key === "badminton" && (
        <BadmintonScorer match={activeMatchData} config={currentEvent.sport_config || {}}
          onScore={(s1, s2, srv) => handleScore(activeMatch, s1, s2, srv)}
          onUndoSet={() => { undoSet(activeMatch).then(loadData); }}
          onClose={() => { setActiveMatch(null); loadData(); }} />
      )}
      {activeMatch && activeMatchData && currentEvent.sport_key === "cricket" && (
        <CricketScorer match={activeMatchData} config={currentEvent.sport_config || {}}
          onScore={(s1, s2, extra) => updateScore(activeMatch, { score_p1: s1, score_p2: s2, ...extra }).then(loadData)}
          onFinish={(wp) => handleFinishMatch(activeMatch, wp)}
          onClose={() => { setActiveMatch(null); loadData(); }} />
      )}
      {activeMatch && activeMatchData && currentEvent.sport_key === "football" && (
        <FootballScorer match={activeMatchData} config={currentEvent.sport_config || {}}
          onScore={(s1, s2, extra) => updateScore(activeMatch, { score_p1: s1, score_p2: s2, ...extra }).then(loadData)}
          onFinish={(wp) => handleFinishMatch(activeMatch, wp)}
          onClose={() => { setActiveMatch(null); loadData(); }} />
      )}
    </div>
  );
}

// ── GroupKnockoutFixtures ─────────────────────────────────────
// Step-by-step UI for the group + knockout format.
// Group stage = single-elimination bracket per group (with byes).
// Championship stage = knockout bracket seeded from group winners/runners-up.
function GroupKnockoutFixtures({
  event, numGroups, setNumGroups, qualifiersPerGroup, setQualifiersPerGroup,
  thirdPlace, setThirdPlace, onGenerateGroups, onGenerateKnockout,
  onAction, onSetConfig, sportKey,
}) {
  const allMatches      = event.matches || [];
  const groupMatches    = allMatches.filter(m => m.group_id);
  const knockoutMatches = allMatches.filter(m => !m.group_id);
  const hasGroups       = groupMatches.length > 0;
  const hasKnockout     = knockoutMatches.length > 0;

  // "Group stage complete" = every group has a DONE final match
  const allGroupFinalsDone = (event.groups?.length > 0) && event.groups.every(g =>
    groupMatches.some(m => m.group_id === g.group_id && m.stage === "final" && m.status === "done")
  );

  const doneGroup  = groupMatches.filter(m => m.status === "done").length;
  const doneKnock  = knockoutMatches.filter(m => m.status === "done").length;

  const NumInput = ({ label, value, setter, min, max }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>{label}</span>
      <input
        type="number" value={value} min={min} max={max}
        onChange={e => setter(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))}
        style={{ width: 52, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", fontSize: 14, fontWeight: 700, textAlign: "center" }}
      />
    </div>
  );

  // ── Step 1: no groups yet ─────────────────────────────────
  if (!hasGroups) {
    return (
      <div>
        <div className="card" style={{ marginBottom: 20, padding: 20 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "var(--primary)", marginBottom: 4 }}>
            Step 1 — Set up Groups
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
            Players are divided randomly into groups. Each group plays a single-elimination bracket (with byes if needed). Group winner and runner-up advance to the championship bracket.
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
            <NumInput label="Number of groups" value={numGroups} setter={setNumGroups} min={2} max={16} />
            <button className="btn btn-primary" style={{ height: 34 }} onClick={onGenerateGroups}>
              Generate Groups
            </button>
          </div>
        </div>
        <div className="empty"><div className="empty-icon"></div>Add players first, then generate groups.</div>
      </div>
    );
  }

  // ── Step 2: groups exist ──────────────────────────────────
  return (
    <div>
      {/* Status banner */}
      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        {!hasKnockout ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: allGroupFinalsDone ? "var(--green,#22c55e)" : "var(--primary)", marginBottom: 4 }}>
                {allGroupFinalsDone ? "✓ All Group Finals Done" : "Group Stage in Progress"}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {doneGroup}/{groupMatches.length} group matches played
                {allGroupFinalsDone ? " — ready to seed the championship bracket." : ". Complete each group's final to advance."}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
              {allGroupFinalsDone && (
                <>
                  <NumInput label="Qualifiers/group" value={qualifiersPerGroup} setter={setQualifiersPerGroup} min={1} max={2} />
                  <label style={{ display: "flex", flexDirection: "column", gap: 3, cursor: "pointer" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>3rd Place</span>
                    <div style={{ height: 34, display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="checkbox" checked={thirdPlace} onChange={e => setThirdPlace(e.target.checked)} style={{ cursor: "pointer", width: 16, height: 16 }} />
                      <span style={{ fontSize: 12 }}>Match</span>
                    </div>
                  </label>
                  <button className="btn btn-primary" style={{ height: 34 }} onClick={onGenerateKnockout}>
                    Generate Championship →
                  </button>
                </>
              )}
              <button className="btn btn-outline" style={{ height: 34, fontSize: 11, color: "var(--muted)" }} onClick={onGenerateGroups}>
                Reset Groups
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "var(--green,#22c55e)", marginBottom: 4 }}>
                ✓ Tournament Running
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Groups: {doneGroup}/{groupMatches.length} · Championship: {doneKnock}/{knockoutMatches.length}
              </div>
            </div>
            <button className="btn btn-outline" style={{ fontSize: 11, color: "var(--muted)" }} onClick={onGenerateKnockout}>
              Regenerate Championship
            </button>
          </div>
        )}
      </div>

      {/* Group brackets — one KnockoutBracket per group */}
      {event.groups?.map(g => {
        const gm = groupMatches.filter(m => m.group_id === g.group_id);
        if (!gm.length) return null;
        const finalDone = gm.some(m => m.stage === "final" && m.status === "done");
        return (
          <div key={g.group_id} style={{ marginBottom: 28 }}>
            <div className="section-label" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              {g.name}
              {finalDone
                ? <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: "rgba(34,197,94,0.15)", color: "var(--green,#22c55e)" }}>✓ DONE</span>
                : <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 400 }}>{gm.filter(m => m.status === "done").length}/{gm.length} done</span>
              }
            </div>
            <KnockoutBracket matches={gm} onAction={onAction} onSetConfig={onSetConfig} sportKey={sportKey} isGroup={true} />
          </div>
        );
      })}

      {/* Championship bracket */}
      {hasKnockout && (
        <div style={{ marginTop: 8 }}>
          <div className="section-label" style={{ marginBottom: 12 }}>
            Championship Bracket
            <span style={{ fontWeight: 400, color: "var(--muted)", marginLeft: 8, fontSize: 11 }}>
              {doneKnock}/{knockoutMatches.length} done
            </span>
          </div>
          <KnockoutBracket matches={knockoutMatches} onAction={onAction} onSetConfig={onSetConfig} sportKey={sportKey} />
        </div>
      )}
    </div>
  );
}

// ── KnockoutBracket ──────────────────────────────────────────
// Road to Finals: groups matches by stage and shows bracket columns
const STAGE_ORDER = ["preliminary", "round_of_32", "round_of_16", "knockout", "quarter", "semi", "third_place", "final"];
const STAGE_LABEL = {
  preliminary: "Preliminary",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  knockout:    "Round of 16",   // legacy label for old records
  quarter:     "Quarter Finals",
  semi:        "Semi Finals",
  third_place: "3rd Place",
  final:       "Final",
};

function KnockoutBracket({ matches, onAction, onSetConfig, sportKey, isGroup = false }) {
  const CARD_W  = 172;
  const CARD_GAP = 10;

  // ── Group bracket: label columns as "Round 1", "Round 2", … ──
  if (isGroup) {
    const byRound = {};
    for (const m of matches) {
      const r = m.round || 1;
      if (!byRound[r]) byRound[r] = [];
      byRound[r].push(m);
    }
    const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
    if (!rounds.length) return null;
    const lastRound = rounds[rounds.length - 1];

    return (
      <div>
        {rounds.length > 2 && (
          <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
            <span>←</span>
            <span style={{ textTransform: "uppercase", letterSpacing: 1 }}>Swipe to see all rounds</span>
            <span>→</span>
          </div>
        )}
        <div style={{ overflowX: "auto", paddingBottom: 10, WebkitOverflowScrolling: "touch" }}>
          <div style={{
            display: "flex", gap: CARD_GAP, alignItems: "flex-start",
            minWidth: rounds.length * (CARD_W + CARD_GAP),
            paddingRight: 4,
          }}>
            {rounds.map(r => (
              <div key={r} style={{ flex: `0 0 ${CARD_W}px` }}>
                <div style={{
                  fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 800,
                  textTransform: "uppercase", letterSpacing: 2, color: "var(--primary)",
                  marginBottom: 8, paddingBottom: 5,
                  borderBottom: `2px solid ${r === lastRound ? "var(--primary)" : "var(--border)"}`,
                  whiteSpace: "nowrap",
                }}>
                  {r === lastRound ? "Group Final" : `Round ${r}`}
                  <span style={{ color: "var(--muted)", fontWeight: 400, marginLeft: 4, letterSpacing: 0, textTransform: "none" }}>
                    ({byRound[r].length})
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {byRound[r].map(m => (
                    <BracketCard key={m.match_id} match={m} onAction={onAction} onSetConfig={onSetConfig}
                      sportKey={sportKey} isFinal={r === lastRound} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Championship / direct knockout: label by stage name ──────
  const byStage = {};
  for (const m of matches) {
    const s = m.stage || "knockout";
    if (!byStage[s]) byStage[s] = [];
    byStage[s].push(m);
  }

  const stages = STAGE_ORDER.filter(s => byStage[s]?.length > 0);
  if (!stages.length) return null;

  return (
    <div>
      {stages.length > 2 && (
        <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
          <span>←</span>
          <span style={{ textTransform: "uppercase", letterSpacing: 1 }}>Swipe to see all rounds</span>
          <span>→</span>
        </div>
      )}
      <div style={{ overflowX: "auto", paddingBottom: 10, WebkitOverflowScrolling: "touch" }}>
        <div style={{
          display: "flex", gap: CARD_GAP, alignItems: "flex-start",
          minWidth: stages.length * (CARD_W + CARD_GAP),
          paddingRight: 4,
        }}>
          {stages.map(stage => (
            <div key={stage} style={{ flex: `0 0 ${CARD_W}px` }}>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: 2, color: "var(--primary)",
                marginBottom: 8, paddingBottom: 5,
                borderBottom: `2px solid ${stage === "final" ? "var(--primary)" : "var(--border)"}`,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {STAGE_LABEL[stage] || stage}
                <span style={{ color: "var(--muted)", fontWeight: 400, marginLeft: 4, letterSpacing: 0, textTransform: "none" }}>
                  ({byStage[stage].length})
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {byStage[stage].map(m => (
                  <BracketCard key={m.match_id} match={m} onAction={onAction} onSetConfig={onSetConfig}
                    sportKey={sportKey} isFinal={stage === "final"} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Group stage + quarter → best of 3 (sets_to_win=2); semi/final/3rd → best of 5 (sets_to_win=3)
function defaultSetsToWin(match) {
  if (match.group_id) return 2;  // any match inside a group bracket
  if (["semi", "final", "third_place"].includes(match.stage)) return 3;
  return 2;  // quarter, round_of_16, round_of_32, preliminary
}

function BracketCard({ match: m, onAction, onSetConfig, sportKey, isFinal }) {
  const isLive     = m.status === "live";
  const isDone     = m.status === "done";
  const p1Won      = m.player_1?.is_winner;
  const p2Won      = m.player_2?.is_winner;
  const isSetBased = ["table_tennis", "badminton"].includes(sportKey);
  const ls         = typeof m.live_state === "string" ? JSON.parse(m.live_state) : (m.live_state || {});
  const curSets    = ls.sets_to_win ?? defaultSetsToWin(m);
  const sets       = (m.sets || []).filter(s => s.is_complete);

  const nameStyle = (won) => ({
    fontSize: 11, fontWeight: won ? 700 : 400,
    color: won ? "var(--primary)" : "var(--ink)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    flex: 1, minWidth: 0,
  });

  const rowStyle = (won) => ({
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 4, padding: "5px 8px", borderRadius: 4, marginBottom: 2,
    background: won ? "var(--primary-dim)" : "transparent",
    border: `1px solid ${won ? "rgba(255,107,53,0.3)" : "var(--border)"}`,
  });

  return (
    <div style={{
      borderRadius: 8,
      border: `1px solid ${isFinal ? "var(--primary)" : isLive ? "rgba(255,107,53,0.5)" : "var(--border)"}`,
      overflow: "hidden",
      background: "var(--surface)",
      boxShadow: isFinal ? "0 0 0 1px rgba(255,107,53,0.2)" : "none",
    }}>
      {/* Status bar */}
      <div style={{
        padding: "3px 8px",
        background: isLive ? "var(--primary)" : "var(--surface-2, var(--elevated, var(--surface)))",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 8, fontWeight: 800, fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: 1, color: isLive ? "#fff" : "var(--muted)" }}>
          {isLive ? "● LIVE" : isDone ? "✓ Done" : "Scheduled"}
        </span>
        {m.table_number && <span style={{ fontSize: 8, color: isLive ? "rgba(255,255,255,0.7)" : "var(--muted)" }}>T{m.table_number}</span>}
      </div>

      {/* Players + set scores */}
      <div style={{ padding: "5px 0" }}>
        <div style={rowStyle(p1Won)}>
          <span style={nameStyle(p1Won)}>{m.player_1?.name || "TBD"}</span>
          {(isLive || isDone) && (
            <span style={{ fontSize: 13, fontWeight: 900, fontFamily: "var(--font-display)", color: p1Won ? "var(--primary)" : "var(--ink)", flexShrink: 0 }}>
              {m.player_1?.score ?? 0}
            </span>
          )}
        </div>
        <div style={rowStyle(p2Won)}>
          <span style={nameStyle(p2Won)}>{m.player_2?.name || "TBD"}</span>
          {(isLive || isDone) && (
            <span style={{ fontSize: 13, fontWeight: 900, fontFamily: "var(--font-display)", color: p2Won ? "var(--primary)" : "var(--ink)", flexShrink: 0 }}>
              {m.player_2?.score ?? 0}
            </span>
          )}
        </div>

        {/* Compact set history */}
        {sets.length > 0 && isSetBased && (
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", padding: "4px 8px 0" }}>
            {sets.map(s => (
              <span key={s.set_number} style={{
                fontSize: 9, padding: "1px 5px", borderRadius: 3,
                fontWeight: 800, fontFamily: "var(--font-display)",
                background: "var(--primary-dim)", color: "var(--primary)",
              }}>
                {s.score_p1}–{s.score_p2}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action footer */}
      <div style={{ padding: "4px 6px", borderTop: "1px solid var(--border)" }}>
        {/* Sets picker — own row */}
        {m.status === "scheduled" && isSetBased && (
          <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 4 }}>
            <span style={{ fontSize: 8, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginRight: 2 }}>Sets</span>
            {[1, 2, 3].map(v => (
              <button key={v}
                className={`btn btn-sm ${curSets === v ? "btn-danger" : "btn-outline"}`}
                style={{ fontSize: 9, padding: "1px 6px", minWidth: 22, flex: 1 }}
                onClick={() => onSetConfig(m.match_id, v)}>
                {v * 2 - 1}
              </button>
            ))}
          </div>
        )}
        {/* Action button — full width */}
        {m.status === "scheduled" && (
          <button className="btn btn-sm btn-danger" style={{ fontSize: 10, padding: "4px 0", width: "100%" }}
            onClick={() => onAction(m.match_id, "start")}>▶ Start</button>
        )}
        {isLive && (
          <button className="btn btn-sm btn-danger" style={{ fontSize: 10, padding: "4px 0", width: "100%" }}
            onClick={() => onAction(m.match_id, "score")}>Score</button>
        )}
        {isDone && (
          <button className="btn btn-sm btn-outline" style={{ fontSize: 10, padding: "4px 0", width: "100%" }}
            onClick={() => onAction(m.match_id, "rematch")}>Rematch</button>
        )}
      </div>
    </div>
  );
}

// ── MatchCard ─────────────────────────────────────────────────
function MatchCard({ match: m, onAction, onSetConfig, sportKey }) {
  const isLive     = m.status === "live";
  const isDone     = m.status === "done";
  const sets       = m.sets || [];
  const ls         = typeof m.live_state === "string" ? JSON.parse(m.live_state) : (m.live_state || {});
  const isSetBased = ["table_tennis", "badminton"].includes(sportKey);
  const curSets    = ls.sets_to_win ?? defaultSetsToWin(m);

  return (
    <div className={`match-row${isLive ? " live" : ""}`} style={{ flexDirection: "column", gap: 10 }}>

      {/* ── Players + score row ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* P1 name */}
        <span className={`match-pname${m.player_1?.is_winner ? " winner" : ""}`}
          style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {m.player_1?.name || "TBD"}
        </span>

        {/* Score + status */}
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div className={`match-score ${isLive ? "live-score" : isDone ? "done-score" : "vs-score"}`}>
            {isLive || isDone ? `${m.player_1?.score ?? 0}–${m.player_2?.score ?? 0}` : "vs"}
          </div>
          <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 2 }}>
            {isLive && (
              <span className="pill pill-orange" style={{ padding: "1px 5px", fontSize: 8 }}>
                <span className="live-dot" style={{ width: 4, height: 4 }} />LIVE
              </span>
            )}
            {isDone && <span className="pill pill-green" style={{ padding: "1px 5px", fontSize: 8 }}>DONE</span>}
          </div>
          {isLive && sportKey === "cricket"  && ls.overs  && <div style={{ fontSize: 9, color: "var(--primary)", fontWeight: 700, marginTop: 2 }}>{ls.overs} ov</div>}
          {isLive && sportKey === "football" && ls.minute && <div style={{ fontSize: 9, color: "var(--primary)", fontWeight: 700, marginTop: 2 }}>{ls.minute}'</div>}
        </div>

        {/* P2 name */}
        <span className={`match-pname right${m.player_2?.is_winner ? " winner" : ""}`}
          style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>
          {m.player_2?.name || "TBD"}
        </span>
      </div>

      {/* ── Set history chips (TT / Badminton) ── */}
      {sets.length > 0 && (isLive || isDone) && isSetBased && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {sets.map(s => (
            <span key={s.set_number} style={{
              fontSize: 10, padding: "2px 7px", borderRadius: 3,
              fontWeight: 800, fontFamily: "var(--font-display)",
              background: s.is_complete ? "var(--primary-dim)" : "var(--gold-dim)",
              color:      s.is_complete ? "var(--primary)"     : "var(--gold)",
            }}>
              S{s.set_number}: {s.score_p1}–{s.score_p2}
            </span>
          ))}
        </div>
      )}

      {/* ── Cricket innings ── */}
      {sportKey === "cricket" && sets.length > 0 && (
        <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--muted)", flexWrap: "wrap" }}>
          {sets.map(s => (
            <span key={s.set_number}>
              <strong style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>Inn {s.set_number}:</strong>{" "}
              {s.score_p1}/{s.score_p2}{s.is_complete ? " ✓" : ""}
            </span>
          ))}
          {sets.length === 2 && sets[0]?.is_complete && !sets[1]?.is_complete && (
            <span style={{ color: "var(--gold)", fontWeight: 700 }}>Target: {sets[0].score_p1 + 1}</span>
          )}
        </div>
      )}

      {/* ── Winner label ── */}
      {isDone && (
        <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: 0.5, color: "var(--gold)" }}>
          {m.player_1?.is_winner ? m.player_1.name : m.player_2?.is_winner ? m.player_2.name : "Draw"}
        </div>
      )}

      {/* ── Footer: meta + actions ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        {/* Meta */}
        <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, display: "flex", gap: 6 }}>
          {m.stage && <span style={{ textTransform: "capitalize" }}>{STAGE_LABEL[m.stage] || m.stage}</span>}
          {m.table_number && <span>· T{m.table_number}</span>}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {/* Sets picker — scheduled set-based matches only */}
          {m.status === "scheduled" && isSetBased && (
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>Sets:</span>
              {[1, 2, 3].map(v => (
                <button key={v}
                  className={`btn btn-sm ${curSets === v ? "btn-danger" : "btn-outline"}`}
                  style={{ fontSize: 10, padding: "3px 8px", minWidth: 28 }}
                  onClick={() => onSetConfig(m.match_id, v)}>
                  {v * 2 - 1}
                </button>
              ))}
            </div>
          )}
          {m.status === "scheduled" && (
            <button className="btn btn-sm btn-danger" style={{ padding: "4px 12px" }}
              onClick={() => onAction(m.match_id, "start")}>▶ Start</button>
          )}
          {isLive && (
            <button className="btn btn-sm btn-danger" style={{ padding: "4px 12px" }}
              onClick={() => onAction(m.match_id, "score")}>Score</button>
          )}
          {isDone && (
            <button className="btn btn-sm btn-outline" style={{ padding: "4px 12px" }}
              onClick={() => onAction(m.match_id, "rematch")}>Rematch</button>
          )}
          {!isDone && (
            <button className="btn btn-sm btn-outline" style={{ color: "var(--muted)", padding: "4px 8px" }}
              onClick={() => onAction(m.match_id, "delete")}>✕</button>
          )}
        </div>
      </div>
    </div>
  );
}