/**
 * TournamentPublic — public spectator page.
 * Single-scroll layout with section nav. No tabs.
 * Sections: Register | Fixtures | Leaderboard | Road to Final
 */
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getTournamentBySlug, getSportTournament } from "../api/client";
import RoadToFinal from "../components/shared/RoadToFinal";

const POLL_MS  = 8000;
const API_BASE = import.meta.env.VITE_API_URL || "/api";

// ── Sport meta ────────────────────────────────────────────────
const SPORT_META = {
  table_tennis: { abbrev: "TT", label: "Table Tennis", icon: "🏓" },
  badminton:    { abbrev: "BD", label: "Badminton",    icon: "🏸" },
  cricket:      { abbrev: "CR", label: "Cricket",      icon: "🏏" },
  football:     { abbrev: "FB", label: "Football",     icon: "⚽" },
};
const sa = k => SPORT_META[k]?.abbrev || k.slice(0, 2).toUpperCase();
const sl = k => SPORT_META[k]?.label  || k;

function getRegMode(ev) {
  const pt = ev?.participant_type || "individual";
  if (pt === "team")         return "team";
  if (pt === "doubles_pair") return "doubles";
  return "individual";
}

async function apiPost(path, body) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Request failed"); }
  return r.json();
}

const registerIndividual = (tId, p) => apiPost(`/public/tournaments/${tId}/register`, p);
const registerPair       = (tId, p) => apiPost(`/public/tournaments/${tId}/register-team`, p);
const registerTeam       = (tId, p) => apiPost(`/public/tournaments/${tId}/register-team`, p);

// ── Status config ─────────────────────────────────────────────
const STATUS_CFG = {
  draft:        { label: "Coming Soon",       color: "var(--muted)"   },
  registration: { label: "Registration Open", color: "#16a34a"        },
  fixtures:     { label: "Fixtures Set",      color: "#2563eb"        },
  live:         { label: "Live Now",          color: "var(--primary)" },
  completed:    { label: "Completed",         color: "var(--muted)"   },
};

// ── Compute standings from match data ────────────────────────
function computeStandings(event) {
  const matches = event.all_matches || [];
  const isRR    = event.format === "round_robin";
  const relevant = isRR
    ? matches
    : matches.filter(m => m.stage === "group");

  const table = {};
  for (const m of relevant) {
    if (m.status !== "done" && m.status !== "live") continue;
    const n1 = m.player_1?.name;
    const n2 = m.player_2?.name;
    if (!n1 || !n2 || n1 === "TBD" || n2 === "TBD") continue;

    if (!table[n1]) table[n1] = { name: n1, p: 0, w: 0, d: 0, l: 0, sf: 0, sa: 0, pts: 0 };
    if (!table[n2]) table[n2] = { name: n2, p: 0, w: 0, d: 0, l: 0, sf: 0, sa: 0, pts: 0 };

    table[n1].p++; table[n2].p++;
    table[n1].sf += m.player_1?.score ?? 0;
    table[n1].sa += m.player_2?.score ?? 0;
    table[n2].sf += m.player_2?.score ?? 0;
    table[n2].sa += m.player_1?.score ?? 0;

    if (m.status === "done") {
      if (m.player_1?.is_winner)      { table[n1].w++; table[n1].pts += 3; table[n2].l++; }
      else if (m.player_2?.is_winner) { table[n2].w++; table[n2].pts += 3; table[n1].l++; }
      else                            { table[n1].d++; table[n1].pts++; table[n2].d++; table[n2].pts++; }
    }
  }

  return Object.values(table).sort((a, b) =>
    b.pts - a.pts || b.w - a.w || (b.sf - b.sa) - (a.sf - a.sa)
  );
}

// ── Form header (shared) ──────────────────────────────────────
function FormHeader({ event, subtitle, onBack }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, paddingBottom:16, borderBottom:"1px solid var(--border)" }}>
      <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--muted)", fontSize:22, padding:"0 2px", lineHeight:1 }}>←</button>
      <div style={{ width:32, height:32, borderRadius:6, background:"var(--primary-dim)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-display)", fontSize:11, fontWeight:900, color:"var(--primary)" }}>
        {sa(event.sport_key)}
      </div>
      <div>
        <div style={{ fontFamily:"var(--font-display)", fontSize:14, fontWeight:900, textTransform:"uppercase", letterSpacing:-0.5, color:"var(--ink)" }}>{event.name}</div>
        <div style={{ fontSize:12, color:"var(--muted)", marginTop:1 }}>{subtitle}</div>
      </div>
    </div>
  );
}

