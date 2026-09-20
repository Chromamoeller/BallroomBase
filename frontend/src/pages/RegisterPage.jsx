import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../api/client.js";
import Alert from "../components/Alert.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function RegisterPage() {
  const { register, loading } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [username, setUsername] = useState("");
  const [courseId, setCourseId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .courses()
      .then(setCourses)
      .catch((err) => setError(err.message));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (password !== passwordRepeat) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    try {
      await register({
        username,
        courseId: Number(courseId),
        joinCode,
        password,
      });
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
          <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Account erstellen
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Den Beitrittscode bekommst du von deinem Kursleiter.
          </p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="reg-username">Teilnehmername</label>
            <input
              id="reg-username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              maxLength={40}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="reg-course">Kurs</label>
            <select
              id="reg-course"
              className="input"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              required
            >
              <option value="">Kurs auswählen…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="reg-code">Beitrittscode</label>
            <input
              id="reg-code"
              className="input uppercase tracking-widest"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="reg-password">Passwort</label>
            <input
              id="reg-password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={4}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="reg-password-repeat">Passwort wiederholen</label>
            <input
              id="reg-password-repeat"
              type="password"
              className="input"
              value={passwordRepeat}
              onChange={(e) => setPasswordRepeat(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          {error && <Alert compact>{error}</Alert>}

          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Erstelle Account…" : "Account erstellen"}
          </button>

          <Link
            to="/login"
            className="block text-center text-sm text-slate-500 hover:text-brand-700 dark:text-slate-400 dark:hover:text-brand-300"
          >
            Bereits einen Account? Zum Login
          </Link>
        </form>
      </div>
    </div>
  );
}
