/**
 * ParticipantsTab — renders the correct participant management UI
 * based on event.participant_type:
 *
 *   "individual"    → add single players, assign to groups
 *   "doubles_pair"  → register pairs (captain + partner names)
 *   "team"          → register teams with full roster
 *
 * Import this in EventWorkspace and render it in the players/teams tab.
 */

import { useState } from "react";

// ── Individual Players ────────────────────────────────────────
export function IndividualTab({ event, onAddPlayer, onCreateGroup, flash }) {
  const [pForm,     setPForm]     = useState({ name: "", age: "", gender: "Male" });
  const [groupName, setGroupName] = useState("");

  const handleAdd = () => {
    if (!pForm.name.trim()) return flash("Name required.");
    onAddPlayer(pForm);
    setPForm({ name: "", age: "", gender: "Male" });
  };

  const handleGroup = () => {
    if (!groupName.trim()) return;
    onCreateGroup(groupName.trim());
    setGroupName("");
  };

  return (
    <div>
      {/* Add player */}
      <div className="card">
        <div className="card-title">Add Player</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="input" placeholder="Player name" style={{ flex: 2, minWidth: 140 }}
            value={pForm.name} onChange={e => setPForm(f => ({ ...f, name: e.target.value }))}
            onKeyDown={e => e.key === "Enter" && handleAdd()} />
          <input className="input" placeholder="Age" type="number" style={{ width: 80 }}
            value={pForm.age} onChange={e => setPForm(f => ({ ...f, age: e.target.value }))} />
          <select className="input" style={{ width: 110 }} value={pForm.gender}
            onChange={e => setPForm(f => ({ ...f, gender: e.target.value }))}>
            <option>Male</option><option>Female</option>
          </select>
          <button className="btn btn-primary" onClick={handleAdd}>Add</button>
        </div>
      </div>

      {/* Groups */}
      <div className="card">
        <div className="card-title">Groups</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input className="input" placeholder="Group name (e.g. Group A)" style={{ flex: 1 }}
            value={groupName} onChange={e => setGroupName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleGroup()} />
          <button className="btn btn-primary" onClick={handleGroup}>Create</button>
        </div>

        {event.groups?.map(g => (
          <div key={g.group_id} className="group-box">
            <div className="group-title">
              {g.name}
              <span style={{ fontWeight: 400, fontSize: 11, color: "var(--muted)", textTransform: "none", marginLeft: 6 }}>
                ({g.players?.length || 0} players)
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap" }}>
              {(g.players || []).map(p => (
                <span key={p.player_id} className="player-chip">{p.name}</span>
              ))}
            </div>
          </div>
        ))}

        {event.ungrouped_players?.length > 0 && (
          <div className="group-box" style={{ marginTop: 8 }}>
            <div className="group-title" style={{ color: "var(--muted)" }}>
              Ungrouped ({event.ungrouped_players.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap" }}>
              {event.ungrouped_players.map(p => (
                <span key={p.player_id} className="player-chip"
                  style={{ background: "var(--gold-dim)", color: "var(--gold)", borderColor: "rgba(255,204,0,0.25)" }}>
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Doubles Pairs ─────────────────────────────────────────────
export function DoublesTab({ event, onAddPair, onRemovePair, pairs, flash }) {
  const [form, setForm] = useState({
    pair_name:       "",
    player1_name:    "",
    player2_name:    "",
    contact_phone:   "",
  });

  const handleAdd = () => {
    if (!form.player1_name.trim()) return flash("Player 1 name required.");
    if (!form.player2_name.trim()) return flash("Player 2 name required.");
    const pairName = form.pair_name.trim() ||
      `${form.player1_name.trim()} & ${form.player2_name.trim()}`;
    onAddPair({
      ...form,
      pair_name: pairName,
    });
    setForm({ pair_name: "", player1_name: "", player2_name: "", contact_phone: "" });
  };

  const isMixed = event.sport_config?.mixed;

  return (
    <div>
      {/* Info banner */}
      <div style={{
        background: "var(--gold-dim)", border: "1px solid rgba(255,204,0,0.25)",
        borderRadius: 8, padding: "10px 14px", marginBottom: 14,
        fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: 1, color: "var(--gold)",
      }}>
        🏸 {isMixed ? "Mixed Doubles" : "Doubles"} — Enter both partners together
      </div>

      {/* Add pair form */}
      <div className="card">
        <div className="card-title">Register a Pair</div>

        <div className="field">
          <label>Pair Name (optional)</label>
          <input className="input" placeholder={`e.g. ${form.player1_name || "Rahul"} & ${form.player2_name || "Priya"}`}
            value={form.pair_name} onChange={e => setForm(f => ({ ...f, pair_name: e.target.value }))} />
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            Leave blank to auto-generate from player names
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{isMixed ? "Male Player *" : "Player 1 *"}</label>
            <input className="input" placeholder="Name"
              value={form.player1_name} onChange={e => setForm(f => ({ ...f, player1_name: e.target.value }))} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{isMixed ? "Female Player *" : "Player 2 *"}</label>
            <input className="input" placeholder="Name"
              value={form.player2_name} onChange={e => setForm(f => ({ ...f, player2_name: e.target.value }))} />
          </div>
        </div>

        <div className="field">
          <label>Contact Phone (optional)</label>
          <input className="input" placeholder="9876543210" type="tel"
            value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
        </div>

        <div style={{ textAlign: "right" }}>
          <button className="btn btn-primary" onClick={handleAdd}>Add Pair</button>
        </div>
      </div>

      {/* Registered pairs */}
      <div className="section-label">{pairs.length} pair{pairs.length !== 1 ? "s" : ""} registered</div>

      {pairs.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🏸</div>
          No pairs registered yet.
        </div>
      ) : (
        pairs.map((ep, i) => {
          const team = ep.team || ep;
          const members = team.members || [];
          const p1 = members.find(m => m.role === "player1") || members[0];
          const p2 = members.find(m => m.role === "player2") || members[1];
          return (
            <div key={team.team_id || i} className="team-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  {/* Pair display: "Rahul & Priya" */}
                  <div style={{
                    fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 900,
                    textTransform: "uppercase", letterSpacing: -0.5, color: "var(--ink)",
                  }}>
                    {p1?.name || "—"} & {p2?.name || "—"}
                  </div>
                  {team.contact_phone && (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                      📞 {team.contact_phone}
                    </div>
                  )}
                </div>
                <button className="btn btn-sm btn-outline" style={{ color: "var(--red)", borderColor: "var(--red)" }}
                  onClick={() => onRemovePair(team.team_id)}>
                  Remove
                </button>
              </div>
              {/* Pair name chip */}
              {team.name && team.name !== `${p1?.name} & ${p2?.name}` && (
                <div style={{ marginTop: 6 }}>
                  <span className="pill pill-gold">{team.name}</span>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Team Sport ────────────────────────────────────────────────
export function TeamTab({ event, onAddTeam, onRemoveTeam, teams, flash }) {
  const squadSize    = event.squad_size   || event.sport_config?.squad_size  || 11;
  const teamSize     = event.team_size    || event.sport_config?.team_size   || 11;
  const substitutes  = event.substitutes  || event.sport_config?.substitutes || 0;
  const totalRoster  = (event.sport_key === "football") ? (teamSize + substitutes) : squadSize;
  const sportKey     = event.sport_key;

  const [teamForm,    setTeamForm]    = useState({ name: "", contact_name: "", contact_phone: "" });
  const [teamMembers, setTeamMembers] = useState(() => {
    // Pre-fill the right number of slots
    const slots = Math.min(totalRoster, 15);
    return Array.from({ length: slots }, (_, i) => ({
      name: "", role: i === 0 ? "captain" : "player",
    }));
  });

  const updateMember = (i, field, val) =>
    setTeamMembers(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: val } : m));

  const addSlot = () => setTeamMembers(prev => [...prev, { name: "", role: "player" }]);
  const removeSlot = (i) => setTeamMembers(prev => prev.filter((_, idx) => idx !== i));

  const handleAdd = () => {
    if (!teamForm.name.trim()) return flash("Team name required.");
    const validMembers = teamMembers.filter(m => m.name.trim());
    if (!validMembers.length) return flash("Add at least one player.");
    onAddTeam(teamForm, validMembers);
    setTeamForm({ name: "", contact_name: "", contact_phone: "" });
    setTeamMembers(Array.from({ length: Math.min(totalRoster, 15) }, (_, i) => ({
      name: "", role: i === 0 ? "captain" : "player",
    })));
  };

  const roleOptions = sportKey === "football"
    ? ["captain", "player", "goalkeeper"]
    : sportKey === "cricket"
    ? ["captain", "player", "wicketkeeper", "bowler"]
    : ["captain", "player"];

  return (
    <div>
      {/* Squad size info banner */}
      <div style={{
        background: "var(--primary-dim)", border: "1px solid rgba(255,107,53,0.2)",
        borderRadius: 8, padding: "10px 14px", marginBottom: 14,
        display: "flex", gap: 16, flexWrap: "wrap",
      }}>
        {sportKey === "football" && (
          <>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900, color: "var(--primary)", lineHeight: 1 }}>{teamSize}</div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>On Field</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900, color: "var(--gold)", lineHeight: 1 }}>{substitutes}</div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>Substitutes</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900, color: "var(--ink)", lineHeight: 1 }}>{totalRoster}</div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>Total Squad</div>
            </div>
          </>
        )}
        {sportKey === "cricket" && (
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900, color: "var(--primary)", lineHeight: 1 }}>{squadSize}</div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>Squad Size</div>
          </div>
        )}
      </div>

      {/* Add team form */}
      <div className="card">
        <div className="card-title">Register a Team</div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <input className="input" placeholder="Team name *" style={{ flex: 2, minWidth: 140 }}
            value={teamForm.name} onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))} />
          <input className="input" placeholder="Contact name" style={{ flex: 1, minWidth: 110 }}
            value={teamForm.contact_name} onChange={e => setTeamForm(f => ({ ...f, contact_name: e.target.value }))} />
          <input className="input" placeholder="Phone" style={{ flex: 1, minWidth: 100 }}
            value={teamForm.contact_phone} onChange={e => setTeamForm(f => ({ ...f, contact_phone: e.target.value }))} />
        </div>

        <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)", marginBottom: 10 }}>
          Squad Roster ({teamMembers.filter(m => m.name.trim()).length}/{totalRoster})
        </div>

        {teamMembers.map((m, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 140px 32px", gap: 6, marginBottom: 6, alignItems: "center" }}>
            <input className="input"
              placeholder={i === 0 ? "Captain name *" : `Player ${i + 1}`}
              value={m.name} onChange={e => updateMember(i, "name", e.target.value)} />
            <select className="input" value={m.role} onChange={e => updateMember(i, "role", e.target.value)}>
              {roleOptions.map(r => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
            <button onClick={() => removeSlot(i)} disabled={teamMembers.length === 1}
              style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 18, padding: 0 }}>×</button>
          </div>
        ))}

        {teamMembers.length < totalRoster + 3 && (
          <button onClick={addSlot}
            style={{ background: "none", border: "1.5px dashed var(--border)", color: "var(--muted)", borderRadius: 6, padding: 8, cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", width: "100%", marginTop: 4 }}>
            + Add Player
          </button>
        )}

        <div style={{ textAlign: "right", marginTop: 14 }}>
          <button className="btn btn-primary" onClick={handleAdd}>Register Team</button>
        </div>
      </div>

      {/* Enrolled teams */}
      <div className="section-label">{teams.length} team{teams.length !== 1 ? "s" : ""} registered</div>

      {teams.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🏟️</div>
          No teams registered yet.
        </div>
      ) : teams.map((ep, i) => {
        const team = ep.team || ep;
        return (
          <div key={team.team_id || i} className="team-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div className="team-name">{team.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  {team.contact_name}{team.contact_phone ? ` · ${team.contact_phone}` : ""} · {team.member_count} players
                </div>
              </div>
              <button className="btn btn-sm btn-outline" style={{ color: "var(--red)", borderColor: "var(--red)" }}
                onClick={() => onRemoveTeam(team.team_id)}>
                Remove
              </button>
            </div>
            <div className="roster">
              {(team.members || []).map(m => (
                <span key={m.tm_id} className={`roster-chip${m.role === "captain" ? " captain" : ""}`}>
                  {m.role === "captain" ? "© " : ""}{m.name}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}