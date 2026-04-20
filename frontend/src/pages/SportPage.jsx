import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getSportPageData } from "../api/client";
import Header from "../components/shared/Header";
import TournamentCard from "../components/shared/TournamentCard";
import { SPORT_LABELS } from "../components/shared/TournamentCard";

const SPORT_URL_TO_KEY = {
  football: "football",
  cricket: "cricket",
  "table-tennis": "table_tennis",
  badminton: "badminton",
};

const SPORT_ICONS = {
  football: "\u26BD",
  cricket: "\uD83C\uDFCF",
  table_tennis: "\uD83C\uDFD3",
  badminton: "\uD83C\uDFF8",
};

const POLL_INTERVAL = 8000;

export default function SportPage() {
  const location = useLocation();
  const sportUrl = location.pathname.replace("/", ""); // "/football" → "football"
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [filterCity, setFilterCity] = useState("");
  const [searchQ, setSearchQ] = useState("");

  const sportKey = SPORT_URL_TO_KEY[sportUrl];

  const fetchData = useCallback(() => {
    if (!sportUrl) return;
    getSportPageData(sportUrl, filterCity || null, searchQ || null)
      .then(setData)
      .catch(console.error);
  }, [sportUrl, filterCity, searchQ]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  const tournaments = data?.tournaments || [];
  const cities = data?.cities || [];

  const liveTournaments = tournaments.filter((t) => t.status === "live");
  const upcomingTournaments = tournaments.filter((t) => t.status === "upcoming");
  const completedTournaments = tournaments.filter((t) => t.status === "completed");

  const totalLive = tournaments.reduce((s, t) => s + (t.live_count || 0), 0);

  return (
    <div className="app">
      <Header
        showSearch
        onSearch={setSearchQ}
        searchPlaceholder={`Search ${SPORT_LABELS[sportKey] || sportUrl} tournaments...`}
      />

      {/* Sport header */}
      <div className="sport-page-hero" style={{ "--sport-accent": sportKey === "football" ? "#1a8f3f" : sportKey === "cricket" ? "#d4a017" : sportKey === "table_tennis" ? "#c0392b" : "#2d7abf" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 36 }}>{SPORT_ICONS[sportKey] || "🏆"}</span>
          <div>
            <h2 className="sport-page-title">{SPORT_LABELS[sportKey] || sportUrl}</h2>
            <div className="sport-page-sub">
              {tournaments.length} tournament{tournaments.length !== 1 ? "s" : ""}
              {totalLive > 0 && (
                <span style={{ marginLeft: 12 }}>
                  <span className="live-dot" style={{ background: "#fff" }} /> {totalLive} live
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="sport-page-filters">
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="filter-pill filter-pill-active" onClick={() => navigate("/")}>← All Sports</button>
          {cities.length > 0 && (
            <select
              className="filter-select"
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
            >
              <option value="">All Cities</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {totalLive > 0 && (
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
              <span className="live-dot" style={{ background: "#c0392b" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#c0392b", letterSpacing: 1 }}>
                {totalLive} LIVE NOW
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="content" style={{ paddingTop: 20 }}>
        {!data ? (
          <div className="empty">Loading…</div>
        ) : tournaments.length === 0 ? (
          <div className="empty">
            <div style={{ fontSize: 48, marginBottom: 12 }}>{SPORT_ICONS[sportKey] || "🏆"}</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              No {SPORT_LABELS[sportKey]} tournaments yet
            </div>
            <div style={{ fontSize: 14, color: "#7a6a50" }}>Check back soon or organize one!</div>
          </div>
        ) : (
          <>
            {/* Live */}
            {liveTournaments.length > 0 && (
              <Section
                label={`🔴 Live (${liveTournaments.length})`}
                tournaments={liveTournaments}
                sportUrl={sportUrl}
                navigate={navigate}
              />
            )}

            {/* Upcoming */}
            {upcomingTournaments.length > 0 && (
              <Section
                label="Upcoming"
                tournaments={upcomingTournaments}
                sportUrl={sportUrl}
                navigate={navigate}
              />
            )}

            {/* Completed */}
            {completedTournaments.length > 0 && (
              <Section
                label="Completed"
                tournaments={completedTournaments}
                sportUrl={sportUrl}
                navigate={navigate}
              />
            )}
          </>
        )}
      </div>

      <footer className="footer">TheScoreBoard — {SPORT_LABELS[sportKey]} tournaments</footer>
    </div>
  );
}

function Section({ label, tournaments, sportUrl, navigate }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div className="section-label">{label}</div>
      <div className="tournament-grid">
        {tournaments.map((t) => (
          <TournamentCard
            key={t.tournament_id}
            tournament={t}
            onClick={() => navigate(`/${sportUrl}/tournament/${t.slug}`)}
          />
        ))}
      </div>
    </div>
  );
}