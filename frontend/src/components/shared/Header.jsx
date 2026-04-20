import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { isLoggedIn } from "../../api/client";

export default function Header({ showSearch = false, onSearch, searchPlaceholder = "Search tournaments, cities..." }) {
  const navigate = useNavigate();
  const [searchVal, setSearchVal] = useState("");

  const handleSearch = (val) => {
    setSearchVal(val);
    if (onSearch) onSearch(val);
  };

  return (
    <header className="header">
      <div className="header-inner">
        <h1 className="header-title header-title-link" onClick={() => navigate("/")}>
          TheScoreBoard
        </h1>

        {showSearch && (
          <div className="header-search">
            <span className="header-search-icon">🔍</span>
            <input
              className="header-search-input"
              type="text"
              placeholder={searchPlaceholder}
              value={searchVal}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {searchVal && (
              <button className="header-search-clear" onClick={() => handleSearch("")}>✕</button>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isLoggedIn() ? (
            <button className="btn-ghost" onClick={() => navigate("/dashboard")}>Dashboard</button>
          ) : (
            <button className="btn-ghost" onClick={() => navigate("/login")}>Log in</button>
          )}
        </div>
      </div>
    </header>
  );
}