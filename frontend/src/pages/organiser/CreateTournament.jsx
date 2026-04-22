import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getMyOrgs, createTournament } from "../../api/client";

// ── Sport definitions ─────────────────────────────────────────
const SPORTS = [
  { key: "table_tennis", label: "Table Tennis", icon: "🏓" },
  { key: "badminton",    label: "Badminton",    icon: "🏸" },
  { key: "cricket",      label: "Cricket",      icon: "🏏" },
  { key: "football",     label: "Football",     icon: "⚽" },
];

// Sub-formats per sport
// Each sub-format defines: label, participant_type, extra config fields
const SPORT_SUBFORMATS = {
  table_tennis: [
    {
      key:              "singles",
      label:            "Singles",
      sub:              "1 vs 1 — individual players compete",
      participant_type: "individual",
      config:           {},
    },
    {
      key:              "doubles",
      label:            "Doubles",
      sub:              "2 vs 2 — pairs compete together",
      participant_type: "doubles_pair",
      config:           {},
    },
  ],
  badminton: [
    {
      key:              "singles",
      label:            "Singles",
      sub:              "1 vs 1 — individual players compete",
      participant_type: "individual",
      config:           {},
    },
    {
      key:              "doubles",
      label:            "Doubles",
      sub:              "2 vs 2 — pairs compete together",
      participant_type: "doubles_pair",
      config:           {},
    },
    {
      key:              "mixed_doubles",
      label:            "Mixed Doubles",
      sub:              "2 vs 2 — one male, one female per pair",
      participant_type: "doubles_pair",
      config:           { mixed: true },
    },
  ],
  cricket: [
    {
      key:              "standard",
      label:            "Standard",
      sub:              "Full team cricket — configure squad size below",
      participant_type: "team",
      config:           { squad_size: 11 },
      configFields:     [
        { key: "squad_size", label: "Squad Size", type: "number", min: 6, max: 15, default: 11,
          hint: "Total players per team including subs (e.g. 11 = playing XI)" },
      ],
    },
  ],
  football: [
    {
      key:              "11_a_side",
      label:            "11-a-side",
      sub:              "Standard football — 11 players per team",
      participant_type: "team",
      config:           { team_size: 11, substitutes: 5 },
      configFields:     [
        { key: "substitutes", label: "Substitutes on bench", type: "number", min: 0, max: 7, default: 5 },
      ],
    },
    {
      key:              "7_a_side",
      label:            "7-a-side",
      sub:              "7 players per team on the field",
      participant_type: "team",
      config:           { team_size: 7, substitutes: 3 },
      configFields:     [
        { key: "substitutes", label: "Substitutes on bench", type: "number", min: 0, max: 5, default: 3 },
      ],
    },
    {
      key:              "5_a_side",
      label:            "5-a-side",
      sub:              "5 players per team — futsal / small-sided",
      participant_type: "team",
      config:           { team_size: 5, substitutes: 2 },
      configFields:     [
        { key: "substitutes", label: "Substitutes on bench", type: "number", min: 0, max: 3, default: 2 },
      ],
    },
  ],
};

const FORMATS = [
  { value: "group_knockout",  label: "Group Stage + Knockout", sub: "Groups then single elimination" },
  { value: "direct_knockout", label: "Direct Knockout",         sub: "Straight single elimination"   },
  { value: "round_robin",     label: "Round Robin",             sub: "Everyone plays everyone"        },
];

const STEPS = ["Type", "Sport & Format", "Structure", "Details", "Review"];

