import { useState } from "react";
import { login, setToken } from "../api/client";

export default function AdminLogin({ onSuccess, onBack }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!pw) return;
    setLoading(true);
    setError("");
    try {
      const data = await login(pw);
      setToken(data.access_token);
      onSuccess();
    } catch (e) {
      setError("Incorrect password. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div style={{ fontSize: 48, textAlign: "center" }}>🏓</div>
        <h2 className="login-title">Admin Access</h2>
        <input
          className={`input ${error ? "input-error" : ""}`}
          type="password"
          placeholder="Enter password"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />
        {error && <p className="error-txt">{error}</p>}
        <button className="btn-primary" onClick={handleLogin} disabled={loading}>
          {loading ? "Checking…" : "Enter"}
        </button>
        <button className="btn-ghost" onClick={onBack}>← Back to public view</button>
        <p className="hint-txt">Contact your tournament organiser for the password.</p>
      </div>
    </div>
  );
}
