import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getTournamentBySlug, getSportTournament } from "../api/client";

const POLL_INTERVAL = 5000;
const API_BASE = import.meta.env.VITE_API_URL || "/api";

// ── Public registration API (no auth needed) ──────────────────
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

// ── Status-aware views ────────────────────────────────────────

function DraftView({ tournament }) {
  return (
    <div style={{ maxWidth: 560, margin: "60px auto", padding: "0 24px", textAlign: "center" }}>
      <div style={{ fontSize: 52, marginBottom: 20 }}>🏗️</div>
      <h2 style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 28, fontWeight: 900, color: "var(--ink)", marginBottom: 10,
      }}>
        Tournament Not Yet Live
      </h2>
      <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.7, marginBottom: 24 }}>
        <strong style={{ color: "var(--ink)" }}>{tournament.name}</strong> is currently being set up
        by the organizer. Check back soon!
      </p>
      <div style={{
        background: "var(--yellow-bg)", border: "1.5px solid var(--yellow)",
        borderRadius: 8, padding: "14px 20px",
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 13, fontWeight: 700, color: "var(--brown)", letterSpacing: ".5px",
      }}>
        📢 Stay tuned — registration and live scores coming soon
      </div>
      {tournament.org_name && (
        <p style={{ marginTop: 24, fontSize: 13, color: "var(--muted)" }}>
          Organized by <strong style={{ color: "var(--ink)" }}>{tournament.org_name}</strong>
        </p>
      )}
    </div>
  );
}