export default function CreateTournament() {
  const navigate = useNavigate();

  const [step,           setStep]           = useState(1);
  const [activeOrg,      setActiveOrg]      = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState("");
  const [isMultiSport,   setIsMultiSport]   = useState(false);

  // events array — each entry:
  // { sport_key, subformat_key, participant_type, format, name, sport_config }
  const [events, setEvents] = useState([]);

  // details
  const [name,      setName]      = useState("");
  const [venue,     setVenue]     = useState("");
  const [city,      setCity]      = useState("");
  const [startDate, setStartDate] = useState("");

  useEffect(() => {
    getMyOrgs().then(o => { if (o?.length) setActiveOrg(o[0]); });
  }, []);

  // ── Helpers ───────────────────────────────────────────────
  const sl  = (k) => SPORTS.find(s => s.key === k)?.label || k;
  const si  = (k) => SPORTS.find(s => s.key === k)?.icon  || "🏅";
  const fl  = (v) => FORMATS.find(f => f.value === v)?.label || v;

  const getSubformat = (sportKey, sfKey) =>
    SPORT_SUBFORMATS[sportKey]?.find(sf => sf.key === sfKey);

  // Add a new sport event slot
  const addSportEvent = (sportKey) => {
    const subformats = SPORT_SUBFORMATS[sportKey] || [];
    const sf         = subformats[0]; // default to first
    setEvents(prev => [...prev, {
      sport_key:        sportKey,
      subformat_key:    sf?.key || "singles",
      participant_type: sf?.participant_type || "individual",
      format:           "",
      name:             "",
      sport_config:     { ...(sf?.config || {}) },
    }]);
  };

  const removeSportEvent = (i) => setEvents(prev => prev.filter((_, idx) => idx !== i));

  const updateEvent = (i, updates) =>
    setEvents(prev => prev.map((ev, idx) => idx === i ? { ...ev, ...updates } : ev));

  const setSubformat = (i, sfKey) => {
    const ev = events[i];
    const sf = getSubformat(ev.sport_key, sfKey);
    if (!sf) return;
    updateEvent(i, {
      subformat_key:    sfKey,
      participant_type: sf.participant_type,
      sport_config:     { ...(sf.config || {}) },
    });
  };

  const updateEventConfig = (i, key, val) =>
    setEvents(prev => prev.map((ev, idx) =>
      idx === i ? { ...ev, sport_config: { ...ev.sport_config, [key]: val } } : ev
    ));

  // Toggle sport for multi-sport
  const toggleSport = (sportKey) => {
    const existing = events.find(e => e.sport_key === sportKey);
    if (existing) {
      setEvents(prev => prev.filter(e => e.sport_key !== sportKey));
    } else {
      addSportEvent(sportKey);
    }
  };

  // Single sport — replace
  const setSingleSport = (sportKey) => {
    const subformats = SPORT_SUBFORMATS[sportKey] || [];
    const sf         = subformats[0];
    setEvents([{
      sport_key:        sportKey,
      subformat_key:    sf?.key || "singles",
      participant_type: sf?.participant_type || "individual",
      format:           "",
      name:             "",
      sport_config:     { ...(sf?.config || {}) },
    }]);
  };

  // Validation
  const canAdvance = () => {
    if (step === 2) return events.length > 0;
    if (step === 3) return events.every(e => e.format !== "");
    if (step === 4) return name.trim().length > 0;
    return true;
  };

  const next = () => { if (!canAdvance()) return; setError(""); setStep(s => Math.min(s + 1, 5)); };
  const back = () => setStep(s => Math.max(s - 1, 1));

  const handleCreate = async () => {
    if (!activeOrg)     return setError("No organization found.");
    if (!name.trim())   return setError("Tournament name is required.");
    if (!events.length) return setError("Select at least one sport.");

    setLoading(true); setError("");
    try {
      const t = await createTournament(activeOrg.org_id, {
        name:           name.trim(),
        venue:          venue.trim() || null,
        city:           city.trim()  || null,
        start_date:     startDate    || null,
        is_multi_sport: isMultiSport,
        events: events.map(e => {
          const sf      = getSubformat(e.sport_key, e.subformat_key);
          const evtName = e.name.trim() ||
            `${sl(e.sport_key)}${sf ? " " + sf.label : ""}`;
          return {
            name:             evtName,
            sport_key:        e.sport_key,
            format:           e.format,
            participant_type: e.participant_type,
            sport_config:     {
              ...(sf?.config || {}),
              ...e.sport_config,
            },
            // flat columns for the backend
            squad_size:   e.sport_config?.squad_size  || null,
            team_size:    e.sport_config?.team_size   || null,
            substitutes:  e.sport_config?.substitutes || null,
          };
        }),
      });
      navigate(`/organiser/tournament/${t.tournament_id}`);
    } catch (e) {
      setError(e.message || "Failed to create tournament.");
    } finally {
      setLoading(false);
    }
  };

  // ── Styles (Stadium Lights) ───────────────────────────────
  const c = {
    bg: "var(--bg)", surface: "var(--surface)", border: "var(--border)",
    orange: "var(--primary)", gold: "var(--gold)", muted: "var(--muted)",
    ink: "var(--ink)", dim: "var(--primary-dim)",
  };

  const selStyle = (selected) => ({
    border: `2px solid ${selected ? c.orange : c.border}`,
    borderRadius: 8,
    background: selected ? c.dim : c.surface,
    cursor: "pointer",
    transition: "all .15s",
    padding: "14px 16px",
    marginBottom: 8,
  });

  return (
    <div style={{ minHeight: "100vh", background: c.bg, fontFamily: "var(--font-body)" }}>

      {/* ── NAV ── */}
      <header className="site-header">
        <div className="header-row">
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: 3, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>
              New Tournament
            </div>
            <span className="header-brand">The<span className="accent">Score</span>Board</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate("/organiser")}>← Cancel</button>
        </div>
      </header>

      {/* ── PROGRESS ── */}
      <div style={{ background: c.surface, borderBottom: `1px solid ${c.border}`, padding: "14px 0" }}>
        <div style={{ maxWidth: 620, margin: "0 auto", padding: "0 24px" }} className="progress-container">
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            {STEPS.map((label, i) => {
              const n     = i + 1;
              const state = n < step ? "done" : n === step ? "active" : "pending";
              return (
                <div key={label} style={{ display: "flex", alignItems: "flex-start", flex: 1 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 800,
                      background: state === "done" ? c.orange : state === "active" ? c.gold : c.surface,
                      color:      state === "done" ? c.bg    : state === "active" ? c.bg   : c.muted,
                      border:     state === "pending" ? `2px solid ${c.border}` : "none",
                      boxShadow:  state === "active" ? `0 0 0 3px ${c.dim}` : "none",
                    }}>
                      {state === "done" ? "✓" : n}
                    </div>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginTop: 4, color: state === "pending" ? c.muted : state === "active" ? c.gold : c.orange, textAlign: "center", whiteSpace: "nowrap" }}>
                      {label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{ flex: 1, height: 2, margin: "13px 4px 0", background: state === "done" ? c.orange : c.border }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "28px 24px" }} className="create-content">
        {error && (
          <div style={{ background: "var(--red-dim)", border: "1px solid rgba(229,62,62,0.3)", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, color: "var(--red)" }}>
            {error}
          </div>
        )}

        {/* ── STEP 1: Type ── */}
        {step === 1 && (
          <div className="card">
            <div className="card-title">Step 1 — Tournament Type</div>
            <p style={{ fontSize: 13, color: c.muted, marginBottom: 18 }}>Run one sport or combine multiple sports under one event.</p>
            {[
              { multi: false, icon: "🎯", title: "Single Sport",  sub: "One sport bracket — e.g. Football 5-a-side" },
              { multi: true,  icon: "🏟️", title: "Multi Sport",   sub: "Multiple sports — e.g. Football + Cricket + TT" },
            ].map(({ multi, icon, title, sub }) => (
              <div key={String(multi)}
                style={selStyle(isMultiSport === multi)}
                onClick={() => { setIsMultiSport(multi); setEvents([]); }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: -0.5, color: isMultiSport === multi ? c.orange : c.ink }}>
                  {title}
                </div>
                <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{sub}</div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn btn-primary" onClick={next}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Sport + Sub-format ── */}
        {step === 2 && (
          <div className="card">
            <div className="card-title">Step 2 — Sport & Format</div>
            <p style={{ fontSize: 13, color: c.muted, marginBottom: 18 }}>
              {isMultiSport ? "Pick all sports and their format." : "Pick your sport and format."}
            </p>

            {/* Sport picker */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }} className="sport-selector-grid">
              {SPORTS.map(sport => {
                const selected = events.some(e => e.sport_key === sport.key);
                return (
                  <div key={sport.key}
                    style={{
                      ...selStyle(selected),
                      display: "flex", alignItems: "center", gap: 10, margin: 0,
                    }}
                    onClick={() => isMultiSport ? toggleSport(sport.key) : setSingleSport(sport.key)}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                      background: selected ? c.orange : c.surface,
                      border: `1px solid ${selected ? c.orange : c.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                    }}>
                      {sport.icon}
                    </div>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: -0.5, color: selected ? c.orange : c.ink }}>
                      {sport.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Sub-format picker — shown per selected sport */}
            {events.map((ev, i) => {
              const subformats = SPORT_SUBFORMATS[ev.sport_key] || [];
              if (subformats.length <= 1) return null; // cricket only has one
              return (
                <div key={`${ev.sport_key}-${i}`} style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: c.orange, marginBottom: 8 }}>
                    {si(ev.sport_key)} {sl(ev.sport_key)} — Pick Format
                  </div>
                  {subformats.map(sf => (
                    <div key={sf.key}
                      style={{ ...selStyle(ev.subformat_key === sf.key), padding: "10px 14px", marginBottom: 6 }}
                      onClick={() => setSubformat(i, sf.key)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                          background: ev.subformat_key === sf.key ? c.orange : "transparent",
                          border: `2px solid ${ev.subformat_key === sf.key ? c.orange : c.border}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, color: c.bg,
                        }}>
                          {ev.subformat_key === sf.key && "✓"}
                        </div>
                        <div>
                          <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: -0.5, color: ev.subformat_key === sf.key ? c.orange : c.ink }}>
                            {sf.label}
                          </div>
                          <div style={{ fontSize: 11, color: c.muted, marginTop: 1 }}>{sf.sub}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Squad / team size config — shown for team sports */}
            {events.map((ev, i) => {
              const sf = getSubformat(ev.sport_key, ev.subformat_key);
              if (!sf?.configFields?.length) return null;
              return (
                <div key={`config-${ev.sport_key}-${i}`} style={{ background: "var(--elevated)", border: `1px solid ${c.border}`, borderRadius: 8, padding: "14px 16px", marginBottom: 12 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: c.orange, marginBottom: 12 }}>
                    {si(ev.sport_key)} {sl(ev.sport_key)} — {sf.label} Config
                  </div>
                  {sf.configFields.map(field => (
                    <div key={field.key} style={{ marginBottom: 10 }}>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: c.muted, marginBottom: 6 }}>
                        {field.label}
                      </label>
                      <input
                        type={field.type}
                        min={field.min} max={field.max}
                        value={ev.sport_config?.[field.key] ?? field.default}
                        onChange={e => updateEventConfig(i, field.key, parseInt(e.target.value) || field.default)}
                        className="input"
                        style={{ width: 100 }}
                      />
                      {field.hint && <div style={{ fontSize: 11, color: c.muted, marginTop: 4 }}>{field.hint}</div>}
                    </div>
                  ))}
                </div>
              );
            })}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <button className="btn btn-outline" onClick={back}>← Back</button>
              <button className="btn btn-primary" onClick={next} disabled={events.length === 0}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Match structure (format) ── */}
        {step === 3 && (
          <div className="card">
            <div className="card-title">Step 3 — Match Structure</div>
            <p style={{ fontSize: 13, color: c.muted, marginBottom: 18 }}>How matches are organised within each event.</p>

            {events.map((ev, i) => {
              const sf = getSubformat(ev.sport_key, ev.subformat_key);
              return (
                <div key={`${ev.sport_key}-${i}`} style={{ marginBottom: 20 }}>
                  {events.length > 1 && (
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: c.orange, marginBottom: 10, paddingTop: 10, borderTop: `1px solid ${c.border}` }}>
                      {si(ev.sport_key)} {sl(ev.sport_key)} — {sf?.label || ""}
                    </div>
                  )}
                  {FORMATS.map(f => (
                    <div key={f.value}
                      style={{ ...selStyle(ev.format === f.value), padding: "12px 14px", marginBottom: 6 }}
                      onClick={() => updateEvent(i, { format: f.value })}>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: -0.5, color: ev.format === f.value ? c.orange : c.ink }}>
                        {f.label}
                      </div>
                      <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>{f.sub}</div>
                    </div>
                  ))}
                </div>
              );
            })}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <button className="btn btn-outline" onClick={back}>← Back</button>
              <button className="btn btn-primary" onClick={next} disabled={!events.every(e => e.format)}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Details ── */}
        {step === 4 && (
          <div className="card">
            <div className="card-title">Step 4 — Tournament Details</div>
            <p style={{ fontSize: 13, color: c.muted, marginBottom: 18 }}>Name your tournament and add location info.</p>

            <div className="field">
              <label>Tournament Name *</label>
              <input className="input" autoFocus placeholder="e.g. Tenx Championship 2026"
                value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && name.trim() && next()} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Venue</label>
                <input className="input" placeholder="e.g. Main Hall" value={venue} onChange={e => setVenue(e.target.value)} />
              </div>
              <div className="field">
                <label>City</label>
                <input className="input" placeholder="e.g. Mumbai" value={city} onChange={e => setCity(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Start Date</label>
              <input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>

            {/* Optional event name overrides */}
            {events.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${c.border}` }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: c.muted, marginBottom: 12 }}>
                  Event Names <span style={{ fontWeight: 400, fontSize: 10, textTransform: "none", letterSpacing: 0 }}>(optional — leave blank for auto-name)</span>
                </div>
                {events.map((ev, i) => {
                  const sf = getSubformat(ev.sport_key, ev.subformat_key);
                  const autoName = `${sl(ev.sport_key)} ${sf?.label || ""}`.trim();
                  return (
                    <div key={`name-${i}`} className="field">
                      <label>{si(ev.sport_key)} {autoName}</label>
                      <input className="input" placeholder={autoName}
                        value={ev.name}
                        onChange={e => updateEvent(i, { name: e.target.value })} />
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <button className="btn btn-outline" onClick={back}>← Back</button>
              <button className="btn btn-primary" onClick={next} disabled={!name.trim()}>Review →</button>
            </div>
          </div>
        )}

        {/* ── STEP 5: Review ── */}
        {step === 5 && (
          <div className="card">
            <div className="card-title">Step 5 — Review & Create</div>
            <p style={{ fontSize: 13, color: c.muted, marginBottom: 20 }}>Double-check everything before creating.</p>

            {/* Tournament details */}
            {[
              ["Name",       name],
              ["Type",       isMultiSport ? "Multi-Sport" : "Single Sport"],
              venue     && ["Venue",      venue],
              city      && ["City",       city],
              startDate && ["Start Date", startDate],
            ].filter(Boolean).map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: `1px solid ${c.border}` }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: c.muted }}>{k}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: c.ink, textAlign: "right" }}>{v}</span>
              </div>
            ))}

            {/* Events summary */}
            <div style={{ background: "var(--elevated)", border: `1px solid ${c.border}`, borderRadius: 8, padding: "14px 16px", marginTop: 16 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, color: c.orange, marginBottom: 12 }}>
                Events ({events.length})
              </div>
              {events.map((ev, i) => {
                const sf      = getSubformat(ev.sport_key, ev.subformat_key);
                const evName  = ev.name.trim() || `${sl(ev.sport_key)} ${sf?.label || ""}`.trim();
                const pType   = sf?.participant_type || ev.participant_type;
                const isDoubles = pType === "doubles_pair";
                const isTeam    = pType === "team";
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: i < events.length - 1 ? `1px solid ${c.border}` : "none" }}>
                    <div>
                      <div style={{ fontWeight: 700, color: c.ink, fontSize: 13 }}>
                        {si(ev.sport_key)} {evName}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                        {isDoubles && <span className="pill pill-gold">Doubles Pairs</span>}
                        {isTeam    && <span className="pill pill-orange">Team Sport</span>}
                        {!isDoubles && !isTeam && <span className="pill pill-green">Individual</span>}
                        {ev.sport_config?.squad_size  && <span className="pill pill-gray">{ev.sport_config.squad_size} per squad</span>}
                        {ev.sport_config?.team_size   && <span className="pill pill-gray">{ev.sport_config.team_size}-a-side</span>}
                        {ev.sport_config?.substitutes != null && ev.sport_config.team_size && (
                          <span className="pill pill-gray">+{ev.sport_config.substitutes} subs</span>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: c.muted, textAlign: "right", flexShrink: 0, marginLeft: 8 }}>{fl(ev.format)}</span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
              <button className="btn btn-outline" onClick={back}>← Back</button>
              <button className="btn btn-gradient btn-lg" style={{ fontSize: 13 }} onClick={handleCreate} disabled={loading}>
                {loading ? "Creating…" : "Create Tournament →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}   