// ── Individual registration form ──────────────────────────────
function IndividualForm({ event, tournament, onSuccess, onBack }) {
  const [form,    setForm]    = useState({ name:"", phone:"", age:"", gender:"Male" });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const submit = async () => {
    if (!form.name.trim())  return setError("Name is required.");
    if (!form.phone.trim()) return setError("Phone number is required.");
    setLoading(true); setError("");
    try {
      await registerIndividual(tournament.tournament_id, {
        name: form.name.trim(), phone: form.phone.trim(),
        age: parseInt(form.age) || null, gender: form.gender,
        event_ids: [event.event_id],
      });
      onSuccess(form.name.trim());
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div>
      <FormHeader event={event} subtitle="Individual Registration" onBack={onBack} />
      {error && <div className="pub-error">{error}</div>}
      <div className="field">
        <label>Your Name *</label>
        <input className="input" autoFocus placeholder="e.g. Rahul Sharma"
          value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="field">
        <label>Phone *</label>
        <input className="input" type="tel" placeholder="9876543210"
          value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Age</label>
          <input className="input" type="number" placeholder="24" min="5" max="99"
            value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} />
        </div>
        <div className="field">
          <label>Gender</label>
          <select className="input" value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
            <option>Male</option><option>Female</option><option>Other</option>
          </select>
        </div>
      </div>
      <p style={{ fontSize:11, color:"var(--muted)", marginBottom:14 }}>Your details are only used for this tournament.</p>
      <button className="btn btn-gradient btn-lg" style={{ width:"100%" }} onClick={submit} disabled={loading}>
        {loading ? "Registering…" : "Register →"}
      </button>
    </div>
  );
}

// ── Doubles form ──────────────────────────────────────────────
function DoublesForm({ event, tournament, onSuccess, onBack }) {
  const isMixed = event.sport_config?.mixed;
  const [form,    setForm]    = useState({ p1:"", p2:"", phone:"" });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const submit = async () => {
    if (!form.p1.trim()) return setError(`${isMixed ? "Male player" : "Player 1"} name is required.`);
    if (!form.p2.trim()) return setError(`${isMixed ? "Female player" : "Player 2"} name is required.`);
    if (form.p1.trim().toLowerCase() === form.p2.trim().toLowerCase())
      return setError("Both players must be different people.");
    setLoading(true); setError("");
    try {
      await registerPair(tournament.tournament_id, {
        name: `${form.p1.trim()} & ${form.p2.trim()}`,
        contact_phone: form.phone.trim() || "",
        sport_key: event.sport_key, event_id: event.event_id,
        members: [
          { name: form.p1.trim(), role: isMixed ? "male"    : "player1" },
          { name: form.p2.trim(), role: isMixed ? "female"  : "player2" },
        ],
      });
      onSuccess(`${form.p1.trim()} & ${form.p2.trim()}`);
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div>
      <FormHeader event={event} subtitle={isMixed ? "Mixed Doubles" : "Doubles Pair Registration"} onBack={onBack} />
      {error && <div className="pub-error">{error}</div>}
      <div style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12, color:"var(--muted)", lineHeight:1.5 }}>
        Enter both partners. The organiser will confirm and seed the draw.
      </div>
      <div style={{ border:"2px solid var(--border)", borderLeft:"4px solid var(--primary)", borderRadius:8, padding:"14px 16px", marginBottom:10, background:"var(--surface)" }}>
        <div style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:2, color:"var(--primary)", marginBottom:10 }}>
          {isMixed ? "Male Player *" : "Player 1 *"}
        </div>
        <input className="input" autoFocus placeholder="Full name"
          value={form.p1} onChange={e => setForm(f => ({ ...f, p1: e.target.value }))} />
      </div>
      <div style={{ border:"2px solid var(--border)", borderLeft:"4px solid #92700A", borderRadius:8, padding:"14px 16px", marginBottom:14, background:"var(--surface)" }}>
        <div style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:2, color:"#92700A", marginBottom:10 }}>
          {isMixed ? "Female Player *" : "Player 2 *"}
        </div>
        <input className="input" placeholder="Full name"
          value={form.p2} onChange={e => setForm(f => ({ ...f, p2: e.target.value }))} />
      </div>
      <div className="field">
        <label>Contact Phone (optional)</label>
        <input className="input" type="tel" placeholder="9876543210"
          value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
      </div>
      <button className="btn btn-gradient btn-lg" style={{ width:"100%" }} onClick={submit} disabled={loading}>
        {loading ? "Registering…" : "Register Pair →"}
      </button>
    </div>
  );
}

