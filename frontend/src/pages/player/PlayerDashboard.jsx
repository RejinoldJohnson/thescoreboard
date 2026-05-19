import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getMe, getPlayerProfile, savePlayerProfile, clearToken } from "../../api/client";
import OrgHeader from "../../components/shared/OrgHeader";
import PageLoader from "../../components/shared/PageLoader";

export default function PlayerDashboard() {
  const navigate = useNavigate();

  const [user,    setUser]    = useState(null);
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form,    setForm]    = useState({});
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [saved,   setSaved]   = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const u = await getMe();
        setUser(u);
        const p = await getPlayerProfile().catch(() => null);
        setProfile(p);
        if (!p) setEditing(true);
        else setForm({
          name: p.name || "", phone: p.phone || "",
          age: p.age != null ? String(p.age) : "",
          gender: p.gender || "Male", location: p.location || "",
        });
      } catch {
        navigate("/login", { replace: true });
      }
    }
    load();
  }, [navigate]);

  const handleSave = async () => {
    if (!form.name?.trim()) return setError("Name is required.");
    setSaving(true); setError("");
    try {
      const p = await savePlayerProfile({
        name: form.name.trim(), phone: form.phone?.trim() || null,
        age: parseInt(form.age) || null, gender: form.gender,
        location: form.location?.trim() || null,
      });
      setProfile(p);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const logout = () => { clearToken(); navigate("/login", { replace: true }); };

  const inputSt = {
    width:"100%", padding:"11px 12px", borderRadius:8,
    border:"1px solid var(--border)", background:"var(--input-bg, var(--elevated))",
    color:"var(--ink)", fontSize:14, boxSizing:"border-box",
  };
  const labelSt = {
    display:"block", fontSize:11, fontWeight:700, color:"var(--muted)",
    marginBottom:5, textTransform:"uppercase", letterSpacing:0.5,
  };

  if (!user) return <PageLoader />;

  return (
    <div className="app">
      <OrgHeader user={user} onLogout={logout} />

      <div style={{ maxWidth:540, margin:"0 auto", padding:"32px 20px 60px" }}>

        {/* Greeting */}
        <div style={{ marginBottom:28 }}>
          <div style={{ fontFamily:"var(--font-display)", fontSize:24, fontWeight:900, textTransform:"uppercase", letterSpacing:-1, color:"var(--ink)", marginBottom:4 }}>
            Player Dashboard
          </div>
          <div style={{ fontSize:14, color:"var(--muted)" }}>
            Welcome back, <strong style={{ color:"var(--ink)" }}>{user.name}</strong>
          </div>
        </div>

        {/* Profile card */}
        <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, overflow:"hidden", marginBottom:20 }}>
          <div style={{ padding:"14px 18px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ fontFamily:"var(--font-display)", fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:2, color:"var(--muted)" }}>Player Profile</div>
            {!editing && profile && (
              <button onClick={() => { setEditing(true); setForm({ name:profile.name||"", phone:profile.phone||"", age:profile.age!=null?String(profile.age):"", gender:profile.gender||"Male", location:profile.location||"" }); }} style={{ background:"none", border:"1px solid var(--border)", borderRadius:6, padding:"4px 12px", fontSize:12, fontWeight:600, color:"var(--muted)", cursor:"pointer" }}>
                Edit
              </button>
            )}
          </div>

          <div style={{ padding:"18px" }}>
            {!editing && profile && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px 20px" }}>
                {[
                  { label:"Name",     val:profile.name     },
                  { label:"Phone",    val:profile.phone    },
                  { label:"Age",      val:profile.age      },
                  { label:"Gender",   val:profile.gender   },
                  { label:"Location", val:profile.location },
                ].map(({ label, val }) => val ? (
                  <div key={label}>
                    <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, color:"var(--muted)", marginBottom:3 }}>{label}</div>
                    <div style={{ fontSize:14, fontWeight:600, color:"var(--ink)" }}>{val}</div>
                  </div>
                ) : null).filter(Boolean)}
              </div>
            )}

            {editing && (
              <div>
                {!profile && (
                  <div style={{ background:"rgba(255,107,53,.06)", border:"1px solid rgba(255,107,53,.2)", borderRadius:8, padding:"10px 13px", marginBottom:16, fontSize:12, color:"var(--muted)", lineHeight:1.5 }}>
                    Set up your player profile to register for tournaments.
                  </div>
                )}

                <div style={{ marginBottom:14 }}>
                  <label style={labelSt}>Full Name *</label>
                  <input className="input" style={inputSt} placeholder="Rahul Sharma" autoFocus
                    value={form.name || ""} onChange={e => setForm(f => ({...f, name:e.target.value}))} />
                </div>
                <div style={{ marginBottom:14 }}>
                  <label style={labelSt}>Phone</label>
                  <input className="input" type="tel" style={inputSt} placeholder="9876543210"
                    value={form.phone || ""} onChange={e => setForm(f => ({...f, phone:e.target.value}))} />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                  <div>
                    <label style={labelSt}>Age</label>
                    <input className="input" type="number" style={inputSt} placeholder="24" min="5" max="99"
                      value={form.age || ""} onChange={e => setForm(f => ({...f, age:e.target.value}))} />
                  </div>
                  <div>
                    <label style={labelSt}>Gender</label>
                    <select className="input" style={inputSt} value={form.gender || "Male"} onChange={e => setForm(f => ({...f, gender:e.target.value}))}>
                      <option>Male</option><option>Female</option><option>Other</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom:20 }}>
                  <label style={labelSt}>City / Location</label>
                  <input className="input" style={inputSt} placeholder="e.g. Chennai"
                    value={form.location || ""} onChange={e => setForm(f => ({...f, location:e.target.value}))} />
                </div>

                {error && (
                  <div style={{ background:"rgba(220,38,38,.08)", border:"1px solid rgba(220,38,38,.3)", borderRadius:8, padding:"9px 12px", marginBottom:14, fontSize:12, color:"#dc2626", fontWeight:600 }}>
                    {error}
                  </div>
                )}

                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={handleSave} disabled={saving} style={{ flex:1, padding:"12px", borderRadius:10, border:"none", background:"var(--primary)", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", opacity:saving ? 0.65 : 1 }}>
                    {saving ? "Saving…" : "Save Profile"}
                  </button>
                  {profile && (
                    <button onClick={() => setEditing(false)} style={{ padding:"12px 16px", borderRadius:10, border:"1px solid var(--border)", background:"var(--elevated)", color:"var(--muted)", fontSize:14, fontWeight:600, cursor:"pointer" }}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {saved && (
            <div style={{ padding:"10px 18px", background:"rgba(22,163,74,.08)", borderTop:"1px solid rgba(22,163,74,.2)", fontSize:12, fontWeight:700, color:"#16a34a" }}>
              ✓ Profile saved
            </div>
          )}
        </div>

        {/* Account info card */}
        <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, overflow:"hidden", marginBottom:20 }}>
          <div style={{ padding:"14px 18px", borderBottom:"1px solid var(--border)" }}>
            <div style={{ fontFamily:"var(--font-display)", fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:2, color:"var(--muted)" }}>Account</div>
          </div>
          <div style={{ padding:"16px 18px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px 20px" }}>
            <div>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, color:"var(--muted)", marginBottom:3 }}>Email</div>
              <div style={{ fontSize:13, fontWeight:600, color:"var(--ink)", wordBreak:"break-all" }}>{user.email}</div>
            </div>
            {user.name && (
              <div>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, color:"var(--muted)", marginBottom:3 }}>Name</div>
                <div style={{ fontSize:13, fontWeight:600, color:"var(--ink)" }}>{user.name}</div>
              </div>
            )}
          </div>
        </div>

        {/* Quick links */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
          <button onClick={() => { localStorage.setItem("tsb_mode","organiser"); navigate("/organiser"); }} style={{ padding:"14px 16px", borderRadius:12, border:"1px solid var(--border)", background:"var(--surface)", cursor:"pointer", textAlign:"left" }}>
            <div style={{ fontFamily:"var(--font-display)", fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:1, color:"var(--muted)", marginBottom:4 }}>Switch to</div>
            <div style={{ fontSize:14, fontWeight:700, color:"var(--ink)" }}>Organiser Mode</div>
          </button>
          <button onClick={() => navigate("/")} style={{ padding:"14px 16px", borderRadius:12, border:"1px solid var(--border)", background:"var(--surface)", cursor:"pointer", textAlign:"left" }}>
            <div style={{ fontFamily:"var(--font-display)", fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:1, color:"var(--muted)", marginBottom:4 }}>Explore</div>
            <div style={{ fontSize:14, fontWeight:700, color:"var(--ink)" }}>Tournaments</div>
          </button>
        </div>

      </div>
    </div>
  );
}
