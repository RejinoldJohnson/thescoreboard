/**
 * RoadToFinal — visual bracket for knockout tournaments.
 *
 * Stage names from backend:
 *   preliminary | round_of_32 | round_of_16 | quarter | semi | final | third_place
 *
 * Desktop: horizontal columns (left→right, earliest→latest round).
 * Mobile:  vertical stack (same order, top→bottom).
 *
 * Filtering: a stage column is only rendered if at least one match in it
 * has at least one real (non-"TBD") player name.
 */
import { useState, useEffect } from "react";

// ── Layout constants ──────────────────────────────────────────
const CARD_H    = 112; // approximate MatchCard height (header 26px + 2×player 42px + border 2px)
const CARD_G    = 12;  // gap between cards in the first-stage column
const BASE_UNIT = CARD_H + CARD_G; // vertical space one card claims in stage-0 column
const HEADER_H  = 58;  // fixed header height — same for every column to keep rows aligned
const COL_W     = 260; // column width

// ── Stage metadata ────────────────────────────────────────────
const STAGE_ORDER = ["preliminary", "round_of_32", "round_of_16", "quarter", "semi", "final"];

const STAGE_LABEL = {
  preliminary: "Qualifying",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarter:     "Quarter Finals",
  semi:        "Semi Finals",
  final:       "Final",
};

// ── Helpers ───────────────────────────────────────────────────
const hasRealPlayer = m =>
  (m.player_1?.name && m.player_1.name !== "TBD") ||
  (m.player_2?.name && m.player_2.name !== "TBD");

// ── Match Card ────────────────────────────────────────────────
function MatchCard({ match: m, isFinal }) {
  const isDone = m.status === "done";
  const isLive = m.status === "live";

  const hdrBg    = isDone ? "#059669" : isLive ? "#FF6B35" : "var(--elevated)";
  const hdrColor = isDone || isLive ? "#fff" : "var(--muted)";
  const hdrLabel = isDone ? "DONE" : isLive ? "LIVE" : "SCHEDULED";
  const hdrIcon  = isDone ? "✓"   : isLive ? "●"    : null;

  const PlayerRow = ({ player, bottom }) => {
    const isTBD    = !player?.name || player.name === "TBD";
    const isWinner = isDone && player?.is_winner;
    const isLoser  = isDone && !player?.is_winner && !isTBD;

    return (
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"9px 14px", minHeight:42,
        borderTop: bottom ? "1px solid var(--border)" : "none",
        background: isWinner ? "var(--green-dim)" : "transparent",
      }}>
        <div style={{ display:"flex", alignItems:"center", flex:1, minWidth:0, gap:8 }}>
          {/* 20px-wide slot keeps text aligned whether winner icon present or not */}
          <span style={{ width:18, flexShrink:0, textAlign:"center", fontSize:13 }}>
            {isWinner ? "🥇" : ""}
          </span>
          <span style={{
            fontSize:13,
            fontWeight: isWinner ? 700 : 500,
            color: isTBD ? "var(--muted)" : isLoser ? "var(--muted)" : "var(--ink)",
            textDecoration: isLoser ? "line-through" : "none",
            fontStyle: isTBD ? "italic" : "normal",
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
          }}>
            {player?.name || "TBD"}
          </span>
        </div>
        {!isTBD && (isDone || isLive) && (
          <span style={{
            fontFamily:"var(--font-display)",
            fontSize:16, fontWeight:900,
            color: isWinner ? "var(--green)" : "var(--muted)",
            flexShrink:0, marginLeft:12, minWidth:20, textAlign:"right",
          }}>
            {player?.score ?? 0}
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{
      background:"var(--surface)",
      border:`1.5px solid ${isFinal ? "rgba(234,179,8,0.45)" : "var(--border)"}`,
      borderRadius:10,
      overflow:"hidden",
      boxShadow: isFinal
        ? "0 4px 16px rgba(234,179,8,0.12)"
        : isLive
        ? "0 0 0 2px rgba(255,107,53,0.18)"
        : "0 1px 4px rgba(0,0,0,0.05)",
    }}>
      {/* Status header bar */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"5px 10px", background:hdrBg, minHeight:26,
      }}>
        <span style={{
          display:"flex", alignItems:"center", gap:5,
          fontFamily:"var(--font-display)", fontSize:9, fontWeight:800,
          color:hdrColor, textTransform:"uppercase", letterSpacing:1.5,
        }}>
          {hdrIcon && (
            <span style={{
              fontSize: isLive ? 7 : 10,
              display:"inline-block",
              ...(isLive ? { animation:"pulse 1.5s infinite" } : {}),
            }}>
              {hdrIcon}
            </span>
          )}
          {hdrLabel}
        </span>
        {m.table_number != null && (
          <span style={{
            background:"rgba(255,255,255,0.22)", borderRadius:4, padding:"2px 7px",
            fontFamily:"var(--font-display)", fontSize:9, fontWeight:800,
            color:hdrColor, letterSpacing:1,
          }}>
            T{m.table_number}
          </span>
        )}
      </div>
      <PlayerRow player={m.player_1} bottom={false} />
      <PlayerRow player={m.player_2} bottom={true}  />
    </div>
  );
}

