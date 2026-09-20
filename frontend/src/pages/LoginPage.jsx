import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Alert from "../components/Alert.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function LoginPage() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      await login(username, password);
      navigate("/welcome");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">
            DanceFans
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">Anmelden</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Bitte melde dich an, um fortzufahren.
          </p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="username">Benutzername</label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Passwort</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <Alert compact>{error}</Alert>
          )}

          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Anmelden…" : "Anmelden"}
          </button>

          <div className="border-t border-slate-200 pt-4 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
            Noch keinen Account?{" "}
            <Link
              to="/register"
              className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
            >
              Jetzt registrieren
            </Link>
          </div>

          <Link to="/" className="block text-center text-sm text-slate-500 hover:text-brand-700 dark:text-slate-400 dark:hover:text-brand-300">
            Zurück zur Startseite
          </Link>
        </form>
      </div>
    </div>
  );
}
