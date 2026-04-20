/**
 * TTScorer — fullscreen table tennis live scoring component.
 *
 * Displays current set score, set history, serve indicator.
 * Calls onScore(score_p1, score_p2, current_server) on every point.
 */
import { useState } from "react";

export default function TTScorer({ match, config, onScore, onUndoSet, onClose }) {
  const p1 = match.participants?.find((p) => p.position === 1);
  const p2 = match.participants?.find((p) => p.position === 2);
  const sets = (match.sets || []).sort((a, b) => a.set_number - b.set_number);
  const currentSet = sets.find((s) => !s.is_complete) || sets[sets.length - 1];
  const isDone = match.status === "done";

  const s1 = currentSet?.score_p1 ?? 0;
  const s2 = currentSet?.score_p2 ?? 0;

  const [firstServer, setFirstServer] = useState(match.current_server || 1);

  // Serve calculation
  const deuce_at = config.deuce_starts_at || 10;
  const isDeuce = s1 >= deuce_at && s2 >= deuce_at;
  const serving = isDone ? null : (() => {
    const total = s1 + s2;
    const other = firstServer === 1 ? 2 : 1;
    if (isDeuce) {
      const deuceTotal = total - (deuce_at * 2);
      return deuceTotal % 2 === 0 ? firstServer : other;
    }
    const interval = config.serve_interval || 2;
    const flips = Math.floor(total / interval);
    return flips % 2 === 0 ? firstServer : other;
  })();

  // Set winner check (for UI only — backend is authoritative)
  const pts = config.points_per_set || 11;
  const margin = config.win_margin || 2;
  const setWinner = (() => {
    if (isDeuce) {
      if (s1 - s2 >= margin) return 1;
      if (s2 - s1 >= margin) return 2;
    } else {
      if (s1 >= pts) return 1;
      if (s2 >= pts) return 2;
    }
    // Instant win
    const iw = config.instant_win;
    if (iw?.enabled) {
      if (s1 === iw.score && s2 === iw.opponent_score) return 1;
      if (s2 === iw.score && s1 === iw.opponent_score) return 2;
    }
    return null;
  })();

  const addPoint = (player) => {
    if (isDone || setWinner) return;
    const ns1 = player === 1 ? s1 + 1 : s1;
    const ns2 = player === 2 ? s2 + 1 : s2;
    onScore(ns1, ns2, serving);
  };

  const undoPoint = (player) => {
    if (player === 1 && s1 === 0) return;
    if (player === 2 && s2 === 0) return;
    const ns1 = player === 1 ? s1 - 1 : s1;
    const ns2 = player === 2 ? s2 - 1 : s2;
    onScore(ns1, ns2, serving);
  };

  const setsWon1 = sets.filter((s) => s.is_complete && s.winner_position === 1).length;
  const setsWon2 = sets.filter((s) => s.is_complete && s.winner_position === 2).length;

  const matchWinner = isDone
    ? (p1?.is_winner ? 1 : p2?.is_winner ? 2 : null)
    : null;

  const p1Name = p1?.player?.name ?? "Player 1";
  const p2Name = p2?.player?.name ?? "Player 2";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#0f0a00",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Top bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 16px", background: "#1a0a0a", borderBottom: "1px solid #2a1a0a",
      }}>
        <div style={{ color: "#7a6a50", fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
          {isDone ? "Match Complete" : `🔴 Live · Set ${currentSet?.set_number || 1}`}
        </div>
        <button onClick={onClose} style={{
          background: "transparent", color: "#7a6a50", border: "1px solid #333",
          borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12,
        }}>✕ Close</button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 16px 16px", gap: 16 }}>

        {/* Sets summary */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          {sets.filter((s) => s.is_complete).map((s) => (
            <span key={s.set_number} style={{
              fontSize: 12, padding: "3px 10px", borderRadius: 4, fontWeight: 700,
              background: "#1a1a1a", color: s.winner_position === 1 ? "#4ade80" : "#f87171",
              border: "1px solid #333",
            }}>
              S{s.set_number}: {s.score_p1}-{s.score_p2}
            </span>
          ))}
          <span style={{ fontSize: 14, fontWeight: 800, color: "#d4a017", alignSelf: "center" }}>
            {setsWon1} - {setsWon2}
          </span>
        </div>

        {/* Serve selector */}
        {!isDone && !setWinner && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
            {[1, 2].map((pos) => (
              <button key={pos} onClick={() => setFirstServer(pos)} style={{
                padding: "6px 16px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer",
                background: serving === pos ? "#d4a017" : "transparent",
                color: serving === pos ? "#1a1208" : "#aaa",
                border: serving === pos ? "2px solid #d4a017" : "2px solid #444",
              }}>
                {serving === pos && "🏓 "}{pos === 1 ? p1Name : p2Name}
              </button>
            ))}
          </div>
        )}

        {/* Score display */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ color: "#e8dfc8", fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
              {p1Name}
            </div>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif", fontSize: 72, fontWeight: 900, lineHeight: 1,
              color: matchWinner === 1 ? "#d4a017" : setWinner === 1 ? "#4ade80" : "#fff",
            }}>
              {s1}
            </div>
          </div>
          <div style={{ color: "#7a6a50", fontSize: 28, fontWeight: 700 }}>–</div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ color: "#e8dfc8", fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
              {p2Name}
            </div>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif", fontSize: 72, fontWeight: 900, lineHeight: 1,
              color: matchWinner === 2 ? "#d4a017" : setWinner === 2 ? "#4ade80" : "#fff",
            }}>
              {s2}
            </div>
          </div>
        </div>

        {/* Status label */}
        {isDeuce && !setWinner && (
          <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: "#f87171", letterSpacing: 1, textTransform: "uppercase" }}>
            {s1 === s2 ? "Deuce" : `Advantage ${s1 > s2 ? p1Name : p2Name}`}
          </div>
        )}

        {matchWinner && (
          <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: "#d4a017", letterSpacing: 2 }}>
            🏆 {matchWinner === 1 ? p1Name : p2Name} Wins!
          </div>
        )}

        {/* Point buttons */}
        {!isDone && (
          <div style={{ display: "flex", gap: 12 }}>
            {[1, 2].map((pos) => (
              <div key={pos} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <button onClick={() => addPoint(pos)} disabled={!!setWinner} style={{
                  width: "100%", padding: "14px 0", borderRadius: 8, fontSize: 18, fontWeight: 800,
                  fontFamily: "'Barlow Condensed', sans-serif",
                  background: setWinner ? "#333" : serving === pos ? "#3a7a33" : "#2d5a27",
                  color: "#fff", border: serving === pos && !setWinner ? "2px solid #d4a017" : "2px solid transparent",
                  cursor: setWinner ? "not-allowed" : "pointer", opacity: setWinner ? 0.5 : 1,
                }}>+ Point</button>
                <button onClick={() => undoPoint(pos)} disabled={(pos === 1 ? s1 : s2) === 0} style={{
                  width: "100%", padding: "8px 0", background: "transparent", color: "#7a6a50",
                  border: "1px solid #333", borderRadius: 6, fontSize: 13,
                  cursor: (pos === 1 ? s1 : s2) === 0 ? "not-allowed" : "pointer",
                  opacity: (pos === 1 ? s1 : s2) === 0 ? 0.4 : 1,
                }}>↩ Undo</button>
              </div>
            ))}
          </div>
        )}

        {/* Undo set */}
        {!isDone && sets.length > 0 && (
          <button onClick={onUndoSet} style={{
            width: "100%", padding: "10px 0", background: "transparent", color: "#7a6a50",
            border: "1px solid #333", borderRadius: 8, fontSize: 13, cursor: "pointer",
          }}>
            ↩ Undo Set
          </button>
        )}
      </div>
    </div>
  );
}
