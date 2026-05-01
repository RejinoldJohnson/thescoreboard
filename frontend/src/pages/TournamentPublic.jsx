import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getTournamentBySlug, getSportTournament } from "../api/client";

const POLL_MS   = 8000;
const API_BASE  = import.meta.env.VITE_API_URL || "/api";

// ── Sport meta ────────────────────────────────────────────────
const SPORT_META = {
  table_tennis: { icon: "🏓", label: "Table Tennis" },
  badminton:    { icon: "🏸", label: "Badminton"    },
  cricket:      { icon: "🏏", label: "Cricket"      },
  football:     { icon: "⚽", label: "Football"     },
};
const si = (k) => SPORT_META[k]?.icon  || "🏅";
const sl = (k) => SPORT_META[k]?.label || k;

// ── Registration rule engine ──────────────────────────────────
// Central mapping — no scattered if-else throughout the UI.
// "individual"   → single-player form
// "doubles_pair" → 2-player pair form
// "team"         → team sport, contact organiser
function getRegMode(event) {
  const pt = event?.participant_type || "individual";
  if (pt === "team")         return "team";
  if (pt === "doubles_pair") return "doubles";
  return "individual";
}

// ── API helpers ───────────────────────────────────────────────
async function apiPost(path, body) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Request failed"); }
  return r.json();
}

const registerIndividual = (tournamentId, payload) =>
  apiPost(`/public/tournaments/${tournamentId}/register`, payload);

const registerPair = (tournamentId, payload) =>
  apiPost(`/public/tournaments/${tournamentId}/register-team`, payload);

// ── Sub-components ────────────────────────────────────────────

// Public page header
function PubHeader({ tournament }) {
  const navigate = useNavigate();
  const statusMap = {
    draft:        { label: "Draft",             cls: "pub-pill pub-pill-gray"   },
    registration: { label: "Registration Open", cls: "pub-pill pub-pill-green"  },
    fixtures:     { label: "Fixtures",          cls: "pub-pill pub-pill-blue"   },
    live:         { label: "Live Now",          cls: "pub-pill pub-pill-orange" },
    completed:    { label: "Completed",         cls: "pub-pill pub-pill-gray"   },
  };
  const sc = statusMap[tournament.status] || statusMap.draft;

  return (
    <div style={{ background: "var(--surface)", borderBottom: "2px solid var(--border)" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "18px 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span
            style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: "var(--primary)", cursor: "pointer" }}
            onClick={() => navigate("/")}
          >
            TheScoreBoard
          </span>
          <span style={{ color: "var(--border-mid)", fontSize: 12 }}>›</span>
          {tournament.org_name && (
            <span style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>
              {tournament.org_name}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 900, textTransform: "uppercase", letterSpacing: -0.5, color: "var(--ink)", lineHeight: 1.2, flex: 1, margin: 0 }}>
            {tournament.name}
          </h1>
          <span className={sc.cls} style={{ flexShrink: 0, marginTop: 2 }}>{sc.label}</span>
        </div>

        {(tournament.city || tournament.start_date || tournament.venue) && (
          <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap", fontSize: 12, color: "var(--muted)" }}>
            {tournament.city && (
              <span>📍 {tournament.city}{tournament.state ? `, ${tournament.state}` : ""}</span>
            )}
            {tournament.start_date && <span>📅 {tournament.start_date}</span>}
            {tournament.venue && <span>🏟️ {tournament.venue}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// Draft / coming-soon screen
function DraftView({ tournament }) {
  return (
    <div style={{ maxWidth: 480, margin: "72px auto", padding: "0 24px", textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 20 }}>🏗️</div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900, textTransform: "uppercase", letterSpacing: -1, marginBottom: 12 }}>
        Coming Soon
      </h2>
      <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.7, marginBottom: 28 }}>
        <strong style={{ color: "var(--ink)" }}>{tournament.name}</strong> is still being set up. Check back soon.
      </p>
      {tournament.org_name && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 16px", fontSize: 13, color: "var(--muted)" }}>
          Organised by <strong style={{ color: "var(--ink)" }}>{tournament.org_name}</strong>
        </div>
      )}
    </div>
  );
}

