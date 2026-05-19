import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { isLoggedIn } from "./api/client";

// Public
import Landing             from "./pages/Landing";
import SportPage           from "./pages/SportPage";
import TournamentPublic    from "./pages/TournamentPublic";
import TournamentRegister  from "./pages/TournamentRegister";
import Login               from "./pages/auth/Login";
import Register            from "./pages/auth/Register";

// Player
import PlayerDashboard from "./pages/player/PlayerDashboard";

// Organiser
import OrgDashboard       from "./pages/organiser/Dashboard";
import CreateTournament   from "./pages/organiser/CreateTournament";
import TournamentOverview from "./pages/organiser/workspace/TournamentOverview";
import EventWorkspace     from "./pages/organiser/workspace/EventWorkspace";

function RequireAuth({ children, orgTheme = true }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  if (!orgTheme) return <>{children}</>;
  return <div className="organizer-flow">{children}</div>;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        {/* Public */}
        <Route path="/"                              element={<Landing />} />
        <Route path="/football"                      element={<SportPage />} />
        <Route path="/cricket"                       element={<SportPage />} />
        <Route path="/table-tennis"                  element={<SportPage />} />
        <Route path="/badminton"                     element={<SportPage />} />
        <Route path="/:sportUrl/tournament/:slug"    element={<TournamentPublic />} />
        <Route path="/t/:slug"                       element={<TournamentPublic />} />
        <Route path="/t/:slug/register"              element={<TournamentRegister />} />

        {/* Auth */}
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Organiser */}
        <Route path="/organiser" element={<RequireAuth><OrgDashboard /></RequireAuth>} />
        <Route path="/organiser/create" element={<RequireAuth><CreateTournament /></RequireAuth>} />

        <Route
          path="/organiser/tournament/:tournamentId"
          element={<RequireAuth><TournamentOverview /></RequireAuth>}
        />

        <Route
          path="/organiser/tournament/:tournamentId/event/:eventId"
          element={<RequireAuth><EventWorkspace /></RequireAuth>}
        />

        {/* Player */}
        <Route path="/player" element={<RequireAuth orgTheme={false}><PlayerDashboard /></RequireAuth>} />

        {/* Legacy redirect */}
        <Route path="/dashboard/*" element={<Navigate to="/organiser" replace />} />
        <Route path="*"            element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}