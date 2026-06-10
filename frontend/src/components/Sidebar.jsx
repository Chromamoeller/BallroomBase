import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";

import { api } from "../api/client.js";
import Modal from "./Modal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

const NAV_ITEMS = [
  { to: "/figuren", label: "Figuren" },
  { to: "/folgen", label: "Folgen" },
  { to: "/historie", label: "Historie" },
  { to: "/anwesenheit", label: "Anwesenheitsliste" },
];

const ADMIN_NAV_ITEMS = [{ to: "/nutzer", label: "Nutzer verwalten" }];

function ThemeSwitch() {
  const { isDark, toggle } = useTheme();
  return (
    <div className="mb-3 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
        {isDark ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M4.93 19.07l1.41-1.41 M17.66 6.34l1.41-1.41" />
          </svg>
        )}
        Dark Mode
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label="Dark Mode umschalten"
        onClick={toggle}
        className={[
          "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 dark:focus:ring-offset-slate-800",
          isDark ? "bg-brand-500" : "bg-slate-300",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
            isDark ? "translate-x-5" : "translate-x-0.5",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

function ChangePasswordModal({ open, onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
    setLoading(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("Die neuen Passwörter stimmen nicht überein.");
      return;
    }
    if (newPassword.length < 4) {
      setError("Neues Passwort muss mindestens 4 Zeichen lang sein.");
      return;
    }
    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Passwort ändern"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={handleClose}>
            Schließen
          </button>
          <button
            type="submit"
            form="change-password-form"
            className="btn-primary"
            disabled={loading}
          >
            {loading ? "Speichern…" : "Speichern"}
          </button>
        </>
      }
    >
      <form id="change-password-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="current-password">Aktuelles Passwort</label>
          <input
            id="current-password"
            type="password"
            className="input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="new-password">Neues Passwort</label>
          <input
            id="new-password"
            type="password"
            className="input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="confirm-password">Neues Passwort bestätigen</label>
          <input
            id="confirm-password"
            type="password"
            className="input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/30 dark:text-red-200">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900/60 dark:bg-green-900/30 dark:text-green-200">
            Passwort wurde geändert.
          </div>
        )}
      </form>
    </Modal>
  );
}

export default function Sidebar({ isOpen = false, onClose = () => {} }) {
  const { user, logout, isAdmin } = useAuth();
  const items = isAdmin ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS;
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);

  useEffect(() => {
    if (!settingsOpen) return;
    function handleClick(e) {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setSettingsOpen(false);
      }
    }
    function handleKey(e) {
      if (e.key === "Escape") setSettingsOpen(false);
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [settingsOpen]);

  return (
    <>
      {/* Overlay (nur Mobile, wenn offen) */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          "fixed left-0 top-0 z-40 flex h-screen h-dvh w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white shadow-card dark:border-slate-700 dark:bg-slate-800",
          "transition-transform duration-200 ease-out",
          isOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
        ].join(" ")}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-6 dark:border-slate-700">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-300">
              DanceFans
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {user?.username}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {user?.role === "admin" ? "Administrator" : "Teilnehmer"} · {user?.courseName}
            </div>
          </div>
          <button
            type="button"
            aria-label="Menü schließen"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200 lg:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-6">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                [
                  "block rounded-lg px-4 py-2.5 text-sm font-medium transition",
                  isActive
                    ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-slate-700">
          <ThemeSwitch />
          <div className="flex items-center gap-2">
            <button onClick={logout} className="btn-secondary flex-1">
              Abmelden
            </button>
            <div className="relative" ref={settingsRef}>
              <button
                type="button"
                aria-label="Einstellungen"
                aria-haspopup="menu"
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen((v) => !v)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              {settingsOpen && (
                <div
                  role="menu"
                  className="absolute bottom-full right-0 z-10 mb-2 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSettingsOpen(false);
                      setPasswordOpen(true);
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Passwort ändern
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      <ChangePasswordModal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
      />
    </>
  );
}
