import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getWorkspace, transitionTournament, clearToken, getMe } from "../../../api/client";
import OrgHeader from "../../../components/shared/OrgHeader";

const LIFECYCLE = ["draft", "registration", "fixtures", "live", "completed"];
const LIFECYCLE_LABELS = {
  draft: "Draft", registration: "Registration",
  fixtures: "Fixtures", live: "Live", completed: "Done",
};

const SPORT_META = {
  table_tennis: { icon: "🏓", label: "Table Tennis", type: "individual" },
  badminton:    { icon: "🏸", label: "Badminton",    type: "individual" },
  cricket:      { icon: "🏏", label: "Cricket",      type: "team"       },
  football:     { icon: "⚽", label: "Football",     type: "team"       },
};

const STATUS_COLORS = {
  draft:        { color: "var(--muted)",    bg: "var(--sand)"     },
  registration: { color: "#a07010",         bg: "var(--yellow-bg)"},
  fixtures:     { color: "var(--green)",    bg: "var(--green-bg)" },
  live:         { color: "var(--live-red)", bg: "var(--live-bg)"  },
  completed:    { color: "var(--green)",    bg: "var(--green-bg)" },
};

export default function TournamentOverview() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const [data, setData]   = useState(null);
  const [user, setUser]   = useState(null);
  const [msg,  setMsg]    = useState("");

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3000); };

  const loadData = useCallback(async () => {
    try {
      const d = await getWorkspace(tournamentId);
      setData(d);
    } catch (e) { console.error(e); }
  }, [tournamentId]);

  useEffect(() => {
    getMe().then(setUser).catch(() => { clearToken(); navigate("/login"); });
    loadData();
  }, [loadData]);

  const handleTransition = async (status) => {
    try { await transitionTournament(tournamentId, status); loadData(); flash(`Phase → ${status}`); }
    catch (e) { flash("Error: " + e.message); }
  };

  if (!data) return (
    <div className="auth-wrap">
      <div style={{ color: "var(--muted)", fontFamily: "'Barlow Condensed',sans-serif", fontSize: 18, fontWeight: 700 }}>
        Loading…
      </div>
    </div>
  );

  const { tournament: t, events, stats } = data;
  const currentIdx = LIFECYCLE.indexOf(t.status);

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <OrgHeader
        user={user}
        onLogout={() => { clearToken(); navigate("/", { replace: true }); }}
        crumbs={[
          { label: "My Tournaments", path: "/organiser" },
          { label: t.name },
        ]}
        right={
          t.status === "live" ? (
            <div className="live-badge">
              <span className="live-dot" style={{ background: "#fff" }} /> LIVE
            </div>
          ) : null
        }
      />

      {msg && (
        <div style={{
          position: "fixed", top: 96, left: "50%", transform: "translateX(-50%)",
          background: "var(--ink)", color: "#fff",
          fontFamily: "'Barlow Condensed',sans-serif",
          fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
          padding: "9px 20px", borderRadius: 6, zIndex: 999,
          boxShadow: "0 4px 16px rgba(0,0,0,.2)",
        }}>{msg}</div>
      )}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>

        {/* ── Tournament title + meta ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontFamily: "'Barlow Condensed',sans-serif",
            fontSize: 32, fontWeight: 900, color: "var(--ink)", letterSpacing: -.5,
            marginBottom: 4,
          }}>
            {t.name}
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "var(--muted)" }}>
            {t.venue && <span>📍 {t.venue}{t.city ? `, ${t.city}` : ""}</span>}
            {t.start_date && <span>📅 {t.start_date}</span>}
            <span
              style={{
                fontFamily: "'Barlow Condensed',sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "1.5px",
                textTransform: "uppercase", padding: "2px 9px", borderRadius: 4,
                background: STATUS_COLORS[t.status]?.bg || "var(--sand)",
                color: STATUS_COLORS[t.status]?.color || "var(--muted)",
                border: `1px solid ${STATUS_COLORS[t.status]?.color || "var(--border)"}30`,
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              {t.status === "live" && (
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", background: "var(--live-red)",
                  display: "inline-block", animation: "blink 1.2s infinite",
                }} />
              )}
              {LIFECYCLE_LABELS[t.status] || t.status}
            </span>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4,1fr)",
          gap: 10, marginBottom: 28,
        }}>
          {[
            { label: "Events",  value: stats.total_events   },
            { label: "Players", value: stats.total_players  },
            { label: "Matches", value: stats.total_matches  },
            { label: "Live",    value: stats.live_matches, color: stats.live_matches > 0 ? "var(--live-red)" : undefined },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: "#fff", border: "1.5px solid var(--border)",
              borderRadius: 8, padding: "14px 16px",
            }}>
              <div style={{
                fontFamily: "'Barlow Condensed',sans-serif",
                fontSize: 28, fontWeight: 900, color: color || "var(--ink)", lineHeight: 1,
              }}>{value}</div>
              <div style={{
                fontFamily: "'Barlow Condensed',sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "2px",
                color: "var(--muted)", textTransform: "uppercase", marginTop: 3,
              }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── Phase control ── */}
        <div style={{
          background: "#fff", border: "1.5px solid var(--border)",
          borderRadius: 8, padding: "16px 18px", marginBottom: 28,
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed',sans-serif",
            fontSize: 11, fontWeight: 800, letterSpacing: "2.5px",
            color: "var(--muted)", textTransform: "uppercase", marginBottom: 12,
          }}>
            Tournament Phase
          </div>

          {/* Phase progress dots */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
            {LIFECYCLE.map((phase, i) => {
              const state = i < currentIdx ? "done" : i === currentIdx ? "active" : "pending";
              return (
                <div key={phase} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none" }}>
                    <div
                      onClick={() => handleTransition(phase)}
                      style={{
                        width: 24, height: 24, borderRadius: "50%", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: "'Barlow Condensed',sans-serif",
                        fontSize: 11, fontWeight: 800,
                        background: state === "done" ? "var(--green)" : state === "active" ? "var(--green)" : "var(--sand)",
                        color: state === "pending" ? "var(--muted)" : "#fff",
                        boxShadow: state === "active" ? "0 0 0 3px var(--green-bg)" : "none",
                        transition: "all .2s",
                      }}
                    >
                      {state === "done" ? "✓" : i + 1}
                    </div>
                    <span style={{
                      fontFamily: "'Barlow Condensed',sans-serif",
                      fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                      color: state === "pending" ? "var(--muted)" : "var(--green)",
                      marginTop: 4, whiteSpace: "nowrap",
                    }}>
                      {LIFECYCLE_LABELS[phase]}
                    </span>
                  </div>
                  {i < LIFECYCLE.length - 1 && (
                    <div style={{
                      flex: 1, height: 2, margin: "0 4px",
                      background: i < currentIdx ? "var(--green)" : "var(--sand)",
                      marginBottom: 16,
                    }} />
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {LIFECYCLE.map((phase) => (
              <button
                key={phase}
                onClick={() => handleTransition(phase)}
                style={{
                  fontFamily: "'Barlow Condensed',sans-serif",
                  fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                  padding: "6px 14px", borderRadius: 5, cursor: "pointer",
                  border: t.status === phase ? "none" : "1.5px solid var(--border)",
                  background: t.status === phase ? "var(--green)" : "var(--cream)",
                  color: t.status === phase ? "#fff" : "var(--muted)",
                  transition: "all .15s",
                }}
              >
                {LIFECYCLE_LABELS[phase]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Share link ── */}
        <div style={{
          background: "#fff", border: "1.5px solid var(--border)",
          borderRadius: 8, padding: "14px 16px",
          display: "flex", alignItems: "center", gap: 10, marginBottom: 28,
        }}>
          <div style={{ flex: 1, fontFamily: "monospace", fontSize: 13, color: "var(--muted)" }}>
            {window.location.origin}/t/{t.slug}
          </div>
          <button className="btn-primary" onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/t/${t.slug}`);
            flash("Copied!");
          }}>
            Copy Link
          </button>
          <button className="btn-outline" onClick={() => window.open(`/t/${t.slug}`, "_blank")}>
            View Public ↗
          </button>
        </div>

        {/* ── Events ── */}
        <div style={{
          fontFamily: "'Barlow Condensed',sans-serif",
          fontSize: 11, fontWeight: 800, letterSpacing: "2.5px",
          color: "var(--muted)", textTransform: "uppercase", marginBottom: 12,
        }}>
          Events — Click to Manage
        </div>

        {events.length === 0 ? (
          <div style={{
            background: "#fff", border: "1.5px solid var(--border)", borderRadius: 8,
            padding: "40px 20px", textAlign: "center",
          }}>
            <div style={{ fontSize: 32, marginBottom: 10, opacity: .4 }}>🏅</div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 18, fontWeight: 800, color: "var(--ink)", marginBottom: 6 }}>
              No Events Yet
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              This tournament has no events configured.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 12 }}>
            {events.map((ev) => {
              const sm = SPORT_META[ev.sport_key] || { icon: "🏅", label: ev.sport_key, type: "individual" };
              return (
                <div
                  key={ev.event_id}
                  onClick={() => navigate(`/organiser/tournament/${tournamentId}/event/${ev.event_id}`)}
                  style={{
                    background: "#fff",
                    border: "1.5px solid var(--border)",
                    borderTop: `4px solid var(--green)`,
                    borderRadius: 8,
                    padding: "18px 18px 14px",
                    cursor: "pointer",
                    transition: "all .15s",
                  }}
                  onMouseOver={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; e.currentTarget.style.borderColor = "var(--green-lt)"; }}
                  onMouseOut={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.borderTopColor = "var(--green)"; }}
                >
                  {/* Sport icon + name */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 8,
                      background: "var(--green-bg)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 20, flexShrink: 0,
                    }}>
                      {sm.icon}
                    </div>
                    <div>
                      <div style={{
                        fontFamily: "'Barlow Condensed',sans-serif",
                        fontSize: 17, fontWeight: 900, color: "var(--ink)", letterSpacing: .3,
                      }}>
                        {ev.name}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>
                        {sm.label} · {ev.format.replace(/_/g, " ")}
                      </div>
                    </div>
                  </div>

                  {/* Participant type badge */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                    <span style={{
                      fontFamily: "'Barlow Condensed',sans-serif",
                      fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                      padding: "2px 8px", borderRadius: 3,
                      background: sm.type === "team" ? "var(--yellow-bg)" : "var(--green-bg)",
                      color: sm.type === "team" ? "#a07010" : "var(--green)",
                      border: `1px solid ${sm.type === "team" ? "#d4a01740" : "#2d5a2730"}`,
                    }}>
                      {sm.type === "team" ? "Team Sport" : "Individual"}
                    </span>
                  </div>

                  {/* Stats */}
                  <div style={{
                    display: "flex", gap: 16,
                    paddingTop: 10, borderTop: "1px solid var(--sand)",
                  }}>
                    {[
                      { label: ev.participant_type === "team" ? "Teams" : "Players", value: ev.player_count },
                      { label: "Matches", value: ev.match_count },
                      { label: "Done", value: `${ev.done_count || 0}/${ev.match_count}` },
                      ev.live_count > 0 && { label: "Live", value: ev.live_count, color: "var(--live-red)" },
                    ].filter(Boolean).map(({ label, value, color }) => (
                      <div key={label} style={{ textAlign: "center" }}>
                        <div style={{
                          fontFamily: "'Barlow Condensed',sans-serif",
                          fontSize: 20, fontWeight: 900, color: color || "var(--ink)", lineHeight: 1,
                        }}>{value}</div>
                        <div style={{
                          fontSize: 10, color: "var(--muted)", fontWeight: 600,
                          textTransform: "uppercase", letterSpacing: .5, marginTop: 2,
                        }}>{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Manage arrow */}
                  <div style={{
                    marginTop: 12, textAlign: "right",
                    fontFamily: "'Barlow Condensed',sans-serif",
                    fontSize: 12, fontWeight: 700, letterSpacing: 1,
                    color: "var(--green)", textTransform: "uppercase",
                  }}>
                    Manage →
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}