// Shared back + event header used by all registration forms
function FormHeader({ event, subtitle, onBack }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
      <button
        onClick={onBack}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 22, padding: "0 2px", lineHeight: 1 }}
      >←</button>
      <div style={{ fontSize: 28, lineHeight: 1 }}>{si(event.sport_key)}</div>
      <div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: -0.5, color: "var(--ink)" }}>
          {event.name}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>{subtitle}</div>
      </div>
    </div>
  );
}

// Individual registration form
function IndividualForm({ event, tournament, onSuccess, onBack }) {
  const [form,    setForm]    = useState({ name: "", phone: "", age: "", gender: "Male" });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handleSubmit = async () => {
    if (!form.name.trim())  return setError("Name is required.");
    if (!form.phone.trim()) return setError("Phone number is required.");
    setLoading(true); setError("");
    try {
      await registerIndividual(tournament.tournament_id, {
        name:      form.name.trim(),
        phone:     form.phone.trim(),
        age:       parseInt(form.age) || null,
        gender:    form.gender,
        event_ids: [event.event_id],
      });
      onSuccess(form.name.trim());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
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
      <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>
        Your details are only used for this tournament.
      </p>
      <button className="btn btn-gradient btn-lg" style={{ width: "100%" }}
        onClick={handleSubmit} disabled={loading}>
        {loading ? "Registering…" : "Register →"}
      </button>
    </div>
  );
}

// Doubles pair registration form (TT Doubles, Badminton Doubles / Mixed)
function DoublesForm({ event, tournament, onSuccess, onBack }) {
  const isMixed = event.sport_config?.mixed;
  const [form,    setForm]    = useState({ p1: "", p2: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const handleSubmit = async () => {
    if (!form.p1.trim()) return setError(`${isMixed ? "Male player" : "Player 1"} name is required.`);
    if (!form.p2.trim()) return setError(`${isMixed ? "Female player" : "Player 2"} name is required.`);
    if (form.p1.trim().toLowerCase() === form.p2.trim().toLowerCase())
      return setError("Both players must be different people.");
    setLoading(true); setError("");
    try {
      await registerPair(tournament.tournament_id, {
        name:          `${form.p1.trim()} & ${form.p2.trim()}`,
        contact_phone: form.phone.trim() || "",
        sport_key:     event.sport_key,
        event_id:      event.event_id,
        members: [
          { name: form.p1.trim(), role: isMixed ? "male"   : "player1" },
          { name: form.p2.trim(), role: isMixed ? "female" : "player2" },
        ],
      });
      onSuccess(`${form.p1.trim()} & ${form.p2.trim()}`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const subtitle = isMixed ? "Mixed Doubles Registration" : "Doubles Pair Registration";

  return (
    <div>
      <FormHeader event={event} subtitle={subtitle} onBack={onBack} />
      {error && <div className="pub-error">{error}</div>}

      <div style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
        Enter both partners. The organiser will confirm and seed the draw.
      </div>

      {/* Player 1 card */}
      <div style={{ border: "2px solid var(--border)", borderLeft: "4px solid var(--primary)", borderRadius: 8, padding: "14px 16px", marginBottom: 10, background: "var(--surface)" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: "var(--primary)", marginBottom: 10 }}>
          {isMixed ? "Male Player *" : "Player 1 *"}
        </div>
        <input className="input" autoFocus placeholder="Full name"
          value={form.p1} onChange={e => setForm(f => ({ ...f, p1: e.target.value }))} />
      </div>

      {/* Player 2 card */}
      <div style={{ border: "2px solid var(--border)", borderLeft: "4px solid #92700A", borderRadius: 8, padding: "14px 16px", marginBottom: 14, background: "var(--surface)" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: "#92700A", marginBottom: 10 }}>
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

      <button className="btn btn-gradient btn-lg" style={{ width: "100%" }}
        onClick={handleSubmit} disabled={loading}>
        {loading ? "Registering…" : "Register Pair →"}
      </button>
    </div>
  );
}

// Team sport — direct self-registration not supported; show organiser contact info
function TeamInfo({ event, onBack }) {
  return (
    <div>
      <FormHeader event={event} subtitle="Team Sport" onBack={onBack} />
      <div style={{ textAlign: "center", padding: "28px 0" }}>
        <div style={{ fontSize: 52, marginBottom: 14 }}>{si(event.sport_key)}</div>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 900, textTransform: "uppercase", letterSpacing: -0.5, marginBottom: 10 }}>
          Team Registration
        </h3>
        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, maxWidth: 300, margin: "0 auto 20px" }}>
          Team registrations for <strong style={{ color: "var(--ink)" }}>{sl(event.sport_key)}</strong> are managed by the organiser. Contact them to register your team.
        </p>
        <div style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 18px", display: "inline-block", fontSize: 13, color: "var(--muted)" }}>
          📋 Contact the organiser to register your team
        </div>
      </div>
    </div>
  );
}

// Success confirmation screen
function SuccessView({ name, event, onBack }) {
  return (
    <div style={{ textAlign: "center", padding: "36px 0" }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900, textTransform: "uppercase", letterSpacing: -1, color: "var(--primary)", marginBottom: 10 }}>
        You're In!
      </div>
      <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.7, marginBottom: 24 }}>
        <strong style={{ color: "var(--ink)" }}>{name}</strong> has been registered for{" "}
        <strong style={{ color: "var(--ink)" }}>{event?.name}</strong>.
      </p>
      <div style={{ background: "var(--primary-dim)", border: "1px solid rgba(255,107,53,0.3)", borderRadius: 8, padding: "12px 18px", marginBottom: 20, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--primary)" }}>
        📲 Share this page with other participants!
      </div>
      <button className="btn btn-outline" onClick={onBack}>← Register Someone Else</button>
    </div>
  );
}

