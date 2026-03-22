const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

function getToken() {
  return localStorage.getItem("authToken");
}

function isTokenValid(token) {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      localStorage.removeItem("authToken");
      return false;
    }
    return true;
  } catch {
    return false;
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
    if (res.status === 401) localStorage.removeItem("authToken");
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

// ── Auth ────────────────────────────────────────────────────
export const login      = (password) => request("POST", "/auth/login", { password });
export const setToken   = (token)    => localStorage.setItem("authToken", token);
export const logout     = ()         => localStorage.removeItem("authToken");
export const isLoggedIn = ()         => isTokenValid(getToken());

// ── Players ──────────────────────────────────────────────────
export const getPlayers   = ()     => request("GET",    "/players/");
export const createPlayer = (data) => request("POST",   "/players/", data);
export const deletePlayer = (id)   => request("DELETE", `/players/${id}`);

// ── Tournaments ──────────────────────────────────────────────
export const getTournaments   = ()     => request("GET",  "/tournaments/");
export const createTournament = (data) => request("POST", "/tournaments/", data);

// ── Tournament participants ──────────────────────────────────
export const getParticipants   = (tId)            => request("GET",    `/tournaments/${tId}/participants`);
export const addParticipant    = (tId, pId, seed) =>
  request("POST", `/tournaments/${tId}/participants/${pId}${seed != null ? `?seed=${seed}` : ""}`);
export const removeParticipant = (tId, pId)       => request("DELETE", `/tournaments/${tId}/participants/${pId}`);
export const setPlayerSeed     = (tId, pId, seed) =>
  request("PATCH", `/tournaments/${tId}/participants/${pId}/seed${seed != null ? `?seed=${seed}` : ""}`);

// ── Matches ──────────────────────────────────────────────────
export const getMatches       = (tId)  => request("GET",    `/matches/?tournament_id=${tId}`);
export const getLiveMatches   = (tId)  => request("GET",    `/matches/live?tournament_id=${tId}`);
export const createExhibitionMatch = (data) => request("POST", "/matches/exhibition", data);
export const createMatch      = (data) => request("POST",   "/matches/", data);
export const deleteMatch      = (id)   => request("DELETE", `/matches/${id}`);
export const generateFixtures = (tId)  => request("POST",   `/matches/generate/${tId}`);
export const triggerKnockout   = (tId)  => request("POST",   `/matches/trigger-ko/${tId}`);
export const assignPlayerGroup  = (tId, pId, gId) => request("PATCH", `/tournaments/${tId}/participants/${pId}/group${gId != null ? `?group_id=${gId}` : ""}`);
export const createManualMatch  = (data) => request("POST", "/matches/", data);
export const createBye          = (tId, pId, gId, round) => request("POST", `/matches/bye/${tId}?player_id=${pId}${gId ? `&group_id=${gId}` : ""}&round_num=${round || 1}`);
export const rematchMatch     = (id)   => request("POST",   `/matches/${id}/rematch`);

// General-purpose match patch — accepts any combo of status, table_number, set_update
export const updateMatch      = (id, data) => request("PATCH",  `/matches/${id}`, data);

// Send a single set score — backend tallies sets_won and auto-finishes match
export const updateMatchSet = (matchId, setNumber, scoreP1, scoreP2) =>
  request("PATCH", `/matches/${matchId}`, {
    set_update: { set_number: setNumber, score_p1: scoreP1, score_p2: scoreP2 },
  });

// Status-only patch (e.g. mark as "live")
export const updateMatchStatus = (matchId, status) =>
  request("PATCH", `/matches/${matchId}`, { status });

// ── Standings ────────────────────────────────────────────────
export const getStandings = (tId) => request("GET", `/tournaments/${tId}/standings`);