import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getWorkspace, transitionTournament, clearToken, getMe } from "../../../api/client";
import OrgHeader from "../../../components/shared/OrgHeader";
import SportSetupModal from "../../../components/organiser/SportSetupModal";

const LIFECYCLE = ["draft", "registration", "fixtures", "live", "completed"];
const LIFECYCLE_LABELS = {
  draft: "Draft", registration: "Reg", fixtures: "Fixtures", live: "Live", completed: "Done",
};

const SPORT_META = {
  table_tennis: { abbrev: "TT", label: "Table Tennis", type: "individual" },
  badminton:    { abbrev: "BD", label: "Badminton",    type: "individual" },
  cricket:      { abbrev: "CR", label: "Cricket",      type: "team"       },
  football:     { abbrev: "FB", label: "Football",     type: "team"       },
};

const STATUS_PILL = {
  draft:        "pill-gray",
  registration: "pill-gold",
  fixtures:     "pill-orange",
  live:         "pill-orange",
  completed:    "pill-green",
};

export default function TournamentOverview() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const [data, setData]           = useState(null);
  const [user, setUser]           = useState(null);
  const [msg,  setMsg]            = useState("");
  const [setupTarget, setSetupTarget] = useState(null); // event being configured

  const flash = (txt) => { setMsg(txt); setTimeout(() => setMsg(""), 3000); };

  const loadData = useCallback(async () => {
    try { setData(await getWorkspace(tournamentId)); }
    catch (e) { console.error(e); }
  }, [tournamentId]);

  useEffect(() => {
    getMe().then(setUser).catch(() => { clearToken(); navigate("/login"); });
    loadData();
  }, [loadData]);

  const handleTransition = async (status) => {
    try { await transitionTournament(tournamentId, status); loadData(); flash(`Phase → ${status}`); }
    catch (e) { flash("Error: " + e.message); }
  };

  const handleSetupComplete = (updatedEvent) => {
    setSetupTarget(null);
    loadData(); // refresh so badges update
    flash(`${updatedEvent.name} configured!`);
  };

  if (!data) return (
    <div className="auth-wrap">
      <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800,
        textTransform: "uppercase", letterSpacing: 2, color: "var(--muted)" }}>
        Loading…
      </div>
    </div>
  );

  const { tournament: t, events, stats } = data;
  const currentIdx = LIFECYCLE.indexOf(t.status);

  const unconfiguredCount = events.filter(ev => ev.is_configured === false).length;
  const allConfigured     = unconfiguredCount === 0;

  const handleEventCardClick = (ev) => {
    if (ev.is_configured === false) {
      // First click on unconfigured sport → open setup wizard
      setSetupTarget(ev);
    } else {
      navigate(`/organiser/tournament/${tournamentId}/event/${ev.event_id}`);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <OrgHeader
        user={user}
        onLogout={() => { clearToken(); navigate("/", { replace: true }); }}
        crumbs={[
          { label: "My Tournaments", path: "/organiser" },
          { label: t.name },
        ]}
        right={t.status === "live" ? (
          <div className="live-badge"><span className="live-dot" /> LIVE</div>
        ) : null}
      />

      {msg && <div className="flash success">{msg}</div>}

      <div className="tournament-overview-content" style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>

        {/* ── TITLE ── */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 900,
            textTransform: "uppercase", letterSpacing: -1, color: "var(--ink)", margin: "0 0 8px" }}>
            {t.name}
          </h1>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13,
            color: "var(--muted)", alignItems: "center" }}>
            {t.venue && <span>{t.venue}{t.city ? `, ${t.city}` : ""}</span>}
            {t.start_date && <span>{t.start_date}</span>}
            <span className={`pill ${STATUS_PILL[t.status] || "pill-gray"}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              {t.status === "live" && <span className="live-dot" style={{ width: 6, height: 6 }}/>}
              {LIFECYCLE_LABELS[t.status] || t.status}
            </span>
            {t.is_multi_sport && (
              <span className="pill pill-gold">Multi-Sport</span>
            )}
          </div>
        </div>

        {/* ── SETUP WARNING BANNER (multi-sport only) ── */}
        {t.is_multi_sport && !allConfigured && (
          <div style={{
            background: "rgba(255,204,0,0.12)", border: "1px solid rgba(255,204,0,0.4)",
            borderRadius: 10, padding: "14px 18px", marginBottom: 20,
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 11, fontFamily: "var(--font-display)", fontWeight: 800, letterSpacing: 1, color: "var(--gold)" }}>SETUP</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink)", marginBottom: 2 }}>
                {unconfiguredCount} sport{unconfiguredCount !== 1 ? "s" : ""} need setup
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Click each sport card below to configure it. Fixture generation is disabled until all sports are set up.
              </div>
            </div>
          </div>
        )}

        {/* ── STATS ── */}
        <div className="stats-grid" style={{ marginBottom: 20 }}>
          {[
            { label: "Events",  value: stats.total_events  },
            { label: "Players", value: stats.total_players },
            { label: "Matches", value: stats.total_matches },
            { label: "Live",    value: stats.live_matches,
              color: stats.live_matches > 0 ? "var(--primary)" : undefined },
          ].map(({ label, value, color }) => (
            <div key={label} className="stat-card">
              <div className="stat-num" style={color ? { color } : {}}>{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>

        {/* ── PHASE CONTROL ── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">Tournament Phase</div>

          <div className="lifecycle-stepper" style={{ display: "flex", alignItems: "center", marginBottom: 16, overflowX: "auto" }}>
            {LIFECYCLE.map((phase, i) => {
              const state = i < currentIdx ? "done" : i === currentIdx ? "active" : "pending";
              return (
                <div key={phase} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div
                      onClick={() => handleTransition(phase)}
                      className="lifecycle-dot"
                      style={{
                        background: state === "pending" ? "var(--elevated)" : "var(--primary)",
                        color:      state === "pending" ? "var(--subtle)"   : "var(--bg)",
                        boxShadow:  state === "active"  ? "0 0 0 3px var(--primary-dim)" : "none",
                        cursor: "pointer",
                        width: 24, height: 24, borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 800,
                        border: state === "pending" ? "2px solid var(--border)" : "none",
                        transition: "all .2s",
                      }}
                    >
                      {state === "done" ? "✓" : i + 1}
                    </div>
                    <span style={{
                      fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 800,
                      textTransform: "uppercase", letterSpacing: 1,
                      color: state === "pending" ? "var(--subtle)" : "var(--primary)",
                      marginTop: 4, whiteSpace: "nowrap",
                    }}>
                      {LIFECYCLE_LABELS[phase]}
                    </span>
                  </div>
                  {i < LIFECYCLE.length - 1 && (
                    <div style={{
                      flex: 1, height: 2, margin: "0 4px", marginBottom: 18,
                      background: i < currentIdx ? "var(--primary)" : "var(--border)",
                    }} />
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {LIFECYCLE.map(phase => (
              <button
                key={phase}
                onClick={() => handleTransition(phase)}
                className={t.status === phase ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
              >
                {LIFECYCLE_LABELS[phase]}
              </button>
            ))}
          </div>
        </div>

        {/* ── SHARE LINK ── */}
        <div className="card share-link-card"
          style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ flex: 1, fontFamily: "monospace", fontSize: 13,
            color: "var(--muted)", wordBreak: "break-all" }}>
            {window.location.origin}/t/{t.slug}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/t/${t.slug}`);
            flash("Copied!");
          }}>Copy Link</button>
          <button className="btn btn-outline btn-sm"
            onClick={() => window.open(`/t/${t.slug}`, "_blank")}>
            View ↗
          </button>
        </div>

        {/* ── EVENTS ── */}
        <div style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 800,
          letterSpacing: "2.5px", color: "var(--muted)", textTransform: "uppercase", marginBottom: 14 }}>
          {t.is_multi_sport ? "Sports — Click to Configure or Manage" : "Events — Click to Manage"}
        </div>

        {events.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--elevated)", margin: "0 auto 10px", opacity: .3 }} />
            <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 900,
              textTransform: "uppercase", letterSpacing: -0.5, color: "var(--ink)", marginBottom: 6 }}>
              No Events Yet
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              This tournament has no events configured.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 12 }}
            className="events-grid">
            {events.map(ev => {
              const sm = SPORT_META[ev.sport_key] || { abbrev: ev.sport_key?.slice(0,2).toUpperCase() || "?", label: ev.sport_key, type: "individual" };
              const needsSetup = ev.is_configured === false;

              return (
                <div
                  key={ev.event_id}
                  className="card card-interactive"
                  onClick={() => handleEventCardClick(ev)}
                  style={{
                    borderTop: needsSetup
                      ? "3px solid var(--gold)"
                      : "3px solid var(--primary)",
                    padding: "16px 18px",
                    opacity: needsSetup ? 0.92 : 1,
                    position: "relative",
                  }}
                >
                  {/* Setup Required badge */}
                  {needsSetup && (
                    <div style={{
                      position: "absolute", top: 10, right: 10,
                      background: "var(--gold)", color: "#1a1a1a",
                      borderRadius: 6, padding: "3px 8px",
                      fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 800,
                      textTransform: "uppercase", letterSpacing: 1,
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                      Setup Required
                    </div>
                  )}

                  {/* Sport icon + name */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
                    paddingRight: needsSetup ? 100 : 0 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                      background: needsSetup ? "rgba(255,204,0,0.12)" : "var(--primary-dim)",
                      border: `1px solid ${needsSetup ? "rgba(255,204,0,0.3)" : "rgba(255,107,53,0.2)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                    }}>
                      {sm.abbrev}
                    </div>
                    <div>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 900,
                        textTransform: "uppercase", letterSpacing: -0.5, color: "var(--ink)" }}>
                        {ev.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                        {needsSetup
                          ? "Click to configure this sport"
                          : `${sm.label} · ${ev.format?.replace(/_/g, " ") || ""}`}
                      </div>
                    </div>
                  </div>

                  {/* Type badge */}
                  <div style={{ marginBottom: 12 }}>
                    {needsSetup ? (
                      <span className="pill pill-gold">Pending Setup</span>
                    ) : (
                      <span className={sm.type === "team" ? "pill pill-gold" : "pill pill-green"}>
                        {sm.type === "team" ? "Team Sport" : "Individual"}
                      </span>
                    )}
                  </div>

                  {/* Stats (only for configured events) */}
                  {!needsSetup && (
                    <div style={{ display: "flex", gap: 16, paddingTop: 10,
                      borderTop: "1px solid var(--border)" }}>
                      {[
                        { label: ev.participant_type === "team" ? "Teams" : "Players", value: ev.player_count },
                        { label: "Matches", value: ev.match_count },
                        { label: "Done",    value: `${ev.done_count || 0}/${ev.match_count}` },
                        ev.live_count > 0 && { label: "Live", value: ev.live_count, color: "var(--primary)" },
                      ].filter(Boolean).map(({ label, value, color }) => (
                        <div key={label}>
                          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 900,
                            color: color || "var(--ink)", lineHeight: 1 }}>{value}</div>
                          <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700,
                            textTransform: "uppercase", letterSpacing: .5, marginTop: 2 }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: 10, textAlign: "right", fontFamily: "var(--font-display)",
                    fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase",
                    color: needsSetup ? "var(--gold)" : "var(--primary)" }}>
                    {needsSetup ? "Configure →" : "Manage →"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Sport setup modal ── */}
      {setupTarget && (
        <SportSetupModal
          event={setupTarget}
          onClose={() => setSetupTarget(null)}
          onSetupComplete={handleSetupComplete}
        />
      )}
    </div>
  );
}
