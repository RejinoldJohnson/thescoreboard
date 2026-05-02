/**
 * TTScorer — fullscreen Table Tennis & Badminton live scorer.
 * Stadium Lights design: deep black, electric orange accents, gold scores.
 */
import { useState } from "react";

export default function TTScorer({ match, config, onScore, onUndoSet, onClose }) {
  const parts = (match.participants || match.sets && []) || [];
  const p1 = match.player_1 || parts.find(p => p.position === 1);
  const p2 = match.player_2 || parts.find(p => p.position === 2);
  const sets = (match.sets || []).slice().sort((a, b) => a.set_number - b.set_number);
  const currentSet = sets.find(s => !s.is_complete) || sets[sets.length - 1];
  const isDone = match.status === "done";

  const s1 = currentSet?.score_p1 ?? 0;
  const s2 = currentSet?.score_p2 ?? 0;

  const [firstServer, setFirstServer] = useState(match.current_server || 1);

  const deuce_at = config.deuce_starts_at || 10;
  const isDeuce  = s1 >= deuce_at && s2 >= deuce_at;

  const serving = isDone ? null : (() => {
    const other = firstServer === 1 ? 2 : 1;
    if (isDeuce) {
      const deuceTotal = (s1 + s2) - (deuce_at * 2);
      return deuceTotal % 2 === 0 ? firstServer : other;
    }
    const interval = config.serve_interval || 2;
    const flips = Math.floor((s1 + s2) / interval);
    return flips % 2 === 0 ? firstServer : other;
  })();

  const pts    = config.points_per_set || 11;
  const margin = config.win_margin || 2;

  const setWinner = (() => {
    if (isDeuce) {
      if (s1 - s2 >= margin) return 1;
      if (s2 - s1 >= margin) return 2;
    } else {
      if (s1 >= pts) return 1;
      if (s2 >= pts) return 2;
    }
    const iw = config.instant_win;
    if (iw?.enabled) {
      if (s1 === iw.score && s2 === iw.opponent_score) return 1;
      if (s2 === iw.score && s1 === iw.opponent_score) return 2;
    }
    return null;
  })();

  const setsWon1 = sets.filter(s => s.is_complete && s.winner_position === 1).length;
  const setsWon2 = sets.filter(s => s.is_complete && s.winner_position === 2).length;
  const matchWinner = isDone ? (p1?.is_winner ? 1 : p2?.is_winner ? 2 : null) : null;

  const p1Name = p1?.name || p1?.player?.name || "Player 1";
  const p2Name = p2?.name || p2?.player?.name || "Player 2";

  const addPoint = (player) => {
    if (isDone || setWinner) return;
    const ns1 = player === 1 ? s1 + 1 : s1;
    const ns2 = player === 2 ? s2 + 1 : s2;
    onScore(ns1, ns2, serving);
  };

  const undoPoint = (player) => {
    if (player === 1 && s1 === 0) return;
    if (player === 2 && s2 === 0) return;
    onScore(player === 1 ? s1 - 1 : s1, player === 2 ? s2 - 1 : s2, serving);
  };

  // Colors
  const c = {
    bg:      "#0d0d0d",
    surface: "#1a1a1a",
    border:  "#2a2a2a",
    orange:  "#FF6B35",
    gold:    "#FFCC00",
    green:   "#22c55e",
    red:     "#ef4444",
    muted:   "#666",
    ink:     "#fff",
  };

  const scoreColor = (pos) => {
    if (matchWinner === pos) return c.gold;
    if (setWinner   === pos) return c.green;
    return c.ink;
  };

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:9999,
      background: c.bg,
      display:"flex", flexDirection:"column", overflow:"hidden",
      fontFamily:"'Space Grotesk', sans-serif",
    }}>

      {/* ── TOP BAR ── */}
      <div style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"10px 20px",
        background: c.surface,
        borderBottom: `2px solid ${c.orange}`,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{
            display:"inline-flex", alignItems:"center", gap:6,
            background:c.orange, color:c.bg,
            fontFamily:"'Unbounded',sans-serif",
            fontSize:10, fontWeight:800, letterSpacing:2, textTransform:"uppercase",
            padding:"3px 10px", borderRadius:4,
          }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:c.bg, animation:"pulse 1.5s infinite", display:"inline-block" }}/>
            {isDone ? "Final" : `Set ${currentSet?.set_number || 1}`}
          </span>
          <span style={{ fontSize:12, color:c.muted, fontWeight:600 }}>
            Sets: <strong style={{ color:c.orange }}>{setsWon1}</strong>
            <span style={{ color:c.border, margin:"0 6px" }}>—</span>
            <strong style={{ color:c.orange }}>{setsWon2}</strong>
          </span>
        </div>
        <button onClick={onClose} style={{
          background:"transparent", color:c.muted,
          border:`1px solid ${c.border}`,
          borderRadius:6, padding:"5px 14px", cursor:"pointer",
          fontSize:12, fontWeight:700, fontFamily:"inherit",
        }}>✕ Close</button>
      </div>

      <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"16px 20px 20px", gap:16, maxWidth:600, margin:"0 auto", width:"100%" }}>

        {/* ── SET HISTORY ── */}
        {sets.filter(s => s.is_complete).length > 0 && (
          <div style={{ display:"flex", justifyContent:"center", gap:6, flexWrap:"wrap" }}>
            {sets.filter(s => s.is_complete).map(s => (
              <span key={s.set_number} style={{
                fontSize:11, padding:"3px 10px", borderRadius:4, fontWeight:800,
                background: s.winner_position === 1 ? `${c.green}18` : `${c.red}18`,
                color: s.winner_position === 1 ? c.green : c.red,
                border: `1px solid ${s.winner_position === 1 ? c.green : c.red}44`,
                fontFamily:"'Unbounded',sans-serif",
              }}>
                S{s.set_number}: {s.score_p1}–{s.score_p2}
              </span>
            ))}
          </div>
        )}

        {/* ── SERVE SELECTOR ── */}
        {!isDone && !setWinner && (
          <div style={{ display:"flex", justifyContent:"center", gap:8 }}>
            {[1, 2].map(pos => (
              <button key={pos} onClick={() => setFirstServer(pos)} style={{
                padding:"7px 18px", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer",
                fontFamily:"inherit",
                background: serving === pos ? c.orange : "transparent",
                color:      serving === pos ? c.bg : c.muted,
                border:     serving === pos ? `2px solid ${c.orange}` : `2px solid ${c.border}`,
                transition:"all .15s",
              }}>
                {pos === 1 ? p1Name : p2Name}
              </button>
            ))}
          </div>
        )}

        {/* ── SCORE DISPLAY ── */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16 }}>
          {[
            { name: p1Name, score: s1, pos: 1 },
            null,
            { name: p2Name, score: s2, pos: 2 },
          ].map((side, i) =>
            side ? (
              <div key={side.pos} style={{ flex:1, textAlign:"center" }}>
                <div style={{
                  fontSize:11, fontWeight:700, letterSpacing:2, textTransform:"uppercase",
                  color: serving === side.pos && !isDone ? c.orange : c.muted,
                  marginBottom:8, transition:"color .15s",
                }}>
                  {side.name}
                </div>
                <div style={{
                  fontFamily:"'Unbounded',sans-serif",
                  fontSize: window.innerWidth < 400 ? 72 : 96,
                  fontWeight:900, lineHeight:1,
                  color: scoreColor(side.pos),
                  transition:"color .3s",
                }}>
                  {side.score}
                </div>
              </div>
            ) : (
              <div key="vs" style={{ color:c.border, fontSize:28, fontWeight:900, flexShrink:0 }}>—</div>
            )
          )}
        </div>

        {/* ── STATUS TEXT ── */}
        {isDeuce && !setWinner && (
          <div style={{ textAlign:"center", fontFamily:"'Unbounded',sans-serif", fontSize:12, fontWeight:800, textTransform:"uppercase", letterSpacing:2, color:c.red }}>
            {s1 === s2 ? "Deuce" : `Advantage ${s1 > s2 ? p1Name : p2Name}`}
          </div>
        )}
        {setWinner && !matchWinner && (
          <div style={{ textAlign:"center", fontFamily:"'Unbounded',sans-serif", fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:2, color:c.green }}>
            Set {currentSet?.set_number} → {setWinner === 1 ? p1Name : p2Name}
          </div>
        )}
        {matchWinner && (
          <div style={{ textAlign:"center", fontFamily:"'Unbounded',sans-serif", fontSize:16, fontWeight:900, textTransform:"uppercase", letterSpacing:2, color:c.gold }}>
            {matchWinner === 1 ? p1Name : p2Name} Wins!
          </div>
        )}

        {/* ── POINT BUTTONS ── */}
        {!isDone && (
          <div style={{ display:"flex", gap:12 }}>
            {[1, 2].map(pos => (
              <div key={pos} style={{ flex:1, display:"flex", flexDirection:"column", gap:6 }}>
                <button
                  onClick={() => addPoint(pos)}
                  disabled={!!setWinner}
                  style={{
                    width:"100%", padding:"18px 0", borderRadius:10,
                    fontFamily:"'Unbounded',sans-serif",
                    fontSize:15, fontWeight:900,
                    background: setWinner ? c.surface : serving === pos ? c.orange : `${c.orange}cc`,
                    color: setWinner ? c.muted : c.bg,
                    border: serving === pos && !setWinner ? `3px solid ${c.gold}` : "3px solid transparent",
                    cursor: setWinner ? "not-allowed" : "pointer",
                    opacity: setWinner ? .4 : 1,
                    transition:"all .15s",
                    boxShadow: serving === pos && !setWinner ? `0 0 20px ${c.orange}44` : "none",
                  }}
                >
                  + Point
                </button>
                <button
                  onClick={() => undoPoint(pos)}
                  disabled={(pos === 1 ? s1 : s2) === 0}
                  style={{
                    width:"100%", padding:"9px 0", background:"transparent",
                    color:c.muted, border:`1px solid ${c.border}`, borderRadius:8,
                    fontSize:12, fontWeight:700, fontFamily:"inherit",
                    cursor:(pos===1?s1:s2)===0?"not-allowed":"pointer",
                    opacity:(pos===1?s1:s2)===0?.35:1,
                  }}
                >↩ Undo</button>
              </div>
            ))}
          </div>
        )}

        {/* ── UNDO SET ── */}
        {!isDone && sets.length > 0 && (
          <button onClick={onUndoSet} style={{
            width:"100%", padding:"11px 0", background:"transparent",
            color:c.muted, border:`1px solid ${c.border}`, borderRadius:8,
            fontSize:12, fontWeight:700, fontFamily:"inherit", cursor:"pointer",
          }}>
            ↩ Undo Last Set
          </button>
        )}
      </div>
    </div>
  );
}