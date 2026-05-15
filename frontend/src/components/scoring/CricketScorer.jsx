/**
 * CricketScorer — fullscreen Cricket live scorer.
 *
 * Pre-match: toss setup (who bats first, overs, wickets)
 * Live: ball-by-ball scoring, wicket types, super over
 *
 * Data model (backend):
 *   Match set N = one innings  →  score_p1=runs, score_p2=wickets
 *   match.live_state = { batting_first, configured_overs, configured_wickets,
 *                        current_innings, runs, wickets, balls, ball_log }
 *
 * Props
 * ─────
 *   match    – match data from API
 *   config   – event sport_config (overs, wickets)
 *   onScore  – (runs, wickets, extra) → void
 *   onFinish – (winner_position | null | "super_over") → void
 *   onClose  – () → void
 */
import { useState, useEffect } from "react";

const DISMISSALS = [
  { key: "b",   label: "Bowled",          desc: "Stumps hit by ball" },
  { key: "lbw", label: "LBW",             desc: "Leg before wicket" },
  { key: "c",   label: "Caught",          desc: "Fielder catch" },
  { key: "cb",  label: "Caught & Bowled", desc: "Caught by bowler" },
  { key: "ro",  label: "Run Out",         desc: "Stumps hit while running" },
  { key: "hw",  label: "Hit Wicket",      desc: "Batter hits own stumps" },
  { key: "st",  label: "Stumped",         desc: "Keeper removes bails" },
  { key: "o",   label: "Other",           desc: "Handled ball / obstruction" },
];

const fmt = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;

const ballRuns = (label) => {
  if (label === "4")  return 4;
  if (label === "6")  return 6;
  if (label === "Wd" || label === "Nb") return 1;
  if (label === "B"  || label === "LB") return 1;
  const n = parseInt(label);
  return isNaN(n) ? 0 : n;
};

const isLegal = (label) => label !== "Wd" && label !== "Nb";

function BallDot({ label }) {
  const isW  = label.startsWith("W");
  const is4  = label === "4";
  const is6  = label === "6";
  const isExt = label === "Wd" || label === "Nb";
  const isBye = label === "B"  || label === "LB";
  const isDot = label === "•";

  const bg    = isW  ? "#dc2626" : is6  ? "#d97706" : is4  ? "#15803d"
              : isExt ? "#c2410c" : isBye ? "#6d28d9" : isDot ? "#1f2937" : "#1e3a2e";
  const color = isW || is6 ? "#fff" : is4 ? "#bbf7d0" : "#e2e8f0";

  return (
    <div style={{
      width:34, height:34, borderRadius:"50%", background:bg, color,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Unbounded',sans-serif",
      fontSize: label.length > 2 ? 7 : label.length > 1 ? 9 : 12,
      fontWeight:900, flexShrink:0,
      border: isW ? "2px solid #ef4444" : is6 ? "2px solid #f59e0b" : is4 ? "2px solid #22c55e" : "none",
      boxShadow: is6 ? "0 0 8px #f59e0b55" : is4 ? "0 0 6px #22c55e44" : "none",
    }}>
      {isW ? "W" : label}
    </div>
  );
}

function EmptySlot() {
  return (
    <div style={{
      width:34, height:34, borderRadius:"50%",
      border:"1.5px dashed #1a3a22", background:"transparent", flexShrink:0,
    }} />
  );
}

