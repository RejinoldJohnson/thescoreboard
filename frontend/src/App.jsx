import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { isLoggedIn } from "./api/client";
import PublicPortal from "./pages/PublicPortal";
import AdminPortal from "./pages/AdminPortal";
import AdminLogin from "./pages/AdminLogin";

// ── Guard: redirects to /admin/login if not authenticated ────
function RequireAuth({ children }) {
  if (!isLoggedIn()) return <Navigate to="/admin/login" replace />;
  return children;
}

// ── Admin login page — redirects to /admin if already logged in
function LoginPage() {
  const navigate = useNavigate();
  if (isLoggedIn()) return <Navigate to="/admin" replace />;
  return (
    <AdminLogin
      onSuccess={() => navigate("/admin", { replace: true })}
      onBack={() => navigate("/")}
    />
  );
}

// ── Admin portal — passes current tab via URL ─────────────────
function AdminPage() {
  const navigate = useNavigate();
  return (
    <RequireAuth>
      <AdminPortal onLogout={() => navigate("/", { replace: true })} />
    </RequireAuth>
  );
}

// ── Public portal ─────────────────────────────────────────────
function PublicPage() {
  const navigate = useNavigate();
  return <PublicPortal onAdminClick={() => navigate("/admin/login")} />;
}

// ── Root app ──────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                  element={<PublicPage />} />
        <Route path="/admin/login"       element={<LoginPage />} />
        <Route path="/admin"             element={<AdminPage />} />
        <Route path="/admin/:tab"        element={<AdminPage />} />
        <Route path="*"                  element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}