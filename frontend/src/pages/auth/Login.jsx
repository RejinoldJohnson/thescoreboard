import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login, setToken } from "../../api/client";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.email || !form.password) return setError("All fields are required.");
    setLoading(true);
    setError("");
    try {
      const data = await login(form);
      setToken(data.access_token);
      navigate("/dashboard", { replace: true });
    } catch (e) {
      setError(e.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-box">
        <h1 className="auth-brand">TheScoreBoard</h1>
        <h2 className="auth-title">Welcome back</h2>

        <input
          className="input"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />

        {error && <p className="error-txt">{error}</p>}

        <button className="btn-primary btn-full" onClick={handleSubmit} disabled={loading}>
          {loading ? "Signing in…" : "Sign In"}
        </button>

        <p className="auth-footer-txt">
          Don't have an account? <Link to="/register">Register</Link>
        </p>
        <p className="auth-footer-txt">
          <Link to="/">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
