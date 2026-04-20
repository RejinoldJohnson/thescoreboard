import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getMe, getMyOrgs, createOrg, deleteOrg,
  getTournaments, deleteTournament,
  clearToken,
} from "../../api/client";

const STATUS_META = {
  draft:        { label: "Draft",        color: "var(--muted)",    bg: "var(--sand)",     border: "var(--border)"    },
  registration: { label: "Registration", color: "#a07010",         bg: "var(--yellow-bg)",border: "#d4a01750"        },
  fixtures:     { label: "Fixtures",     color: "var(--green)",    bg: "var(--green-bg)", border: "#2d5a2750"        },
  live:         { label: "Live",         color: "var(--live-red)", bg: "var(--live-bg)",  border: "#c0392b50"        },
  completed:    { label: "Completed",    color: "var(--green)",    bg: "var(--green-bg)", border: "#2d5a2750"        },
};

const SPORT_ICONS = { table_tennis: "🏓", badminton: "🏸", cricket: "🏏", football: "⚽" };

function sportIcons(events = []) {
  return [...new Set(events.map((e) => e.sport_key))].map((k) => SPORT_ICONS[k] || "🏅").join(" ");
}

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.draft;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontFamily: "'Barlow Condensed', sans-serif",
      fontSize: 11, fontWeight: 700, letterSpacing: "1.5px",
      textTransform: "uppercase", padding: "3px 9px", borderRadius: 4,
      background: m.bg, color: m.color, border: `1px solid ${m.border}`,
      whiteSpace: "nowrap",
    }}>
      {status === "live" && (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--live-red)", display: "inline-block", animation: "tsb-blink 1.2s infinite" }} />
      )}
      {m.label}
    </span>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser]               = useState(null);
  const [orgs, setOrgs]               = useState([]);
  const [activeOrg, setActiveOrg]     = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [msg, setMsg]                 = useState("");

  const [showOrgModal,       setShowOrgModal]       = useState(false);
  const [showDeleteOrgModal, setShowDeleteOrgModal] = useState(false);
  const [showDeleteModal,    setShowDeleteModal]    = useState(null);
  const [showKebab,          setShowKebab]          = useState(null);
  const [onboarding,         setOnboarding]         = useState(false);

  const [orgForm,    setOrgForm]    = useState({ name: "", city: "", state: "" });
  const [orgLoading, setOrgLoading] = useState(false);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3000); };

  useEffect(() => {
    getMe().then(setUser).catch(() => { clearToken(); navigate("/login"); });
  }, []);

  useEffect(() => {
    getMyOrgs().then((o) => {
      const list = o || [];
      setOrgs(list);
      if (list.length === 0) setOnboarding(true);
      else setActiveOrg(list[0]);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!activeOrg) return;
    getTournaments(activeOrg.org_id).then((t) => setTournaments(t || [])).catch(console.error);
  }, [activeOrg]);

  useEffect(() => {
    const close = () => setShowKebab(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const handleLogout = () => { clearToken(); navigate("/", { replace: true }); };

  const handleCreateOrg = async () => {
    if (!orgForm.name.trim()) return flash("Organization name is required.");
    setOrgLoading(true);
    try {
      const org = await createOrg(orgForm);
      setOrgs((p) => [org, ...p]);
      setActiveOrg(org);
      setOnboarding(false);
      setShowOrgModal(false);
      setOrgForm({ name: "", city: "", state: "" });
      flash("Organization created!");
    } catch (e) { flash("Error: " + e.message); }
    finally { setOrgLoading(false); }
  };

  const handleDeleteOrg = async () => {
    if (!activeOrg) return;
    try {
      await deleteOrg(activeOrg.org_id);
      const remaining = orgs.filter((o) => o.org_id !== activeOrg.org_id);
      setOrgs(remaining);
      setActiveOrg(remaining[0] || null);
      setTournaments([]);
      setShowDeleteOrgModal(false);
      flash("Organization deleted.");
    } catch (e) { flash("Error: " + e.message); }
  };

  const handleDeleteTournament = async () => {
    if (!showDeleteModal) return;
    try {
      await deleteTournament(activeOrg.org_id, showDeleteModal.tournament_id);
      setTournaments((p) => p.filter((t) => t.tournament_id !== showDeleteModal.tournament_id));
      setShowDeleteModal(null);
      flash("Tournament deleted.");
    } catch (e) { flash("Error: " + e.message); }
  };

  const ORDER  = { live: 0, registration: 1, fixtures: 2, draft: 3, completed: 4 };
  const sorted = [...tournaments].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));
  const liveCount = tournaments.filter((t) => t.status === "live").length;
  const initials  = user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes tsb-blink { 0%,100%{opacity:1} 50%{opacity:.2} }
        .tsb-nav { background:var(--green); display:flex; align-items:center; justify-content:space-between; padding:0 24px; height:56px; box-shadow:0 2px 8px rgba(0,0,0,0.18); position:sticky; top:0; z-index:200; }
        .tsb-nav-brand { display:flex; flex-direction:column; gap:0; }
        .tsb-nav-eyebrow { font-family:'Barlow Condensed',sans-serif; font-size:10px; letter-spacing:3px; color:rgba(255,255,255,0.55); font-weight:700; text-transform:uppercase; }
        .tsb-nav-title { font-family:'Barlow Condensed',sans-serif; font-size:22px; font-weight:900; color:#fff; letter-spacing:0.5px; line-height:1.1; }
        .tsb-nav-right { display:flex; align-items:center; gap:10px; }
        .tsb-nav-user { font-size:13px; color:rgba(255,255,255,0.7); }
        .tsb-nav-avatar { width:30px; height:30px; border-radius:50%; background:rgba(255,255,255,0.2); color:#fff; display:flex; align-items:center; justify-content:center; font-family:'Barlow Condensed',sans-serif; font-size:13px; font-weight:800; border:1.5px solid rgba(255,255,255,0.3); }
        .tsb-nav-logout { font-family:'Barlow Condensed',sans-serif; font-size:13px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:rgba(255,255,255,0.7); background:none; border:1.5px solid rgba(255,255,255,0.25); padding:5px 12px; border-radius:5px; cursor:pointer; transition:all .15s; }
        .tsb-nav-logout:hover { border-color:rgba(255,255,255,.6); color:#fff; }
        .tsb-body { display:flex; min-height:calc(100vh - 56px); }
        .tsb-sidebar { width:220px; background:#fff; border-right:1.5px solid var(--border); padding:20px 0; flex-shrink:0; display:flex; flex-direction:column; }
        .tsb-sidebar-bottom { margin-top:auto; padding:12px 14px; border-top:1px solid var(--border); }
        .tsb-sidebar-label { font-family:'Barlow Condensed',sans-serif; font-size:10px; letter-spacing:3px; color:var(--muted); font-weight:800; text-transform:uppercase; padding:0 18px; margin-bottom:4px; }
        .tsb-sidebar-org { font-family:'Barlow Condensed',sans-serif; font-size:12px; font-weight:800; letter-spacing:.5px; text-transform:uppercase; color:var(--green); background:var(--green-bg); border:1px solid #2d5a2730; border-radius:5px; padding:5px 12px; margin:0 14px 16px; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .tsb-sidebar-item { display:flex; align-items:center; gap:9px; padding:9px 18px; font-size:13px; font-family:'DM Sans',sans-serif; color:var(--muted); cursor:pointer; transition:all .12s; border-right:2.5px solid transparent; }
        .tsb-sidebar-item:hover { background:var(--cream); color:var(--ink); }
        .tsb-sidebar-item.active { background:var(--green-bg); color:var(--green); font-weight:600; border-right-color:var(--green); }
        .tsb-sidebar-item.danger { color:var(--live-red) !important; }
        .tsb-sidebar-item.danger:hover { background:var(--live-bg) !important; }
        .tsb-main { flex:1; padding:28px 32px; max-width:900px; }
        .tsb-page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; }
        .tsb-page-title { font-family:'Barlow Condensed',sans-serif; font-size:28px; font-weight:900; color:var(--ink); letter-spacing:0.3px; line-height:1.1; }
        .tsb-page-sub { font-size:13px; color:var(--muted); margin-top:3px; }
        .tsb-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:22px; }
        .tsb-stat { background:#fff; border:1.5px solid var(--border); border-radius:8px; padding:13px 16px; }
        .tsb-stat-num { font-family:'Barlow Condensed',sans-serif; font-size:28px; font-weight:900; color:var(--ink); line-height:1; }
        .tsb-stat-label { font-family:'Barlow Condensed',sans-serif; font-size:11px; font-weight:700; letter-spacing:1.5px; color:var(--muted); text-transform:uppercase; margin-top:3px; }
        .tsb-section-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1.5px solid var(--border); }
        .tsb-section-title { font-family:'Barlow Condensed',sans-serif; font-size:12px; font-weight:800; letter-spacing:3px; color:var(--muted); text-transform:uppercase; }
        .tsb-t-card { background:#fff; border:1.5px solid var(--border); border-radius:8px; padding:14px 16px; margin-bottom:9px; display:flex; align-items:center; justify-content:space-between; gap:12px; transition:all .15s; position:relative; cursor:pointer; }
        .tsb-t-card:hover { border-color:#aaa; box-shadow:0 3px 14px rgba(0,0,0,0.07); }
        .tsb-t-icon { width:38px; height:38px; border-radius:7px; background:var(--green-bg); display:flex; align-items:center; justify-content:center; font-size:17px; flex-shrink:0; }
        .tsb-t-name { font-family:'Barlow Condensed',sans-serif; font-size:17px; font-weight:900; color:var(--ink); letter-spacing:.3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .tsb-t-meta { font-size:12px; color:var(--muted); margin-top:1px; }
        .tsb-t-badges { display:flex; gap:5px; margin-top:5px; flex-wrap:wrap; }
        .tsb-share-link { font-size:11px; font-family:monospace; color:var(--muted); background:var(--cream); padding:2px 7px; border-radius:3px; border:1px solid var(--border); }
        .tsb-btn-manage { font-family:'Barlow Condensed',sans-serif; font-size:13px; font-weight:700; letter-spacing:1px; text-transform:uppercase; background:var(--green-bg); color:var(--green); border:1.5px solid var(--green-bg); padding:6px 14px; border-radius:5px; cursor:pointer; transition:all .15s; white-space:nowrap; }
        .tsb-btn-manage:hover { background:var(--green); color:#fff; border-color:var(--green); }
        .tsb-btn-kebab { width:28px; height:28px; border-radius:5px; background:none; border:none; cursor:pointer; color:var(--muted); font-size:17px; display:flex; align-items:center; justify-content:center; transition:all .12s; }
        .tsb-btn-kebab:hover { background:var(--sand); color:var(--ink); }
        .tsb-kebab-menu { position:absolute; right:0; top:46px; background:#fff; border:1.5px solid var(--border); border-radius:7px; box-shadow:0 8px 24px rgba(0,0,0,.12); z-index:50; min-width:160px; overflow:hidden; }
        .tsb-kebab-item { display:flex; align-items:center; gap:8px; padding:10px 14px; font-size:13px; font-family:'DM Sans',sans-serif; color:var(--muted); cursor:pointer; background:none; border:none; width:100%; transition:all .1s; text-align:left; }
        .tsb-kebab-item:hover { background:var(--cream); color:var(--ink); }
        .tsb-kebab-item.danger { color:var(--live-red); }
        .tsb-kebab-item.danger:hover { background:var(--live-bg); }
        .tsb-btn-plus { width:40px; height:40px; border-radius:50%; background:var(--green); color:#fff; border:none; font-size:22px; font-weight:300; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .2s; box-shadow:0 4px 12px rgba(45,90,39,.35); position:relative; }
        .tsb-btn-plus:hover { background:var(--green-lt); transform:scale(1.06); }
        .tsb-tooltip { position:absolute; bottom:calc(100% + 8px); left:50%; transform:translateX(-50%); background:var(--ink); color:#fff; font-family:'Barlow Condensed',sans-serif; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; padding:4px 10px; border-radius:4px; white-space:nowrap; pointer-events:none; opacity:0; transition:opacity .15s; }
        .tsb-btn-plus:hover .tsb-tooltip { opacity:1; }
        .tsb-tooltip::after { content:''; position:absolute; top:100%; left:50%; transform:translateX(-50%); border:4px solid transparent; border-top-color:var(--ink); }
        .tsb-empty { text-align:center; padding:56px 20px; color:var(--muted); }
        .tsb-empty-icon { font-size:36px; margin-bottom:12px; opacity:.4; }
        .tsb-empty-title { font-family:'Barlow Condensed',sans-serif; font-size:20px; font-weight:800; color:var(--ink); margin-bottom:6px; }
        .tsb-empty-sub { font-size:13px; }
        .tsb-flash { position:fixed; top:68px; left:50%; transform:translateX(-50%); background:var(--ink); color:#fff; font-family:'Barlow Condensed',sans-serif; font-size:13px; font-weight:700; letter-spacing:1px; text-transform:uppercase; padding:9px 20px; border-radius:6px; z-index:999; box-shadow:0 4px 16px rgba(0,0,0,.2); }
        .tsb-overlay { position:fixed; inset:0; background:rgba(26,18,8,.55); z-index:300; display:flex; align-items:center; justify-content:center; animation:tsb-fade .15s; }
        @keyframes tsb-fade { from{opacity:0} to{opacity:1} }
        .tsb-modal { background:#fff; border-radius:10px; box-shadow:0 12px 40px rgba(0,0,0,.2); width:100%; max-width:420px; overflow:hidden; animation:tsb-slide .2s ease; }
        @keyframes tsb-slide { from{transform:translateY(14px);opacity:0} to{transform:translateY(0);opacity:1} }
        .tsb-modal-hd { padding:20px 22px 0; display:flex; align-items:flex-start; justify-content:space-between; }
        .tsb-modal-title { font-family:'Barlow Condensed',sans-serif; font-size:20px; font-weight:900; color:var(--ink); letter-spacing:.3px; }
        .tsb-modal-sub { font-size:13px; color:var(--muted); margin-top:2px; }
        .tsb-modal-close { width:26px; height:26px; border-radius:50%; background:var(--sand); border:none; cursor:pointer; font-size:14px; color:var(--muted); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .tsb-modal-close:hover { background:var(--border); }
        .tsb-modal-body { padding:18px 22px; }
        .tsb-modal-foot { padding:0 22px 20px; display:flex; gap:8px; justify-content:flex-end; }
        .tsb-field { margin-bottom:12px; }
        .tsb-field label { display:block; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:var(--green); margin-bottom:5px; font-family:'Barlow Condensed',sans-serif; }
        .tsb-field input { width:100%; border:1.5px solid var(--border); border-radius:6px; padding:9px 11px; font-size:14px; font-family:'DM Sans',sans-serif; color:var(--ink); background:var(--cream); outline:none; transition:border .15s; }
        .tsb-field input:focus { border-color:var(--green); background:#fff; }
        .tsb-field-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .tsb-btn-prim { background:var(--green); color:#fff; border:none; padding:9px 18px; border-radius:6px; font-family:'Barlow Condensed',sans-serif; font-size:14px; font-weight:700; letter-spacing:1px; text-transform:uppercase; cursor:pointer; transition:all .15s; }
        .tsb-btn-prim:hover { background:var(--green-lt); }
        .tsb-btn-prim:disabled { opacity:.45; cursor:not-allowed; }
        .tsb-btn-cancel { background:none; border:1.5px solid var(--border); color:var(--muted); padding:8px 16px; border-radius:6px; font-family:'Barlow Condensed',sans-serif; font-size:14px; font-weight:700; letter-spacing:1px; text-transform:uppercase; cursor:pointer; transition:all .15s; }
        .tsb-btn-cancel:hover { border-color:var(--ink); color:var(--ink); }
        .tsb-btn-danger-full { background:var(--live-red); color:#fff; border:none; padding:9px 18px; border-radius:6px; font-family:'Barlow Condensed',sans-serif; font-size:14px; font-weight:700; letter-spacing:1px; text-transform:uppercase; cursor:pointer; transition:all .15s; }
        .tsb-btn-danger-full:hover { background:#a93226; }
        .tsb-del { background:#fff; border-radius:10px; box-shadow:0 12px 40px rgba(0,0,0,.2); width:100%; max-width:380px; padding:28px; animation:tsb-slide .2s ease; }
        .tsb-del-icon { width:42px; height:42px; border-radius:8px; background:var(--live-bg); color:var(--live-red); font-size:20px; display:flex; align-items:center; justify-content:center; margin-bottom:14px; }
        .tsb-del-title { font-family:'Barlow Condensed',sans-serif; font-size:18px; font-weight:900; color:var(--ink); margin-bottom:6px; }
        .tsb-del-body { font-size:13px; color:var(--muted); line-height:1.6; margin-bottom:8px; }
        .tsb-del-warn { font-size:12px; color:var(--live-red); background:var(--live-bg); border:1px solid #e8c5c0; padding:7px 11px; border-radius:5px; margin-bottom:18px; font-family:'Barlow Condensed',sans-serif; font-weight:700; letter-spacing:.5px; }
        .tsb-del-actions { display:flex; gap:8px; justify-content:flex-end; }
        .tsb-ob { background:#fff; border-radius:10px; box-shadow:0 12px 40px rgba(0,0,0,.2); width:100%; max-width:400px; padding:32px; animation:tsb-slide .2s ease; }
        .tsb-ob-eyebrow { font-family:'Barlow Condensed',sans-serif; font-size:10px; letter-spacing:3px; color:var(--green); font-weight:800; text-transform:uppercase; margin-bottom:6px; }
        .tsb-ob-title { font-family:'Barlow Condensed',sans-serif; font-size:24px; font-weight:900; color:var(--ink); margin-bottom:8px; }
        .tsb-ob-body { font-size:13px; color:var(--muted); line-height:1.6; margin-bottom:20px; }
        .tsb-ob-opt { border:1.5px solid var(--border); border-radius:7px; padding:14px 16px; cursor:pointer; display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; transition:all .15s; background:var(--cream); }
        .tsb-ob-opt:hover { border-color:var(--green); background:var(--green-bg); }
        .tsb-ob-opt-title { font-family:'Barlow Condensed',sans-serif; font-size:15px; font-weight:800; color:var(--ink); }
        .tsb-ob-opt-sub { font-size:12px; color:var(--muted); margin-top:1px; }
        .tsb-ob-skip { font-size:12px; color:var(--muted); text-align:center; margin-top:14px; cursor:pointer; }
        @media(max-width:700px){ .tsb-sidebar{ display:none; } .tsb-main{ padding:16px 14px; } }
      `}</style>

      {/* NAV */}
      <header className="tsb-nav">
        <div className="tsb-nav-brand">
          <span className="tsb-nav-eyebrow">Organizer Dashboard</span>
          <span className="tsb-nav-title">TheScoreBoard</span>
        </div>
        <div className="tsb-nav-right">
          {user && <span className="tsb-nav-user">{user.name}</span>}
          <div className="tsb-nav-avatar">{initials}</div>
          <button className="tsb-nav-logout" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <div className="tsb-body">
        {/* SIDEBAR */}
        <aside className="tsb-sidebar">
          <div style={{ flex: 1 }}>
            {activeOrg && (
              <span className="tsb-sidebar-org" title={activeOrg.name}>{activeOrg.name}</span>
            )}
            <div style={{ marginBottom: 18 }}>
              <div className="tsb-sidebar-label">Menu</div>
              <div className="tsb-sidebar-item active">
                <SvgIcon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                Overview
              </div>
              <div className="tsb-sidebar-item" onClick={() => navigate("/")}>
                <SvgIcon d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                Public Site
              </div>
            </div>

            <div>
              <div className="tsb-sidebar-label" style={{ marginTop: 8 }}>Organizations</div>
              {orgs.map((o) => (
                <div
                  key={o.org_id}
                  className={`tsb-sidebar-item${activeOrg?.org_id === o.org_id ? " active" : ""}`}
                  onClick={() => setActiveOrg(o)}
                >
                  <SvgIcon d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  {o.name}
                </div>
              ))}
              <div className="tsb-sidebar-item" onClick={() => setShowOrgModal(true)}>
                <SvgIcon d="M12 4v16m8-8H4" />
                New Org
              </div>
            </div>
          </div>

          {/* Delete org — bottom of sidebar */}
          {activeOrg && (
            <div className="tsb-sidebar-bottom">
              <div
                className="tsb-sidebar-item danger"
                style={{ padding: "8px 4px", borderRadius: 6 }}
                onClick={() => setShowDeleteOrgModal(true)}
              >
                <SvgIcon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                Delete Org
              </div>
            </div>
          )}
        </aside>

        {/* MAIN */}
        <main className="tsb-main">
          <div className="tsb-page-header">
            <div>
              <div className="tsb-page-title">Tournaments</div>
              <div className="tsb-page-sub">
                {activeOrg
                  ? `${activeOrg.name} · ${tournaments.length} tournament${tournaments.length !== 1 ? "s" : ""}`
                  : "No organization yet — create one to get started"}
              </div>
            </div>
            <button className="tsb-btn-plus" onClick={() => navigate("/organiser/create")}>
              +
              <span className="tsb-tooltip">Create Tournament</span>
            </button>
          </div>

          {tournaments.length > 0 && (
            <div className="tsb-stats">
              <div className="tsb-stat">
                <div className="tsb-stat-num">{tournaments.length}</div>
                <div className="tsb-stat-label">Total</div>
              </div>
              <div className="tsb-stat">
                <div className="tsb-stat-num" style={{ color: "var(--live-red)" }}>{liveCount}</div>
                <div className="tsb-stat-label">Live Now</div>
              </div>
              <div className="tsb-stat">
                <div className="tsb-stat-num" style={{ color: "var(--green)" }}>
                  {tournaments.filter((t) => t.status === "completed").length}
                </div>
                <div className="tsb-stat-label">Completed</div>
              </div>
            </div>
          )}

          <div className="tsb-section-head">
            <div className="tsb-section-title">Your Tournaments</div>
          </div>

          {!activeOrg ? (
            <div className="tsb-empty">
              <div className="tsb-empty-icon">🏢</div>
              <div className="tsb-empty-title">No Organization Yet</div>
              <div className="tsb-empty-sub">Create an organization first to run tournaments under it.</div>
              <button className="tsb-btn-prim" style={{ marginTop: 16 }} onClick={() => setOnboarding(true)}>
                Get Started
              </button>
            </div>
          ) : sorted.length === 0 ? (
            <div className="tsb-empty">
              <div className="tsb-empty-icon">🏆</div>
              <div className="tsb-empty-title">No Tournaments Yet</div>
              <div className="tsb-empty-sub">Hit the <strong>+</strong> button to create your first tournament.</div>
            </div>
          ) : (
            sorted.map((t) => (
              <TournamentCard
                key={t.tournament_id}
                tournament={t}
                showKebab={showKebab === t.tournament_id}
                onKebabToggle={(e) => {
                  e.stopPropagation();
                  setShowKebab(showKebab === t.tournament_id ? null : t.tournament_id);
                }}
                onManage={() => navigate(`/organiser/tournament/${t.tournament_id}`)}
                onDelete={() => { setShowKebab(null); setShowDeleteModal(t); }}
                onCopy={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/t/${t.slug}`);
                  flash("Link copied!"); setShowKebab(null);
                }}
              />
            ))
          )}
        </main>
      </div>

      {msg && <div className="tsb-flash">{msg}</div>}

      {/* ONBOARDING */}
      {onboarding && (
        <div className="tsb-overlay" onClick={() => setOnboarding(false)}>
          <div className="tsb-ob" onClick={(e) => e.stopPropagation()}>
            <div className="tsb-ob-eyebrow">Welcome to TheScoreBoard</div>
            <div className="tsb-ob-title">Let's Get You Set Up</div>
            <div className="tsb-ob-body">Create your organization — your club, school, or group. All tournaments live under it.</div>
            <div className="tsb-ob-opt" onClick={() => { setOnboarding(false); setShowOrgModal(true); }}>
              <div><div className="tsb-ob-opt-title">Create an Organization</div><div className="tsb-ob-opt-sub">Club, school, company</div></div>
              <span style={{ color: "var(--muted)", fontSize: 18 }}>→</span>
            </div>
            <div className="tsb-ob-opt" style={{ opacity: .45, cursor: "not-allowed" }}>
              <div><div className="tsb-ob-opt-title">Join an Existing Org</div><div className="tsb-ob-opt-sub">Coming soon</div></div>
              <span style={{ color: "var(--muted)", fontSize: 18 }}>→</span>
            </div>
            <div className="tsb-ob-skip" onClick={() => setOnboarding(false)}>Skip for now</div>
          </div>
        </div>
      )}

      {/* CREATE ORG MODAL */}
      {showOrgModal && (
        <div className="tsb-overlay" onClick={() => setShowOrgModal(false)}>
          <div className="tsb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tsb-modal-hd">
              <div><div className="tsb-modal-title">Create Organization</div><div className="tsb-modal-sub">Your club, school, or group</div></div>
              <button className="tsb-modal-close" onClick={() => setShowOrgModal(false)}>×</button>
            </div>
            <div className="tsb-modal-body">
              <div className="tsb-field"><label>Organization Name *</label>
                <input autoFocus placeholder="e.g. Tenx Habitat Sports Club" value={orgForm.name}
                  onChange={(e) => setOrgForm((f) => ({ ...f, name: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateOrg()} />
              </div>
              <div className="tsb-field-row">
                <div className="tsb-field"><label>City</label>
                  <input placeholder="Mumbai" value={orgForm.city} onChange={(e) => setOrgForm((f) => ({ ...f, city: e.target.value }))} />
                </div>
                <div className="tsb-field"><label>State</label>
                  <input placeholder="Maharashtra" value={orgForm.state} onChange={(e) => setOrgForm((f) => ({ ...f, state: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="tsb-modal-foot">
              <button className="tsb-btn-cancel" onClick={() => setShowOrgModal(false)}>Cancel</button>
              <button className="tsb-btn-prim" onClick={handleCreateOrg} disabled={orgLoading}>
                {orgLoading ? "Creating…" : "Create Org"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE ORG CONFIRM */}
      {showDeleteOrgModal && activeOrg && (
        <div className="tsb-overlay" onClick={() => setShowDeleteOrgModal(false)}>
          <div className="tsb-del" onClick={(e) => e.stopPropagation()}>
            <div className="tsb-del-icon">⚠</div>
            <div className="tsb-del-title">Delete Organization</div>
            <div className="tsb-del-body">
              You're about to permanently delete <strong>{activeOrg.name}</strong> and
              all <strong>{tournaments.length} tournament{tournaments.length !== 1 ? "s" : ""}</strong> inside it,
              including all events, players, and match data.
            </div>
            <div className="tsb-del-warn">This action cannot be undone.</div>
            <div className="tsb-del-actions">
              <button className="tsb-btn-cancel" onClick={() => setShowDeleteOrgModal(false)}>Cancel</button>
              <button className="tsb-btn-danger-full" onClick={handleDeleteOrg}>Delete Organization</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE TOURNAMENT CONFIRM */}
      {showDeleteModal && (
        <div className="tsb-overlay" onClick={() => setShowDeleteModal(null)}>
          <div className="tsb-del" onClick={(e) => e.stopPropagation()}>
            <div className="tsb-del-icon">⚠</div>
            <div className="tsb-del-title">Delete Tournament</div>
            <div className="tsb-del-body">
              You're about to permanently delete <strong>{showDeleteModal.name}</strong>. All events, players, and match data will be removed.
            </div>
            <div className="tsb-del-warn">This action cannot be undone.</div>
            <div className="tsb-del-actions">
              <button className="tsb-btn-cancel" onClick={() => setShowDeleteModal(null)}>Cancel</button>
              <button className="tsb-btn-danger-full" onClick={handleDeleteTournament}>Delete Permanently</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TournamentCard({ tournament: t, showKebab, onKebabToggle, onManage, onDelete, onCopy }) {
  const events = t.events || [];
  const icons  = sportIcons(events);
  return (
    <div className="tsb-t-card" onClick={onManage}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
        <div className="tsb-t-icon">{icons || "🏅"}</div>
        <div style={{ minWidth: 0 }}>
          <div className="tsb-t-name">{t.name}</div>
          <div className="tsb-t-meta">{[t.venue, t.city].filter(Boolean).join(" · ") || "No venue set"}</div>
          <div className="tsb-t-badges">
            <StatusPill status={t.status} />
            {events.length > 0 && (
              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", padding: "3px 8px", borderRadius: 4, background: "var(--green-bg)", color: "var(--green)", border: "1px solid #2d5a2730" }}>
                {events.length} event{events.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div style={{ marginTop: 4 }}>
            <span className="tsb-share-link">thescoreboard.com/t/{t.slug}</span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        <button className="tsb-btn-manage" onClick={onManage}>Manage</button>
        <div style={{ position: "relative" }}>
          <button className="tsb-btn-kebab" onClick={onKebabToggle}>⋯</button>
          {showKebab && (
            <div className="tsb-kebab-menu" onClick={(e) => e.stopPropagation()}>
              <button className="tsb-kebab-item" onClick={onManage}>✏ Edit / Manage</button>
              <button className="tsb-kebab-item" onClick={onCopy}>⛓ Copy share link</button>
              <button className="tsb-kebab-item danger" onClick={onDelete}>✕ Delete tournament</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SvgIcon({ d }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}