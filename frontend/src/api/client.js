const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

function getToken() {
  return localStorage.getItem("authToken");
}

// Decode JWT payload and check expiry — no library needed
function isTokenValid(token) {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    // exp is in seconds; Date.now() is ms
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      localStorage.removeItem("authToken"); // auto-clear expired token
      return false;
    }
    return true;
  } catch {
    return false; // malformed token — treat as invalid
  }
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    // If 401, token is bad/expired — clear it so UI redirects to login
    if (res.status === 401) localStorage.removeItem("authToken");
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

// ── Auth ────────────────────────────────────────────────────
export const login        = (password)  => request("POST", "/auth/login", { password });
export const setToken     = (token)     => localStorage.setItem("authToken", token);
export const logout       = ()          => localStorage.removeItem("authToken");
export const isLoggedIn   = ()          => isTokenValid(getToken());

// ── Players (global registry) ────────────────────────────────
export const getPlayers    = ()         => request("GET",    "/players/");
export const createPlayer  = (data)     => request("POST",   "/players/", data);
export const deletePlayer  = (id)       => request("DELETE", `/players/${id}`);

// ── Tournaments ──────────────────────────────────────────────
export const getTournaments    = ()           => request("GET",  "/tournaments/");
export const createTournament  = (data)       => request("POST", "/tournaments/", data);

// ── Tournament participants ──────────────────────────────────
// Returns participants grouped by group: [{group_name, players: [...]}]
export const getParticipants   = (tId)        => request("GET",    `/tournaments/${tId}/participants`);
export const addParticipant    = (tId, pId, seed) =>
  request("POST", `/tournaments/${tId}/participants/${pId}${seed != null ? `?seed=${seed}` : ""}`);
export const removeParticipant = (tId, pId)   => request("DELETE", `/tournaments/${tId}/participants/${pId}`);
export const setPlayerSeed     = (tId, pId, seed) =>
  request("PATCH", `/tournaments/${tId}/participants/${pId}/seed${seed != null ? `?seed=${seed}` : ""}`);

// ── Matches ──────────────────────────────────────────────────
export const getMatches        = (tId)        => request("GET",    `/matches/?tournament_id=${tId}`);
export const createMatch       = (data)       => request("POST",   "/matches/", data);
export const updateMatch       = (id, data)   => request("PATCH",  `/matches/${id}`, data);
export const deleteMatch       = (id)         => request("DELETE", `/matches/${id}`);
export const generateFixtures  = (tId)        => request("POST",   `/matches/generate/${tId}`);
export const rematchMatch      = (id)         => request("POST",   `/matches/${id}/rematch`);

// ── Standings ────────────────────────────────────────────────
export const getStandings      = (tId)        => request("GET",    `/tournaments/${tId}/standings`);