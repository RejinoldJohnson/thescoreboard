import { useState, useRef, useEffect } from "react";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function toISO(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDisplay(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function todayISO() {
  const t = new Date();
  return toISO(t.getFullYear(), t.getMonth(), t.getDate());
}

/**
 * DatePicker — custom calendar popup, no external libraries.
 * Matches the app's design system via CSS variables.
 */
export default function DatePicker({
  value,
  onChange,
  label,
  placeholder = "Select a date",
}) {
  const today      = todayISO();
  const getView    = () => {
    if (value) {
      const [y, m] = value.split("-").map(Number);
      return { year: y, month: m - 1 };
    }
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth() };
  };

  const [open, setOpen]   = useState(false);
  const [view, setView]   = useState(getView);
  const containerRef      = useRef(null);

  // Sync calendar view to selected value when opening
  useEffect(() => { if (open) setView(getView()); }, [open, value]);

  // Close on outside click
  useEffect(() => {
    const close = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const prevMonth = () =>
    setView(v =>
      v.month === 0
        ? { year: v.year - 1, month: 11 }
        : { ...v, month: v.month - 1 }
    );

  const nextMonth = () =>
    setView(v =>
      v.month === 11
        ? { year: v.year + 1, month: 0 }
        : { ...v, month: v.month + 1 }
    );

  const firstWeekday  = new Date(view.year, view.month, 1).getDay();
  const daysInMonth   = new Date(view.year, view.month + 1, 0).getDate();

  const pickDay = (day) => {
    onChange(toISO(view.year, view.month, day));
    setOpen(false);
  };

  // ── Styles ─────────────────────────────────────────────────────
  const navBtn = {
    background:     "none",
    border:         "1px solid var(--border)",
    borderRadius:   6,
    width:          30,
    height:         30,
    cursor:         "pointer",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    fontSize:       18,
    lineHeight:     1,
    color:          "var(--ink)",
    flexShrink:     0,
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {label && (
        <label style={{
          display: "block", fontSize: 11, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: 1,
          color: "var(--muted)", marginBottom: 6,
        }}>
          {label}
        </label>
      )}

      {/* ── Trigger ── */}
      <div
        className="input"
        role="button"
        tabIndex={0}
        style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", userSelect: "none", gap: 8 }}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => (e.key === "Enter" || e.key === " ") && setOpen(o => !o)}
      >
        <span style={{ color: value ? "var(--ink)" : "var(--muted)", fontSize: 14, flex: 1 }}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--muted)", flexShrink: 0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8"  y1="2" x2="8"  y2="6"/>
          <line x1="3"  y1="10" x2="21" y2="10"/>
        </svg>
      </div>

      {/* ── Calendar popup ── */}
      {open && (
        <div style={{
          position:     "absolute",
          top:          "calc(100% + 6px)",
          left:         0,
          zIndex:       300,
          background:   "var(--surface)",
          border:       "1px solid var(--border-mid)",
          borderRadius: 12,
          boxShadow:    "var(--shadow-md)",
          padding:      16,
          minWidth:     296,
          animation:    "fadeIn .15s ease",
        }}>

          {/* Month / year header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 8 }}>
            <button type="button" style={navBtn} onClick={prevMonth}>‹</button>
            <span style={{
              fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800,
              textTransform: "uppercase", letterSpacing: "-0.5px", color: "var(--ink)",
            }}>
              {MONTHS[view.month]} {view.year}
            </span>
            <button type="button" style={navBtn} onClick={nextMonth}>›</button>
          </div>

          {/* Day-of-week headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
            {DAY_LABELS.map(d => (
              <div key={d} style={{
                textAlign: "center", fontSize: 10, fontWeight: 700,
                color: "var(--muted)", padding: "2px 0",
                fontFamily: "var(--font-display)", letterSpacing: 1,
              }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {/* Leading empty cells */}
            {Array(firstWeekday).fill(null).map((_, i) => <div key={`e${i}`} />)}

            {Array(daysInMonth).fill(null).map((_, i) => {
              const day        = i + 1;
              const iso        = toISO(view.year, view.month, day);
              const isSelected = iso === value;
              const isToday    = iso === today;

              return (
                <div
                  key={day}
                  onClick={() => pickDay(day)}
                  style={{
                    textAlign:   "center",
                    padding:     "7px 2px",
                    borderRadius: 7,
                    fontSize:    13,
                    cursor:      "pointer",
                    fontWeight:  isSelected ? 800 : isToday ? 700 : 400,
                    background:  isSelected ? "var(--primary)" : "transparent",
                    color:       isSelected ? "white" : isToday ? "var(--primary)" : "var(--ink)",
                    outline:     isToday && !isSelected ? "2px solid var(--primary)" : "none",
                    outlineOffset: -2,
                    transition:  "background .1s, color .1s",
                  }}
                  onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = "var(--primary-dim)"; }}
                  onMouseOut={e  => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                >
                  {day}
                </div>
              );
            })}
          </div>

          {/* Footer — clear + selected label */}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 24 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {value ? formatDisplay(value) : "No date selected"}
            </span>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                style={{ fontSize: 11, color: "var(--red)", background: "none", border: "none", cursor: "pointer", fontWeight: 700, padding: "0 4px" }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