// ── Team registration form ────────────────────────────────────
function TeamRegistrationForm({ event, tournament, onSuccess, onBack }) {
  const cfg        = event.sport_config || {};
  const teamSize   = cfg.team_size   || 11;
  const subs       = cfg.substitutes || 0;
  const totalSlots = teamSize + subs;

  const emptyMember = (role) => ({ name: "", role, jersey: "", age: "" });
  const [teamName, setTeamName] = useState("");
  const [phone,    setPhone]    = useState("");
  const [members,  setMembers]  = useState(() => [
    emptyMember("captain"),
    emptyMember("vice_captain"),
    ...Array.from({ length: Math.max(0, Math.min(totalSlots - 2, 9)) }, () => emptyMember("player")),
  ]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const updateMember = (i, field, val) =>
    setMembers(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: val } : m));
  const addSlot = () => setMembers(prev => [...prev, emptyMember("player")]);
  const removeSlot = (i) => setMembers(prev => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!teamName.trim()) return setError("Team name is required.");
    const captain = members.find(m => m.role === "captain" && m.name.trim());
    if (!captain)         return setError("Captain name is required.");
    const valid = members
      .filter(m => m.name.trim())
      .map(m => ({
        name:          m.name.trim(),
        role:          m.role,
        jersey_number: m.jersey ? parseInt(m.jersey) || null : null,
        age:           m.age    ? parseInt(m.age)    || null : null,
      }));
    setLoading(true); setError("");
    try {
      await registerTeam(tournament.tournament_id, {
        name:          teamName.trim(),
        contact_phone: phone.trim(),
        sport_key:     event.sport_key,
        event_ids:     [event.event_id],
        members:       valid,
      });
      onSuccess(teamName.trim());
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  };

  const roleLabel = r => r === "vice_captain" ? "Vice Captain" : r.charAt(0).toUpperCase() + r.slice(1);
  const roleOptions = ["captain", "vice_captain", "player"];

  return (
    <div>
      <FormHeader event={event} subtitle="Team Registration" onBack={onBack} />
      {error && <div className="pub-error">{error}</div>}

      {/* Team details */}
      <div className="field">
        <label>Team Name *</label>
        <input className="input" autoFocus placeholder="e.g. FC Rangers"
          value={teamName} onChange={e => setTeamName(e.target.value)} />
      </div>
      <div className="field">
        <label>Captain's Contact Phone</label>
        <input className="input" type="tel" placeholder="9876543210"
          value={phone} onChange={e => setPhone(e.target.value)} />
      </div>

      {/* Squad size hint */}
      <div style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 14px", marginBottom:16, fontSize:12, color:"var(--muted)", lineHeight:1.5 }}>
        {sl(event.sport_key)} · {teamSize} on field{subs > 0 ? ` + ${subs} subs` : ""} · Fill in your full squad below
      </div>

      {/* Column headers */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 58px 52px 130px 28px", gap:6, marginBottom:4 }}>
        {["Player Name","Jersey","Age","Role",""].map(h => (
          <span key={h} style={{ fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:1, color:"var(--muted)" }}>{h}</span>
        ))}
      </div>

      {/* Roster rows */}
      {members.map((m, i) => (
        <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 58px 52px 130px 28px", gap:6, marginBottom:6, alignItems:"center" }}>
          <input className="input"
            placeholder={i === 0 ? "Captain *" : i === 1 ? "Vice Captain" : `Player ${i + 1}`}
            value={m.name} onChange={e => updateMember(i, "name", e.target.value)} />
          <input className="input" type="number" placeholder="#" style={{ textAlign:"center" }}
            value={m.jersey} onChange={e => updateMember(i, "jersey", e.target.value)} />
          <input className="input" type="number" placeholder="Age" min="5" max="60" style={{ textAlign:"center" }}
            value={m.age} onChange={e => updateMember(i, "age", e.target.value)} />
          <select className="input" value={m.role} onChange={e => updateMember(i, "role", e.target.value)}>
            {roleOptions.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
          <button onClick={() => removeSlot(i)} disabled={members.length <= 1}
            style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:18, padding:0, opacity: members.length <= 1 ? 0.3 : 1 }}>×</button>
        </div>
      ))}

      {members.length < totalSlots + 3 && (
        <button onClick={addSlot} style={{ width:"100%", padding:"8px 0", background:"none", border:"1.5px dashed var(--border)", borderRadius:6, color:"var(--muted)", fontFamily:"var(--font-display)", fontSize:11, fontWeight:700, letterSpacing:1, textTransform:"uppercase", cursor:"pointer", marginBottom:16, marginTop:4 }}>
          + Add Player
        </button>
      )}

      <p style={{ fontSize:11, color:"var(--muted)", marginBottom:14 }}>
        {members.filter(m => m.name.trim()).length} of {totalSlots} roster slots filled
      </p>
      <button className="btn btn-gradient btn-lg" style={{ width:"100%" }} onClick={submit} disabled={loading}>
        {loading ? "Registering…" : "Register Team →"}
      </button>
    </div>
  );
}

// ── Success screen ────────────────────────────────────────────
function SuccessView({ name, event, onBack }) {
  return (
    <div style={{ textAlign:"center", padding:"36px 0" }}>
      <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(34,197,94,0.12)", border:"2px solid rgba(34,197,94,0.3)", margin:"0 auto 16px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28 }}>✓</div>
      <div style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:900, textTransform:"uppercase", letterSpacing:-1, color:"#16a34a", marginBottom:10 }}>
        You're In!
      </div>
      <p style={{ fontSize:14, color:"var(--muted)", lineHeight:1.7, marginBottom:24 }}>
        <strong style={{ color:"var(--ink)" }}>{name}</strong> has been registered for{" "}
        <strong style={{ color:"var(--ink)" }}>{event?.name}</strong>.
      </p>
      <div style={{ background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.25)", borderRadius:8, padding:"12px 18px", marginBottom:20, fontFamily:"var(--font-display)", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1, color:"#16a34a" }}>
        Share this page with other participants!
      </div>
      <button className="btn btn-outline" onClick={onBack}>← Register Someone Else</button>
    </div>
  );
}

// ── Event card (registration browse) ─────────────────────────
function EventCard({ event, onClick }) {
  const mode = getRegMode(event);
  const modeLabel = { team:"Team Sport", doubles:"Doubles Pair", individual:"Individual" }[mode];
  const modeCls   = { team:"pub-pill pub-pill-blue", doubles:"pub-pill pub-pill-orange", individual:"pub-pill pub-pill-green" }[mode];

  return (
    <div className="pub-event-card" onClick={onClick}>
      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ width:48, height:48, borderRadius:12, background:"var(--primary-dim)", border:"1px solid rgba(255,107,53,.2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontFamily:"var(--font-display)", fontSize:14, fontWeight:900, color:"var(--primary)" }}>
          {sa(event.sport_key)}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:"var(--font-display)", fontSize:14, fontWeight:900, textTransform:"uppercase", letterSpacing:-0.5, color:"var(--ink)", marginBottom:6 }}>{event.name}</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <span className={modeCls}>{modeLabel}</span>
            {event.format && <span className="pub-pill pub-pill-gray">{event.format.replace(/_/g, " ")}</span>}
          </div>
        </div>
        <div style={{ fontFamily:"var(--font-display)", fontSize:22, color:"var(--primary)", flexShrink:0 }}>›</div>
      </div>
    </div>
  );
}