// ── Round Column (desktop) ────────────────────────────────────
// stageIndex=0 → first/earliest visible stage (most matches)
// stageIndex=N-1 → final stage (1 match)
// Each match card is centred in a slot of height 2^stageIndex × BASE_UNIT.
// All columns share the same fixed-height header so match rows stay aligned.
function RoundColumn({ stage, matches, isFinalStage, thirdPlaceMatches, stageIndex }) {
  const label    = STAGE_LABEL[stage] || stage.replace(/_/g, " ");
  const slotSize = Math.pow(2, stageIndex) * BASE_UNIT;

  return (
    <div style={{ width:COL_W, flexShrink:0 }}>
      {/* Fixed-height header — same height on every column */}
      <div style={{ height:HEADER_H, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-end", paddingBottom:10 }}>
        {isFinalStage && <div style={{ fontSize:20, lineHeight:1, marginBottom:5 }}>🏆</div>}
        <span style={{
          display:"inline-block",
          fontFamily:"var(--font-display)",
          fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:2,
          padding:"4px 12px", borderRadius:6,
          color:      isFinalStage ? "#92700A"             : "var(--muted)",
          background: isFinalStage ? "rgba(234,179,8,0.1)" : "var(--elevated)",
          border:`1px solid ${isFinalStage ? "rgba(234,179,8,0.3)" : "var(--border)"}`,
        }}>
          {label}
        </span>
      </div>

      {/* Match slots — each card centred vertically in its proportional slot */}
      <div style={{ display:"flex", flexDirection:"column" }}>
        {matches.map(m => (
          <div key={m.match_id} style={{ height:slotSize, display:"flex", alignItems:"center" }}>
            <div style={{ width:"100%" }}>
              <MatchCard match={m} isFinal={isFinalStage} />
            </div>
          </div>
        ))}
      </div>

      {/* 3rd place — rendered below the Final column only */}
      {isFinalStage && thirdPlaceMatches?.length > 0 && (
        <div style={{ marginTop:24 }}>
          <div style={{ textAlign:"center", marginBottom:12 }}>
            <span style={{
              display:"inline-block",
              fontFamily:"var(--font-display)",
              fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:2,
              padding:"5px 12px", borderRadius:6,
              color:"#92400e", background:"rgba(180,83,9,0.08)",
              border:"1px solid rgba(180,83,9,0.22)",
            }}>
              🥉 3rd Place
            </span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {thirdPlaceMatches.map(m => <MatchCard key={m.match_id} match={m} isFinal={false} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────
function BracketLegend() {
  return (
    <div style={{
      display:"flex", alignItems:"center", justifyContent:"center",
      gap:20, marginTop:16, paddingTop:14,
      borderTop:"1px solid var(--border)",
      flexWrap:"wrap",
    }}>
      {[
        { bg:"var(--elevated)", border:"var(--border)", color:"var(--muted)", label:"Scheduled" },
        { bg:"#FF6B35",         border:"transparent",   color:"#fff",         label:"Live"      },
        { bg:"#059669",         border:"transparent",   color:"#fff",         label:"Completed" },
      ].map(item => (
        <div key={item.label} style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:12, height:12, borderRadius:3, background:item.bg, border:`1px solid ${item.border}`, flexShrink:0 }}/>
          <span style={{ fontSize:11, color:"var(--muted)", fontWeight:600 }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────
function EmptyBracket({ format }) {
  return (
    <div style={{ textAlign:"center", padding:"40px 20px" }}>
      <div style={{ fontSize:44, marginBottom:14 }}>🏆</div>
      <div style={{
        fontFamily:"var(--font-display)", fontSize:14, fontWeight:900,
        textTransform:"uppercase", letterSpacing:1, color:"var(--muted)", marginBottom:10,
      }}>
        Bracket Pending
      </div>
      <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.7, maxWidth:340, margin:"0 auto" }}>
        {format === "group_knockout"
          ? "The knockout draw will be generated once the group stage is complete."
          : "The bracket will appear once the tournament draw is published."}
      </p>
    </div>
  );
}

// ── Per-event bracket ─────────────────────────────────────────
function EventBracket({ event, isMobile }) {
  const matches = event.all_matches || [];

  const thirdPlaceAll = matches.filter(m => m.stage === "third_place");
  const thirdPlaceVisible = thirdPlaceAll.filter(hasRealPlayer);

  // Knockout stages exclude group and third_place
  const koMatches = matches.filter(m => m.stage !== "group" && m.stage !== "third_place");

  // Group by stage
  const byStage = {};
  for (const m of koMatches) {
    const s = m.stage;
    if (!s) continue;
    if (!byStage[s]) byStage[s] = [];
    byStage[s].push(m);
  }

  // Only render stages that have at least one real player
  const visibleStages = STAGE_ORDER.filter(s => byStage[s]?.some(hasRealPlayer));

  if (!visibleStages.length && !thirdPlaceVisible.length) {
    return <EmptyBracket format={event.format} />;
  }

  const finalStage = visibleStages.length ? visibleStages[visibleStages.length - 1] : null;

  // ── Mobile layout ─────────────────────────────────────────
  if (isMobile) {
    return (
      <div>
        {visibleStages.map(s => {
          const isFinal = s === finalStage;
          return (
            <div key={s} style={{ marginBottom:24 }}>
              {/* Stage header */}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, paddingBottom:8, borderBottom:"1px solid var(--border)" }}>
                {isFinal && <span style={{ fontSize:16 }}>🏆</span>}
                <span style={{
                  fontFamily:"var(--font-display)", fontSize:10, fontWeight:800,
                  textTransform:"uppercase", letterSpacing:2,
                  color: isFinal ? "#92700A" : "var(--muted)",
                }}>
                  {STAGE_LABEL[s] || s.replace(/_/g, " ")}
                </span>
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {byStage[s].map(m => <MatchCard key={m.match_id} match={m} isFinal={isFinal} />)}
              </div>

              {/* 3rd place shown after Final on mobile */}
              {isFinal && thirdPlaceVisible.length > 0 && (
                <div style={{ marginTop:20 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, paddingBottom:8, borderBottom:"1px solid var(--border)" }}>
                    <span style={{ fontSize:16 }}>🥉</span>
                    <span style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:2, color:"#92400e" }}>
                      3rd Place
                    </span>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {thirdPlaceVisible.map(m => <MatchCard key={m.match_id} match={m} isFinal={false} />)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <BracketLegend />
      </div>
    );
  }

  // ── Desktop layout ────────────────────────────────────────
  return (
    <div>
      <div style={{ overflowX:"auto", paddingBottom:8 }}>
        <div style={{ display:"flex", gap:32, minWidth:"max-content", padding:"4px 2px 12px", alignItems:"flex-start" }}>
          {visibleStages.map((s, si) => (
            <RoundColumn
              key={s}
              stage={s}
              matches={byStage[s]}
              isFinalStage={s === finalStage}
              thirdPlaceMatches={s === finalStage ? thirdPlaceVisible : null}
              stageIndex={si}
            />
          ))}
        </div>
      </div>
      <BracketLegend />
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────
export default function RoadToFinal({ events }) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);

  const relevant = events.filter(ev =>
    ev.format === "direct_knockout" || ev.format === "group_knockout"
  );
  if (!relevant.length) return null;

  return (
    <>
      {relevant.map((ev, i) => (
        <div key={ev.event_id} style={{ marginBottom: i < relevant.length - 1 ? 36 : 0 }}>
          {relevant.length > 1 && (
            <div style={{
              fontFamily:"var(--font-display)", fontSize:11, fontWeight:800,
              textTransform:"uppercase", letterSpacing:1,
              color:"var(--muted)", marginBottom:12,
            }}>
              {ev.name}
            </div>
          )}
          <EventBracket event={ev} isMobile={isMobile} />
        </div>
      ))}
    </>
  );
}
