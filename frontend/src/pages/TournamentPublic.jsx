import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getTournamentBySlug, getSportTournament } from "../api/client";

const POLL_INTERVAL = 5000;
const API_BASE = import.meta.env.VITE_API_URL || "/api";

async function registerForTournament(tournamentId, formData) {
  const res = await fetch(`${API_BASE}/public/tournaments/${tournamentId}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Registration failed");
  }
  return res.json();
}

// ── Draft view ────────────────────────────────────────────────
function DraftView({ tournament }) {
  return (
    <div style={{ maxWidth:520, margin:"64px auto", padding:"0 24px", textAlign:"center" }}>
      <div style={{ fontSize:52, marginBottom:16 }}>🏗️</div>
      <div style={{ fontFamily:"var(--font-display)", fontSize:26, fontWeight:900, textTransform:"uppercase", letterSpacing:-1, marginBottom:10 }}>
        Tournament Not Yet Live
      </div>
      <p style={{ fontSize:14, color:"var(--muted)", lineHeight:1.7, marginBottom:24 }}>
        <strong style={{ color:"var(--ink)" }}>{tournament.name}</strong> is being set up. Check back soon.
      </p>
      <div style={{
        background:"var(--gold-dim)", border:"1px solid rgba(255,204,0,0.3)",
        borderRadius:8, padding:"12px 18px",
        fontFamily:"var(--font-display)", fontSize:11, fontWeight:700,
        textTransform:"uppercase", letterSpacing:1, color:"var(--gold)",
      }}>
        📢 Registration opening soon
      </div>
      {tournament.org_name && (
        <p style={{ marginTop:24, fontSize:13, color:"var(--muted)" }}>
          Organized by <strong style={{ color:"var(--ink)" }}>{tournament.org_name}</strong>
        </p>
      )}
    </div>
  );
}

// ── Registration view ─────────────────────────────────────────
function RegistrationView({ tournament, events }) {
  const [form,     setForm]     = useState({ name:"", phone:"", age:"", gender:"Male" });
  const [eventIds, setEventIds] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState(false);
  const [error,    setError]    = useState("");

  useEffect(() => { if (events.length === 1) setEventIds([events[0].event_id]); }, [events]);

  const toggleEvent = (id) => setEventIds(p => p.includes(id) ? p.filter(x=>x!==id) : [...p, id]);

  const handleSubmit = async () => {
    if (!form.name.trim())     return setError("Name is required.");
    if (!form.phone.trim())    return setError("Phone number is required.");
    if (!eventIds.length)      return setError("Select at least one event.");
    setLoading(true); setError("");
    try {
      await registerForTournament(tournament.tournament_id, {
        name: form.name.trim(), phone: form.phone.trim(),
        age: parseInt(form.age)||null, gender: form.gender, event_ids: eventIds,
      });
      setSuccess(true);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (success) return (
    <div style={{ maxWidth:480, margin:"64px auto", padding:"0 24px", textAlign:"center" }}>
      <div style={{ fontSize:52, marginBottom:16 }}>🎉</div>
      <div style={{ fontFamily:"var(--font-display)", fontSize:24, fontWeight:900, textTransform:"uppercase", letterSpacing:-1, color:"var(--primary)", marginBottom:10 }}>
        You're Registered!
      </div>
      <p style={{ fontSize:14, color:"var(--muted)", lineHeight:1.7 }}>
        Welcome <strong style={{ color:"var(--ink)" }}>{form.name}</strong>! You've been added to <strong style={{ color:"var(--ink)" }}>{tournament.name}</strong>.
      </p>
      <div style={{ marginTop:20, background:"var(--primary-dim)", border:"1px solid rgba(255,107,53,0.3)", borderRadius:8, padding:"12px 18px", fontFamily:"var(--font-display)", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1, color:"var(--primary)" }}>
        📲 Share this page with other participants!
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth:520, margin:"32px auto", padding:"0 24px" }}>
      <div className="card">
        <div className="card-title">Register for {tournament.name}</div>
        {tournament.org_name && <p style={{ fontSize:13, color:"var(--muted)", marginBottom:16, marginTop:-8 }}>Organized by {tournament.org_name}</p>}

        {error && (
          <div style={{ background:"var(--red-dim)", border:"1px solid rgba(229,62,62,0.3)", borderRadius:6, padding:"9px 13px", marginBottom:14, fontFamily:"var(--font-display)", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:.5, color:"var(--red)" }}>
            {error}
          </div>
        )}

        {events.length > 1 && (
          <div className="field">
            <label>Select Events *</label>
            {events.map(ev => {
              const sel = eventIds.includes(ev.event_id);
              return (
                <div key={ev.event_id}
                  onClick={() => toggleEvent(ev.event_id)}
                  style={{
                    border:`2px solid ${sel?"var(--primary)":"var(--border)"}`,
                    borderRadius:8, padding:"11px 14px", cursor:"pointer",
                    display:"flex", alignItems:"center", gap:10, marginBottom:8,
                    background: sel?"var(--primary-dim)":"var(--elevated)",
                    transition:"all .15s",
                  }}>
                  <div style={{
                    width:18, height:18, borderRadius:4, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
                    background: sel?"var(--primary)":"transparent",
                    border: sel?"2px solid var(--primary)":"2px solid var(--border-mid)",
                    color:"var(--bg)", fontSize:11, fontWeight:800,
                  }}>{sel?"✓":""}</div>
                  <div>
                    <div style={{ fontFamily:"var(--font-display)", fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:-0.5, color: sel?"var(--primary)":"var(--ink)" }}>{ev.name}</div>
                    <div style={{ fontSize:11, color:"var(--muted)" }}>{ev.sport_key} · {ev.format}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="field"><label>Full Name *</label>
          <input className="input" placeholder="e.g. Rahul Sharma" value={form.name}
            onChange={e => setForm(f=>({...f,name:e.target.value}))} /></div>
        <div className="field"><label>Phone *</label>
          <input className="input" placeholder="9876543210" type="tel" value={form.phone}
            onChange={e => setForm(f=>({...f,phone:e.target.value}))} /></div>
        <div className="field-row">
          <div className="field"><label>Age</label>
            <input className="input" placeholder="24" type="number" min="5" max="99" value={form.age}
              onChange={e => setForm(f=>({...f,age:e.target.value}))} /></div>
          <div className="field"><label>Gender</label>
            <select className="input" value={form.gender} onChange={e => setForm(f=>({...f,gender:e.target.value}))}>
              <option>Male</option><option>Female</option><option>Other</option>
            </select></div>
        </div>

        <button className="btn btn-gradient btn-lg" style={{ width:"100%", marginTop:6 }}
          onClick={handleSubmit} disabled={loading}>
          {loading ? "Registering…" : "Register Now →"}
        </button>
        <p style={{ fontSize:11, color:"var(--muted)", textAlign:"center", marginTop:10 }}>Your details are only used for this tournament.</p>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function TournamentPublic() {
  const { slug, sportUrl } = useParams();
  const navigate = useNavigate();
  const [data,        setData]        = useState(null);
  const [error,       setError]       = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(() => {
    const fetcher = sportUrl ? getSportTournament(sportUrl, slug) : getTournamentBySlug(slug);
    fetcher.then(d => { setData(d); setLastUpdated(new Date()); }).catch(e => setError(e.message));
  }, [slug, sportUrl]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  if (error) return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign:"center" }}>
        <div className="auth-logo">The<span className="accent">Score</span>Board</div>
        <p style={{ color:"var(--muted)", margin:"16px 0" }}>Tournament not found.</p>
        <button className="btn btn-primary" onClick={() => navigate("/")}>Go Home</button>
      </div>
    </div>
  );

  if (!data) return (
    <div className="auth-wrap">
      <div style={{ color:"var(--muted)", fontFamily:"var(--font-display)", fontSize:14, textTransform:"uppercase", letterSpacing:2 }}>Loading…</div>
    </div>
  );

  const { tournament: t, events } = data;
  const status   = t.status || "draft";
  const allLive  = events.flatMap(ev => ev.live_matches || []);
  const allMatches = events.flatMap(ev => ev.all_matches || []);
  const liveCt   = allMatches.filter(m=>m.status==="live").length;
  const doneCt   = allMatches.filter(m=>m.status==="done").length;
  const schedCt  = allMatches.filter(m=>m.status==="scheduled").length;

  return (
    <div className="app">
      {/* ── HEADER ── */}
      <header className="site-header">
        <div className="header-row">
          <div>
            <div style={{ fontFamily:"var(--font-display)", fontSize:9, fontWeight:800, textTransform:"uppercase", letterSpacing:3, color:"rgba(255,255,255,0.4)", cursor:"pointer", marginBottom:2 }} onClick={() => navigate("/")}>
              TheScoreBoard
            </div>
            <div style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:900, textTransform:"uppercase", letterSpacing:-0.5, color:"#fff", lineHeight:1 }}>
              {t.name}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {sportUrl && <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/${sportUrl}`)}>← Back</button>}
            {allLive.length > 0 && <div className="live-badge"><span className="live-dot"/>{allLive.length} LIVE</div>}
          </div>
        </div>
      </header>

      {/* ── INFO STRIP ── */}
      <div style={{ background:"var(--surface)", borderBottom:"1px solid var(--border)", padding:"8px 24px" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", gap:16, flexWrap:"wrap", fontSize:12, color:"var(--muted)", alignItems:"center",className:"tournament-info-strip" }}>
          {t.org_name   && <span>Organized by <strong style={{ color:"var(--ink)" }}>{t.org_name}</strong></span>}
          {t.venue      && <span>📍 {t.venue}{t.city?`, ${t.city}`:""}</span>}
          {t.start_date && <span>📅 {t.start_date}</span>}
          <div style={{ marginLeft:"auto" }}>
            {{
              draft:        <span className="pill pill-gray">Draft</span>,
              registration: <span className="pill pill-gold">🟡 Registration Open</span>,
              fixtures:     <span className="pill pill-orange">Fixtures</span>,
              live:         <span className="pill pill-orange"><span className="live-dot" style={{width:6,height:6}}/>Live Now</span>,
              completed:    <span className="pill pill-green">✅ Completed</span>,
            }[status]}
          </div>
        </div>
      </div>

      {/* ── STATUS BODY ── */}
      {status === "draft" && <DraftView tournament={t} />}
      {status === "registration" && <RegistrationView tournament={t} events={events} />}

      {["fixtures","live","completed"].includes(status) && (
        <>
          {/* Live banner */}
          {allLive.length > 0 && (
            <div style={{ background:"var(--primary)", padding:"10px 24px", display:"flex", gap:8, flexWrap:"wrap", justifyContent:"center",className:"live-banner" }}>
              {allLive.map((m,i) => (
                <div key={m.match_id??i} style={{
                  display:"flex", alignItems:"center", gap:8,
                  background:"rgba(0,0,0,0.25)", borderRadius:6, padding:"5px 12px",
                }}>
                  <span className="live-dot" style={{ background:"var(--bg)" }}/>
                  <span style={{ fontSize:13, fontWeight:700, color:"var(--bg)" }}>{m.player_1?.name}</span>
                  <span style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:900, color:"var(--bg)", letterSpacing:2 }}>
                    {m.player_1?.score??0}–{m.player_2?.score??0}
                  </span>
                  <span style={{ fontSize:13, fontWeight:700, color:"var(--bg)" }}>{m.player_2?.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Stats strip */}
          <div style={{ background:"var(--surface)", borderBottom:"1px solid var(--border)", padding:"12px 24px" }}>
            <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", gap:24, flexWrap:"wrap" }}>
              {[
                { label:"Events",    value: events.length    },
                { label:"Matches",   value: allMatches.length },
                { label:"Live",      value: liveCt,  color:"var(--primary)" },
                { label:"Completed", value: doneCt,  color:"var(--green)"   },
                { label:"Upcoming",  value: schedCt                         },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display:"flex", alignItems:"baseline", gap:5 }}>
                  <span style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:900, color:color||"var(--ink)" }}>{value}</span>
                  <span style={{ fontSize:11, color:"var(--muted)", fontWeight:700, textTransform:"uppercase", letterSpacing:1 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Match list */}
          <div style={{ maxWidth:1100, margin:"0 auto", padding:"24px 24px" }}>
            {events.length === 0 ? (
              <div className="empty">No events scheduled yet.</div>
            ) : events.map(ev => (
              <div key={ev.event_id} style={{ marginBottom:32 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, paddingBottom:8, borderBottom:"2px solid var(--border)" }}>
                  <span style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:900, textTransform:"uppercase", letterSpacing:-0.5, color:"var(--ink)" }}>{ev.name}</span>
                  <span style={{ fontSize:11, color:"var(--muted)", fontWeight:600 }}>{ev.format}</span>
                  {ev.live_matches?.length > 0 && (
                    <span className="pill pill-orange">🔴 {ev.live_matches.length} Live</span>
                  )}
                  <span style={{ fontSize:11, color:"var(--muted)", marginLeft:"auto" }}>
                    {ev.completed_matches}/{ev.total_matches} done
                  </span>
                </div>
                {(ev.all_matches||[]).map(m => <MatchRow key={m.match_id} match={m} />)}
              </div>
            ))}
          </div>
        </>
      )}

      <footer style={{ textAlign:"center", padding:"20px 24px", color:"var(--subtle)", fontSize:12, borderTop:"1px solid var(--border)" }}>
        Powered by TheScoreBoard
        {status==="live" && " · Auto-refreshes every 5s"}
        {lastUpdated && ` · ${lastUpdated.toLocaleTimeString()}`}
      </footer>
    </div>
  );
}

