/**
 * TournamentInfoEditor — 4 focused sections:
 *   overview      – plain textarea
 *   prize_pool    – structured list of { category, position, amount }
 *   rules         – plain textarea
 *   contact       – structured list of { name, phone } + entry_fee + reg_deadline
 *
 * Saved as a single JSON dict to tournament.tournament_info via PATCH.
 */
import { useState } from "react";
import { updateTournament } from "../../api/client";
import DatePicker from "../shared/DatePicker";

const POSITIONS = ["1st Place", "2nd Place", "3rd Place", "Runner Up"];

const empty = () => ({
  overview:   "",
  prize_pool: [],          // [{ category, position, amount }]
  rules:      "",
  contact: {
    entry_fee:    "",
    reg_deadline: "",
    persons:      [],      // [{ name, phone }]
  },
});

function parse(raw) {
  if (!raw) return empty();
  return {
    overview:   raw.overview   || "",
    prize_pool: raw.prize_pool || [],
    rules:      raw.rules      || "",
    contact: {
      entry_fee:    raw.contact?.entry_fee    || "",
      reg_deadline: raw.contact?.reg_deadline || "",
      persons:      raw.contact?.persons      || [],
    },
  };
}

// ── Small shared styles ────────────────────────────────────────
const labelStyle = {
  display: "block", fontSize: 11, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: 0.5,
  color: "var(--muted)", marginBottom: 5,
};
const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1.5px solid var(--border)",
  background: "var(--input-bg, var(--elevated))",
  color: "var(--ink)", fontSize: 13, boxSizing: "border-box",
  fontFamily: "inherit", outline: "none", transition: "border-color .15s",
};
const sectionHeadStyle = {
  fontSize: 11, fontWeight: 800, textTransform: "uppercase",
  letterSpacing: 1.5, color: "var(--muted)", marginBottom: 12,
};
const addBtnStyle = {
  background: "none", border: "1.5px dashed var(--border)",
  borderRadius: 8, padding: "8px 14px", cursor: "pointer",
  fontSize: 12, fontWeight: 700, color: "var(--muted)",
  width: "100%", fontFamily: "inherit", marginTop: 8,
  transition: "border-color .15s, color .15s",
};
const removeBtnStyle = {
  background: "none", border: "none", cursor: "pointer",
  color: "var(--muted)", fontSize: 18, lineHeight: 1,
  padding: "0 6px", flexShrink: 0, fontFamily: "inherit",
};