// ── Match card ─────────────────────────────────────────────────
function MatchCard({ match: m }) {
  const isLive = m.status === "live";
  const isDone = m.status === "done";
  const sets   = (m.sets || []).filter(s => s.is_complete);

  return (
    <div className={`match-row${isLive ? " live" : ""}`} style={{ flexDirection:"column", gap:8 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        {m.round != null && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", minWidth:34, flexShrink:0 }}>
            <span style={{ fontFamily:"var(--font-display)", fontSize:9, fontWeight:800, textTransform:"uppercase", letterSpacing:1, background:"var(--primary-dim)", color:"var(--primary)", padding:"2px 5px", borderRadius:3 }}>
              R{m.round}
            </span>
            {m.table_number && (
              <span style={{ fontSize:9, color:"var(--muted)", fontWeight:700, marginTop:2 }}>T{m.table_number}</span>
            )}
          </div>
        )}

        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
          <span style={{ flex:1, fontSize:13, fontWeight:700, color: m.player_1?.is_winner ? "var(--green)" : "var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {m.player_1?.name || "TBD"}
          </span>
          <span style={{ fontFamily:"var(--font-display)", fontSize:isLive || isDone ? 17 : 13, fontWeight:900, minWidth:52, textAlign:"center", color: isLive ? "var(--primary)" : isDone ? "var(--ink)" : "var(--muted)" }}>
            {isLive || isDone ? `${m.player_1?.score ?? 0}–${m.player_2?.score ?? 0}` : "vs"}
          </span>
          <span style={{ flex:1, textAlign:"right", fontSize:13, fontWeight:700, color: m.player_2?.is_winner ? "var(--green)" : "var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {m.player_2?.name || "TBD"}
          </span>
        </div>

        <div style={{ flexShrink:0, width:36, display:"flex", justifyContent:"flex-end" }}>
          {isLive && (
            <span className="pill pill-orange" style={{ fontSize:9, padding:"2px 6px", display:"flex", alignItems:"center", gap:3 }}>
              <span className="live-dot" style={{ width:5, height:5, background:"var(--primary)" }}/>LIVE
            </span>
          )}
          {isDone && <span className="pill pill-green" style={{ fontSize:9, padding:"2px 6px" }}>FT</span>}
        </div>
      </div>

      {sets.length > 0 && (
        <div style={{ display:"flex", gap:4, justifyContent:"center", flexWrap:"wrap" }}>
          {sets.map(s => (
            <span key={s.set_number} style={{ fontSize:10, padding:"2px 7px", borderRadius:3, fontWeight:700, fontFamily:"var(--font-display)", background:"var(--primary-dim)", color:"var(--primary)" }}>
              S{s.set_number}: {s.score_p1}-{s.score_p2}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// BracketCard removed — bracket rendering handled by RoadToFinal component

// ── Section wrapper ───────────────────────────────────────────
function Section({ id, title, accent, children, wide }) {
  return (
    <section id={id} style={{ padding:"28px 0 20px", scrollMarginTop:48 }}>
      <div style={{ maxWidth: wide ? 1280 : 1100, margin:"0 auto", padding:"0 24px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:22, paddingBottom:14, borderBottom:"2px solid var(--border)" }}>
          <div style={{ width:4, height:24, borderRadius:2, background: accent || "var(--primary)", flexShrink:0 }}/>
          <h2 style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:900, textTransform:"uppercase", letterSpacing:-0.5, color:"var(--ink)", margin:0, flex:1 }}>{title}</h2>
        </div>
        {children}
      </div>
    </section>
  );
}

// ── Tournament hero ───────────────────────────────────────────
function TournamentHero({ tournament, liveCount, totalPlayers, doneMatches, totalMatches }) {
  const navigate = useNavigate();
  const sc = STATUS_CFG[tournament.status] || STATUS_CFG.draft;
  const isLive = tournament.status === "live";

  return (
    <div style={{ background:"var(--surface)", borderBottom:"3px solid var(--border)", position:"relative", overflow:"hidden" }}>
      {/* Subtle radial accent */}
      <div style={{ position:"absolute", top:-60, right:-60, width:280, height:280, borderRadius:"50%", background:`radial-gradient(circle, var(--primary-dim) 0%, transparent 70%)`, pointerEvents:"none" }}/>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"22px 24px 24px", position:"relative" }}>
        {/* Breadcrumb */}
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
          <span onClick={() => navigate("/")} style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:2, color:"var(--primary)", cursor:"pointer" }}>
            TheScoreBoard
          </span>
          {tournament.org_name && (
            <>
              <span style={{ color:"var(--border-mid)", fontSize:12 }}>›</span>
              <span style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1, color:"var(--muted)" }}>{tournament.org_name}</span>
            </>
          )}
        </div>

        {/* Title + status */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:14 }}>
          <h1 style={{ fontFamily:"var(--font-display)", fontSize:26, fontWeight:900, textTransform:"uppercase", letterSpacing:-1, color:"var(--ink)", margin:0, lineHeight:1.1, flex:1 }}>
            {tournament.name}
          </h1>
          <span style={{
            display:"inline-flex", alignItems:"center", gap:6, flexShrink:0, marginTop:4,
            background: isLive ? "var(--primary-dim)" : "var(--elevated)",
            color: sc.color,
            fontFamily:"var(--font-display)", fontSize:10, fontWeight:800,
            textTransform:"uppercase", letterSpacing:2,
            padding:"5px 12px", borderRadius:6,
            border: isLive ? "1px solid rgba(255,107,53,0.3)" : "1px solid var(--border)",
          }}>
            {isLive && <span className="live-dot" style={{ background:"var(--primary)", width:6, height:6 }}/>}
            {sc.label}
          </span>
        </div>

        {/* Meta row */}
        <div style={{ display:"flex", gap:14, flexWrap:"wrap", fontSize:12, color:"var(--muted)", marginBottom:16 }}>
          {tournament.venue    && <span>🏟 {tournament.venue}</span>}
          {tournament.city     && <span>📍 {tournament.city}{tournament.state ? `, ${tournament.state}` : ""}</span>}
          {tournament.start_date && <span>📅 {tournament.start_date}</span>}
          {tournament.end_date && tournament.end_date !== tournament.start_date && (
            <span>→ {tournament.end_date}</span>
          )}
        </div>

        {tournament.description && (
          <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.6, marginBottom:16, maxWidth:540 }}>
            {tournament.description}
          </p>
        )}

        {/* Quick stat chips */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {totalPlayers > 0 && (
            <div style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:20, padding:"5px 14px", display:"flex", alignItems:"center", gap:6, fontSize:12, fontWeight:700 }}>
              <span style={{ color:"var(--primary)", fontFamily:"var(--font-display)", fontSize:14, fontWeight:900 }}>{totalPlayers}</span>
              <span style={{ color:"var(--muted)" }}>Players</span>
            </div>
          )}
          {totalMatches > 0 && (
            <div style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:20, padding:"5px 14px", display:"flex", alignItems:"center", gap:6, fontSize:12, fontWeight:700 }}>
              <span style={{ color:"var(--ink)", fontFamily:"var(--font-display)", fontSize:14, fontWeight:900 }}>{doneMatches}/{totalMatches}</span>
              <span style={{ color:"var(--muted)" }}>Matches Done</span>
            </div>
          )}
          {liveCount > 0 && (
            <div style={{ background:"var(--primary-dim)", border:"1px solid rgba(255,107,53,0.3)", borderRadius:20, padding:"5px 14px", display:"flex", alignItems:"center", gap:6, fontSize:12, fontWeight:700 }}>
              <span className="live-dot" style={{ width:6, height:6, background:"var(--primary)", flexShrink:0 }}/>
              <span style={{ color:"var(--primary)" }}>{liveCount} Live Now</span>
            </div>
          )}
        </div>

        {/* Sponsors */}
        {tournament.sponsors?.length > 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:16, flexWrap:"wrap" }}>
            <span style={{ fontSize:10, color:"var(--muted)", fontWeight:700, textTransform:"uppercase", letterSpacing:1 }}>Sponsors</span>
            {tournament.sponsors.map((s, i) => (
              <span key={i} style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:6, padding:"3px 10px", fontSize:11, color:"var(--muted)", fontWeight:600 }}>
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Live strip ────────────────────────────────────────────────
function LiveStrip({ liveMatches }) {
  if (!liveMatches.length) return null;
  return (
    <div style={{ background:"var(--primary)", overflowX:"auto", scrollbarWidth:"none" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 20px", minWidth:"max-content" }}>
        <span style={{ display:"flex", alignItems:"center", gap:6, color:"#fff", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:2, flexShrink:0 }}>
          <span className="live-dot" style={{ background:"#fff" }}/>LIVE
        </span>
        {liveMatches.map(m => (
          <div key={m.match_id} style={{ background:"rgba(0,0,0,0.2)", borderRadius:8, padding:"5px 14px", flexShrink:0, display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ color:"#fff", fontWeight:700, fontSize:12 }}>{m.player_1?.name || "TBD"}</span>
            <span style={{ color:"#fff", fontFamily:"var(--font-display)", fontSize:15, fontWeight:900 }}>
              {m.player_1?.score ?? 0}–{m.player_2?.score ?? 0}
            </span>
            <span style={{ color:"#fff", fontWeight:700, fontSize:12 }}>{m.player_2?.name || "TBD"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section nav ───────────────────────────────────────────────
function SectionNav({ sections, activeId, onNav }) {
  return (
    <div style={{ background:"var(--surface)", borderBottom:"2px solid var(--border)", position:"sticky", top:0, zIndex:100, overflowX:"auto", scrollbarWidth:"none" }}>
      <div style={{ display:"flex", padding:"0 16px", maxWidth:1100, margin:"0 auto" }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => onNav(s.id)} style={{
            padding:"11px 16px", background:"none", border:"none",
            borderBottom: activeId === s.id ? "2px solid var(--primary)" : "2px solid transparent",
            marginBottom:-2,
            color: activeId === s.id ? "var(--primary)" : "var(--muted)",
            fontFamily:"var(--font-display)", fontSize:10, fontWeight:800,
            textTransform:"uppercase", letterSpacing:1.5,
            cursor:"pointer", whiteSpace:"nowrap", flexShrink:0,
            transition:"color .15s, border-color .15s",
          }}>
            {s.label}
            {s.count != null && s.count > 0 && (
              <span style={{ marginLeft:6, background: activeId === s.id ? "var(--primary)" : "var(--elevated)", color: activeId === s.id ? "#fff" : "var(--muted)", borderRadius:10, padding:"1px 6px", fontSize:9, fontFamily:"var(--font-display)", fontWeight:900, verticalAlign:"middle" }}>
                {s.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Register section ──────────────────────────────────────────
function RegisterSection({ events, tournament }) {
  const [phase,   setPhase]   = useState("browse");
  const [selEvt,  setSelEvt]  = useState(null);
  const [regName, setRegName] = useState("");

  const open = events.filter(ev => ev.is_configured !== false);
  const handleBack = () => { setPhase("browse"); setSelEvt(null); };

  return (
    <Section id="register" title="Register Now" accent="#16a34a">
      {phase === "success" && <SuccessView name={regName} event={selEvt} onBack={handleBack} />}
      {phase === "form" && selEvt && (() => {
        const mode = getRegMode(selEvt);
        if (mode === "team")    return <TeamRegistrationForm event={selEvt} tournament={tournament} onSuccess={n => { setRegName(n); setPhase("success"); }} onBack={handleBack} />;
        if (mode === "doubles") return <DoublesForm  event={selEvt} tournament={tournament} onSuccess={n => { setRegName(n); setPhase("success"); }} onBack={handleBack} />;
        return                         <IndividualForm event={selEvt} tournament={tournament} onSuccess={n => { setRegName(n); setPhase("success"); }} onBack={handleBack} />;
      })()}
      {phase === "browse" && (
        open.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📋</div>
            <div className="empty-title">Registration Closed</div>
            <p style={{ fontSize:13, color:"var(--muted)", marginTop:8 }}>No events are currently open for registration.</p>
          </div>
        ) : (
          <div>
            <p style={{ fontSize:13, color:"var(--muted)", marginBottom:16 }}>
              {open.length} event{open.length !== 1 ? "s" : ""} available — tap to register
            </p>
            {open.map(ev => <EventCard key={ev.event_id} event={ev} onClick={() => { setSelEvt(ev); setPhase("form"); }} />)}
          </div>
        )
      )}
    </Section>
  );
}

// ── Fixtures section ──────────────────────────────────────────
function FixturesSection({ events }) {
  const allMatches = events.flatMap(ev => ev.all_matches || []);
  const liveCt     = allMatches.filter(m => m.status === "live").length;
  const doneCt     = allMatches.filter(m => m.status === "done").length;
  const upcomingCt = allMatches.filter(m => m.status !== "live" && m.status !== "done").length;

  return (
    <Section id="fixtures" title="Fixtures">
      {/* Stats strip */}
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
        {[
          { label:"Total",    val: allMatches.length, color:"var(--muted)"   },
          { label:"Live",     val: liveCt,            color:"var(--primary)" },
          { label:"Done",     val: doneCt,            color:"var(--green)"   },
          { label:"Upcoming", val: upcomingCt,        color:"var(--muted)"   },
        ].map(s => (
          <div key={s.label} style={{ background:"var(--surface)", border:"1.5px solid var(--border)", borderRadius:10, padding:"10px 16px", textAlign:"center", minWidth:68 }}>
            <div style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:900, color:s.color, lineHeight:1 }}>{s.val}</div>
            <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1, color:"var(--muted)", marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {allMatches.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🏆</div>
          <div className="empty-title">Fixtures Not Set Yet</div>
          <p style={{ fontSize:13, color:"var(--muted)", marginTop:8 }}>The draw will be published here once ready.</p>
        </div>
      ) : (
        events.map(ev => {
          const matches = ev.all_matches || [];
          if (!matches.length) return null;

          const stageMap = {};
          for (const m of matches) {
            const sk = m.stage || "main";
            if (!stageMap[sk]) stageMap[sk] = {};
            const r = m.round ?? 0;
            if (!stageMap[sk][r]) stageMap[sk][r] = [];
            stageMap[sk][r].push(m);
          }
          const stageOrder  = ["group", "knockout", "main", "finals"];
          const stageLabels = { group:"Group Stage", knockout:"Knockout Stage", main:"Fixtures", finals:"Finals" };
          const multiStage  = Object.keys(stageMap).length > 1;

          return (
            <div key={ev.event_id} style={{ marginBottom:32 }}>
              {/* Event header */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, paddingBottom:10, borderBottom:"1px solid var(--border)" }}>
                <div style={{ width:30, height:30, borderRadius:8, background:"var(--primary-dim)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-display)", fontSize:10, fontWeight:900, color:"var(--primary)", flexShrink:0 }}>
                  {sa(ev.sport_key)}
                </div>
                <span style={{ fontFamily:"var(--font-display)", fontSize:14, fontWeight:900, textTransform:"uppercase", letterSpacing:-0.5, color:"var(--ink)", flex:1 }}>{ev.name}</span>
                {ev.live_matches?.length > 0 && (
                  <span className="pill pill-orange" style={{ fontSize:9, display:"flex", alignItems:"center", gap:3 }}>
                    <span className="live-dot" style={{ width:5, height:5, background:"var(--primary)" }}/>
                    {ev.live_matches.length} Live
                  </span>
                )}
                <span style={{ fontSize:11, color:"var(--muted)" }}>
                  {ev.completed_matches ?? doneCt}/{ev.total_matches ?? matches.length} done
                </span>
              </div>

              {stageOrder.filter(sk => stageMap[sk]).map(sk => (
                <div key={sk} style={{ marginBottom:12 }}>
                  {multiStage && (
                    <div style={{ fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:2, color:"var(--muted)", marginBottom:10, marginTop:4, paddingLeft:4, borderLeft:"3px solid var(--border)" }}>
                      {stageLabels[sk] || sk}
                    </div>
                  )}
                  {Object.entries(stageMap[sk]).sort(([a],[b]) => Number(a)-Number(b)).map(([round, rMatches]) => (
                    <div key={round} style={{ marginBottom:10 }}>
                      {Object.keys(stageMap[sk]).length > 1 && Number(round) > 0 && (
                        <div style={{ fontSize:10, color:"var(--muted)", fontWeight:700, marginBottom:5, paddingLeft:4 }}>
                          Round {round}
                        </div>
                      )}
                      {rMatches.map(m => <MatchCard key={m.match_id} match={m} />)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })
      )}
    </Section>
  );
}

// ── Leaderboard section ───────────────────────────────────────
function LeaderboardSection({ events }) {
  const relevant = events.filter(ev => ev.format === "round_robin" || ev.format === "group_knockout");
  if (!relevant.length) return null;

  return (
    <Section id="leaderboard" title="Leaderboard" accent="#eab308">
      {relevant.map(ev => {
        const rows  = computeStandings(ev);
        const isGK  = ev.format === "group_knockout";
        const hasDrw = rows.some(r => r.d > 0);
        const isFootball = ev.sport_key === "football";
        const scoreLabel = isFootball ? "GF–GA" : "Sets";
        const cols = hasDrw
          ? "32px 1fr 32px 32px 32px 32px 56px"
          : "32px 1fr 32px 32px 32px 56px";
        const headers = hasDrw
          ? ["#", isFootball ? "Team" : "Player", "P", "W", "D", "L", scoreLabel]
          : ["#", isFootball ? "Team" : "Player", "P", "W", "L", scoreLabel];

        return (
          <div key={ev.event_id} style={{ marginBottom:28 }}>
            {relevant.length > 1 && (
              <div style={{ fontFamily:"var(--font-display)", fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:1, color:"var(--muted)", marginBottom:10 }}>
                {ev.name}
              </div>
            )}

            {rows.length === 0 ? (
              <div style={{ textAlign:"center", padding:"28px 0", color:"var(--muted)", fontSize:13 }}>No matches played yet.</div>
            ) : (
              <>
                <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, overflow:"hidden" }}>
                  {/* Table header */}
                  <div style={{ display:"grid", gridTemplateColumns:cols, padding:"8px 16px", background:"var(--elevated)", borderBottom:"1px solid var(--border)" }}>
                    {headers.map((h, i) => (
                      <span key={h} style={{ fontSize:9, fontWeight:800, textTransform:"uppercase", letterSpacing:1.5, color:"var(--muted)", fontFamily:"var(--font-display)", textAlign: i > 1 ? "center" : "left" }}>{h}</span>
                    ))}
                  </div>
                  {rows.map((row, i) => {
                    const advances = isGK && i < 2;
                    return (
                      <div key={row.name} style={{
                        display:"grid", gridTemplateColumns:cols,
                        padding:"11px 16px", alignItems:"center",
                        borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none",
                        background: advances ? "rgba(34,197,94,0.04)" : "transparent",
                      }}>
                        <span style={{ fontFamily:"var(--font-display)", fontSize:13, fontWeight:900, color: advances ? "var(--green)" : "var(--muted)" }}>{i + 1}</span>
                        <span style={{ fontSize:13, fontWeight:700, color:"var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{row.name}</span>
                        <span style={{ textAlign:"center", fontSize:12, color:"var(--muted)" }}>{row.p}</span>
                        <span style={{ textAlign:"center", fontSize:13, fontWeight:800, color: row.w > 0 ? "var(--green)" : "var(--muted)" }}>{row.w}</span>
                        {hasDrw && <span style={{ textAlign:"center", fontSize:12, color:"var(--muted)" }}>{row.d}</span>}
                        <span style={{ textAlign:"center", fontSize:12, color:"var(--muted)" }}>{row.l}</span>
                        <span style={{ textAlign:"center", fontSize:11, color:"var(--muted)" }}>{row.sf}–{row.sa}</span>
                      </div>
                    );
                  })}
                </div>
                {isGK && rows.length >= 2 && (
                  <p style={{ fontSize:11, color:"var(--muted)", marginTop:8, paddingLeft:4 }}>
                    ↑ Top 2 advance to knockout stage
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}
    </Section>
  );
}

// ── Road to Final section ─────────────────────────────────────
function BracketSection({ events }) {
  return (
    <Section id="bracket" title="Road to Final" accent="#818cf8" wide>
      <RoadToFinal events={events} />
    </Section>
  );
}

// ── Draft view ────────────────────────────────────────────────
function DraftView({ tournament }) {
  return (
    <div style={{ maxWidth:480, margin:"72px auto", padding:"0 24px", textAlign:"center" }}>
      <div style={{ fontSize:56, marginBottom:20 }}>🏗️</div>
      <h2 style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:900, textTransform:"uppercase", letterSpacing:-1, marginBottom:12 }}>Coming Soon</h2>
      <p style={{ fontSize:14, color:"var(--muted)", lineHeight:1.7, marginBottom:28 }}>
        <strong style={{ color:"var(--ink)" }}>{tournament.name}</strong> is still being set up. Check back soon.
      </p>
      {tournament.org_name && (
        <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 16px", fontSize:13, color:"var(--muted)" }}>
          Organised by <strong style={{ color:"var(--ink)" }}>{tournament.org_name}</strong>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function TournamentPublic() {
  const { slug, sportUrl } = useParams();
  const navigate = useNavigate();

  const [data,        setData]        = useState(null);
  const [error,       setError]       = useState(null);
  const [activeId,    setActiveId]    = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const d = sportUrl
        ? await getSportTournament(sportUrl, slug)
        : await getTournamentBySlug(slug);
      setData(d);
      setLastUpdated(new Date());
    } catch(e) { setError(e.message || "Tournament not found."); }
  }, [slug, sportUrl]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!data) return;
    const allMatches = data.events?.flatMap(ev => ev.all_matches || []) || [];
    if (!allMatches.some(m => m.status === "live")) return;
    const id = setInterval(fetchData, POLL_MS);
    return () => clearInterval(id);
  }, [data, fetchData]);

  // Scroll spy — highlight active section
  useEffect(() => {
    const handleScroll = () => {
      const ids = ["register", "fixtures", "leaderboard", "bracket"];
      for (const id of [...ids].reverse()) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 80) {
          setActiveId(id);
          return;
        }
      }
      // Nothing scrolled into view — pick first visible section
      for (const id of ids) {
        if (document.getElementById(id)) { setActiveId(id); return; }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [data]);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior:"smooth", block:"start" });
    setActiveId(id);
  };

  // ── Loading ──
  if (!data && !error) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ fontFamily:"var(--font-display)", fontSize:12, fontWeight:800, textTransform:"uppercase", letterSpacing:3, color:"var(--muted)" }}>Loading…</div>
    </div>
  );

  // ── Error ──
  if (error) return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign:"center" }}>
        <div className="auth-logo">The<span className="accent">Score</span>Board</div>
        <div style={{ fontSize:40, margin:"20px 0 12px" }}>😕</div>
        <p style={{ color:"var(--muted)", marginBottom:20, fontSize:14 }}>{error}</p>
        <button className="btn btn-primary" onClick={() => navigate("/")}>Go Home</button>
      </div>
    </div>
  );

  const { tournament: t, events = [] } = data;
  const status = t.status || "draft";

  const allMatches  = events.flatMap(ev => ev.all_matches || []);
  const liveMatches = allMatches.filter(m => m.status === "live");
  const doneCt      = allMatches.filter(m => m.status === "done").length;
  const totalPlayers = events.reduce((s, ev) => s + (ev.player_count ?? 0), 0);

  const regOpen   = status === "registration";
  const hasKO     = events.some(ev => ev.format === "direct_knockout" || ev.format === "group_knockout");
  const hasBoard  = events.some(ev => ev.format === "round_robin"     || ev.format === "group_knockout");

  if (status === "draft") return (
    <div className="app">
      <TournamentHero tournament={t} liveCount={0} totalPlayers={0} doneMatches={0} totalMatches={0} />
      <DraftView tournament={t} />
    </div>
  );

  // Build section list
  const sections = [
    ...(regOpen ? [{ id:"register",   label:"Register"        }] : []),
    { id:"fixtures",   label:"Fixtures", count: allMatches.length },
    ...(hasBoard ? [{ id:"leaderboard", label:"Leaderboard" }] : []),
    ...(hasKO   ? [{ id:"bracket",     label:"Road to Final" }] : []),
  ];

  // Default active on first render
  const effectiveActive = activeId || sections[0]?.id;

  return (
    <div className="app">
      <TournamentHero
        tournament={t}
        liveCount={liveMatches.length}
        totalPlayers={totalPlayers}
        doneMatches={doneCt}
        totalMatches={allMatches.length}
      />

      {liveMatches.length > 0 && <LiveStrip liveMatches={liveMatches} />}

      <SectionNav sections={sections} activeId={effectiveActive} onNav={scrollTo} />

      <div className="pub-content">
        {regOpen  && <RegisterSection events={events} tournament={t} />}
        <FixturesSection events={events} />
        {hasBoard && <LeaderboardSection events={events} />}
        {hasKO    && <BracketSection events={events} />}
      </div>

      <footer style={{ textAlign:"center", padding:"20px 24px", color:"var(--subtle)", fontSize:12, borderTop:"1px solid var(--border)" }}>
        Powered by TheScoreBoard
        {liveMatches.length > 0 && " · Auto-refreshing"}
        {lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString()}`}
      </footer>
    </div>
  );
}