export default function CricketScorer({ match, config, onScore, onFinish, onClose }) {
  const ls      = match.live_state || {};
  const sets    = (match.sets || []).slice().sort((a, b) => a.set_number - b.set_number);
  const isDone  = match.status === "done";
  const innings = ls.current_innings || 1;

  const p1 = match.player_1 || {};
  const p2 = match.player_2 || {};

  // Config: setup values override event config
  const isSuperOver  = !!(ls.is_super_over) || innings >= 3;
  const maxOvers     = isSuperOver ? 1 : (ls.configured_overs   ?? config.overs   ?? 20);
  const maxWickets   = isSuperOver ? 2 : (ls.configured_wickets ?? config.wickets ?? 10);
  const battingFirst = ls.batting_first ?? null;

  // Batting team: odd innings = battingFirst, even innings = other
  const battingTeamPos = !battingFirst ? 1
    : (innings % 2 === 1 ? battingFirst : (3 - battingFirst));
  const battingName = battingTeamPos === 1 ? (p1?.name || "Team 1") : (p2?.name || "Team 2");
  const bowlingName = battingTeamPos === 1 ? (p2?.name || "Team 2") : (p1?.name || "Team 1");

  const inn1 = sets.find(s => s.set_number === 1);
  const inn2 = sets.find(s => s.set_number === 2);
  // For current innings, find the previous set for target
  const prevSet = innings >= 2 ? sets.find(s => s.set_number === innings - 1) : null;
  const target  = prevSet ? prevSet.score_p1 + 1 : null;

  // ── Local state ──────────────────────────────────────────
  const [st, setSt] = useState({
    runs:    ls.runs    ?? 0,
    wickets: ls.wickets ?? 0,
    balls:   ls.balls   ?? 0,
    log:     ls.ball_log ?? [],
  });

  const [showWicket,    setShowWicket]    = useState(false);
  const [showEndConf,   setShowEndConf]   = useState(false);
  const [setupDone,     setSetupDone]     = useState(!!battingFirst);
  const [setupBatFirst, setSetupBatFirst] = useState(1);
  const [setupOvers,    setSetupOvers]    = useState(config.overs || 20);
  const [setupWickets,  setSetupWickets]  = useState(config.wickets || 10);

  useEffect(() => {
    setSt({
      runs:    ls.runs    ?? 0,
      wickets: ls.wickets ?? 0,
      balls:   ls.balls   ?? 0,
      log:     ls.ball_log ?? [],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [innings]);

  useEffect(() => {
    if (ls.batting_first) setSetupDone(true);
  }, [ls.batting_first]);

  // ── Derived ───────────────────────────────────────────────
  const runsNeeded     = target ? Math.max(0, target - st.runs) : null;
  const ballsLeft      = maxOvers * 6 - st.balls;
  const allOut         = st.wickets >= maxWickets;
  const oversUp        = Math.floor(st.balls / 6) >= maxOvers;
  const targetAchieved = !!target && st.runs >= target;
  const canEndInnings  = allOut || oversUp || targetAchieved;
  const ballsInOver    = st.balls % 6;
  const matchWinner    = isDone
    ? (p1?.is_winner ? (p1?.name || "Team 1") : p2?.is_winner ? (p2?.name || "Team 2") : null)
    : null;
  const isKnockout = !!(match.stage && !["group"].includes(match.stage));

  // Detect tie: innings >= 2, innings ended (not by target), scores equal
  const prevSetRuns = prevSet?.score_p1 ?? null;
  const isTied = innings >= 2 && !targetAchieved && prevSetRuns !== null && st.runs === prevSetRuns;

  const currentOverLog = (() => {
    if (!st.log.length) return [];
    const result = [];
    let legal = 0;
    for (let i = st.log.length - 1; i >= 0; i--) {
      const b = st.log[i];
      result.unshift(b);
      if (isLegal(b)) legal++;
      if (legal >= ballsInOver) break;
    }
    return result.slice(-12);
  })();

  // ── Helpers ───────────────────────────────────────────────
  const deliver = (label, runs, legal, isWkt = false) => {
    const next = {
      runs:    st.runs + runs,
      wickets: st.wickets + (isWkt ? 1 : 0),
      balls:   st.balls   + (legal ? 1 : 0),
      log:     [...st.log, label],
    };
    setSt(next);
    onScore(next.runs, next.wickets, {
      half:               innings,
      minute:             next.balls,
      overs:              fmt(next.balls),
      cricket_live_state: { ball_log: next.log },
    });
  };

  const undo = () => {
    if (!st.log.length) return;
    const last = st.log[st.log.length - 1];
    const next = {
      runs:    Math.max(0, st.runs    - ballRuns(last)),
      wickets: Math.max(0, st.wickets - (last.startsWith("W") ? 1 : 0)),
      balls:   Math.max(0, st.balls   - (isLegal(last) ? 1 : 0)),
      log:     st.log.slice(0, -1),
    };
    setSt(next);
    onScore(next.runs, next.wickets, {
      half:               innings,
      minute:             next.balls,
      overs:              fmt(next.balls),
      cricket_live_state: { ball_log: next.log },
    });
  };

  const wicketOut   = (type) => { setShowWicket(false); deliver(`W(${type})`, 0, true, true); };
  const endInnings  = (superOver = false) => {
    setShowEndConf(false);
    onFinish(superOver ? "super_over" : null);
  };

  const confirmSetup = () => {
    setSetupDone(true);
    onScore(0, 0, {
      half: 1, minute: 0, overs: "0.0",
      cricket_live_state: {
        batting_first:      setupBatFirst,
        configured_overs:   setupOvers,
        configured_wickets: setupWickets,
      },
    });
  };

  const inningsLabel = isSuperOver ? `Super Over` : innings === 1 ? "1st Innings" : "2nd Innings";

  const c = {
    bg:"#060f06", surface:"#0a1e0a", surf2:"#0f2810", border:"#173517",
    green:"#16a34a", lime:"#4ade80", gold:"#f59e0b", red:"#ef4444",
    orange:"#f97316", purple:"#a855f7", muted:"#4b7055", ink:"#ecfdf5", badge:"#15803d",
  };

  // ── SETUP SCREEN ─────────────────────────────────────────
  if (!setupDone) {
    return (
      <div style={{ position:"fixed", inset:0, zIndex:9999, background:c.bg, display:"flex", flexDirection:"column", fontFamily:"'Space Grotesk',sans-serif" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 20px", background:c.surface, borderBottom:`2px solid ${c.green}` }}>
          <span style={{ fontFamily:"'Unbounded',sans-serif", fontSize:12, fontWeight:900, textTransform:"uppercase", letterSpacing:2, color:c.lime }}>
            Pre-Match Setup
          </span>
          <button onClick={onClose} style={{ background:"transparent", color:c.muted, border:`1px solid ${c.border}`, borderRadius:6, padding:"5px 14px", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit" }}>
            ✕ Close
          </button>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"20px", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ maxWidth:400, width:"100%" }}>

            {/* Toss */}
            <div style={{ background:c.surface, borderRadius:14, border:`1px solid ${c.border}`, padding:"20px", marginBottom:14 }}>
              <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:10, fontWeight:900, textTransform:"uppercase", letterSpacing:2, color:c.muted, marginBottom:14 }}>
                Toss — Who bats first?
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {[{ pos:1, name: p1?.name||"Team 1" }, { pos:2, name: p2?.name||"Team 2" }].map(({ pos, name }) => (
                  <button key={pos} onClick={() => setSetupBatFirst(pos)}
                    style={{
                      padding:"18px 10px", borderRadius:12, cursor:"pointer",
                      fontFamily:"inherit", fontSize:13, fontWeight:800, textAlign:"center",
                      background: setupBatFirst === pos ? `${c.green}25` : c.surf2,
                      border: `2px solid ${setupBatFirst === pos ? c.green : c.border}`,
                      color: setupBatFirst === pos ? c.lime : c.muted,
                    }}>
                    <div style={{ fontSize:20, marginBottom:6 }}>🏏</div>
                    {name}
                    {setupBatFirst === pos && (
                      <div style={{ fontSize:8, fontFamily:"'Unbounded',sans-serif", fontWeight:900, textTransform:"uppercase", letterSpacing:1, color:c.green, marginTop:6 }}>
                        Batting First ✓
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Overs & Wickets */}
            <div style={{ background:c.surface, borderRadius:14, border:`1px solid ${c.border}`, padding:"20px", marginBottom:14 }}>
              <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:10, fontWeight:900, textTransform:"uppercase", letterSpacing:2, color:c.muted, marginBottom:14 }}>
                Match Configuration
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
                {[
                  { label:"Overs", val:setupOvers,   set:setSetupOvers,   min:1,  max:50 },
                  { label:"Wickets", val:setupWickets, set:setSetupWickets, min:1, max:10 },
                ].map(({ label, val, set, min, max }) => (
                  <div key={label}>
                    <div style={{ fontSize:10, fontWeight:700, color:c.muted, marginBottom:8, textTransform:"uppercase", letterSpacing:1 }}>{label}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <button onClick={() => set(v => Math.max(min, v-1))}
                        style={{ width:36, height:36, borderRadius:8, background:c.surf2, border:`1px solid ${c.border}`, color:c.muted, fontSize:18, cursor:"pointer", fontFamily:"'Unbounded',sans-serif", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        −
                      </button>
                      <div style={{ flex:1, textAlign:"center", fontFamily:"'Unbounded',sans-serif", fontSize:26, fontWeight:900, color:c.lime }}>{val}</div>
                      <button onClick={() => set(v => Math.min(max, v+1))}
                        style={{ width:36, height:36, borderRadius:8, background:c.surf2, border:`1px solid ${c.border}`, color:c.lime, fontSize:18, cursor:"pointer", fontFamily:"'Unbounded',sans-serif", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={confirmSetup}
              style={{ width:"100%", padding:"16px 0", borderRadius:12, background:c.green, border:"none", color:"#fff", fontFamily:"'Unbounded',sans-serif", fontSize:14, fontWeight:900, textTransform:"uppercase", letterSpacing:1, cursor:"pointer", boxShadow:`0 0 20px ${c.green}44` }}>
              Start Match →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN SCORER ───────────────────────────────────────────
  return (
    <div style={{ position:"fixed", inset:0, zIndex:9999, background:c.bg, display:"flex", flexDirection:"column", overflow:"hidden", fontFamily:"'Space Grotesk',sans-serif" }}>

      {/* TOP BAR */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 20px", background:c.surface, borderBottom:`2px solid ${c.green}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:isSuperOver ? c.gold : c.badge, color:"#fff", fontFamily:"'Unbounded',sans-serif", fontSize:10, fontWeight:800, letterSpacing:2, textTransform:"uppercase", padding:"3px 10px", borderRadius:4 }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:"#fff", animation:"pulse 1.5s infinite", display:"inline-block" }} />
            {isDone ? "Match Over" : inningsLabel}
          </span>
          {!isDone && (
            <span style={{ fontSize:12, color:c.muted, fontWeight:600 }}>
              Batting: <strong style={{ color:c.lime }}>{battingName}</strong>
            </span>
          )}
          {isDone && matchWinner && (
            <span style={{ fontFamily:"'Unbounded',sans-serif", fontSize:12, fontWeight:900, color:c.gold }}>{matchWinner} Win!</span>
          )}
          {isDone && !matchWinner && (
            <span style={{ fontFamily:"'Unbounded',sans-serif", fontSize:12, fontWeight:900, color:c.muted }}>Match Tied</span>
          )}
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {!isDone && (
            <button onClick={() => setShowEndConf(true)}
              style={{ background:`${c.red}20`, color:c.red, border:`1px solid ${c.red}55`, borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit" }}>
              End Innings
            </button>
          )}
          <button onClick={onClose}
            style={{ background:"transparent", color:c.muted, border:`1px solid ${c.border}`, borderRadius:6, padding:"5px 14px", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit" }}>
            ✕ Close
          </button>
        </div>
      </div>

      {/* SCROLLABLE BODY */}
      <div style={{ flex:1, overflowY:"auto", padding:"14px 20px 24px" }}>
        <div style={{ maxWidth:520, margin:"0 auto", width:"100%" }}>

          {/* PREV INNINGS SUMMARY */}
          {innings >= 2 && prevSet && (
            <div style={{ background:c.surf2, borderRadius:10, border:`1px solid ${c.border}`, padding:"10px 16px", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color:c.muted, marginBottom:2 }}>
                  {isSuperOver ? "Super Over — " : "1st Innings · "}
                  {innings % 2 === 0
                    ? (battingFirst === 1 ? (p1?.name||"Team 1") : (p2?.name||"Team 2"))
                    : (battingFirst === 1 ? (p2?.name||"Team 2") : (p1?.name||"Team 1"))}
                </div>
                <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:22, fontWeight:900, color:c.lime }}>
                  {prevSet.score_p1}<span style={{ color:c.muted, fontSize:14 }}>/{prevSet.score_p2}</span>
                </div>
              </div>
              {target && (
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1, color:c.muted }}>Target</div>
                  <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:24, fontWeight:900, color:c.gold }}>{target}</div>
                </div>
              )}
            </div>
          )}

          {/* TARGET / CHASE STRIP */}
          {innings >= 2 && target && !isDone && (
            <div style={{ marginBottom:12, background: targetAchieved ? `${c.gold}15` : `${c.orange}10`, border:`1px solid ${targetAchieved ? c.gold : c.orange}44`, borderRadius:8, padding:"8px 14px" }}>
              {targetAchieved ? (
                <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:12, fontWeight:900, textTransform:"uppercase", letterSpacing:1, color:c.gold }}>
                  Target Achieved — End Innings
                </div>
              ) : (
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, fontWeight:700 }}>
                  <span style={{ color:c.muted }}>Need <strong style={{ color:c.lime }}>{runsNeeded}</strong> runs</span>
                  <span style={{ color:c.muted }}><strong style={{ color:c.lime }}>{ballsLeft}</strong> balls left</span>
                </div>
              )}
            </div>
          )}

          {/* MAIN SCOREBOARD */}
          <div style={{ background:c.surface, borderRadius:16, border:`1px solid ${c.border}`, padding:"20px 22px", marginBottom:14, position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:-50, right:-50, width:180, height:180, borderRadius:"50%", background:`radial-gradient(circle, ${c.green}15, transparent 70%)`, pointerEvents:"none" }} />

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:2, color:c.muted }}>{battingName}</div>
              <div style={{ fontSize:11, fontWeight:700, color:c.muted }}>Max {maxOvers} ov · {maxWickets} wkts</div>
            </div>

            <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:6 }}>
              <span style={{ fontFamily:"'Unbounded',sans-serif", fontSize:80, fontWeight:900, color:c.ink, lineHeight:1 }}>{st.runs}</span>
              <span style={{ fontFamily:"'Unbounded',sans-serif", fontSize:40, fontWeight:900, color:c.muted, lineHeight:1 }}>/{st.wickets}</span>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:15, fontWeight:700, color:c.lime }}>({fmt(st.balls)} ov)</span>
              {allOut  && <span style={{ background:`${c.red}20`,    color:c.red,    border:`1px solid ${c.red}55`,    borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:900, fontFamily:"'Unbounded',sans-serif", letterSpacing:1 }}>ALL OUT</span>}
              {oversUp && !allOut && <span style={{ background:`${c.orange}20`, color:c.orange, border:`1px solid ${c.orange}55`, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:900, fontFamily:"'Unbounded',sans-serif", letterSpacing:1 }}>OVERS UP</span>}
            </div>

            {st.balls > 0 && (
              <div style={{ marginTop:6, fontSize:11, color:c.muted }}>
                CRR: <strong style={{ color:c.lime }}>{(st.runs / (st.balls / 6)).toFixed(2)}</strong>
                {target && !targetAchieved && runsNeeded > 0 && ballsLeft > 0 && (
                  <span style={{ marginLeft:12 }}>
                    RRR: <strong style={{ color:c.gold }}>{(runsNeeded / (ballsLeft / 6)).toFixed(2)}</strong>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* THIS OVER */}
          <div style={{ background:c.surf2, borderRadius:10, border:`1px solid ${c.border}`, padding:"10px 14px", marginBottom:14 }}>
            <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color:c.muted, marginBottom:8 }}>
              Over {Math.floor(st.balls / 6) + 1} &nbsp;·&nbsp; {ballsInOver}/6 balls
            </div>
            <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
              {currentOverLog.map((b, i) => <BallDot key={i} label={b} />)}
              {Array.from({ length: Math.max(0, 6 - ballsInOver) }).map((_, i) => <EmptySlot key={`e${i}`} />)}
            </div>
          </div>

          {/* ACTION BUTTONS */}
          {!isDone && !canEndInnings && (
            <>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:8 }}>
                {[{ label:"•", runs:0, disp:"0" }, { label:"1", runs:1 }, { label:"2", runs:2 }, { label:"3", runs:3 }].map(b => (
                  <button key={b.label} onClick={() => deliver(b.label, b.runs, true)}
                    style={{ padding:"20px 0", borderRadius:10, fontFamily:"'Unbounded',sans-serif", fontSize:22, fontWeight:900, background:c.surf2, border:`1.5px solid ${c.border}`, color:c.ink, cursor:"pointer" }}>
                    {b.disp || b.label}
                  </button>
                ))}
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                <button onClick={() => deliver("4", 4, true)}
                  style={{ padding:"20px 0", borderRadius:10, fontFamily:"'Unbounded',sans-serif", fontSize:28, fontWeight:900, background:`${c.green}18`, border:`2px solid ${c.green}66`, color:c.lime, cursor:"pointer" }}>4</button>
                <button onClick={() => deliver("6", 6, true)}
                  style={{ padding:"20px 0", borderRadius:10, fontFamily:"'Unbounded',sans-serif", fontSize:28, fontWeight:900, background:`${c.gold}15`, border:`2px solid ${c.gold}66`, color:c.gold, cursor:"pointer", boxShadow:`0 0 12px ${c.gold}22` }}>6</button>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:6, marginBottom:8 }}>
                {[{ label:"Wd", disp:"Wide", runs:1, legal:false }, { label:"Nb", disp:"No Ball", runs:1, legal:false }, { label:"B", disp:"Bye", runs:1, legal:true }, { label:"LB", disp:"Leg Bye", runs:1, legal:true }].map(e => (
                  <button key={e.label} onClick={() => deliver(e.label, e.runs, e.legal)}
                    style={{ padding:"10px 0", borderRadius:8, fontFamily:"inherit", fontSize:11, fontWeight:800, background:`${c.orange}12`, border:`1px solid ${c.orange}40`, color:c.orange, cursor:"pointer", textTransform:"uppercase", letterSpacing:0.5 }}>
                    {e.disp}
                  </button>
                ))}
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:8, marginBottom:8 }}>
                <button onClick={() => setShowWicket(true)} disabled={st.wickets >= maxWickets}
                  style={{ padding:"16px 0", borderRadius:10, fontFamily:"'Unbounded',sans-serif", fontSize:14, fontWeight:900, letterSpacing:1, textTransform:"uppercase", background:`${c.red}15`, border:`2px solid ${c.red}55`, color:c.red, cursor: st.wickets >= maxWickets ? "not-allowed" : "pointer", opacity: st.wickets >= maxWickets ? 0.4 : 1 }}>
                  ● Wicket ({st.wickets}/{maxWickets})
                </button>
                <button onClick={undo} disabled={!st.log.length}
                  style={{ padding:"16px 18px", borderRadius:10, background:"transparent", border:`1px solid ${c.border}`, color:c.muted, fontSize:13, fontWeight:700, fontFamily:"inherit", cursor: st.log.length ? "pointer" : "not-allowed", opacity: st.log.length ? 1 : 0.3 }}>
                  ↩ Undo
                </button>
              </div>
            </>
          )}

          {/* END INNINGS CTA */}
          {!isDone && canEndInnings && (
            <div style={{ marginBottom:8 }}>
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                {[{ label:"•", runs:0, disp:"0" }, { label:"1", runs:1 }, { label:"2", runs:2 }, { label:"3", runs:3 }].map(b => (
                  <button key={b.label} onClick={() => deliver(b.label, b.runs, true)}
                    style={{ flex:1, padding:"14px 0", borderRadius:8, fontFamily:"'Unbounded',sans-serif", fontSize:18, fontWeight:900, background:c.surf2, border:`1px solid ${c.border}`, color:c.ink, cursor:"pointer" }}>
                    {b.disp || b.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowEndConf(true)}
                style={{ width:"100%", padding:"16px 0", borderRadius:10, fontFamily:"'Unbounded',sans-serif", fontSize:14, fontWeight:900, textTransform:"uppercase", letterSpacing:1, background: targetAchieved ? `${c.gold}18` : `${c.red}18`, border:`2px solid ${targetAchieved ? c.gold : c.red}`, color: targetAchieved ? c.gold : c.red, cursor:"pointer" }}>
                {targetAchieved
                  ? "Target Achieved — End Match"
                  : allOut
                  ? `All Out (${st.wickets}/${maxWickets}) — End Innings`
                  : `${maxOvers} Overs Up — End Innings`}
              </button>
              <button onClick={undo} disabled={!st.log.length}
                style={{ width:"100%", marginTop:6, padding:"10px 0", borderRadius:8, background:"transparent", border:`1px solid ${c.border}`, color:c.muted, fontSize:12, fontWeight:700, fontFamily:"inherit", cursor: st.log.length ? "pointer" : "not-allowed", opacity: st.log.length ? 1 : 0.35 }}>
                ↩ Undo Last Ball
              </button>
            </div>
          )}

          {/* MATCH DONE */}
          {isDone && (
            <div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                {[
                  { label:"1st Innings", team: battingFirst === 1 ? (p1?.name||"Team 1") : (p2?.name||"Team 2"), set: inn1 },
                  { label:"2nd Innings", team: battingFirst === 1 ? (p2?.name||"Team 2") : (p1?.name||"Team 1"), set: inn2 },
                ].map((inns, i) => (
                  <div key={i} style={{ background:c.surf2, borderRadius:10, border:`1px solid ${c.border}`, padding:"12px 14px" }}>
                    <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1, color:c.muted, marginBottom:4 }}>{inns.label}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:c.ink, marginBottom:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{inns.team}</div>
                    <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:24, fontWeight:900, color:c.lime }}>
                      {inns.set?.score_p1 ?? 0}<span style={{ color:c.muted, fontSize:14 }}>/{inns.set?.score_p2 ?? 0}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ textAlign:"center", padding:"12px 0 4px" }}>
                <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:20, fontWeight:900, textTransform:"uppercase", letterSpacing:-1, color:c.gold }}>
                  {matchWinner ? `${matchWinner} Win!` : "Match Tied"}
                </div>
              </div>
            </div>
          )}

          {/* BALL LOG */}
          {st.log.length > 0 && !isDone && (
            <div style={{ marginTop:12, background:c.surf2, borderRadius:10, border:`1px solid ${c.border}`, padding:"10px 14px" }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color:c.muted, marginBottom:8 }}>
                Innings Log ({st.log.length} deliveries)
              </div>
              <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                {st.log.map((b, i) => (
                  <span key={i} style={{
                    fontSize:10, fontFamily:"'Unbounded',sans-serif", fontWeight:700,
                    padding:"2px 6px", borderRadius:3,
                    background:  b.startsWith("W") ? `${c.red}20`    : b === "6" ? `${c.gold}20`   : b === "4" ? `${c.green}20`  : (b==="Wd"||b==="Nb") ? `${c.orange}20` : c.surf2,
                    color:       b.startsWith("W") ? c.red            : b === "6" ? c.gold          : b === "4" ? c.lime          : (b==="Wd"||b==="Nb") ? c.orange        : c.muted,
                    border:`1px solid ${b.startsWith("W") ? `${c.red}40` : b==="6" ? `${c.gold}40` : b==="4" ? `${c.green}40` : c.border}`,
                  }}>
                    {b.startsWith("W(") ? b : b === "•" ? "0" : b}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* WICKET MODAL */}
      {showWicket && (
        <div style={{ position:"fixed", inset:0, zIndex:10000, background:"rgba(0,0,0,0.92)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:c.surface, border:`2px solid ${c.red}44`, borderRadius:16, padding:"24px", width:"100%", maxWidth:380 }}>
            <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:16, fontWeight:900, textTransform:"uppercase", letterSpacing:1, color:c.red, marginBottom:4 }}>Wicket!</div>
            <div style={{ fontSize:12, color:c.muted, marginBottom:18 }}>How was the batter dismissed? Wicket #{st.wickets + 1}</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
              {DISMISSALS.map(d => (
                <button key={d.key} onClick={() => wicketOut(d.key)}
                  style={{ padding:"12px 10px", borderRadius:10, background:`${c.red}10`, border:`1px solid ${c.red}33`, color:c.ink, fontFamily:"inherit", fontSize:13, fontWeight:700, cursor:"pointer", textAlign:"left", lineHeight:1.3 }}>
                  <div style={{ fontSize:11, fontWeight:900, color:c.red, marginBottom:2, fontFamily:"'Unbounded',sans-serif", textTransform:"uppercase" }}>{d.label}</div>
                  <div style={{ fontSize:10, color:c.muted }}>{d.desc}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setShowWicket(false)}
              style={{ width:"100%", padding:"10px 0", background:"transparent", color:c.muted, border:`1px solid ${c.border}`, borderRadius:8, fontSize:12, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* END INNINGS MODAL */}
      {showEndConf && (
        <div style={{ position:"fixed", inset:0, zIndex:10000, background:"rgba(0,0,0,0.88)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:c.surface, border:`1px solid ${c.border}`, borderRadius:14, padding:"24px", width:"100%", maxWidth:360 }}>
            <div style={{ fontFamily:"'Unbounded',sans-serif", fontSize:13, fontWeight:900, textTransform:"uppercase", letterSpacing:1, color:c.ink, marginBottom:6 }}>
              {isSuperOver ? "End Super Over?" : innings === 1 ? "End 1st Innings?" : targetAchieved ? "End Match?" : "End 2nd Innings?"}
            </div>
            <div style={{ fontSize:13, color:c.muted, marginBottom:6, lineHeight:1.5 }}>
              {battingName}: <strong style={{ color:c.lime }}>{st.runs}/{st.wickets}</strong> ({fmt(st.balls)} ov)
            </div>

            {innings === 1 && !isSuperOver && (
              <div style={{ fontSize:12, color:c.muted, marginBottom:16 }}>
                {bowlingName} will need <strong style={{ color:c.lime }}>{st.runs + 1}</strong> to win.
              </div>
            )}
            {innings >= 2 && !targetAchieved && inn1 && (
              <div style={{ fontSize:12, color:c.muted, marginBottom:16 }}>
                {isTied
                  ? "Scores are tied!"
                  : st.runs < (prevSet?.score_p1 ?? 0)
                  ? `${battingFirst === 1 ? (p1?.name||"Team 1") : (p2?.name||"Team 2")} wins by ${(prevSet?.score_p1 ?? 0) - st.runs} runs.`
                  : "Calculating result..."}
              </div>
            )}

            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <button onClick={() => endInnings(false)}
                style={{ padding:"13px 0", borderRadius:10, background:c.green, border:"none", color:"#fff", fontFamily:"'Unbounded',sans-serif", fontSize:12, fontWeight:900, textTransform:"uppercase", letterSpacing:1, cursor:"pointer" }}>
                {targetAchieved ? "Confirm Win" : innings === 1 ? "End 1st Innings" : "End Match"}
              </button>

              {/* Super over: tied 2nd innings (or super over) in knockout */}
              {innings >= 2 && isTied && isKnockout && (
                <button onClick={() => endInnings(true)}
                  style={{ padding:"13px 0", borderRadius:10, background:`${c.gold}18`, border:`2px solid ${c.gold}`, color:c.gold, fontFamily:"'Unbounded',sans-serif", fontSize:12, fontWeight:900, textTransform:"uppercase", letterSpacing:1, cursor:"pointer" }}>
                  ⚡ Super Over (Tied Match)
                </button>
              )}

              <button onClick={() => setShowEndConf(false)}
                style={{ padding:"11px 0", borderRadius:10, background:"transparent", border:`1px solid ${c.border}`, color:c.muted, fontFamily:"inherit", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
