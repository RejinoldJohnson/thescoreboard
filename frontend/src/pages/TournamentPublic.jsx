/**
 * TournamentPublic — public spectator page.
 * Single-scroll layout with section nav. No tabs.
 * Sections: Register | Fixtures | Leaderboard | Road to Final
 */
import { useState, useEffect, useCallback, useRef } from "react";
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
  const sportIcon = SPORT_META[event.sport_key]?.icon || "🏆";

  return (
    <div onClick={onClick} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:14, marginBottom:8, background:"var(--surface)", border:"1.5px solid var(--border)", borderLeft:"4px solid var(--accent)", cursor:"pointer", boxShadow:"var(--sh-sm)", transition:"box-shadow .15s" }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "var(--accent-glow), var(--sh-sm)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "var(--sh-sm)"}
    >
      <div style={{ width:44, height:44, borderRadius:12, background:"var(--accent-dim)", border:"1px solid var(--accent-border)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
        {sportIcon}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:"var(--font-display)", fontSize:13, fontWeight:900, textTransform:"uppercase", letterSpacing:"-0.5px", color:"var(--ink)", marginBottom:6 }}>{event.name}</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          <span style={{ fontFamily:"var(--font-display)", fontSize:8, fontWeight:900, textTransform:"uppercase", letterSpacing:1, background:"var(--accent-dim)", color:"var(--accent)", border:"1px solid var(--accent-border)", padding:"2px 8px", borderRadius:20 }}>{modeLabel}</span>
          {event.format && <span style={{ fontFamily:"var(--font-display)", fontSize:8, fontWeight:900, textTransform:"uppercase", letterSpacing:1, background:"var(--elevated)", color:"var(--muted)", border:"1px solid var(--border)", padding:"2px 8px", borderRadius:20 }}>{event.format.replace(/_/g, " ")}</span>}
        </div>
      </div>
      <div style={{ color:"var(--accent)", fontSize:20, flexShrink:0 }}>›</div>
    </div>
  );
}

// ── Sport accent colours ──────────────────────────────────────
const SPORT_ACCENT_CFG = {
  cricket:      { accent:"#16a34a", rgb:"22,163,74"   },
  football:     { accent:"#2563eb", rgb:"37,99,235"   },
  badminton:    { accent:"#7c3aed", rgb:"124,58,237"  },
  table_tennis: { accent:"#0891b2", rgb:"8,145,178"   },
};
// Per-sport colors used inline (for multi-event pages)
const SPORT_ACCENT = {
  cricket:      { color:"#16a34a", dim:"rgba(22,163,74,0.12)"   },
  football:     { color:"#2563eb", dim:"rgba(37,99,235,0.12)"   },
  badminton:    { color:"#7c3aed", dim:"rgba(124,58,237,0.12)"  },
  table_tennis: { color:"#0891b2", dim:"rgba(8,145,178,0.12)"   },
};
const sAccent = (key) => SPORT_ACCENT[key] || { color:"var(--primary)", dim:"var(--primary-dim)" };

function applyAccent(sportKey) {
  const s = SPORT_ACCENT_CFG[sportKey];
  if (!s) return;
  const r = document.documentElement;
  r.style.setProperty("--accent",        s.accent);
  r.style.setProperty("--accent-dim",    `rgba(${s.rgb},.12)`);
  r.style.setProperty("--accent-border", `rgba(${s.rgb},.22)`);
  r.style.setProperty("--accent-glow",   `0 0 20px rgba(${s.rgb},.2)`);
  r.style.setProperty("--accent-rgb",    s.rgb);
}

// ── Penalty dot (public viewer) ───────────────────────────────
function PenDot({ result }) {
  const scored = result === "H";
  const missed = result === "M";
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      width:18, height:18, borderRadius:"50%", fontSize:9, fontWeight:900,
      background: scored ? "#16a34a" : missed ? "#dc2626" : "transparent",
      border: !scored && !missed ? "1.5px solid #444" : "none",
      color:"#fff", flexShrink:0,
    }}>
      {scored ? "✓" : missed ? "✗" : ""}
    </span>
  );
}