function RegistrationView({ tournament, events }) {
  const [form,     setForm]     = useState({ name: "", phone: "", age: "", gender: "Male" });
  const [eventIds, setEventIds] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState(false);
  const [error,    setError]    = useState("");

  // Auto-select single event
  useEffect(() => {
    if (events.length === 1) setEventIds([events[0].event_id]);
  }, [events]);

  const toggleEvent = (id) => {
    setEventIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  };

  const handleSubmit = async () => {
    if (!form.name.trim())    return setError("Name is required.");
    if (!form.phone.trim())   return setError("Phone number is required.");
    if (eventIds.length === 0) return setError("Please select at least one event.");
    setLoading(true); setError("");
    try {
      await registerForTournament(tournament.tournament_id, {
        name:      form.name.trim(),
        phone:     form.phone.trim(),
        age:       parseInt(form.age) || null,
        gender:    form.gender,
        event_ids: eventIds,
      });
      setSuccess(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ maxWidth: 480, margin: "60px auto", padding: "0 24px", textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
        <h2 style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 28, fontWeight: 900, color: "var(--green)", marginBottom: 10,
        }}>
          You're Registered!
        </h2>
        <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.7 }}>
          Welcome <strong style={{ color: "var(--ink)" }}>{form.name}</strong>!
          You've been added to <strong style={{ color: "var(--ink)" }}>{tournament.name}</strong>.
          The organizer will assign you to matches once registration closes.
        </p>
        <div style={{
          marginTop: 20, background: "var(--green-bg)", border: "1.5px solid var(--green)",
          borderRadius: 8, padding: "12px 18px", fontSize: 13, color: "var(--green)",
          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: ".5px",
        }}>
          📲 Share this page with other participants!
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520, margin: "32px auto", padding: "0 24px" }}>
      <style>{`
        .reg-card {
          background: #fff; border: 1.5px solid var(--border);
          border-radius: 10px; padding: 28px;
        }
        .reg-title {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 22px; font-weight: 900; color: var(--ink);
          letter-spacing: .3px; margin-bottom: 4px;
        }
        .reg-sub { font-size: 13px; color: var(--muted); margin-bottom: 22px; }
        .reg-field { margin-bottom: 14px; }
        .reg-field label {
          display: block;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 11px; font-weight: 800; letter-spacing: 1.5px;
          text-transform: uppercase; color: var(--brown); margin-bottom: 5px;
        }
        .reg-field input, .reg-field select {
          width: 100%; border: 1.5px solid var(--border); border-radius: 7px;
          padding: 10px 12px; font-size: 14px; font-family: 'DM Sans', sans-serif;
          color: var(--ink); background: var(--cream); outline: none;
          transition: border .15s; box-sizing: border-box;
        }
        .reg-field input:focus, .reg-field select:focus {
          border-color: var(--green); background: #fff;
        }
        .reg-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .reg-event {
          border: 1.5px solid var(--border); border-radius: 7px;
          padding: 11px 14px; cursor: pointer; display: flex;
          align-items: center; gap: 10px; margin-bottom: 8px;
          transition: all .15s; background: var(--cream);
        }
        .reg-event:hover { border-color: var(--green); background: var(--green-bg); }
        .reg-event.sel  { border-color: var(--green); background: var(--green-bg); }
        .reg-event-check {
          width: 18px; height: 18px; border-radius: 4px; flex-shrink: 0;
          border: 2px solid var(--border); display: flex; align-items: center;
          justify-content: center; transition: all .15s;
        }
        .reg-event.sel .reg-event-check {
          background: var(--green); border-color: var(--green); color: #fff; font-size: 11px;
        }
        .reg-event-name {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 15px; font-weight: 800; color: var(--ink); letter-spacing: .3px;
        }
        .reg-event.sel .reg-event-name { color: var(--green); }
        .reg-event-meta { font-size: 12px; color: var(--muted); }
        .reg-btn {
          width: 100%; background: var(--green); color: #fff; border: none;
          padding: 12px; border-radius: 7px; cursor: pointer;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 16px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
          transition: all .15s; margin-top: 6px;
        }
        .reg-btn:hover    { background: var(--green-lt); }
        .reg-btn:disabled { opacity: .45; cursor: not-allowed; }
        .reg-error {
          background: var(--live-bg); border: 1px solid #e8c5c0;
          color: var(--live-red); font-size: 13px; padding: 9px 13px;
          border-radius: 6px; margin-bottom: 14px;
          font-family: 'Barlow Condensed', sans-serif; font-weight: 700; letter-spacing: .5px;
        }
      `}</style>

      <div className="reg-card">
        <div className="reg-title">Register for {tournament.name}</div>
        <div className="reg-sub">
          Fill in your details to join.
          {tournament.org_name && ` Organized by ${tournament.org_name}.`}
        </div>

        {error && <div className="reg-error">{error}</div>}

        {/* Event selection — only show if multiple events */}
        {events.length > 1 && (
          <div className="reg-field">
            <label>Select Events *</label>
            {events.map((ev) => {
              const sel = eventIds.includes(ev.event_id);
              return (
                <div key={ev.event_id}
                  className={`reg-event${sel ? " sel" : ""}`}
                  onClick={() => toggleEvent(ev.event_id)}
                >
                  <div className="reg-event-check">{sel && "✓"}</div>
                  <div>
                    <div className="reg-event-name">{ev.name}</div>
                    <div className="reg-event-meta">{ev.sport_key} · {ev.format}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="reg-field">
          <label>Full Name *</label>
          <input
            placeholder="e.g. Rahul Sharma"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>

        <div className="reg-field">
          <label>Phone Number *</label>
          <input
            placeholder="e.g. 9876543210"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>

        <div className="reg-field-row">
          <div className="reg-field">
            <label>Age</label>
            <input
              placeholder="e.g. 24"
              type="number"
              min="5" max="99"
              value={form.age}
              onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
            />
          </div>
          <div className="reg-field">
            <label>Gender</label>
            <select value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <button className="reg-btn" onClick={handleSubmit} disabled={loading}>
          {loading ? "Registering…" : "Register Now →"}
        </button>

        <p style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 12 }}>
          Your details will only be used for this tournament.
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function TournamentPublic() {
  const { slug, sportUrl } = useParams();
  const navigate = useNavigate();
  const [data,        setData]        = useState(null);
  const [error,       setError]       = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(() => {
    const fetcher = sportUrl
      ? getSportTournament(sportUrl, slug)
      : getTournamentBySlug(slug);
    fetcher
      .then((d) => { setData(d); setLastUpdated(new Date()); })
      .catch((e) => setError(e.message));
  }, [slug, sportUrl]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  if (error) return (
    <div className="auth-wrap">
      <div className="auth-box" style={{ textAlign: "center" }}>
        <h2 className="auth-brand">TheScoreBoard</h2>
        <p style={{ color: "var(--muted)" }}>Tournament not found.</p>
        <button className="btn-primary" onClick={() => navigate("/")}>Go Home</button>
      </div>
    </div>
  );

  if (!data) return (
    <div className="auth-wrap">
      <div style={{ color: "var(--muted)" }}>Loading…</div>
    </div>
  );

  const { tournament, events } = data;
  const status        = tournament.status || "draft";
  const allLive       = events.flatMap((ev) => ev.live_matches || []);
  const allMatches    = events.flatMap((ev) => ev.all_matches  || []);
  const liveMatches   = allMatches.filter((m) => m.status === "live");
  const doneMatches   = allMatches.filter((m) => m.status === "done");
  const scheduledMatches = allMatches.filter((m) => m.status === "scheduled");

  return (
    <div className="app">
      {/* ── Header ── */}
      <header
        className="header"
        style={tournament.primary_color ? { background: tournament.primary_color } : {}}
      >
        <div className="header-inner">
          <div>
            <div
              className="header-sub"
              style={{ cursor: "pointer" }}
              onClick={() => navigate("/")}
            >
              TheScoreBoard
            </div>
            <h1 className="header-title">{tournament.name}</h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {sportUrl && (
              <button className="btn-ghost" onClick={() => navigate(`/${sportUrl}`)}>← Back</button>
            )}
            {allLive.length > 0 && (
              <div className="live-badge">
                <span className="live-dot" style={{ background: "#fff" }} />
                {allLive.length} LIVE
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Info strip ── */}
      <div style={{ background: "#fff", borderBottom: "1.5px solid var(--border)", padding: "8px 16px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "var(--muted)" }}>
          {tournament.org_name  && <span>Organized by <strong style={{ color: "var(--ink)" }}>{tournament.org_name}</strong></span>}
          {tournament.venue     && <span>📍 {tournament.venue}{tournament.city ? `, ${tournament.city}` : ""}</span>}
          {tournament.start_date && <span>📅 {tournament.start_date}</span>}

          {/* Status pill */}
          {status === "draft" && (
            <span style={{
              marginLeft: "auto", fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 11, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase",
              background: "var(--sand)", color: "var(--brown)",
              border: "1px solid var(--border)", padding: "2px 9px", borderRadius: 4,
            }}>Draft</span>
          )}
          {status === "registration" && (
            <span style={{
              marginLeft: "auto", fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 11, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase",
              background: "var(--yellow-bg)", color: "var(--yellow)",
              border: "1px solid #d4a01750", padding: "2px 9px", borderRadius: 4,
            }}>🟡 Registration Open</span>
          )}
          {status === "live" && (
            <span style={{
              marginLeft: "auto", fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 11, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase",
              background: "var(--live-bg)", color: "var(--live-red)",
              border: "1px solid #c0392b50", padding: "2px 9px", borderRadius: 4,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%", background: "var(--live-red)",
                display: "inline-block", animation: "blink 1.2s infinite",
              }} />
              Live Now
            </span>
          )}
          {status === "completed" && (
            <span style={{
              marginLeft: "auto", fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 11, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase",
              background: "var(--green-bg)", color: "var(--green)",
              border: "1px solid #2d5a2750", padding: "2px 9px", borderRadius: 4,
            }}>✅ Completed</span>
          )}
        </div>
      </div>

      {/* ── STATUS-AWARE BODY ── */}

      {/* DRAFT — not yet live */}
      {status === "draft" && <DraftView tournament={tournament} />}

      {/* REGISTRATION — show form */}
      {status === "registration" && (
        <RegistrationView tournament={tournament} events={events} />
      )}

      {/* FIXTURES / LIVE / COMPLETED — show matches */}
      {(status === "fixtures" || status === "live" || status === "completed") && (
        <>
          {/* Live banner */}
          {allLive.length > 0 && (
            <div className="live-banner">
              {allLive.map((m, i) => (
                <div key={m.match_id ?? i} className="live-card">
                  <span className="live-tag">LIVE</span>
                  {m.table_number && (
                    <span style={{
                      fontSize: 11, background: "var(--sand)", color: "var(--brown)",
                      padding: "2px 6px", borderRadius: 3, fontWeight: 700,
                    }}>T{m.table_number}</span>
                  )}
                  <span className="live-name">
                    {m.current_server === 1 && "🏓 "}{m.player_1?.name}
                  </span>
                  <span className="live-score">
                    {m.player_1?.score ?? 0} – {m.player_2?.score ?? 0}
                  </span>
                  <span className="live-name">
                    {m.player_2?.name}{m.current_server === 2 && " 🏓"}
                  </span>
                  {m.sets?.length > 0 && (
                    <div style={{ display: "flex", gap: 3 }}>
                      {m.sets.filter((s) => s.is_complete).map((s) => (
                        <span key={s.set_number} style={{
                          fontSize: 10, padding: "1px 4px", borderRadius: 2,
                          background: "var(--cream)", fontWeight: 700, color: "var(--brown)",
                        }}>
                          {s.score_p1}-{s.score_p2}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Stats strip */}
          <div style={{ background: "#fff", borderBottom: "1.5px solid var(--border)" }}>
            <div style={{ maxWidth: 960, margin: "0 auto", padding: "10px 16px", display: "flex", gap: 20, flexWrap: "wrap" }}>
              <Stat label="Events"    value={events.length}          />
              <Stat label="Matches"   value={allMatches.length}      />
              <Stat label="Live"      value={liveMatches.length}     color="var(--live-red)" />
              <Stat label="Completed" value={doneMatches.length}     color="var(--green)"    />
              <Stat label="Upcoming"  value={scheduledMatches.length} />
            </div>
          </div>

          {/* Match list per event */}
          <div className="content">
            {events.length === 0 ? (
              <div className="empty">No events scheduled yet.</div>
            ) : (
              events.map((ev) => (
                <div key={ev.event_id} style={{ marginBottom: 28 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
                    paddingBottom: 8, borderBottom: "2px solid var(--border)",
                  }}>
                    <span style={{
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 20, fontWeight: 900, color: "var(--ink)",
                    }}>
                      {ev.name}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                      {ev.format}
                    </span>
                    {ev.live_matches?.length > 0 && (
                      <span style={{
                        fontSize: 11, background: "var(--live-red)", color: "#fff",
                        padding: "2px 8px", borderRadius: 4, fontWeight: 700,
                      }}>
                        🔴 {ev.live_matches.length} LIVE
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {ev.completed_matches}/{ev.total_matches} done
                    </span>
                  </div>
                  {(ev.all_matches || []).map((m) => (
                    <MatchRow key={m.match_id} match={m} />
                  ))}
                </div>
              ))
            )}

            {tournament.sponsors?.length > 0 && (
              <div className="card">
                <div className="card-title">Sponsors</div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                  {tournament.sponsors.map((s, i) => (
                    <div key={i} style={{ textAlign: "center" }}>
                      {s.logo_url && (
                        <img src={s.logo_url} alt={s.name}
                          style={{ maxHeight: 40, maxWidth: 100, marginBottom: 4 }} />
                      )}
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--brown)" }}>{s.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <footer className="footer">
        Powered by TheScoreBoard
        {status === "live" && " · Auto-refreshes every 5s"}
        {lastUpdated && ` · ${lastUpdated.toLocaleTimeString()}`}
      </footer>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────
function MatchRow({ match: m }) {
  const isLive = m.status === "live";
  const isDone = m.status === "done";
  const sets   = m.sets || [];
  const currentSet = sets.find((s) => !s.is_complete) || sets[sets.length - 1];

  return (
    <div className={`match-row ${isLive ? "match-live" : ""}`} style={{ flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 44 }}>
          <span className="match-round">R{m.round}</span>
          {m.table_number && (
            <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, marginTop: 2 }}>
              T{m.table_number}
            </span>
          )}
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{
            fontWeight: m.player_1?.is_winner ? 800 : 600, fontSize: 14,
            color: m.player_1?.is_winner ? "var(--green)" : "var(--ink)",
          }}>
            {m.current_server === 1 && isLive && "🏓 "}{m.player_1?.name}
          </span>
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 18, fontWeight: 900, minWidth: 48, textAlign: "center",
            color: isLive ? "var(--live-red)" : isDone ? "var(--green)" : "var(--muted)",
          }}>
            {isLive || isDone ? `${m.player_1?.score} – ${m.player_2?.score}` : "vs"}
          </span>
          <span style={{
            fontWeight: m.player_2?.is_winner ? 800 : 600, fontSize: 14,
            color: m.player_2?.is_winner ? "var(--green)" : "var(--ink)",
          }}>
            {m.player_2?.name}{m.current_server === 2 && isLive && " 🏓"}
          </span>
        </div>
        {isLive && <span className="live-tag">LIVE</span>}
        {isDone  && <span className="done-tag">FT</span>}
      </div>

      {sets.length > 0 && (isLive || isDone) && (
        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
          {sets.map((s) => (
            <span key={s.set_number} style={{
              fontSize: 11, padding: "2px 6px", borderRadius: 3, fontWeight: 700,
              background: s.is_complete ? "var(--green-bg)" : "var(--yellow-bg)",
              color: s.is_complete ? "var(--green)" : "var(--yellow)",
            }}>
              S{s.set_number}: {s.score_p1}-{s.score_p2}
            </span>
          ))}
        </div>
      )}

      {isLive && currentSet && !currentSet.is_complete && (
        <div style={{ textAlign: "center", fontSize: 12, color: "var(--live-red)", fontWeight: 700 }}>
          Set {currentSet.set_number}: {currentSet.score_p1} - {currentSet.score_p2}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
      <span style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 22, fontWeight: 800, color: color || "var(--ink)",
      }}>
        {value}
      </span>
      <span style={{
        fontSize: 11, color: "var(--muted)", fontWeight: 600,
        textTransform: "uppercase", letterSpacing: 1,
      }}>
        {label}
      </span>
    </div>
  );
}