function MatchRow({ match: m }) {
  const isLive = m.status === "live";
  const isDone = m.status === "done";
  const sets   = m.sets || [];

  return (
    <div className={`match-row${isLive?" live":""}`} style={{ flexDirection:"column", gap:6 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, width:"100%" }}>
        {/* Round */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", minWidth:40 }}>
          <span style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:1, background:"var(--primary-dim)", color:"var(--primary)", padding:"2px 6px", borderRadius:3 }}>R{m.round}</span>
          {m.table_number && <span style={{ fontSize:10, color:"var(--muted)", fontWeight:700, marginTop:2 }}>T{m.table_number}</span>}
        </div>

        {/* Players + score */}
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
          <span className={`match-pname${m.player_1?.is_winner?" winner":""}`}>
            {m.current_server===1&&isLive&&"🏓 "}{m.player_1?.name}
          </span>
          <span className={`match-score ${isLive?"live-score":isDone?"done-score":"vs-score"}`}>
            {isLive||isDone ? `${m.player_1?.score}–${m.player_2?.score}` : "vs"}
          </span>
          <span className={`match-pname right${m.player_2?.is_winner?" winner":""}`}>
            {m.player_2?.name}{m.current_server===2&&isLive&&" 🏓"}
          </span>
        </div>

        {/* Status tag */}
        {isLive && <span className="pill pill-orange"><span className="live-dot" style={{width:6,height:6}}/>LIVE</span>}
        {isDone  && <span className="pill pill-green">FT</span>}
      </div>

      {/* Set chips */}
      {sets.length > 0 && (isLive||isDone) && (
        <div style={{ display:"flex", gap:4, justifyContent:"center", flexWrap:"wrap" }}>
          {sets.map(s => (
            <span key={s.set_number} style={{
              fontSize:11, padding:"2px 7px", borderRadius:3, fontWeight:700,
              fontFamily:"var(--font-display)",
              background: s.is_complete?"var(--primary-dim)":"var(--gold-dim)",
              color: s.is_complete?"var(--primary)":"var(--gold)",
            }}>
              S{s.set_number}: {s.score_p1}-{s.score_p2}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}