// ── Round chip ────────────────────────────────────────────────
function RoundChip({ round, table }) {
  if (round == null) return null;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", minWidth:32, flexShrink:0 }}>
      <span style={{ fontFamily:"var(--font-display)", fontSize:9, fontWeight:800, textTransform:"uppercase", letterSpacing:1, background:"var(--primary-dim)", color:"var(--primary)", padding:"2px 5px", borderRadius:3 }}>
        R{round}
      </span>
      {table && <span style={{ fontSize:9, color:"var(--muted)", fontWeight:700, marginTop:2 }}>T{table}</span>}
    </div>
  );
}

// ── Live / Done status pill ───────────────────────────────────
function StatusPill({ isLive, isDone }) {
  if (isLive) return (
    <span className="pill pill-orange" style={{ fontSize:9, padding:"2px 6px", display:"flex", alignItems:"center", gap:3, whiteSpace:"nowrap" }}>
      <span className="live-dot" style={{ width:5, height:5, background:"var(--primary)" }}/>LIVE
    </span>
  );
  if (isDone) return <span className="pill pill-green" style={{ fontSize:9, padding:"2px 6px" }}>FT</span>;
  return null;
}

// ── Cricket match card ────────────────────────────────────────
function CricketCard({ m }) {
  const isLive = m.status === "live";
  const isDone = m.status === "done";
  const ls     = m.live_state || {};
  const battingFirst   = ls.batting_first   || 1;
  const currentInnings = ls.current_innings || 1;
  const completedSets  = (m.sets || [])
    .filter(s => s.is_complete)
    .sort((a, b) => a.set_number - b.set_number);

  const p1Name = m.player_1?.name || "TBD";
  const p2Name = m.player_2?.name || "TBD";

  // Build innings display list
  const maxInn = isDone ? completedSets.length : (isLive ? currentInnings : 0);
  const inningsData = Array.from({ length: maxInn }, (_, idx) => {
    const innNum    = idx + 1;
    const battingPos = (innNum % 2 === 1) ? battingFirst : (3 - battingFirst);
    const teamName   = battingPos === 1 ? p1Name : p2Name;
    const isP1       = battingPos === 1;
    const set        = completedSets.find(s => s.set_number === innNum);
    const isActiveLive = isLive && innNum === currentInnings;

    const runs    = set ? set.score_p1 : (isActiveLive ? ls.runs    || 0 : 0);
    const wickets = set ? set.score_p2 : (isActiveLive ? ls.wickets || 0 : 0);
    const overs   = isActiveLive ? ls.overs : null;
    const isWinner = isDone && (isP1 ? m.player_1?.is_winner : m.player_2?.is_winner);
    return { innNum, teamName, isP1, runs, wickets, overs, isComplete: !!set, isActiveLive, isWinner };
  });

  const target = inningsData[0] ? inningsData[0].runs + 1 : null;

  return (
    <div className={`mc${isLive ? " live" : ""}`} style={{ flexDirection:"column", gap:0 }}>
      {isLive && <div className="glow-bg"/>}
      {/* Header row */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8, gap:6 }}>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <RoundChip round={m.round} />
          <span style={{ fontSize:13 }}>🏏</span>
        </div>
        <StatusPill isLive={isLive} isDone={isDone} />
      </div>

      {/* Pre-match */}
      {inningsData.length === 0 && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
          <span style={{ flex:1, fontSize:13, fontWeight:700, color:"var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p1Name}</span>
          <span style={{ fontFamily:"var(--font-display)", fontSize:12, fontWeight:800, color:"var(--muted)" }}>vs</span>
          <span style={{ flex:1, fontSize:13, fontWeight:700, color:"var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textAlign:"right" }}>{p2Name}</span>
        </div>
      )}

      {/* Innings rows */}
      {inningsData.map((inn, idx) => {
        const isChasing = idx === 1 && target !== null;
        const runsNeeded = isChasing && !isDone ? target - inn.runs : null;
        const won = isChasing && inn.runs >= target;
        return (
          <div key={inn.innNum} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderTop: idx > 0 ? "1px solid var(--border)" : "none" }}>
            {/* Live bat icon */}
            <span style={{ width:14, fontSize:10, flexShrink:0, color:"#16a34a", opacity: inn.isActiveLive ? 1 : 0 }}>🏏</span>
            {/* Team name */}
            <span style={{ flex:1, fontSize:13, fontWeight: inn.isWinner ? 800 : 600, color: inn.isWinner ? "#16a34a" : "var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {inn.teamName}
            </span>
            {/* Score */}
            <span style={{ fontFamily:"var(--font-display)", fontSize:16, fontWeight:900, color: inn.isActiveLive ? "var(--primary)" : inn.isWinner ? "#16a34a" : "var(--ink)", lineHeight:1 }}>
              {inn.runs}
              <span style={{ fontSize:11, fontWeight:600, color:"var(--muted)" }}>/{inn.wickets}</span>
            </span>
            {/* Overs + need */}
            <span style={{ fontSize:10, color:"var(--muted)", minWidth:56, textAlign:"right", flexShrink:0 }}>
              {inn.overs ? `(${inn.overs})` : ""}
              {isChasing && inn.isActiveLive && runsNeeded !== null && (
                <span style={{ color: won ? "#16a34a" : "var(--muted)", display:"block", fontSize:9 }}>
                  {won ? "✓ won" : `need ${runsNeeded}`}
                </span>
              )}
            </span>
          </div>
        );
      })}

      {/* Target line for live 2nd innings */}
      {isLive && currentInnings === 2 && target !== null && inningsData.length > 1 && (
        <div style={{ fontSize:10, color:"var(--muted)", textAlign:"right", marginTop:3 }}>Target: {target}</div>
      )}
    </div>
  );
}

// ── Football match card ───────────────────────────────────────
function FootballCard({ m }) {
  const isLive = m.status === "live";
  const isDone = m.status === "done";
  const ls     = m.live_state || {};

  const penH1     = ls.pen_h1 || [];
  const penH2     = ls.pen_h2 || [];
  const hasPens   = penH1.length > 0 || penH2.length > 0;
  const penScore1 = penH1.filter(r => r === "H").length;
  const penScore2 = penH2.filter(r => r === "H").length;
  const penSlots  = Math.max(5, penH1.length, penH2.length);

  const fbHalf = ls.half;
  const phaseLabel = (() => {
    if (!fbHalf) return null;
    if (fbHalf >= 5) return "Penalties";
    if (fbHalf === 4) return "ET 2nd";
    if (fbHalf === 3) return "ET 1st";
    if (fbHalf === 2) return "2nd Half";
    return "1st Half";
  })();

  const score1 = m.player_1?.score ?? 0;
  const score2 = m.player_2?.score ?? 0;
  const p1Win  = m.player_1?.is_winner;
  const p2Win  = m.player_2?.is_winner;

  return (
    <div className={`mc${isLive ? " live" : ""}`} style={{ flexDirection:"column", gap:8 }}>
      {isLive && <div className="glow-bg"/>}
      {/* Main score row */}
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <RoundChip round={m.round} table={m.table_number} />

        {/* Team 1 */}
        <span style={{ flex:1, fontSize:13, fontWeight: p1Win ? 800 : 700, color: p1Win ? "#2563eb" : "var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textAlign:"right" }}>
          {m.player_1?.name || "TBD"}
        </span>

        {/* Central score block */}
        <div style={{ textAlign:"center", flexShrink:0, minWidth:60 }}>
          <div style={{ fontFamily:"var(--font-display)", fontSize: isLive || isDone ? 22 : 14, fontWeight:900, lineHeight:1, color: isLive ? "var(--primary)" : isDone ? "var(--ink)" : "var(--muted)" }}>
            {isLive || isDone ? `${score1}–${score2}` : "vs"}
          </div>
          {isLive && phaseLabel && (
            <div style={{ fontSize:8, fontWeight:800, color:"var(--muted)", textTransform:"uppercase", letterSpacing:0.5, marginTop:2 }}>{phaseLabel}</div>
          )}
        </div>

        {/* Team 2 */}
        <span style={{ flex:1, fontSize:13, fontWeight: p2Win ? 800 : 700, color: p2Win ? "#2563eb" : "var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {m.player_2?.name || "TBD"}
        </span>

        <div style={{ flexShrink:0, width:40, display:"flex", justifyContent:"flex-end" }}>
          <StatusPill isLive={isLive} isDone={isDone} />
        </div>
      </div>

      {/* Penalty shootout */}
      {hasPens && (
        <div style={{ padding:"8px 12px", background:"#0d1b2a", borderRadius:8, border:"1px solid #1e3a5f" }}>
          <div style={{ fontSize:9, fontWeight:800, textTransform:"uppercase", letterSpacing:1.5, color:"#3b82f6", marginBottom:6, textAlign:"center" }}>
            Penalty Shootout
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"center" }}>
            <div style={{ display:"flex", gap:3 }}>
              {Array.from({ length: penSlots }, (_, i) => <PenDot key={i} result={penH1[i]} />)}
            </div>
            <div style={{ fontFamily:"var(--font-display)", fontSize:15, fontWeight:900, color:"#fff", minWidth:36, textAlign:"center" }}>
              {penScore1}–{penScore2}
            </div>
            <div style={{ display:"flex", gap:3 }}>
              {Array.from({ length: penSlots }, (_, i) => <PenDot key={i} result={penH2[i]} />)}
            </div>
          </div>
          {isDone && (
            <div style={{ textAlign:"center", fontSize:10, color:"#3b82f6", fontWeight:700, marginTop:6 }}>
              {p1Win ? (m.player_1?.name||"Team 1") : (m.player_2?.name||"Team 2")} win on penalties
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Default match card (Badminton / Table Tennis) ─────────────
function DefaultCard({ m, sportKey }) {
  const isLive = m.status === "live";
  const isDone = m.status === "done";
  const ls     = m.live_state || {};
  const completedSets = (m.sets || [])
    .filter(s => s.is_complete)
    .sort((a, b) => a.set_number - b.set_number);

  const liveS1 = ls.score_p1 ?? 0;
  const liveS2 = ls.score_p2 ?? 0;
  const p1Win  = m.player_1?.is_winner;
  const p2Win  = m.player_2?.is_winner;
  const ac     = sAccent(sportKey);

  const SetChip = ({ val, isWinner, isLiveChip }) => (
    <span style={{
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      minWidth:24, height:22, borderRadius:4, fontSize:12, fontWeight:800,
      fontFamily:"var(--font-display)",
      background: isLiveChip ? "var(--primary-dim)" : isWinner ? ac.color : "var(--elevated)",
      color:      isLiveChip ? "var(--primary)"    : isWinner ? "#fff"    : "var(--muted)",
      border:     isLiveChip ? "1px solid rgba(255,107,53,0.4)" : "none",
    }}>
      {val}
    </span>
  );

  return (
    <div className={`mc${isLive ? " live" : ""}`} style={{ flexDirection:"column", gap:6 }}>
      {isLive && <div className="glow-bg"/>}
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <RoundChip round={m.round} table={m.table_number} />

        {/* Two-row player layout */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:4 }}>
          {/* Player 1 */}
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ flex:1, fontSize:13, fontWeight: p1Win ? 800 : 700, color: p1Win ? "var(--green)" : "var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {m.player_1?.name || "TBD"}
            </span>
            <div style={{ display:"flex", gap:3 }}>
              {completedSets.map(s => (
                <SetChip key={s.set_number} val={s.score_p1} isWinner={s.score_p1 > s.score_p2} />
              ))}
              {isLive && <SetChip val={liveS1} isLiveChip />}
            </div>
          </div>
          {/* Player 2 */}
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ flex:1, fontSize:13, fontWeight: p2Win ? 800 : 700, color: p2Win ? "var(--green)" : "var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {m.player_2?.name || "TBD"}
            </span>
            <div style={{ display:"flex", gap:3 }}>
              {completedSets.map(s => (
                <SetChip key={s.set_number} val={s.score_p2} isWinner={s.score_p2 > s.score_p1} />
              ))}
              {isLive && <SetChip val={liveS2} isLiveChip />}
            </div>
          </div>
        </div>

        <div style={{ flexShrink:0, display:"flex", alignItems:"center" }}>
          <StatusPill isLive={isLive} isDone={isDone} />
        </div>
      </div>
    </div>
  );
}

// ── Sport-aware match card dispatcher ─────────────────────────
function MatchCard({ match: m, sportKey }) {
  if (sportKey === "cricket")  return <CricketCard m={m} />;
  if (sportKey === "football") return <FootballCard m={m} />;
  return <DefaultCard m={m} sportKey={sportKey} />;
}

// BracketCard removed — bracket rendering handled by RoadToFinal component

// ── Section wrapper ───────────────────────────────────────────
function Section({ id, title, count, accent, children, wide, action }) {
  return (
    <section id={id} style={{ padding:"24px 20px 4px", scrollMarginTop:52 }}>
      <div style={{ maxWidth: wide ? 1280 : 640, margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, paddingBottom:12, borderBottom:"1px solid var(--border)" }}>
          <div style={{ width:3, height:20, borderRadius:2, background: accent || "var(--primary)", flexShrink:0 }}/>
          <h2 style={{ fontFamily:"var(--font-display)", fontSize:15, fontWeight:900, textTransform:"uppercase", letterSpacing:"-0.5px", color:"var(--ink)", flex:1, margin:0 }}>{title}</h2>
          {count > 0 && <span style={{ fontFamily:"var(--font-display)", fontSize:9, fontWeight:900, color:"var(--muted)", background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:10, padding:"2px 8px" }}>{count}</span>}
          {action}
        </div>
        {children}
      </div>
    </section>
  );
}

// ── Tournament hero ───────────────────────────────────────────
function TournamentHero({ tournament, liveCount, totalPlayers, doneMatches, totalMatches, sportKey, darkMode, onToggleDark }) {
  const sc = STATUS_CFG[tournament.status] || STATUS_CFG.draft;
  const isLive = tournament.status === "live";
  const sportIcon = SPORT_META[sportKey]?.icon;
  const sportLabel = SPORT_META[sportKey]?.label;

  const stCfg = ({
    live:         { label:"Live Now",           bg:"var(--primary-dim)",    c:"var(--primary)",  b:"rgba(255,107,53,.25)", dot:true  },
    registration: { label:"Registration Open",  bg:"rgba(22,163,74,.1)",    c:"#16a34a",          b:"rgba(22,163,74,.25)",  dot:false },
    completed:    { label:"Completed",          bg:"var(--elevated)",       c:"var(--muted)",    b:"var(--border)",         dot:false },
    draft:        { label:"Coming Soon",        bg:"var(--elevated)",       c:"var(--muted)",    b:"var(--border)",         dot:false },
    fixtures:     { label:"Fixtures Set",       bg:"rgba(37,99,235,.1)",    c:"#2563eb",          b:"rgba(37,99,235,.25)",  dot:false },
  })[tournament.status] || { label:sc.label, bg:"var(--elevated)", c:"var(--muted)", b:"var(--border)", dot:false };

  const metaParts = [tournament.venue, tournament.city ? `${tournament.city}${tournament.state ? `, ${tournament.state}` : ""}` : null, tournament.start_date].filter(Boolean);

  return (
    <div style={{ background:"linear-gradient(160deg, rgba(var(--accent-rgb),.07) 0%, var(--bg) 55%)", borderBottom:"1px solid var(--border)", position:"relative", overflow:"hidden" }}>
      {/* Accent radial glow */}
      <div style={{ position:"absolute", top:-100, right:-60, width:380, height:380, borderRadius:"50%", background:"radial-gradient(circle, rgba(var(--accent-rgb),.14) 0%, transparent 65%)", pointerEvents:"none" }}/>

      <div style={{ maxWidth:640, margin:"0 auto", padding:"18px 20px 22px", position:"relative" }}>
        {/* Top row: TheScoreBoard brand + dark mode toggle */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <span style={{ fontFamily:"var(--font-display)", fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:2, lineHeight:1 }}>
            <span style={{ color:"var(--primary)" }}>The</span><span style={{ color:"var(--ink)" }}>Score</span><span style={{ color:"var(--primary)" }}>Board</span>
          </span>
          <button
            onClick={onToggleDark}
            style={{ background:"none", border:"1px solid var(--border)", borderRadius:6, width:32, height:32, cursor:"pointer", color:"var(--ink)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}
          >
            {!darkMode ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            )}
          </button>
        </div>

        {/* Status + sport pills */}
        <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
          <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:stCfg.bg, color:stCfg.c, fontFamily:"var(--font-display)", fontSize:9, fontWeight:900, textTransform:"uppercase", letterSpacing:2, padding:"4px 11px", borderRadius:20, border:`1px solid ${stCfg.b}` }}>
            {stCfg.dot && <span className="live-dot" style={{ width:6, height:6, background:"var(--primary)" }}/>}
            {stCfg.label}
          </span>
          {sportIcon && sportLabel && (
            <span style={{ display:"inline-flex", alignItems:"center", gap:4, background:"var(--accent-dim)", color:"var(--accent)", fontFamily:"var(--font-display)", fontSize:9, fontWeight:900, textTransform:"uppercase", letterSpacing:1, padding:"4px 11px", borderRadius:20, border:"1px solid var(--accent-border)" }}>
              {sportIcon} {sportLabel}
            </span>
          )}
        </div>

        {/* Tournament name */}
        <h1 style={{ fontFamily:"var(--font-display)", fontSize:26, fontWeight:900, textTransform:"uppercase", letterSpacing:"-1.5px", color:"var(--ink)", lineHeight:1.05, marginBottom:12 }}>
          {tournament.name}
        </h1>

        {/* Meta: venue · city · dates */}
        {metaParts.length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", fontSize:12, color:"var(--muted)", marginBottom:18, fontWeight:500 }}>
            {metaParts.map((item, i) => (
              <span key={i} style={{ display:"inline-flex", alignItems:"center" }}>
                {i > 0 && <span style={{ margin:"0 8px", color:"var(--subtle)" }}>·</span>}
                {item}
              </span>
            ))}
            {tournament.end_date && tournament.end_date !== tournament.start_date && (
              <span style={{ display:"inline-flex", alignItems:"center" }}>
                <span style={{ margin:"0 8px", color:"var(--subtle)" }}>→</span>
                {tournament.end_date}
              </span>
            )}
          </div>
        )}

        {tournament.description && (
          <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.6, marginBottom:16, maxWidth:540 }}>
            {tournament.description}
          </p>
        )}

        {/* Stat chips */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {totalPlayers > 0 && (
            <div style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:20, padding:"5px 14px", display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ fontFamily:"var(--font-display)", fontSize:14, fontWeight:900, color:"var(--ink)", lineHeight:1 }}>{totalPlayers}</span>
              <span style={{ fontSize:11, color:"var(--muted)", fontWeight:500 }}>Players</span>
            </div>
          )}
          {totalMatches > 0 && (
            <div style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:20, padding:"5px 14px", display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ fontFamily:"var(--font-display)", fontSize:14, fontWeight:900, color:"var(--ink)", lineHeight:1 }}>{doneMatches}/{totalMatches}</span>
              <span style={{ fontSize:11, color:"var(--muted)", fontWeight:500 }}>Matches</span>
            </div>
          )}
          {liveCount > 0 && (
            <div style={{ background:"var(--primary-dim)", border:"1px solid rgba(255,107,53,.2)", borderRadius:20, padding:"5px 14px", display:"flex", alignItems:"center", gap:6 }}>
              <span className="live-dot" style={{ width:6, height:6, background:"var(--primary)" }}/>
              <span style={{ fontFamily:"var(--font-display)", fontSize:14, fontWeight:900, color:"var(--primary)", lineHeight:1 }}>{liveCount}</span>
              <span style={{ fontSize:11, color:"var(--primary)", fontWeight:600 }}>Live Now</span>
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
    <div style={{ background:"var(--surface)", borderBottom:"1px solid var(--border)", position:"sticky", top:0, zIndex:100, boxShadow:"0 2px 12px rgba(0,0,0,.07)" }}>
      <div style={{ overflowX:"auto", scrollbarWidth:"none", display:"flex", gap:4, padding:"8px 16px", maxWidth:640, margin:"0 auto" }}>
        {sections.map(s => {
          const active = activeId === s.id;
          return (
            <button key={s.id} onClick={() => onNav(s.id)} style={{
              padding:"7px 14px", borderRadius:20, border:"none",
              background: active ? "var(--primary)" : "var(--elevated)",
              color: active ? "#fff" : "var(--muted)",
              fontFamily:"var(--font-display)", fontSize:9, fontWeight:900,
              textTransform:"uppercase", letterSpacing:1.5,
              cursor:"pointer", whiteSpace:"nowrap", flexShrink:0,
              transition:"background .15s, color .15s",
              display:"flex", alignItems:"center", gap:5,
            }}>
              {s.label}
              {s.count != null && s.count > 0 && (
                <span style={{ background: active ? "rgba(255,255,255,.25)" : "var(--border-mid)", borderRadius:10, padding:"1px 5px", fontSize:9, fontWeight:900, minWidth:16, textAlign:"center" }}>
                  {s.count}
                </span>
              )}
            </button>
          );
        })}
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
    <Section id="register" title="Register Now" accent="var(--accent)">
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
  const multiEvent = events.length > 1;
  // Flatten all matches, tagging each with sport_key and event name
  const allMatches = events.flatMap(ev =>
    (ev.all_matches || []).map(m => ({ ...m, sport_key: ev.sport_key, _eventName: ev.name }))
  );
  const live     = allMatches.filter(m => m.status === "live");
  const upcoming = allMatches.filter(m => m.status !== "live" && m.status !== "done");
  const done     = allMatches.filter(m => m.status === "done");

  const statsItems = [
    { label:"Total",    val: allMatches.length, c:"var(--muted)"   },
    { label:"Live",     val: live.length,        c:"var(--primary)" },
    { label:"Done",     val: done.length,        c:"var(--green)"   },
    { label:"Upcoming", val: upcoming.length,    c:"var(--muted)"   },
  ].filter(s => s.val > 0);

  return (
    <Section id="fixtures" title="Fixtures" count={allMatches.length}>
      {/* Stats strip */}
      <div style={{ display:"flex", gap:6, marginBottom:20, flexWrap:"wrap" }}>
        {statsItems.map(s => (
          <div key={s.label} style={{ background:"var(--elevated)", border:"1px solid var(--border)", borderRadius:10, padding:"6px 12px", textAlign:"center" }}>
            <div style={{ fontFamily:"var(--font-display)", fontSize:17, fontWeight:900, color:s.c, lineHeight:1 }}>{s.val}</div>
            <div style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:1, color:"var(--muted)", marginTop:3 }}>{s.label}</div>
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
        <>
          {live.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10, fontFamily:"var(--font-display)", fontSize:9, fontWeight:900, textTransform:"uppercase", letterSpacing:2, color:"var(--primary)" }}>
                <span className="live-dot" style={{ width:7, height:7, background:"var(--primary)" }}/>Live Now
              </div>
              {live.map(m => (
                <div key={m.match_id}>
                  {multiEvent && <div style={{ fontSize:9, color:"var(--muted)", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:3, paddingLeft:2 }}>{m._eventName}</div>}
                  <MatchCard match={m} sportKey={m.sport_key} />
                </div>
              ))}
            </div>
          )}
          {upcoming.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:9, fontWeight:800, textTransform:"uppercase", letterSpacing:2, color:"var(--muted)", marginBottom:10, fontFamily:"var(--font-display)" }}>Upcoming</div>
              {upcoming.map(m => (
                <div key={m.match_id}>
                  {multiEvent && <div style={{ fontSize:9, color:"var(--muted)", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:3, paddingLeft:2 }}>{m._eventName}</div>}
                  <MatchCard match={m} sportKey={m.sport_key} />
                </div>
              ))}
            </div>
          )}
          {done.length > 0 && (
            <div style={{ marginBottom:4 }}>
              <div style={{ fontSize:9, fontWeight:800, textTransform:"uppercase", letterSpacing:2, color:"var(--muted)", marginBottom:10, fontFamily:"var(--font-display)" }}>Completed</div>
              {done.map(m => (
                <div key={m.match_id}>
                  {multiEvent && <div style={{ fontSize:9, color:"var(--muted)", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:3, paddingLeft:2 }}>{m._eventName}</div>}
                  <MatchCard match={m} sportKey={m.sport_key} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ── Leaderboard section ───────────────────────────────────────
const RANK_COLORS = ["#f59e0b", "#94a3b8", "#b45309"];
function LeaderboardSection({ events }) {
  const relevant = events.filter(ev => ev.format === "round_robin" || ev.format === "group_knockout");
  if (!relevant.length) return null;

  return (
    <Section id="leaderboard" title="Standings">
      {relevant.map(ev => {
        const rows   = computeStandings(ev);
        const isGK   = ev.format === "group_knockout";
        const sp     = ev.sport_key;
        const isFootball = sp === "football";
        const isCricket  = sp === "cricket";

        return (
          <div key={ev.event_id} style={{ marginBottom:20 }}>
            {relevant.length > 1 && (
              <div style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:1, color:"var(--muted)", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
                {SPORT_META[sp]?.icon} {ev.name}
              </div>
            )}

            {rows.length === 0 ? (
              <div style={{ textAlign:"center", padding:"28px 0", color:"var(--muted)", fontSize:13 }}>No matches played yet.</div>
            ) : (
              <>
                <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, overflow:"hidden", boxShadow:"var(--sh-sm)" }}>
                  {rows.map((row, i) => {
                    const advances = isGK && i < 2;
                    const rc       = RANK_COLORS[i] || "var(--muted)";
                    const prog     = row.p > 0 ? row.w / row.p : 0;
                    const sec      = isCricket ? row.nrr : isFootball ? `${row.sf}–${row.sa}` : null;
                    return (
                      <div key={row.name} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none", background: advances ? "rgba(22,163,74,.03)" : "transparent" }}>
                        {/* Rank */}
                        <div style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:900, color:rc, minWidth:28, textAlign:"center", lineHeight:1, flexShrink:0 }}>{i + 1}</div>
                        {/* Name + progress bar */}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:"var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginBottom:6 }}>
                            {advances && <span style={{ color:"var(--green)", marginRight:4, fontSize:9 }}>▲</span>}
                            {row.name}
                          </div>
                          <div style={{ height:3, borderRadius:2, background:"var(--elevated)", overflow:"hidden" }}>
                            <div style={{ height:"100%", width:`${Math.max(5, prog * 100)}%`, background:"linear-gradient(90deg, var(--accent), var(--primary))", borderRadius:2 }} />
                          </div>
                        </div>
                        {/* Points + record */}
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          <div style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:900, color:"var(--ink)", lineHeight:1, display:"flex", alignItems:"baseline", gap:3, justifyContent:"flex-end" }}>
                            {row.pts}<span style={{ fontSize:9, color:"var(--muted)", fontWeight:700 }}>pts</span>
                          </div>
                          <div style={{ fontSize:10, color:"var(--muted)", marginTop:3 }}>
                            {row.p}P · {row.w}W · {row.l}L{row.d > 0 ? ` · ${row.d}D` : ""}{sec ? ` · ${sec}` : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {isGK && rows.length >= 2 && (
                  <p style={{ fontSize:11, color:"var(--muted)", marginTop:8, paddingLeft:4 }}>
                    <span style={{ color:"var(--green)" }}>▲</span> Top 2 advance to knockout stage
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
  const [darkMode,    setDarkMode]    = useState(
    () => (localStorage.getItem("theme") || "light") === "dark"
  );
  const fetchingRef = useRef(false);

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const d = sportUrl
        ? await getSportTournament(sportUrl, slug)
        : await getTournamentBySlug(slug);
      setData(d);
      setLastUpdated(new Date());
    } catch(e) {
      setError(e.message || "Tournament not found.");
    } finally {
      fetchingRef.current = false;
    }
  }, [slug, sportUrl]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Apply sport accent when data first loads
  useEffect(() => {
    if (!data) return;
    const firstSportKey = data.events?.[0]?.sport_key;
    if (firstSportKey) applyAccent(firstSportKey);
  }, [data]);

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

  const primarySportKey = events[0]?.sport_key;

  if (status === "draft") return (
    <div className="app">
      <TournamentHero tournament={t} liveCount={0} totalPlayers={0} doneMatches={0} totalMatches={0} sportKey={primarySportKey} darkMode={darkMode} onToggleDark={toggleDark} />
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
        sportKey={primarySportKey}
        darkMode={darkMode}
        onToggleDark={toggleDark}
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
