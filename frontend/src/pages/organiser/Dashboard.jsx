import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getMe, getMyOrgs, createOrg, deleteOrg,
  getTournaments, deleteTournament, clearToken,
} from "../../api/client";
import OrgHeader from "../../components/shared/OrgHeader";

const STATUS_META = {
  draft:        { label: "Draft",        pill: "pill-gray"   },
  registration: { label: "Registration", pill: "pill-gold"   },
  fixtures:     { label: "Fixtures",     pill: "pill-orange" },
  live:         { label: "Live",         pill: "pill-red"    },
  completed:    { label: "Completed",    pill: "pill-green"  },
};

const SPORT_ICONS = { table_tennis:"🏓", badminton:"🏸", cricket:"🏏", football:"⚽" };
const sportIcons  = (events=[]) => [...new Set(events.map(e=>e.sport_key))].map(k=>SPORT_ICONS[k]||"🏅").join(" ");

export default function Dashboard() {
  const navigate = useNavigate();
  const [user,        setUser]        = useState(null);
  const [orgs,        setOrgs]        = useState([]);
  const [activeOrg,   setActiveOrg]   = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [msg,         setMsg]         = useState("");

  const [showOrgModal,       setShowOrgModal]       = useState(false);
  const [showDeleteOrgModal, setShowDeleteOrgModal] = useState(false);
  const [showDeleteModal,    setShowDeleteModal]    = useState(null);
  const [showKebab,          setShowKebab]          = useState(null);
  const [onboarding,         setOnboarding]         = useState(false);
  const [orgForm,    setOrgForm]    = useState({ name:"", city:"", state:"" });
  const [orgLoading, setOrgLoading] = useState(false);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3000); };

  useEffect(() => {
    getMe().then(setUser).catch(() => { clearToken(); navigate("/login"); });
  }, []);

  useEffect(() => {
    getMyOrgs().then(o => {
      const list = o || [];
      setOrgs(list);
      if (!list.length) setOnboarding(true);
      else setActiveOrg(list[0]);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!activeOrg) return;
    getTournaments(activeOrg.org_id).then(t => setTournaments(t||[])).catch(console.error);
  }, [activeOrg]);

  useEffect(() => {
    const close = () => setShowKebab(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const handleLogout    = () => { clearToken(); navigate("/", { replace:true }); };
  const handleCreateOrg = async () => {
    if (!orgForm.name.trim()) return flash("Name required.");
    setOrgLoading(true);
    try {
      const org = await createOrg(orgForm);
      setOrgs(p => [org, ...p]); setActiveOrg(org);
      setOnboarding(false); setShowOrgModal(false);
      setOrgForm({ name:"", city:"", state:"" }); flash("Organization created!");
    } catch(e) { flash("Error: "+e.message); }
    finally { setOrgLoading(false); }
  };

  const handleDeleteOrg = async () => {
    try {
      await deleteOrg(activeOrg.org_id);
      const rest = orgs.filter(o => o.org_id !== activeOrg.org_id);
      setOrgs(rest); setActiveOrg(rest[0]||null); setTournaments([]);
      setShowDeleteOrgModal(false); flash("Organization deleted.");
    } catch(e) { flash("Error: "+e.message); }
  };

  const handleDeleteTournament = async () => {
    try {
      await deleteTournament(activeOrg.org_id, showDeleteModal.tournament_id);
      setTournaments(p => p.filter(t => t.tournament_id !== showDeleteModal.tournament_id));
      setShowDeleteModal(null); flash("Tournament deleted.");
    } catch(e) { flash("Error: "+e.message); }
  };

  const ORDER  = { live:0, registration:1, fixtures:2, draft:3, completed:4 };
  const sorted = [...tournaments].sort((a,b) => (ORDER[a.status]??9)-(ORDER[b.status]??9));
  const liveCount = tournaments.filter(t=>t.status==="live").length;
  const initials  = user?.name?.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()||"?";

  return (
    <div className="app">
      <OrgHeader
        user={user}
        onLogout={handleLogout}
        crumbs={[{ label: "My Tournaments" }]}
      />

      {msg && <div className="flash success">{msg}</div>}

      <div className="sidebar-layout">
        {/* ── SIDEBAR ── */}
        <aside className="sidebar">
          <div style={{ flex: 1 }}>
            {activeOrg && (
              <span className="sidebar-org-chip" title={activeOrg.name}>{activeOrg.name}</span>
            )}

            <div className="sidebar-section-label">Menu</div>
            <div className="sidebar-item active">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
              Overview
            </div>
            <div className="sidebar-item" onClick={() => navigate("/")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              Public Site
            </div>

            <div className="sidebar-section-label">Organizations</div>
            {orgs.map(o => (
              <div key={o.org_id}
                className={`sidebar-item${activeOrg?.org_id===o.org_id?" active":""}`}
                onClick={() => setActiveOrg(o)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                {o.name}
              </div>
            ))}
            <div className="sidebar-item" onClick={() => setShowOrgModal(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4v16m8-8H4"/></svg>
              New Org
            </div>
          </div>

          {activeOrg && (
            <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
              <div className="sidebar-item danger" style={{ borderRadius: 6 }} onClick={() => setShowDeleteOrgModal(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                Delete Org
              </div>
            </div>
          )}
        </aside>

        {/* ── MAIN ── */}
        <main style={{ flex:1, padding:"28px 32px", maxWidth:900 }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24 }}>
            <div>
              <div style={{ fontFamily:"var(--font-display)", fontSize:26, fontWeight:900, textTransform:"uppercase", letterSpacing:"-1px", color:"var(--ink)" }}>
                Tournaments
              </div>
              <div style={{ fontSize:13, color:"var(--muted)", marginTop:3 }}>
                {activeOrg
                  ? `${activeOrg.name} · ${tournaments.length} tournament${tournaments.length!==1?"s":""}`
                  : "No organization yet"}
              </div>
            </div>
            <button
              className="btn btn-gradient btn-lg"
              style={{ borderRadius:8, fontSize:13 }}
              onClick={() => navigate("/organiser/create")}
              title="Create Tournament"
            >
              + New Tournament
            </button>
          </div>

          {/* Stats */}
          {tournaments.length > 0 && (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-num">{tournaments.length}</div>
                <div className="stat-label">Total</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color:"var(--red)" }}>{liveCount}</div>
                <div className="stat-label">Live Now</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color:"var(--green)" }}>
                  {tournaments.filter(t=>t.status==="completed").length}
                </div>
                <div className="stat-label">Completed</div>
              </div>
            </div>
          )}

          <div className="section-label">Your Tournaments</div>

          {!activeOrg ? (
            <div className="empty">
              <div className="empty-icon">🏢</div>
              <div className="empty-title">No Organization Yet</div>
              <p style={{ fontSize:13 }}>Create an organization first to run tournaments.</p>
              <button className="btn btn-primary" style={{ marginTop:16 }} onClick={() => setOnboarding(true)}>Get Started</button>
            </div>
          ) : sorted.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🏆</div>
              <div className="empty-title">No Tournaments Yet</div>
              <p style={{ fontSize:13 }}>Hit <strong>+ New Tournament</strong> to get started.</p>
            </div>
          ) : (
            sorted.map(t => (
              <TournamentCard key={t.tournament_id} tournament={t}
                showKebab={showKebab===t.tournament_id}
                onKebabToggle={e => { e.stopPropagation(); setShowKebab(showKebab===t.tournament_id?null:t.tournament_id); }}
                onManage={() => navigate(`/organiser/tournament/${t.tournament_id}`)}
                onDelete={() => { setShowKebab(null); setShowDeleteModal(t); }}
                onCopy={() => { navigator.clipboard.writeText(`${window.location.origin}/t/${t.slug}`); flash("Link copied!"); setShowKebab(null); }}
              />
            ))
          )}
        </main>
      </div>

      {/* ── ONBOARDING ── */}
      {onboarding && (
        <div className="overlay" onClick={() => setOnboarding(false)}>
          <div style={{ background:"var(--surface)", border:"2px solid var(--border-mid)", borderRadius:12, padding:32, width:"100%", maxWidth:420, animation:"fadeIn .2s ease" }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:3, color:"var(--primary)", marginBottom:8 }}>Welcome</div>
            <div style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:900, textTransform:"uppercase", letterSpacing:-1, marginBottom:10 }}>Get Started</div>
            <p style={{ fontSize:13, color:"var(--muted)", marginBottom:20 }}>Create your organization — your club, school, or group.</p>
            <div style={{ border:"2px solid var(--border)", borderRadius:8, padding:"14px 16px", cursor:"pointer", transition:"all .15s", marginBottom:8 }}
              onClick={() => { setOnboarding(false); setShowOrgModal(true); }}
              onMouseOver={e=>e.currentTarget.style.borderColor="var(--primary)"}
              onMouseOut={e=>e.currentTarget.style.borderColor="var(--border)"}
            >
              <div style={{ fontFamily:"var(--font-display)", fontSize:14, fontWeight:800, textTransform:"uppercase", letterSpacing:-0.5 }}>Create an Organization</div>
              <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Club, school, company — add your group</div>
            </div>
            <div style={{ fontSize:12, color:"var(--muted)", textAlign:"center", marginTop:12, cursor:"pointer" }} onClick={() => setOnboarding(false)}>Skip for now</div>
          </div>
        </div>
      )}

      {/* ── CREATE ORG ── */}
      {showOrgModal && (
        <div className="overlay" onClick={() => setShowOrgModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <div><div className="modal-title">Create Organization</div><div className="modal-sub">Your club, school, or group</div></div>
              <button className="modal-close" onClick={() => setShowOrgModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="field"><label>Organization Name *</label>
                <input className="input" autoFocus placeholder="e.g. Tenx Sports Club" value={orgForm.name}
                  onChange={e=>setOrgForm(f=>({...f,name:e.target.value}))}
                  onKeyDown={e=>e.key==="Enter"&&handleCreateOrg()} /></div>
              <div className="field-row">
                <div className="field"><label>City</label><input className="input" placeholder="Mumbai" value={orgForm.city} onChange={e=>setOrgForm(f=>({...f,city:e.target.value}))}/></div>
                <div className="field"><label>State</label><input className="input" placeholder="Maharashtra" value={orgForm.state} onChange={e=>setOrgForm(f=>({...f,state:e.target.value}))}/></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowOrgModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateOrg} disabled={orgLoading}>{orgLoading?"Creating…":"Create"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE ORG ── */}
      {showDeleteOrgModal && activeOrg && (
        <div className="overlay" onClick={() => setShowDeleteOrgModal(false)}>
          <div className="danger-box" onClick={e=>e.stopPropagation()}>
            <div className="danger-icon">⚠</div>
            <div className="danger-title">Delete Organization</div>
            <div className="danger-body">You're deleting <strong>{activeOrg.name}</strong> and all <strong>{tournaments.length} tournament{tournaments.length!==1?"s":""}</strong> inside it.</div>
            <div className="danger-warn">This action cannot be undone.</div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button className="btn btn-outline" onClick={() => setShowDeleteOrgModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteOrg}>Delete Organization</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE TOURNAMENT ── */}
      {showDeleteModal && (
        <div className="overlay" onClick={() => setShowDeleteModal(null)}>
          <div className="danger-box" onClick={e=>e.stopPropagation()}>
            <div className="danger-icon">⚠</div>
            <div className="danger-title">Delete Tournament</div>
            <div className="danger-body">Permanently delete <strong>{showDeleteModal.name}</strong>. All events, matches, and player data will be removed.</div>
            <div className="danger-warn">This action cannot be undone.</div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button className="btn btn-outline" onClick={() => setShowDeleteModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteTournament}>Delete Permanently</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TournamentCard({ tournament:t, showKebab, onKebabToggle, onManage, onDelete, onCopy }) {
  const events = t.events||[];
  const icons  = sportIcons(events);
  const sm     = STATUS_META[t.status]||STATUS_META.draft;
  return (
    <div className="tournament-card" onClick={onManage} style={{ marginBottom:8 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, flex:1, minWidth:0 }}>
        <div className="tournament-card-icon">{icons||"🏅"}</div>
        <div style={{ minWidth:0 }}>
          <div style={{ fontFamily:"var(--font-display)", fontSize:15, fontWeight:900, textTransform:"uppercase", letterSpacing:-0.5, color:"var(--ink)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{t.name}</div>
          <div style={{ fontSize:12, color:"var(--muted)", marginTop:1 }}>{[t.venue,t.city].filter(Boolean).join(" · ")||"No venue"}</div>
          <div style={{ display:"flex", gap:6, marginTop:5, flexWrap:"wrap", alignItems:"center" }}>
            <span className={`pill ${sm.pill}`}>
              {t.status==="live" && <span className="live-dot" style={{ width:6, height:6 }}/>}
              {sm.label}
            </span>
            {events.length>0 && <span className="pill pill-gray">{events.length} event{events.length!==1?"s":""}</span>}
            <span style={{ fontSize:11, fontFamily:"monospace", color:"var(--subtle)" }}>/t/{t.slug}</span>
          </div>
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }} onClick={e=>e.stopPropagation()}>
        <button className="btn btn-primary btn-sm" onClick={onManage}>Manage</button>
        <div style={{ position:"relative" }}>
          <button className="btn btn-ghost btn-sm" style={{ width:32, padding:0 }} onClick={onKebabToggle}>⋯</button>
          {showKebab && (
            <div className="kebab-menu" onClick={e=>e.stopPropagation()}>
              <button className="kebab-item" onClick={onManage}>✏ Edit / Manage</button>
              <button className="kebab-item" onClick={onCopy}>⛓ Copy share link</button>
              <button className="kebab-item danger" onClick={onDelete}>✕ Delete</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}