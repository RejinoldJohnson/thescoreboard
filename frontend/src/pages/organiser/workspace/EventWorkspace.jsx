import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getWorkspace,
  createPlayer, addPlayerToEvent,
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
  table_tennis: { icon: "🏓", label: "Table Tennis" },
  badminton:    { icon: "🏸", label: "Badminton"    },
  cricket:      { icon: "🏏", label: "Cricket"      },
  football:     { icon: "⚽", label: "Football"     },
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

  const [data,        setData]        = useState(null);
  const [user,        setUser]        = useState(null);
  const [tab,         setTab]         = useState("overview");
  const [msg,         setMsg]         = useState("");
  const [activeMatch, setActiveMatch] = useState(null);
  const [eventTeams,  setEventTeams]  = useState([]);

  const flash = (txt) => { setMsg(txt); setTimeout(() => setMsg(""), 3000); };

  const loadData = useCallback(async () => {
    try { setData(await getWorkspace(tournamentId)); }
    catch (e) { console.error(e); }
  }, [tournamentId]);

  const loadTeams = useCallback(async () => {
    try { setEventTeams(await getEventTeams(eventId) || []); }
    catch (e) { console.error(e); }
  }, [eventId]);

  useEffect(() => {
    getMe().then(setUser).catch(() => { clearToken(); navigate("/login"); });
    loadData();
  }, [loadData]);

  useEffect(() => {
    getMe().then(setUser).catch(() => { clearToken(); navigate("/login"); });
    loadData();
  }, [loadData]);
  
  // DEBUG: Log workspace data to see what's actually returned
  useEffect(() => {
    if (data?.tournament) {
      console.log("🔍 Workspace data loaded:");
      console.log("  Tournament ID:", data.tournament.tournament_id);
      console.log("  Tournament Name:", data.tournament.name);
      console.log("  Org ID:", data.tournament.org_id);
      console.log("  Full tournament object:", data.tournament);
    }
  }, [data]);

  // ── FIX: derive participant_type from raw data, NOT from currentEvent ──
  useEffect(() => {
    if (!data) return;
    const ev = data.events?.find(e => e.event_id === parseInt(eventId));
    if (ev?.participant_type === "team" || ev?.participant_type === "doubles_pair") loadTeams();
  }, [data, eventId, loadTeams]);

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

  const sm         = SPORT_META[currentEvent.sport_key] || { icon: "🏅", label: currentEvent.sport_key };
  const pType      = currentEvent.participant_type;       // "individual" | "doubles_pair" | "team"
  const isIndividual = pType === "individual";
  const isDoubles    = pType === "doubles_pair";
  const isTeam       = pType === "team";

  // Tab label for participant slot: pairs / teams / players
  const pTab = isDoubles ? "pairs" : isTeam ? "teams" : "players";
  const TABS = ["overview", pTab, "fixtures", "live"];

  const tabLabel = (tb) => {
    if (tb === "live"    && currentEvent.sport_key === "cricket")  return "Innings";
    if (tb === "live"    && currentEvent.sport_key === "football") return "Match Day";
    if (tb === "pairs")   return "Pairs";
    if (tb === "teams")   return "Teams";
    if (tb === "players") return "Players";
    return tb.charAt(0).toUpperCase() + tb.slice(1);
  };

  const liveCount       = currentEvent.matches?.filter(m => m.status === "live").length || 0;
  const activeMatchData = activeMatch ? currentEvent.matches?.find(m => m.match_id === activeMatch) : null;

  // ── Participant handlers ──────────────────────────────────

  const handleAddPlayer = async (form) => {
    try {
      const p = await createPlayer({ name: form.name.trim(), age: parseInt(form.age) || null, gender: form.gender });
      await addPlayerToEvent(currentEvent.event_id, p.player_id);
      loadData(); flash("Player added!");
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

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <OrgHeader
        user={user}
        onLogout={() => { clearToken(); navigate("/", { replace: true }); }}
        crumbs={[
          { label: "My Tournaments", path: "/organiser" },
          { label: t.name, path: `/organiser/tournament/${tournamentId}` },
          { label: `${sm.icon} ${currentEvent.name}` },
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

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 24px" }}>

        {/* ══ OVERVIEW ══════════════════════════════════════════ */}
        {tab === "overview" && (
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: 10, background: "var(--primary-dim)", border: "1px solid rgba(255,107,53,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>
                  {sm.icon}
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
                <button className="btn btn-danger" onClick={() => setTab("live")}>🔴 Score Live</button>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
                {currentEvent.match_count} matches
              </span>
              <button className="btn btn-primary" onClick={handleGenerateFixtures}>⚡ Generate Fixtures</button>
            </div>
            {!currentEvent.matches?.length ? (
              <div className="empty">
                <div className="empty-icon">🗓️</div>
                {isTeam || isDoubles
                  ? `Add ${isDoubles ? "pairs" : "teams"}, then generate fixtures.`
                  : "Add players to groups, then generate fixtures."}
              </div>
            ) : (
              <>
                {currentEvent.groups?.map(g => {
                  const gm = currentEvent.matches.filter(m => m.group_id === g.group_id);
                  if (!gm.length) return null;
                  return (
                    <div key={g.group_id} style={{ marginBottom: 20 }}>
                      <div className="section-label">{g.name} · {gm.length} matches</div>
                      {gm.map(m => <MatchCard key={m.match_id} match={m} onAction={handleMatchAction} sportKey={currentEvent.sport_key} />)}
                    </div>
                  );
                })}
                {currentEvent.matches.filter(m => !m.group_id).map(m => (
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
              <div className="empty">Generate fixtures first.</div>
            ) : (() => {
              const live      = currentEvent.matches?.filter(m => m.status === "live")      || [];
              const scheduled = currentEvent.matches?.filter(m => m.status === "scheduled") || [];
              const done      = currentEvent.matches?.filter(m => m.status === "done")      || [];
              return [...live, ...scheduled, ...done].map(m => (
                <MatchCard key={m.match_id} match={m} onAction={handleMatchAction}
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
          onClose={() => { setActiveMatch(null); loadData(); }} />
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

// ── MatchCard ─────────────────────────────────────────────────
function MatchCard({ match: m, onAction, sportKey }) {
  const isLive = m.status === "live";
  const isDone = m.status === "done";
  const sets   = m.sets || [];
  const ls     = m.live_state || {};

  return (
    <div className={`match-row${isLive ? " live" : ""}`} style={{ flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className={`match-pname${m.player_1?.is_winner ? " winner" : ""}`}>{m.player_1?.name || "TBD"}</span>
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div className={`match-score ${isLive ? "live-score" : isDone ? "done-score" : "vs-score"}`}>
            {isLive || isDone ? `${m.player_1?.score ?? 0}–${m.player_2?.score ?? 0}` : "vs"}
          </div>
          <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 2 }}>
            {isLive && <span className="pill pill-orange" style={{ padding: "1px 6px", fontSize: 9 }}><span className="live-dot" style={{ width: 5, height: 5 }}/>LIVE</span>}
            {isDone  && <span className="pill pill-green"  style={{ padding: "1px 6px", fontSize: 9 }}>DONE</span>}
          </div>
          {isLive && sportKey === "cricket"  && ls.overs  && <div style={{ fontSize: 10, color: "var(--primary)", fontWeight: 700, marginTop: 2 }}>{ls.overs} ov</div>}
          {isLive && sportKey === "football" && ls.minute && <div style={{ fontSize: 10, color: "var(--primary)", fontWeight: 700, marginTop: 2 }}>{ls.minute}'</div>}
        </div>
        <span className={`match-pname right${m.player_2?.is_winner ? " winner" : ""}`}>{m.player_2?.name || "TBD"}</span>
      </div>

      {sets.length > 0 && (isLive || isDone) && ["table_tennis", "badminton"].includes(sportKey) && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {sets.map(s => (
            <span key={s.set_number} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, fontWeight: 800, fontFamily: "var(--font-display)", background: s.is_complete ? "var(--primary-dim)" : "var(--gold-dim)", color: s.is_complete ? "var(--primary)" : "var(--gold)" }}>
              S{s.set_number}: {s.score_p1}–{s.score_p2}
            </span>
          ))}
        </div>
      )}

      {sportKey === "cricket" && sets.length > 0 && (
        <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--muted)" }}>
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

      {isDone && (
        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: 0.5, color: "var(--gold)" }}>
          🏆 {m.player_1?.is_winner ? m.player_1.name : m.player_2?.is_winner ? m.player_2.name : "Draw"}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 10, color: "var(--subtle)", fontWeight: 600 }}>
          {m.table_number && `Table ${m.table_number}`}{m.round && ` · R${m.round}`}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {m.status === "scheduled" && <button className="btn btn-sm btn-danger" onClick={() => onAction(m.match_id, "start")}>▶ Start</button>}
          {isLive && <button className="btn btn-sm btn-danger" onClick={() => onAction(m.match_id, "score")}>Score</button>}
          {isDone && <button className="btn btn-sm btn-outline" onClick={() => onAction(m.match_id, "rematch")}>Rematch</button>}
          {!isDone && <button className="btn btn-sm btn-outline" style={{ color: "var(--subtle)" }} onClick={() => onAction(m.match_id, "delete")}>✕</button>}
        </div>
      </div>
    </div>
  );
}