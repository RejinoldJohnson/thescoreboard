/**
 * FootballScorer — fullscreen Football match scorer.
 * + / − goal buttons, match minute, half selector.
 * Organiser presses "Full Time" to end match.
 * Stadium Lights design.
 */
import { useState } from "react";

export default function FootballScorer({ match, config, onScore, onFinish, onClose }) {
  const p1 = match.player_1 || {};
  const p2 = match.player_2 || {};
  const sets = match.sets || [];
  const currentSet = sets.find(s => !s.is_complete) || sets[0];
  const isDone = match.status === "done";
  const ls     = match.live_state || {};

  const halfDuration = config.half_duration_minutes || 45;
  const totalHalves  = config.halves || 2;

  const [goals1, setGoals1] = useState(currentSet?.score_p1 ?? (p1?.score ?? 0));
  const [goals2, setGoals2] = useState(currentSet?.score_p2 ?? (p2?.score ?? 0));
  const [minute, setMinute] = useState(ls.minute || 0);
  const [half,   setHalf]   = useState(ls.half || 1);

  const isLeading = goals1 > goals2 ? 1 : goals2 > goals1 ? 2 : 0;

  const c = {
    bg:"#0d0d0d", surface:"#1a1a1a", border:"#2a2a2a",
    orange:"#FF6B35", gold:"#FFCC00", green:"#22c55e",
    red:"#ef4444", muted:"#666", ink:"#fff",
  };

  const handleScore = () => onScore(goals1, goals2, { minute, half });
  const handleFullTime = () => onFinish(goals1 > goals2 ? 1 : goals2 > goals1 ? 2 : null);

  const GoalButton = ({ pos, score, setScore }) => (
    <div style={{ flex:1, textAlign:"center" }}>
      <div style={{ fontSize:12, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", color: !isDone && isLeading === pos ? c.gold : c.muted, marginBottom:10, transition:"color .2s" }}>
        {pos === 1 ? p1?.name||"Team 1" : p2?.name||"Team 2"}
        {isLeading === pos && !isDone && <span style={{ color:c.gold }}> ★</span>}
      </div>

      {/* Score */}
      <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:80, fontWeight:900, lineHeight:1, color: isDone && (pos===1?p1.is_winner:p2.is_winner) ? c.gold : isLeading===pos&&!isDone ? c.orange : c.ink, marginBottom:12, transition:"color .3s" }}>
        {score}
      </div>

      {/* +/- buttons */}
      {!isDone && (
        <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
          <button
            onClick={() => { setScore(v => Math.max(0, v-1)); }}
            style={{ width:48, height:48, borderRadius:10, background:"transparent", border:`2px solid ${c.border}`, color:c.muted, fontSize:22, cursor:"pointer", fontFamily:"'Unbounded',sans-serif", fontWeight:900 }}>
            −
          </button>
          <button
            onClick={() => { setScore(v => v+1); }}
            style={{ width:64, height:64, borderRadius:12, background:c.orange, border:`3px solid ${c.gold}`, color:c.bg, fontSize:28, cursor:"pointer", fontFamily:"'Unbounded',sans-serif", fontWeight:900, boxShadow:`0 0 24px ${c.orange}55`, transition:"all .15s" }}
            onMouseOver={e => e.currentTarget.style.transform="scale(1.08)"}
            onMouseOut={e => e.currentTarget.style.transform="scale(1)"}
          >
            +
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9999, background:c.bg, display:"flex", flexDirection:"column", overflow:"hidden", fontFamily:"'Space Grotesk',sans-serif" }}>

      {/* ── TOP BAR ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 20px", background:c.surface, borderBottom:`2px solid ${c.green}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:c.green, color:c.bg, fontFamily:"'Unbounded',sans-serif", fontSize:10, fontWeight:800, letterSpacing:2, textTransform:"uppercase", padding:"3px 10px", borderRadius:4 }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:c.bg, animation:"pulse 1.5s infinite", display:"inline-block" }}/>
            ⚽ {isDone ? "Full Time" : `${half===1?"1st":"2nd"} Half · ${minute}'`}
          </span>
        </div>
        <button onClick={onClose} style={{ background:"transparent", color:c.muted, border:`1px solid ${c.border}`, borderRadius:6, padding:"5px 14px", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit" }}>✕ Close</button>
      </div>

      <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"16px 20px 24px", gap:20, maxWidth:600, margin:"0 auto", width:"100%" }}>

        {/* ── SCORE ROW ── */}
        <div style={{ display:"flex", alignItems:"center", gap:20 }}>
          <GoalButton pos={1} score={goals1} setScore={setGoals1} />
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, flexShrink:0 }}>
            <div style={{ color:c.border, fontFamily:"'Unbounded',sans-serif", fontSize:24, fontWeight:900 }}>vs</div>
            {!isDone && isLeading === 0 && (
              <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:1.5, color:c.muted }}>Draw</div>
            )}
          </div>
          <GoalButton pos={2} score={goals2} setScore={setGoals2} />
        </div>

        {/* ── MATCH CLOCK ── */}
        {!isDone && (
          <div>
            <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color:c.muted, marginBottom:8, textAlign:"center" }}>Match Clock</div>
            <div style={{ display:"flex", gap:8 }}>
              {/* Minute */}
              <div style={{ flex:2 }}>
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <button onClick={() => setMinute(v=>Math.max(0,v-1))} style={{ padding:"8px 14px", background:c.surface, border:`1px solid ${c.border}`, borderRadius:8, color:c.muted, fontSize:16, cursor:"pointer" }}>−</button>
                  <div style={{ flex:1, textAlign:"center", fontFamily:"'Unbounded',sans-serif", fontSize:28, fontWeight:900, color:c.orange }}>
                    {minute}'
                  </div>
                  <button onClick={() => setMinute(v=>Math.min(halfDuration*totalHalves+15,v+1))} style={{ padding:"8px 14px", background:c.surface, border:`1px solid ${c.border}`, borderRadius:8, color:c.orange, fontSize:16, cursor:"pointer" }}>+</button>
                </div>
              </div>
              {/* Half */}
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", gap:4 }}>
                  {[1,2].map(h => (
                    <button key={h} onClick={() => setHalf(h)} style={{
                      flex:1, padding:"10px 0", borderRadius:8,
                      background: half===h?c.green:"transparent",
                      border:`2px solid ${half===h?c.green:c.border}`,
                      color: half===h?c.bg:c.muted,
                      fontFamily:"'Unbounded',sans-serif", fontSize:12, fontWeight:800, cursor:"pointer",
                    }}>
                      {h===1?"1st":"2nd"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick minute presets */}
            <div style={{ display:"flex", gap:4, marginTop:8, flexWrap:"wrap" }}>
              {[45, 46, 47, 48, 90, 91, 92, 93].filter(m => half===1?m<=50:m>44).slice(0,6).map(m => (
                <button key={m} onClick={() => setMinute(m)} style={{
                  padding:"4px 10px", background:c.surface, border:`1px solid ${c.border}`,
                  borderRadius:4, color:c.muted, fontSize:11, fontWeight:700, cursor:"pointer",
                  fontFamily:"'Unbounded',sans-serif",
                }}>
                  {m}'
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── DONE STATE ── */}
        {isDone && (
          <div style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:20, fontWeight:900, textTransform:"uppercase", letterSpacing:-1, color:c.gold }}>
              {goals1 === goals2 ? "Draw" : `🏆 ${goals1>goals2?p1?.name||"Team 1":p2?.name||"Team 2"} Win!`}
            </div>
            <div style={{ fontSize:13, color:c.muted, marginTop:8 }}>Full Time</div>
          </div>
        )}

        {/* ── ACTION BUTTONS ── */}
        {!isDone && (
          <div style={{ display:"flex", gap:8, marginTop:4 }}>
            <button
              onClick={handleScore}
              style={{ flex:1, padding:"14px 0", background:c.orange, border:"none", borderRadius:8, fontFamily:"'Unbounded',sans-serif", fontSize:13, fontWeight:900, textTransform:"uppercase", letterSpacing:1, color:c.bg, cursor:"pointer", boxShadow:`0 0 16px ${c.orange}33` }}>
              Update Score
            </button>
            <button
              onClick={handleFullTime}
              style={{ flex:1, padding:"14px 0", background:`${c.green}22`, border:`2px solid ${c.green}66`, borderRadius:8, fontFamily:"'Unbounded',sans-serif", fontSize:13, fontWeight:900, textTransform:"uppercase", letterSpacing:1, color:c.green, cursor:"pointer" }}>
              ⏱ Full Time
            </button>
          </div>
        )}
      </div>
    </div>
  );
}