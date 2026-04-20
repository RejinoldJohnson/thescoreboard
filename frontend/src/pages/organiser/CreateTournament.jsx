import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getMyOrgs, createTournament } from "../../api/client";

const SPORTS = [
  { key: "table_tennis", label: "Table Tennis", icon: "🏓" },
  { key: "badminton",    label: "Badminton",    icon: "🏸" },
  { key: "cricket",      label: "Cricket",      icon: "🏏" },
  { key: "football",     label: "Football",     icon: "⚽" },
];

const FORMATS = [
  { value: "group_knockout",  label: "Group Stage + Knockout", sub: "Groups then single elimination" },
  { value: "direct_knockout", label: "Direct Knockout",         sub: "Straight single elimination"   },
  { value: "round_robin",     label: "Round Robin",             sub: "Everyone plays everyone"        },
];

const STEPS = ["Type", "Sport", "Format", "Details", "Review"];

export default function CreateTournament() {
  const navigate = useNavigate();

  const [step,           setStep]           = useState(1);
  const [activeOrg,      setActiveOrg]      = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState("");
  const [isMultiSport,   setIsMultiSport]   = useState(false);
  const [selectedSports, setSelectedSports] = useState([]);
  const [events,         setEvents]         = useState([]);
  const [visibility,     setVisibility]     = useState("public");
  const [name,           setName]           = useState("");
  const [venue,          setVenue]          = useState("");
  const [city,           setCity]           = useState("");
  const [startDate,      setStartDate]      = useState("");

  useEffect(() => {
    getMyOrgs().then((o) => { if (o?.length) setActiveOrg(o[0]); });
  }, []);

  const toggleSport = (key) => {
    if (!isMultiSport) {
      setSelectedSports([key]);
      setEvents([{
        name: "",
        sport_key: key,
        format: "",
      }]);
    } else {
      const exists  = selectedSports.includes(key);
      const updated = exists
        ? selectedSports.filter((s) => s !== key)
        : [...selectedSports, key];
      setSelectedSports(updated);
      if (!exists) {
        setEvents((p) => [...p, { name: "", sport_key: key, format: "" }]);
      } else {
        setEvents((p) => p.filter((e) => e.sport_key !== key));
      }
    }
  };

  const setEventFormat = (sportKey, format) =>
    setEvents((p) => p.map((e) => e.sport_key === sportKey ? { ...e, format } : e));

  const canAdvance = () => {
    if (step === 2) return selectedSports.length > 0;
    if (step === 3) return events.every((e) => e.format !== "");
    if (step === 4) return name.trim().length > 0;
    return true;
  };

  const next = () => { if (!canAdvance()) return; setError(""); setStep((s) => Math.min(s + 1, 5)); };
  const back = () => setStep((s) => Math.max(s - 1, 1));

  const handleCreate = async () => {
    if (!activeOrg)        return setError("No organization found. Go to dashboard and create one first.");
    if (!name.trim())      return setError("Tournament name is required.");
    if (!events.length)    return setError("Select at least one sport.");

    setLoading(true); setError("");
    try {
      const t = await createTournament(activeOrg.org_id, {
        name:           name.trim(),
        venue:          venue.trim() || null,
        city:           city.trim()  || null,
        start_date:     startDate    || null,
        is_multi_sport: isMultiSport,
        events: events.map((e) => ({
          // fall back to sport label if admin left name blank
          name:             e.name.trim() || SPORTS.find((s) => s.key === e.sport_key)?.label || e.sport_key,
          sport_key:        e.sport_key,
          format:           e.format,
          participant_type: "individual",
        })),
      });
      navigate(`/organiser/tournament/${t.tournament_id}`);
    } catch (e) {
      setError(e.message || "Failed to create tournament.");
    } finally {
      setLoading(false);
    }
  };

  const sl = (k) => SPORTS.find((s) => s.key === k)?.label || k;
  const si = (k) => SPORTS.find((s) => s.key === k)?.icon  || "🏅";
  const fl = (v) => FORMATS.find((f) => f.value === v)?.label || v;

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        .ct-nav {
          background: var(--green);
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 24px; height: 56px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.18);
          position: sticky; top: 0; z-index: 100;
        }
        .ct-brand-wrap { display: flex; flex-direction: column; gap: 0; }
        .ct-nav-eyebrow {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 10px; letter-spacing: 3px; color: var(--yellow-lt);
          font-weight: 700; text-transform: uppercase;
        }
        .ct-brand {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 22px; font-weight: 900; color: #fff; letter-spacing: 0.5px; line-height: 1.1;
        }
        .ct-back {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
          color: rgba(255,255,255,0.7); background: none;
          border: 1.5px solid rgba(255,255,255,0.25);
          padding: 6px 14px; border-radius: 5px; cursor: pointer; transition: all .15s;
        }
        .ct-back:hover { border-color: rgba(255,255,255,.6); color: #fff; }

        .ct-progress { background: #fff; border-bottom: 1.5px solid var(--border); padding: 14px 0; }
        .ct-progress-inner { max-width: 560px; margin: 0 auto; padding: 0 24px; }
        .ct-steps { display: flex; align-items: flex-start; }
        .ct-step-wrap { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
        .ct-step-dot {
          width: 26px; height: 26px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 12px; font-weight: 800; transition: all .2s;
        }
        .ct-step-dot.done   { background: var(--green); color: #fff; }
        .ct-step-dot.active { background: var(--yellow); color: var(--ink); box-shadow: 0 0 0 3px var(--yellow-bg); }
        .ct-step-dot.pending{ background: var(--sand); color: var(--muted); }
        .ct-step-lbl {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 10px; font-weight: 700; letter-spacing: 1.5px;
          text-transform: uppercase; margin-top: 4px;
        }
        .ct-step-lbl.done    { color: var(--green); }
        .ct-step-lbl.active  { color: var(--yellow); }
        .ct-step-lbl.pending { color: var(--border); }
        .ct-step-line { flex: 1; height: 2px; background: var(--sand); margin: 12px 4px 0; transition: background .3s; }
        .ct-step-line.done { background: var(--green); }

        .ct-shell { max-width: 560px; margin: 0 auto; padding: 28px 24px; }
        .ct-card { background: #fff; border: 1.5px solid var(--border); border-radius: 8px; padding: 22px; }

        .ct-step-eyebrow {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 10px; font-weight: 800; letter-spacing: 3px;
          color: var(--muted); text-transform: uppercase; margin-bottom: 4px;
        }
        .ct-step-title {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 22px; font-weight: 900; color: var(--ink); letter-spacing: .3px; margin-bottom: 4px;
        }
        .ct-step-hint { font-size: 13px; color: var(--muted); margin-bottom: 18px; }

        .ct-type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .ct-type-card {
          border: 1.5px solid var(--border); border-radius: 7px; padding: 16px;
          cursor: pointer; transition: all .15s; background: var(--cream); text-align: left;
        }
        .ct-type-card:hover { border-color: var(--green); background: var(--green-bg); }
        .ct-type-card.sel   { border-color: var(--green); background: var(--green-bg); }
        .ct-type-icon  { font-size: 22px; margin-bottom: 8px; }
        .ct-type-title {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 15px; font-weight: 800; color: var(--ink); letter-spacing: .3px;
        }
        .ct-type-sub  { font-size: 12px; color: var(--muted); margin-top: 2px; }
        .ct-type-card.sel .ct-type-title { color: var(--green); }

        .ct-sport-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .ct-sport-tile {
          border: 1.5px solid var(--border); border-radius: 7px; padding: 12px 14px;
          cursor: pointer; display: flex; align-items: center; gap: 10px;
          transition: all .15s; background: var(--cream);
        }
        .ct-sport-tile:hover { border-color: var(--green); background: var(--green-bg); }
        .ct-sport-tile.sel  { border-color: var(--green); background: var(--green-bg); }
        .ct-sport-ico {
          width: 34px; height: 34px; border-radius: 6px; background: #fff;
          display: flex; align-items: center; justify-content: center;
          font-size: 17px; flex-shrink: 0; border: 1px solid var(--border); transition: all .15s;
        }
        .ct-sport-tile.sel .ct-sport-ico { background: var(--green); border-color: var(--green); }
        .ct-sport-name {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 15px; font-weight: 800; color: var(--ink); letter-spacing: .3px;
        }
        .ct-sport-tile.sel .ct-sport-name { color: var(--green); }

        .ct-format-item {
          border: 1.5px solid var(--border); border-radius: 7px; padding: 12px 14px;
          cursor: pointer; transition: all .15s; margin-bottom: 8px; background: var(--cream);
        }
        .ct-format-item:hover { border-color: var(--green); background: var(--green-bg); }
        .ct-format-item.sel  { border-color: var(--green); background: var(--green-bg); }
        .ct-format-name {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 15px; font-weight: 800; color: var(--ink); letter-spacing: .3px;
        }
        .ct-format-sub  { font-size: 12px; color: var(--muted); margin-top: 2px; }
        .ct-format-item.sel .ct-format-name { color: var(--green); }

        .ct-vis-row { display: flex; gap: 8px; margin-top: 14px; }
        .ct-vis-btn {
          flex: 1; padding: 9px; border: 1.5px solid var(--border); border-radius: 6px;
          background: var(--cream);
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 14px; font-weight: 700; letter-spacing: .5px;
          color: var(--muted); cursor: pointer; transition: all .15s;
        }
        .ct-vis-btn:hover  { border-color: var(--green-lt); color: var(--green); }
        .ct-vis-btn.active { border-color: var(--green); background: var(--green-bg); color: var(--green); }

        .ct-field { margin-bottom: 12px; }
        .ct-field label {
          display: block; font-family: 'Barlow Condensed', sans-serif;
          font-size: 11px; font-weight: 800; letter-spacing: 1.5px;
          text-transform: uppercase; color: var(--brown); margin-bottom: 5px;
        }
        .ct-field input {
          width: 100%; border: 1.5px solid var(--border); border-radius: 6px;
          padding: 9px 11px; font-size: 14px; font-family: 'DM Sans', sans-serif;
          color: var(--ink); background: var(--cream); outline: none;
          transition: border .15s; box-sizing: border-box;
        }
        .ct-field input:focus { border-color: var(--green); background: #fff; }
        .ct-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

        .ct-sport-divider {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 11px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;
          color: var(--brown); padding: 10px 0 6px; margin-top: 4px; border-top: 1px solid var(--border);
        }

        .ct-review-row {
          display: flex; justify-content: space-between; align-items: flex-start;
          padding: 8px 0; border-bottom: 1px solid var(--sand);
        }
        .ct-review-row:last-child { border-bottom: none; }
        .ct-review-key {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--muted);
        }
        .ct-review-val { font-size: 13px; font-weight: 600; color: var(--ink); text-align: right; }
        .ct-events-box {
          margin-top: 12px; padding: 12px; background: var(--cream);
          border: 1px solid var(--border); border-radius: 6px;
        }
        .ct-events-box-title {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 11px; font-weight: 800; letter-spacing: 2px;
          text-transform: uppercase; color: var(--brown); margin-bottom: 8px;
        }
        .ct-event-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 5px 0; border-bottom: 1px solid var(--border); font-size: 13px;
        }
        .ct-event-row:last-child { border-bottom: none; }

        .ct-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; }
        .ct-btn-back {
          background: none; border: 1.5px solid var(--border); color: var(--muted);
          padding: 9px 18px; border-radius: 6px;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 14px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
          cursor: pointer; transition: all .15s;
        }
        .ct-btn-back:hover { border-color: var(--brown-lt); color: var(--ink); }
        .ct-btn-next {
          background: var(--green); color: #fff; border: none;
          padding: 9px 22px; border-radius: 6px;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 14px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
          cursor: pointer; transition: all .15s;
        }
        .ct-btn-next:hover    { background: var(--green-lt); }
        .ct-btn-next:disabled { opacity: .4; cursor: not-allowed; }
        .ct-btn-create {
          background: var(--green); color: #fff; border: none;
          padding: 10px 24px; border-radius: 6px;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 15px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
          cursor: pointer; transition: all .15s; box-shadow: 0 4px 12px rgba(45,90,39,.3);
        }
        .ct-btn-create:hover    { background: var(--green-lt); }
        .ct-btn-create:disabled { opacity: .4; cursor: not-allowed; }

        .ct-error {
          background: var(--live-bg); border: 1px solid #e8c5c0; color: var(--live-red);
          font-size: 13px; padding: 9px 13px; border-radius: 6px; margin-bottom: 14px;
          font-family: 'Barlow Condensed', sans-serif; font-weight: 700; letter-spacing: .5px;
        }
      `}</style>

      {/* NAV */}
      <header className="ct-nav">
        <div className="ct-brand-wrap">
          <span className="ct-nav-eyebrow">New Tournament</span>
          <span className="ct-brand">TheScoreBoard</span>
        </div>
        <button className="ct-back" onClick={() => navigate("/organiser")}>← Cancel</button>
      </header>

      {/* PROGRESS */}
      <div className="ct-progress">
        <div className="ct-progress-inner">
          <div className="ct-steps">
            {STEPS.map((label, i) => {
              const n     = i + 1;
              const state = n < step ? "done" : n === step ? "active" : "pending";
              return (
                <div key={label} style={{ display: "flex", alignItems: "flex-start", flex: 1 }}>
                  <div className="ct-step-wrap">
                    <div className={`ct-step-dot ${state}`}>{state === "done" ? "✓" : n}</div>
                    <span className={`ct-step-lbl ${state}`}>{label}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`ct-step-line ${state === "done" ? "done" : ""}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="ct-shell">
        {error && <div className="ct-error">{error}</div>}

        {/* ── Step 1: Type ── */}
        {step === 1 && (
          <div className="ct-card">
            <div className="ct-step-eyebrow">Step 1 of 5</div>
            <div className="ct-step-title">Tournament Type</div>
            <div className="ct-step-hint">Run one sport or multiple sports under one event.</div>
            <div className="ct-type-grid">
              {[
                { multi: false, icon: "🎯", title: "Single Sport", sub: "One sport, one bracket"          },
                { multi: true,  icon: "🏟️", title: "Multi Sport",  sub: "Multiple sports, one event"      },
              ].map(({ multi, icon, title, sub }) => (
                <div
                  key={String(multi)}
                  className={`ct-type-card${isMultiSport === multi ? " sel" : ""}`}
                  onClick={() => { setIsMultiSport(multi); setSelectedSports([]); setEvents([]); }}
                >
                  <div className="ct-type-icon">{icon}</div>
                  <div className="ct-type-title">{title}</div>
                  <div className="ct-type-sub">{sub}</div>
                </div>
              ))}
            </div>
            <div className="ct-footer">
              <div />
              <button className="ct-btn-next" onClick={next}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── Step 2: Sport ── */}
        {step === 2 && (
          <div className="ct-card">
            <div className="ct-step-eyebrow">Step 2 of 5</div>
            <div className="ct-step-title">{isMultiSport ? "Select Sports" : "Pick a Sport"}</div>
            <div className="ct-step-hint">
              {isMultiSport ? "Select all sports to include." : "Scoring rules adapt to your choice."}
            </div>
            <div className="ct-sport-grid">
              {SPORTS.map((s) => {
                const sel = selectedSports.includes(s.key);
                return (
                  <div key={s.key} className={`ct-sport-tile${sel ? " sel" : ""}`}
                    onClick={() => toggleSport(s.key)}>
                    <div className="ct-sport-ico">{s.icon}</div>
                    <span className="ct-sport-name">{s.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="ct-footer">
              <button className="ct-btn-back" onClick={back}>← Back</button>
              <button className="ct-btn-next" onClick={next} disabled={selectedSports.length === 0}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Format ── */}
        {step === 3 && (
          <div className="ct-card">
            <div className="ct-step-eyebrow">Step 3 of 5</div>
            <div className="ct-step-title">Format & Visibility</div>
            <div className="ct-step-hint">How matches are structured.</div>

            {events.map((ev) => (
              <div key={ev.sport_key}>
                {isMultiSport && (
                  <div className="ct-sport-divider">{si(ev.sport_key)} {sl(ev.sport_key)}</div>
                )}
                {FORMATS.map((f) => {
                  const sel = ev.format === f.value;
                  return (
                    <div key={f.value} className={`ct-format-item${sel ? " sel" : ""}`}
                      onClick={() => setEventFormat(ev.sport_key, f.value)}>
                      <div className="ct-format-name">{f.label}</div>
                      <div className="ct-format-sub">{f.sub}</div>
                    </div>
                  );
                })}
              </div>
            ))}

            <div style={{ marginTop: 6 }}>
              <div style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 11, fontWeight: 800, letterSpacing: "1.5px",
                textTransform: "uppercase", color: "var(--brown)", marginBottom: 6,
              }}>
                Visibility
              </div>
              <div className="ct-vis-row">
                <button className={`ct-vis-btn${visibility === "public" ? " active" : ""}`}
                  onClick={() => setVisibility("public")}>🌐 Public</button>
                <button className={`ct-vis-btn${visibility === "private" ? " active" : ""}`}
                  onClick={() => setVisibility("private")}>🔒 Private</button>
              </div>
            </div>

            <div className="ct-footer">
              <button className="ct-btn-back" onClick={back}>← Back</button>
              <button className="ct-btn-next" onClick={next}
                disabled={!events.every((e) => e.format !== "")}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Details ── */}
        {step === 4 && (
          <div className="ct-card">
            <div className="ct-step-eyebrow">Step 4 of 5</div>
            <div className="ct-step-title">Tournament Details</div>
            <div className="ct-step-hint">Name your tournament and fill in optional info.</div>

            <div className="ct-field">
              <label>Tournament Name *</label>
              <input
                autoFocus
                placeholder="e.g. Tenx TT Championship 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && name.trim() && next()}
              />
            </div>

            <div className="ct-field-row">
              <div className="ct-field">
                <label>Venue</label>
                <input placeholder="e.g. Main Hall" value={venue}
                  onChange={(e) => setVenue(e.target.value)} />
              </div>
              <div className="ct-field">
                <label>City</label>
                <input placeholder="e.g. Mumbai" value={city}
                  onChange={(e) => setCity(e.target.value)} />
              </div>
            </div>

            <div className="ct-field">
              <label>Start Date</label>
              <input type="date" value={startDate}
                onChange={(e) => setStartDate(e.target.value)} />
            </div>

            {/* Event name overrides — empty by default, placeholder shows the auto-name */}
            {events.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 12, borderTop: "1px solid var(--sand)" }}>
                <div style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 11, fontWeight: 800, letterSpacing: "1.5px",
                  textTransform: "uppercase", color: "var(--brown)", marginBottom: 10,
                }}>
                  Event Names <span style={{ fontWeight: 400, fontSize: 10, color: "var(--muted)" }}>
                    (optional — leave blank for default)
                  </span>
                </div>
                {events.map((ev, i) => (
                  <div key={ev.sport_key} className="ct-field">
                    <label>{si(ev.sport_key)} {sl(ev.sport_key)}</label>
                    <input
                      placeholder={`e.g. ${sl(ev.sport_key)} Singles`}
                      value={ev.name}
                      onChange={(e) =>
                        setEvents((p) => p.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="ct-footer">
              <button className="ct-btn-back" onClick={back}>← Back</button>
              <button className="ct-btn-next" onClick={next} disabled={!name.trim()}>
                Review →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5: Review ── */}
        {step === 5 && (
          <div className="ct-card">
            <div className="ct-step-eyebrow">Step 5 of 5 — Final Review</div>
            <div className="ct-step-title">Ready to Create?</div>
            <div className="ct-step-hint">Double-check your details before we go live.</div>

            <div>
              {[
                ["Name",       name],
                ["Type",       isMultiSport ? "Multi-Sport" : "Single Sport"],
                ["Visibility", visibility === "public" ? "🌐 Public" : "🔒 Private"],
                venue     && ["Venue",      venue],
                city      && ["City",       city],
                startDate && ["Start Date", startDate],
              ].filter(Boolean).map(([k, v]) => (
                <div key={k} className="ct-review-row">
                  <span className="ct-review-key">{k}</span>
                  <span className="ct-review-val">{v}</span>
                </div>
              ))}
            </div>

            <div className="ct-events-box">
              <div className="ct-events-box-title">Events ({events.length})</div>
              {events.map((ev) => (
                <div key={ev.sport_key} className="ct-event-row">
                  <span style={{ fontWeight: 600, color: "var(--ink)" }}>
                    {si(ev.sport_key)} {ev.name || sl(ev.sport_key) + " Singles"}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{fl(ev.format)}</span>
                </div>
              ))}
            </div>

            <div className="ct-footer">
              <button className="ct-btn-back" onClick={back}>← Back</button>
              <button className="ct-btn-create" onClick={handleCreate} disabled={loading}>
                {loading ? "Creating…" : "Create Tournament →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}