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

export default function AnwesenheitPage() {
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState({ dates: [], users: [], myCard: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState("");
  const [entries, setEntries] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [allOpen, setAllOpen] = useState(false);
  const [allEntries, setAllEntries] = useState([]);
  const [allLoading, setAllLoading] = useState(false);
  const [allError, setAllError] = useState(null);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [cards, setCards] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardsError, setCardsError] = useState(null);

  async function togglePaid(card) {
    const next = !card.paid;
    try {
      const updated = await api.setFourCardPaid(
        user.courseId,
        card.userId,
        next,
      );
      setCards((prev) =>
        prev.map((c) => (c.userId === card.userId ? { ...c, ...updated } : c)),
      );
      await load();
    } catch (err) {
      setCardsError(err.message);
    }
  }

  async function openFourCards() {
    setCardsOpen(true);
    setCardsLoading(true);
    setCardsError(null);
    try {
      const result = await api.fourCards(user.courseId);
      setCards(result);
    } catch (err) {
      setCardsError(err.message);
    } finally {
      setCardsLoading(false);
    }
  }


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
    setEditingId(null);
    setOpen(true);
  }

  async function openAllEntries() {
    setAllOpen(true);
    setAllLoading(true);
    setAllError(null);
    try {
      const result = await api.allAttendance(user.courseId);
      setAllEntries(result);
    } catch (err) {
      setAllError(err.message);
    } finally {
      setAllLoading(false);
    }
  }

  async function deleteEntry(entry) {
    const confirmed = window.confirm(
      `Soll der Anwesenheitstermin vom ${formatDate(entry.date)} wirklich gelöscht werden?`,
    );
    if (!confirmed) return;
    setAllError(null);
    try {
      await api.deleteAttendance(user.courseId, entry.id);
      setAllEntries((prev) => prev.filter((e) => e.id !== entry.id));
      await load();
    } catch (err) {
      setAllError(err.message);
    }
  }

  function startEdit(entry) {
    const initial = {};
    const byUserId = new Map(entry.entries.map((e) => [e.userId, e]));
    for (const u of data.users) {
      const saved = byUserId.get(u.id);
      initial[u.id] = {
        present: saved ? saved.present : false,
        hours: saved
          ? saved.hours || (u.hasFourCard ? "4/4" : null)
          : u.hasFourCard
            ? "4/4"
            : null,
      };
    }
    setEntries(initial);
    setDate(entry.date || "");
    setEditingId(entry.id);
    setAllOpen(false);
    setOpen(true);
  }

  function togglePresent(userId) {
    setEntries((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], present: !prev[userId]?.present },
    }));
  }

  async function submit(e) {
    e?.preventDefault?.();
    if (!date) {
      setError("Bitte ein Datum auswählen.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        date,
        entries: Object.entries(entries).map(([userId, val]) => ({
          userId: Number(userId),
          present: val.present,
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
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-secondary" onClick={openFourCards}>
                4er-Karten Übersicht
              </button>
              <button className="btn-secondary" onClick={openAllEntries}>
                Alle Termine anzeigen
              </button>
              <button className="btn-primary" onClick={openModal}>
                Anwesenheit hinzufügen
              </button>
            </div>
          ) : null
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data.myCard && (
        <div
          className={[
            "mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm",
            data.myCard.paid
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : data.myCard.needsPayment
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-slate-200 bg-slate-50 text-slate-700",
          ].join(" ")}
        >
          <div className="min-w-0">
            <div className="font-semibold">
              Deine 4er-Karte: {data.myCard.displayHours}
            </div>
            <div className="text-xs">
              {data.myCard.paid
                ? "Karte ist bezahlt."
                : data.myCard.needsPayment
                  ? "Karte ist voll – bitte zahle für eine neue Karte."
                  : "Karte ist noch nicht bezahlt."}
            </div>
          </div>
          <span
            className={[
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
              data.myCard.paid
                ? "bg-emerald-100 text-emerald-800"
                : data.myCard.needsPayment
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-200 text-slate-700",
            ].join(" ")}
          >
            {data.myCard.paid
              ? "Bezahlt"
              : data.myCard.needsPayment
                ? "Bitte bezahlen"
                : "Nicht bezahlt"}
          </span>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Lade Anwesenheit…</div>
      ) : data.users.length === 0 ? (
        <div className="card p-6 text-sm text-slate-500">
          Für diesen Kurs sind keine Teilnehmer hinterlegt.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[480px] table-fixed divide-y divide-slate-200">
            <colgroup>
              <col className="w-32 sm:w-40" />
              {data.dates.map((d) => (
                <col key={d.id} />
              ))}
            </colgroup>
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Teilnehmer
                </th>
                {data.dates.map((d) => (
                  <th
                    key={d.id}
                    className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500"
                  >
                    {formatDate(d.date)}
                  </th>
                ))}
                {data.dates.length === 0 && (
                  <th className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Noch keine Termine
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {data.users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="truncate px-4 py-3 text-sm font-medium text-slate-900">
                    {u.username}
                  </td>
                  {data.dates.map((d) => {
                    const e = u.entries[d.id];
                    return (
                      <td key={d.id} className="px-2 py-3 text-center">
                          {e?.present ? (
                            <div className="flex flex-col items-center">
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </span>
                              {e.hours && u.id === user.id && (
                                <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                                  {e.hours}
                                  {u.hasFourCard && (
                                    <span
                                      className="group relative inline-flex cursor-help items-center"
                                      aria-label="Dies ist die Anzahl an bereits genommen Stunden"
                                    >
                                      <span className="inline-flex h-3.5 w-3.5 select-none items-center justify-center rounded-full border border-slate-400 text-[9px] font-bold leading-none text-slate-500">
                                        i
                                      </span>
                                      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-normal text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                                        Dies ist die Anzahl an bereits genommen Stunden
                                      </span>
                                    </span>
                                  )}
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
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? "Anwesenheit bearbeiten" : "Anwesenheit erfassen"}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Abbrechen
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={submit}
              disabled={saving}
            >
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
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3 dark:border-slate-600">
              {data.users.length === 0 && (
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Keine Teilnehmer im Kurs.
                </div>
              )}
              {data.users.map((u) => {
                const e = entries[u.id] || { present: false };
                return (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    <label className="flex flex-1 items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-500 dark:bg-slate-700"
                        checked={e.present}
                        onChange={() => togglePresent(u.id)}
                      />
                      {u.username}
                    </label>
                    {u.hasFourCard ? (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        4er-Karte (auto +1)
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Keine 4er Karte
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={allOpen}
        onClose={() => setAllOpen(false)}
        title="Alle Anwesenheitstermine"
        footer={
          <button className="btn-secondary" onClick={() => setAllOpen(false)}>
            Schließen
          </button>
        }
      >
        {allLoading ? (
          <div className="text-sm text-slate-500">Lade Termine…</div>
        ) : allError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {allError}
          </div>
        ) : allEntries.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            Es sind noch keine Anwesenheitstermine vorhanden.
          </div>
        ) : (
          <ol className="space-y-3">
            {allEntries.map((entry) => {
              const presentCount = entry.entries.filter((e) => e.present).length;
              return (
                <li
                  key={entry.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {formatDate(entry.date)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {presentCount} von {entry.entries.length} anwesend
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEdit(entry)}
                        aria-label="Bearbeiten"
                        title="Bearbeiten"
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M17.414 2.586a2 2 0 0 0-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 0 0 0-2.828z" />
                          <path d="M2 15a1 1 0 0 0 1 1h3v-2H4v-2H2v3z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => deleteEntry(entry)}
                        aria-label="Löschen"
                        title="Löschen"
                        className="text-slate-400 hover:text-red-600"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M9 2a1 1 0 0 0-.894.553L7.382 4H4a1 1 0 0 0 0 2h.117l.764 10.7A2 2 0 0 0 6.877 18.5h6.246a2 2 0 0 0 1.996-1.8L15.883 6H16a1 1 0 1 0 0-2h-3.382l-.724-1.447A1 1 0 0 0 11 2H9zm-1 6a1 1 0 0 1 2 0v6a1 1 0 1 1-2 0V8zm4 0a1 1 0 1 1 2 0v6a1 1 0 1 1-2 0V8z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {entry.entries.length > 0 && (
                    <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                      {entry.entries.map((e) => (
                        <li
                          key={e.userId}
                          className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1"
                        >
                          <span className="flex items-center gap-2 text-slate-700">
                            {e.present ? (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </span>
                            ) : (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700">
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                >
                                  <path d="M18 6 6 18M6 6l12 12" />
                                </svg>
                              </span>
                            )}
                            {e.username}
                          </span>
                          {e.present && e.hours && e.userId === user.id && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                              {e.hours}
                              {e.hasFourCard && (
                                <span
                                  className="group relative inline-flex cursor-help items-center"
                                  aria-label="Dies ist die Anzahl an bereits genommen Stunden"
                                >
                                  <span className="inline-flex h-3.5 w-3.5 select-none items-center justify-center rounded-full border border-slate-400 text-[9px] font-bold leading-none text-slate-500">
                                    i
                                  </span>
                                  <span className="pointer-events-none absolute bottom-full right-0 z-10 mb-1 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-normal text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                                    Dies ist die Anzahl an bereits genommen Stunden
                                  </span>
                                </span>
                              )}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Modal>

      <Modal
        open={cardsOpen}
        onClose={() => setCardsOpen(false)}
        title="4er-Karten Übersicht"
        footer={
          <button
            className="btn-secondary"
            onClick={() => setCardsOpen(false)}
          >
            Schließen
          </button>
        }
      >
        {cardsLoading ? (
          <div className="text-sm text-slate-500">Lade 4er-Karten…</div>
        ) : cardsError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {cardsError}
          </div>
        ) : cards.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            In diesem Kurs hat noch niemand eine 4er-Karte hinterlegt.
          </div>
        ) : (
          <ul className="space-y-2">
            {cards.map((c) => (
              <li
                key={c.userId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">
                    {c.username}
                  </div>
                  <div className="text-xs text-slate-500">
                    Stunden gezählt: {c.displayHours}
                    {c.paidAt && (
                      <>
                        {" · "}
                        <span className="text-emerald-700">
                          Bezahlt am{" "}
                          {new Date(c.paidAt).toLocaleDateString("de-DE")}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-700">
                    {c.displayHours}
                  </span>
                  {c.paid ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      Bezahlt
                    </span>
                  ) : c.needsPayment ? (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      Karte voll – zahlen
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                      Nicht bezahlt
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => togglePaid(c)}
                    className={[
                      "rounded-lg px-3 py-1 text-xs font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2",
                      c.paid
                        ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus:ring-slate-400"
                        : "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-400",
                    ].join(" ")}
                  >
                    {c.paid ? "Bezahlung zurücknehmen" : "Als bezahlt markieren"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
