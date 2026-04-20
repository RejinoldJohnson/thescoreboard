const SPORT_LABELS = {
    table_tennis: "Table Tennis",
    badminton: "Badminton",
    cricket: "Cricket",
    football: "Football",
  };
  const SPORT_ICONS = {
    table_tennis: "\uD83C\uDFD3",
    badminton: "\uD83C\uDFF8",
    cricket: "\uD83C\uDFCF",
    football: "\u26BD",
  };
  const STATUS_STYLES = {
    live: { bg: "#c0392b", color: "#fff", label: "LIVE" },
    upcoming: { bg: "#d4a017", color: "#1a1208", label: "UPCOMING" },
    completed: { bg: "#2d5a27", color: "#fff", label: "COMPLETED" },
  };
  
  export default function TournamentCard({ tournament: t, onClick }) {
    const allLiveMatches = t.events?.flatMap((e) => e.live_matches || []) || [];
    const st = STATUS_STYLES[t.status] || STATUS_STYLES.upcoming;
  
    return (
      <div className="t-card" onClick={onClick} style={t.primary_color ? { borderTopColor: t.primary_color } : {}}>
        {/* Status badge */}
        <div className="t-card-status" style={{ background: st.bg, color: st.color }}>
          {t.is_live && <span className="live-dot" style={{ background: "#fff" }} />}
          {st.label}
        </div>
  
        {/* Header */}
        <div className="t-card-header">
          <h3 className="t-card-name">{t.name}</h3>
          {t.org_name && <span className="t-card-meta">by {t.org_name}</span>}
          {t.city && <span className="t-card-meta">📍 {t.city}{t.state ? `, ${t.state}` : ""}</span>}
          {t.venue && <span className="t-card-meta">{t.venue}</span>}
          {t.start_date && <span className="t-card-meta">📅 {t.start_date}</span>}
        </div>
  
        {/* Sport badges */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
          {(t.sports || []).map((s) => (
            <span key={s} className="sport-badge">
              {SPORT_ICONS[s] || ""} {SPORT_LABELS[s] || s}
            </span>
          ))}
        </div>
  
        {/* Stats */}
        <div className="t-card-stats">
          <TCardStat num={t.total_players} label="Players" />
          <TCardStat num={t.total_matches} label="Matches" />
          <TCardStat num={t.completed_matches} label="Done" color="#2d5a27" />
          {t.live_count > 0 && <TCardStat num={t.live_count} label="Live" color="#c0392b" />}
        </div>
  
        {/* Live match previews */}
        {allLiveMatches.length > 0 && (
          <div className="t-card-live-matches">
            {allLiveMatches.slice(0, 3).map((m) => (
              <div key={m.match_id} className="t-live-match">
                <span className="t-live-name">
                  {m.current_server === 1 && "🏓 "}{m.player_1?.name}
                </span>
                <span className="t-live-score">{m.player_1?.score} – {m.player_2?.score}</span>
                <span className="t-live-name">
                  {m.player_2?.name}{m.current_server === 2 && " 🏓"}
                </span>
              </div>
            ))}
            {allLiveMatches.length > 3 && (
              <div style={{ fontSize: 11, color: "#7a6a50", textAlign: "center" }}>
                +{allLiveMatches.length - 3} more live
              </div>
            )}
          </div>
        )}
  
        {/* Event list when not live */}
        {allLiveMatches.length === 0 && (t.events || []).length > 0 && (
          <div style={{ marginTop: 8 }}>
            {t.events.map((e) => (
              <div key={e.event_id} style={{
                fontSize: 12, color: "#7a6a50",
                display: "flex", justifyContent: "space-between", padding: "2px 0",
              }}>
                <span>{e.name}</span>
                <span>{e.done_matches}/{e.total_matches}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  
  function TCardStat({ num, label, color }) {
    return (
      <div className="t-stat">
        <span className="t-stat-num" style={color ? { color } : {}}>{num}</span>
        <span className="t-stat-label">{label}</span>
      </div>
    );
  }
  
  export { SPORT_LABELS, SPORT_ICONS };