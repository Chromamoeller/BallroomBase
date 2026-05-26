import { useEffect, useState } from "react";

import { api } from "../api/client.js";
import Modal from "../components/Modal.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function formatDate(d) {
  try {
    return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return d;
  }
}

const HOUR_OPTIONS = ["1/4", "2/4", "3/4", "4/4"];

export default function AnwesenheitPage() {
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState({ dates: [], users: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState("");
  const [entries, setEntries] = useState({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.attendance(user.courseId);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.courseId]);

  function openModal() {
    const initial = {};
    for (const u of data.users) {
      initial[u.id] = { present: false, hours: u.hasFourCard ? "4/4" : null };
    }
    setEntries(initial);
    setDate("");
    setOpen(true);
  }

  function togglePresent(userId) {
    setEntries((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], present: !prev[userId]?.present },
    }));
  }

  function setHours(userId, value) {
    setEntries((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], hours: value },
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        date,
        entries: Object.entries(entries).map(([userId, val]) => ({
          userId: Number(userId),
          present: val.present,
          hours: val.present ? val.hours : null,
        })),
      };
      await api.addAttendance(user.courseId, payload);
      setOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Anwesenheitsliste"
        description="Anwesenheit und Stundenstand der letzten vier Termine."
        action={
          isAdmin ? (
            <button className="btn-primary" onClick={openModal}>
              Anwesenheit hinzufügen
            </button>
          ) : null
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Lade Anwesenheit…</div>
      ) : data.users.length === 0 ? (
        <div className="card p-6 text-sm text-slate-500">
          Für diesen Kurs sind keine Teilnehmer hinterlegt.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Teilnehmer
                  </th>
                  {data.dates.map((d) => (
                    <th
                      key={d.id}
                      className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500"
                    >
                      {formatDate(d.date)}
                    </th>
                  ))}
                  {data.dates.length === 0 && (
                    <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Noch keine Termine
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {data.users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-sm font-medium text-slate-900">{u.username}</td>
                    {data.dates.map((d) => {
                      const e = u.entries[d.id];
                      return (
                        <td key={d.id} className="px-5 py-3 text-center">
                          {e?.present ? (
                            <div className="flex flex-col items-center">
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </span>
                              {e.hours && (
                                <span className="mt-1 text-xs font-medium text-slate-600">
                                  {e.hours}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-700">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path d="M18 6 6 18M6 6l12 12" />
                              </svg>
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Anwesenheit erfassen"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>
              Abbrechen
            </button>
            <button className="btn-primary" form="attendance-form" disabled={saving}>
              {saving ? "Speichern…" : "Speichern"}
            </button>
          </>
        }
      >
        <form id="attendance-form" onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Datum</label>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div>
            <div className="label">Teilnehmer</div>
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
              {data.users.length === 0 && (
                <div className="text-sm text-slate-500">Keine Teilnehmer im Kurs.</div>
              )}
              {data.users.map((u) => {
                const e = entries[u.id] || { present: false, hours: u.hasFourCard ? "4/4" : null };
                return (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50"
                  >
                    <label className="flex flex-1 items-center gap-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        checked={e.present}
                        onChange={() => togglePresent(u.id)}
                      />
                      {u.username}
                    </label>
                    {u.hasFourCard ? (
                      <select
                        className="input w-24 py-1"
                        value={e.hours || "4/4"}
                        onChange={(ev) => setHours(u.id, ev.target.value)}
                        disabled={!e.present}
                      >
                        {HOUR_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-slate-500">Keine 4er Karte</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