// Event card shown in the sport-browse phase
function EventCard({ event, onClick }) {
  const mode = getRegMode(event);
  const modeLabel = { team: "Team Sport", doubles: "Doubles Pair", individual: "Individual" }[mode];
  const modeCls   = { team: "pub-pill pub-pill-blue", doubles: "pub-pill pub-pill-orange", individual: "pub-pill pub-pill-green" }[mode];

  return (
    <div className="pub-event-card" onClick={onClick}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 12,
          background: "var(--primary-dim)", border: "1px solid rgba(255,107,53,.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26, flexShrink: 0,
        }}>
          {si(event.sport_key)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: -0.5, color: "var(--ink)", marginBottom: 6 }}>
            {event.name}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span className={modeCls}>{modeLabel}</span>
            {event.format && (
              <span className="pub-pill pub-pill-gray">
                {event.format.replace(/_/g, " ")}
              </span>
            )}
          </div>
        </div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--primary)", flexShrink: 0 }}>›</div>
      </div>
    </div>
  );
}

// Registration hub: browse → form → success state machine
function RegistrationHub({ events, tournament }) {
  const [phase,   setPhase]   = useState("browse");   // "browse" | "form" | "success"
  const [selEvt,  setSelEvt]  = useState(null);
  const [regName, setRegName] = useState("");

  // Only show events that are fully configured (not a blank shell from multi-sport creation)
  const open = events.filter(ev => ev.is_configured !== false);

  const selectEvent = (ev) => { setSelEvt(ev); setPhase("form"); };
  const handleSuccess = (name) => { setRegName(name); setPhase("success"); };
  const handleBack    = () => { setPhase("browse"); setSelEvt(null); };

  if (phase === "success") {
    return <SuccessView name={regName} event={selEvt} onBack={handleBack} />;
  }

  if (phase === "form" && selEvt) {
    const mode = getRegMode(selEvt);
    if (mode === "team")    return <TeamInfo     event={selEvt} onBack={handleBack} />;
    if (mode === "doubles") return <DoublesForm  event={selEvt} tournament={tournament} onSuccess={handleSuccess} onBack={handleBack} />;
    return                         <IndividualForm event={selEvt} tournament={tournament} onSuccess={handleSuccess} onBack={handleBack} />;
  }

  // Browse phase
  if (open.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">📋</div>
        <div className="empty-title">Registration Not Open</div>
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
          No events are currently open for registration.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)", marginBottom: 12 }}>
        {open.length} event{open.length !== 1 ? "s" : ""} open — select to register
      </div>
      {open.map(ev => <EventCard key={ev.event_id} event={ev} onClick={() => selectEvent(ev)} />)}
    </div>
  );
}