// ── Section wrapper ────────────────────────────────────────────
function Section({ title, icon, children }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1.5px solid var(--border)",
      borderRadius: 12, padding: "18px 18px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={sectionHeadStyle}>{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function TournamentInfoEditor({ orgId, tournamentId, initialInfo, onSaved }) {
  const [info,   setInfo]   = useState(() => parse(initialInfo));
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState("");

  const set = (key, val) => { setInfo(p => ({ ...p, [key]: val })); setSaved(false); };
  const setContact = (key, val) =>
    setInfo(p => ({ ...p, contact: { ...p.contact, [key]: val } }));

  // ── Prize pool helpers ───────────────────────────────────────
  const addPrize = () =>
    set("prize_pool", [...info.prize_pool, { category: "", position: "1st Place", amount: "" }]);
  const updatePrize = (i, field, val) =>
    set("prize_pool", info.prize_pool.map((p, idx) => idx === i ? { ...p, [field]: val } : p));
  const removePrize = (i) =>
    set("prize_pool", info.prize_pool.filter((_, idx) => idx !== i));

  // ── Contact person helpers ───────────────────────────────────
  const addPerson = () =>
    setInfo(p => ({ ...p, contact: { ...p.contact, persons: [...p.contact.persons, { name: "", phone: "" }] } }));
  const updatePerson = (i, field, val) =>
    setInfo(p => ({
      ...p,
      contact: {
        ...p.contact,
        persons: p.contact.persons.map((c, idx) => idx === i ? { ...c, [field]: val } : c),
      },
    }));
  const removePerson = (i) =>
    setInfo(p => ({
      ...p,
      contact: { ...p.contact, persons: p.contact.persons.filter((_, idx) => idx !== i) },
    }));

  // ── Save ─────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      await updateTournament(orgId, tournamentId, { tournament_info: info });
      setSaved(true);
      onSaved?.(info);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const focusStyle  = (e) => { e.target.style.borderColor = "var(--primary, #FF6B35)"; };
  const blurStyle   = (e) => { e.target.style.borderColor = "var(--border)"; };
  const primaryColor = "var(--primary, #FF6B35)";

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={sectionHeadStyle}>Info &amp; Rules</div>
        <button onClick={handleSave} disabled={saving}
          style={{
            padding: "9px 22px", borderRadius: 8, border: "none",
            background: saving ? "var(--elevated)" : primaryColor,
            color: saving ? "var(--muted)" : "#fff",
            fontWeight: 700, fontSize: 13,
            cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}>
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fee2e2",
          border: "1px solid #fca5a5", color: "#dc2626", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* ── Overview ── */}
        <Section title="Tournament Overview" icon="📋">
          <textarea
            value={info.overview}
            onChange={e => set("overview", e.target.value)}
            onFocus={focusStyle} onBlur={blurStyle}
            placeholder="Describe the tournament — its purpose, theme, number of teams, what makes it special…"
            rows={4}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.65 }}
          />
        </Section>

        {/* ── Prize Pool ── */}
        <Section title="Prize Pool" icon="🏆">
          {info.prize_pool.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
              No prizes added yet.
            </div>
          )}
          {info.prize_pool.map((prize, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto",
              gap: 8, marginBottom: 8, alignItems: "end",
            }}>
              <div>
                {i === 0 && <label style={labelStyle}>Category</label>}
                <input style={inputStyle} placeholder="e.g. Champions"
                  value={prize.category}
                  onChange={e => updatePrize(i, "category", e.target.value)}
                  onFocus={focusStyle} onBlur={blurStyle}
                />
              </div>
              <div>
                {i === 0 && <label style={labelStyle}>Position</label>}
                <select style={{ ...inputStyle, cursor: "pointer" }}
                  value={prize.position}
                  onChange={e => updatePrize(i, "position", e.target.value)}
                  onFocus={focusStyle} onBlur={blurStyle}
                >
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                {i === 0 && <label style={labelStyle}>Amount / Prize</label>}
                <input style={inputStyle} placeholder="e.g. ₹20,000 or Trophy"
                  value={prize.amount}
                  onChange={e => updatePrize(i, "amount", e.target.value)}
                  onFocus={focusStyle} onBlur={blurStyle}
                />
              </div>
              <button onClick={() => removePrize(i)} style={removeBtnStyle}
                title="Remove">×</button>
            </div>
          ))}
          <button onClick={addPrize}
            style={addBtnStyle}
            onMouseEnter={e => { e.target.style.borderColor = primaryColor; e.target.style.color = primaryColor; }}
            onMouseLeave={e => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--muted)"; }}
          >
            + Add Prize
          </button>
        </Section>

        {/* ── Rules ── */}
        <Section title="Rules & Regulations" icon="📏">
          <textarea
            value={info.rules}
            onChange={e => set("rules", e.target.value)}
            onFocus={focusStyle} onBlur={blurStyle}
            placeholder={`List your key rules — eligibility, conduct, match regulations, admin guidelines…\n\nExample:\n• Each team may register only one entry\n• Players must carry valid ID at all times\n• Walkovers awarded if team is absent 10 mins after match time\n• Red card = immediate disqualification\n• Committee decisions are final`}
            rows={7}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.65 }}
          />
        </Section>

        {/* ── Registration & Contact ── */}
        <Section title="Registration & Contact" icon="📞">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Entry Fee</label>
              <input style={inputStyle} placeholder="e.g. ₹3,000 per team"
                value={info.contact.entry_fee}
                onChange={e => setContact("entry_fee", e.target.value)}
                onFocus={focusStyle} onBlur={blurStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Registration Deadline</label>
              <DatePicker
                value={info.contact.reg_deadline}
                onChange={val => setContact("reg_deadline", val)}
                placeholder="Pick a date"
              />
            </div>
          </div>

          {info.contact.persons.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <label style={labelStyle}>Contact Persons</label>
              {info.contact.persons.map((person, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginBottom: 8 }}>
                  <input style={inputStyle} placeholder="Name"
                    value={person.name}
                    onChange={e => updatePerson(i, "name", e.target.value)}
                    onFocus={focusStyle} onBlur={blurStyle}
                  />
                  <input style={inputStyle} placeholder="Phone / WhatsApp"
                    value={person.phone}
                    onChange={e => updatePerson(i, "phone", e.target.value)}
                    onFocus={focusStyle} onBlur={blurStyle}
                  />
                  <button onClick={() => removePerson(i)} style={removeBtnStyle} title="Remove">×</button>
                </div>
              ))}
            </div>
          )}
          <button onClick={addPerson}
            style={addBtnStyle}
            onMouseEnter={e => { e.target.style.borderColor = primaryColor; e.target.style.color = primaryColor; }}
            onMouseLeave={e => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--muted)"; }}
          >
            + Add Contact Person
          </button>
        </Section>

      </div>

      {/* Bottom save */}
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={handleSave} disabled={saving}
          style={{
            padding: "9px 22px", borderRadius: 8, border: "none",
            background: saving ? "var(--elevated)" : primaryColor,
            color: saving ? "var(--muted)" : "#fff",
            fontWeight: 700, fontSize: 13,
            cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}>
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
