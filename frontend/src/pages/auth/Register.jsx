import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { register, setToken } from "../../api/client";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.password)
      return setError("Name, email, and password are required.");
    if (form.password.length < 6)
      return setError("Password must be at least 6 characters.");
    setLoading(true);
    setError("");
    try {
      const data = await register(form);
      setToken(data.access_token);
      navigate("/dashboard", { replace: true });
    } catch (e) {
      setError(e.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-box">
        <h1 className="auth-brand">TheScoreBoard</h1>
        <h2 className="auth-title">Create your account</h2>

        <input
          className="input"
          type="text"
          placeholder="Full name *"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          className="input"
          type="email"
          placeholder="Email *"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
        <input
          className="input"
          type="password"
          placeholder="Password (min 6 chars) *"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
        />
        <input
          className="input"
          type="tel"
          placeholder="Phone (optional)"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />

        {error && <p className="error-txt">{error}</p>}

        <button className="btn-primary btn-full" onClick={handleSubmit} disabled={loading}>
          {loading ? "Creating account…" : "Create Account"}
        </button>

        <p className="auth-footer-txt">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
        <p className="auth-footer-txt">
          <Link to="/">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
