export const SPORT_LABELS = {
  table_tennis: "Table Tennis",
  badminton:    "Badminton",
  cricket:      "Cricket",
  football:     "Football",
};

export const SPORT_ICONS = {
  table_tennis: "🏓",
  badminton:    "🏸",
  cricket:      "🏏",
  football:     "⚽",
};

const STATUS_META = {
  live:      { label:"LIVE",     pillClass:"pill-orange" },
  upcoming:  { label:"UPCOMING", pillClass:"pill-gold"   },
  completed: { label:"DONE",     pillClass:"pill-green"  },
  draft:     { label:"DRAFT",    pillClass:"pill-gray"   },
};

export default function TournamentCard({ tournament: t, onClick }) {
  const allLive = t.events?.flatMap(e => e.live_matches || []) || [];
  const sm      = STATUS_META[t.status] || STATUS_META.upcoming;

  return (
    <div
      className="sport-card"
      onClick={onClick}
      style={{ cursor:"pointer", padding:"16px" }}
    >
      {/* Top row: name + status */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10, gap:8 }}>
        <div style={{ minWidth:0 }}>
          <h3 style={{
            fontFamily:"var(--font-display)", fontSize:15, fontWeight:900,
            textTransform:"uppercase", letterSpacing:-0.5,
            color:"var(--ink)", lineHeight:1.2, margin:0,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
          }}>{t.name}</h3>
          {t.org_name && <div style={{ fontSize:11, color:"var(--muted)", marginTop:3 }}>by {t.org_name}</div>}
        </div>
        <span className={`pill ${sm.pillClass}`} style={{ flexShrink:0 }}>
          {t.status === "live" && <span className="live-dot" style={{ width:6, height:6 }}/>}
          {sm.label}
        </span>
      </div>

      {/* Meta */}
      <div style={{ display:"flex", flexDirection:"column", gap:2, marginBottom:10, fontSize:12, color:"var(--muted)" }}>
        {t.city && <span>📍 {t.city}{t.state ? `, ${t.state}` : ""}</span>}
        {t.venue && <span>{t.venue}</span>}
        {t.start_date && <span>📅 {t.start_date}</span>}
      </div>

      {/* Sport badges */}
      <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:10 }}>
        {(t.sports || []).map(s => (
          <span key={s} style={{
            fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:.5,
            padding:"2px 8px", borderRadius:4,
            background:"var(--primary-dim)", color:"var(--primary)",
            border:"1px solid rgba(255,107,53,0.25)",
          }}>
            {SPORT_ICONS[s]||""} {SPORT_LABELS[s]||s}
          </span>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display:"flex", gap:16, paddingTop:10, borderTop:"1px solid var(--border)" }}>
        {[
          { label:"Players",  value: t.total_players },
          { label:"Matches",  value: t.total_matches },
          { label:"Done",     value: t.completed_matches, color:"var(--green)"   },
          t.live_count > 0 && { label:"Live", value: t.live_count, color:"var(--primary)" },
        ].filter(Boolean).map(({ label, value, color }) => (
          <div key={label} style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"var(--font-display)", fontSize:20, fontWeight:900, color: color||"var(--ink)", lineHeight:1 }}>{value}</div>
            <div style={{ fontSize:10, color:"var(--muted)", fontWeight:700, textTransform:"uppercase", letterSpacing:.5, marginTop:2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Live match previews */}
      {allLive.length > 0 && (
        <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:4 }}>
          {allLive.slice(0,3).map(m => (
            <div key={m.match_id} style={{
              display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              background:"var(--primary-dim)", border:"1px solid rgba(255,107,53,0.2)",
              borderRadius:6, padding:"5px 10px",
            }}>
              <span style={{ fontSize:12, fontWeight:600, color:"var(--ink)", maxWidth:90, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {m.current_server===1 && "🏓 "}{m.player_1?.name}
              </span>
              <span style={{ fontFamily:"var(--font-display)", fontSize:16, fontWeight:900, color:"var(--primary)", letterSpacing:1, minWidth:44, textAlign:"center" }}>
                {m.player_1?.score}–{m.player_2?.score}
              </span>
              <span style={{ fontSize:12, fontWeight:600, color:"var(--ink)", maxWidth:90, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {m.player_2?.name}{m.current_server===2 && " 🏓"}
              </span>
            </div>
          ))}
          {allLive.length > 3 && (
            <div style={{ fontSize:11, color:"var(--muted)", textAlign:"center" }}>+{allLive.length-3} more live</div>
          )}
        </div>
      )}
    </div>
  );
}