// Single match row — preserves existing API field names (player_1, player_2, sets)
function MatchRow({ match: m }) {
  const isLive = m.status === "live";
  const isDone = m.status === "done" || m.status === "completed";
  const sets   = m.sets || [];

  return (
    <div className={`match-row${isLive ? " live" : ""}`} style={{ flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
        {/* Round badge */}
        {m.round != null && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 36, flexShrink: 0 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, background: "var(--primary-dim)", color: "var(--primary)", padding: "2px 6px", borderRadius: 3 }}>
              R{m.round}
            </span>
            {m.table_number && (
              <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, marginTop: 2 }}>T{m.table_number}</span>
            )}
          </div>
        )}

        {/* Players + score */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <span className={`match-pname${m.player_1?.is_winner ? " winner" : ""}`}>
            {m.current_server === 1 && isLive ? "🏓 " : ""}{m.player_1?.name || m.team1_name || "TBD"}
          </span>
          <span className={`match-score ${isLive ? "live-score" : isDone ? "done-score" : "vs-score"}`}>
            {isLive || isDone
              ? `${m.player_1?.score ?? m.score_a ?? 0}–${m.player_2?.score ?? m.score_b ?? 0}`
              : "vs"}
          </span>
          <span className={`match-pname right${m.player_2?.is_winner ? " winner" : ""}`}>
            {m.player_2?.name || m.team2_name || "TBD"}{m.current_server === 2 && isLive ? " 🏓" : ""}
          </span>
        </div>

        {/* Status pill */}
        {isLive && <span className="pill pill-orange"><span className="live-dot" style={{ width: 6, height: 6 }} />LIVE</span>}
        {isDone  && <span className="pill pill-green">FT</span>}
      </div>

      {/* Set chips */}
      {sets.length > 0 && (isLive || isDone) && (
        <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
          {sets.map(s => (
            <span key={s.set_number} style={{
              fontSize: 11, padding: "2px 7px", borderRadius: 3, fontWeight: 700,
              fontFamily: "var(--font-display)",
              background: s.is_complete ? "var(--primary-dim)" : "var(--gold-dim)",
              color:      s.is_complete ? "var(--primary)"     : "#92700A",
            }}>
              S{s.set_number}: {s.score_p1}-{s.score_p2}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Matches view — stats strip + per-event match lists
function MatchesView({ events }) {
  const allMatches = events.flatMap(ev => ev.all_matches || ev.matches || []);
  const liveCt     = allMatches.filter(m => m.status === "live").length;
  const doneCt     = allMatches.filter(m => m.status === "done" || m.status === "completed").length;
  const upcomingCt = allMatches.filter(m => m.status !== "live" && m.status !== "done" && m.status !== "completed").length;

  if (allMatches.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">🎯</div>
        <div className="empty-title">No Fixtures Yet</div>
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>Fixtures will appear once the tournament starts.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Stats strip */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Total",    val: allMatches.length, color: "var(--muted)"    },
          { label: "Live",     val: liveCt,            color: "var(--primary)"  },
          { label: "Done",     val: doneCt,            color: "var(--green)"    },
          { label: "Upcoming", val: upcomingCt,        color: "var(--muted)"    },
        ].map(s => (
          <div key={s.label} style={{ background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 10, padding: "10px 16px", textAlign: "center", minWidth: 72 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {events.map(ev => {
        const matches = ev.all_matches || ev.matches || [];
        if (!matches.length) return null;
        return (
          <div key={ev.event_id} style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 900, textTransform: "uppercase", letterSpacing: -0.5, color: "var(--ink)" }}>
                {si(ev.sport_key)} {ev.name}
              </span>
              {ev.live_matches?.length > 0 && (
                <span className="pill pill-orange">🔴 {ev.live_matches.length} Live</span>
              )}
              <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
                {ev.completed_matches ?? doneCt}/{ev.total_matches ?? matches.length} done
              </span>
            </div>
            {matches.map(m => <MatchRow key={m.match_id} match={m} />)}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function TournamentPublic() {
  const { slug, sportUrl } = useParams();
  const navigate = useNavigate();

  const [data,        setData]        = useState(null);
  const [error,       setError]       = useState(null);
  const [tab,         setTab]         = useState("register");
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const d = sportUrl
        ? await getSportTournament(sportUrl, slug)
        : await getTournamentBySlug(slug);
      setData(d);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e.message || "Tournament not found.");
    }
  }, [slug, sportUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Only poll when there are live matches
  useEffect(() => {
    if (!data) return;
    const allMatches = data.events?.flatMap(ev => ev.all_matches || ev.matches || []) || [];
    const hasLive = allMatches.some(m => m.status === "live");
    if (!hasLive) return;
    const id = setInterval(fetchData, POLL_MS);
    return () => clearInterval(id);
  }, [data, fetchData]);

  // Loading
  if (!data && !error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 3, color: "var(--muted)" }}>
        Loading…
      </div>
    </div>
  );

  // Error
  if (error) return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <div className="auth-logo">The<span className="accent">Score</span>Board</div>
        <div style={{ fontSize: 40, margin: "20px 0 12px" }}>😕</div>
        <p style={{ color: "var(--muted)", marginBottom: 20, fontSize: 14 }}>{error}</p>
        <button className="btn btn-primary" onClick={() => navigate("/")}>Go Home</button>
      </div>
    </div>
  );

  const { tournament: t, events = [] } = data;
  const status = t.status || "draft";

  const allMatches     = events.flatMap(ev => ev.all_matches || ev.matches || []);
  const liveMatches    = events.flatMap(ev => ev.live_matches || []);
  const liveCt         = liveMatches.length || allMatches.filter(m => m.status === "live").length;

  // Only show register tab if not draft/completed and there are configured events
  const registrableEvents = events.filter(ev => ev.is_configured !== false);
  const showRegTab = !["draft", "completed"].includes(status) && registrableEvents.length > 0;

  // Tabs
  const tabs = [
    ...(showRegTab ? [{ key: "register", label: "Register" }] : []),
    { key: "matches", label: allMatches.length > 0 ? `Matches (${allMatches.length})` : "Matches" },
  ];

  // Default to a valid tab
  const activeTab = tabs.find(t => t.key === tab)?.key || tabs[0]?.key || "matches";

  if (status === "draft") return (
    <div className="app">
      <PubHeader tournament={t} />
      <DraftView tournament={t} />
    </div>
  );

  return (
    <div className="app">
      <PubHeader tournament={t} />

      {/* Live banner */}
      {liveCt > 0 && (
        <div style={{ background: "var(--primary)", color: "#fff", padding: "10px 24px", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="live-badge" style={{ background: "rgba(0,0,0,0.2)", border: "none", flexShrink: 0 }}>
            <span className="live-dot" />LIVE
          </span>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800, letterSpacing: 1 }}>
            {liveCt} match{liveCt !== 1 ? "es" : ""} in progress
          </span>
        </div>
      )}

      {/* Tab bar */}
      {tabs.length > 1 && (
        <div className="tabs" style={{ position: "sticky", top: 0, zIndex: 100 }}>
          {tabs.map(tb => (
            <button key={tb.key} className={`tab${activeTab === tb.key ? " active" : ""}`}
              onClick={() => setTab(tb.key)}>
              {tb.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 20px" }}>
        {activeTab === "register" && (
          <RegistrationHub events={events} tournament={t} />
        )}
        {activeTab === "matches" && (
          <MatchesView events={events} />
        )}
      </div>

      <footer style={{ textAlign: "center", padding: "20px 24px", color: "var(--subtle)", fontSize: 12, borderTop: "1px solid var(--border)" }}>
        Powered by TheScoreBoard
        {liveCt > 0 && " · Auto-refreshing"}
        {lastUpdated && ` · ${lastUpdated.toLocaleTimeString()}`}
      </footer>
    </div>
  );
}
