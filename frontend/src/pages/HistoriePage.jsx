import { useEffect, useState } from "react";

import { api } from "../api/client.js";
import Modal from "../components/Modal.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("de-DE", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function HistoriePage() {
  const { user, isAdmin } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: "", warmup: "", lesson: "", cooldown: "" });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deletingEntry, setDeletingEntry] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.history(user.courseId);
      setHistory(data);
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

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.updateHistory(user.courseId, editingId, form);
      } else {
        await api.addHistory(user.courseId, form);
      }
      setOpen(false);
      setEditingId(null);
      setForm({ date: "", warmup: "", lesson: "", cooldown: "" });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deletingEntry) return;
    setDeleting(true);
    try {
      await api.deleteHistory(user.courseId, deletingEntry.id);
      setDeletingEntry(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  const sortedHistory = [...history].sort((a, b) => {
    const da = a && a.date ? new Date(a.date) : new Date(0);
    const db = b && b.date ? new Date(b.date) : new Date(0);
    return da - db;
  });

  const placeholders = Array.from({ length: Math.max(0, 4 - sortedHistory.length) });

  return (
    <div>
      <PageHeader
        title="Unterrichtshistorie"
        description="Die letzten vier Unterrichtswochen im Überblick."
        action={
          isAdmin ? (
            <button
              className="btn-primary"
              onClick={() => {
                setEditingId(null);
                setForm({ date: "", warmup: "", lesson: "", cooldown: "" });
                setOpen(true);
              }}
            >
              Eintrag hinzufügen
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
        <div className="text-sm text-slate-500">Lade Historie…</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {sortedHistory.map((h) => (
            <div key={h.id} className="card relative flex flex-col p-5">
              {isAdmin && (
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingId(h.id);
                      setForm({ date: h.date || "", warmup: h.warmup || "", lesson: h.lesson || "", cooldown: h.cooldown || "" });
                      setOpen(true);
                    }}
                    aria-label="Bearbeiten"
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M17.414 2.586a2 2 0 0 0-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 0 0 0-2.828z" />
                      <path d="M2 15a1 1 0 0 0 1 1h3v-2H4v-2H2v3z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDeletingEntry(h)}
                    aria-label="Löschen"
                    className="text-slate-400 hover:text-red-600"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 0 0-.894.553L7.382 4H4a1 1 0 0 0 0 2h12a1 1 0 1 0 0-2h-3.382l-.724-1.447A1 1 0 0 0 11 2H9zM5 8a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8zm3 2a1 1 0 0 1 2 0v5a1 1 0 1 1-2 0v-5zm4 0a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0v-5z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              )}

              <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                Unterricht
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {formatDate(h.date)}
              </div>

              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Eintanzen
                  </dt>
                  <dd className="mt-0.5 text-slate-800">{h.warmup || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Unterricht
                  </dt>
                  <dd className="mt-0.5 text-slate-800">{h.lesson || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Austanzen
                  </dt>
                  <dd className="mt-0.5 text-slate-800">{h.cooldown || "—"}</dd>
                </div>
              </dl>
            </div>
          ))}
          {placeholders.map((_, idx) => (
            <div
              key={`ph-${idx}`}
              className="rounded-2xl border border-dashed border-slate-200 bg-white/50 p-5 text-sm text-slate-400"
            >
              Noch kein Eintrag.
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setEditingId(null);
        }}
        title={editingId ? "Eintrag bearbeiten" : "Neuen Historieneintrag hinzufügen"}
        footer={
          <>
            <button
              className="btn-secondary"
              onClick={() => {
                setOpen(false);
                setEditingId(null);
              }}
            >
              Abbrechen
            </button>
            <button className="btn-primary" form="history-form" disabled={saving}>
              {saving ? "Speichern…" : "Speichern"}
            </button>
          </>
        }
      >
        <form id="history-form" onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Datum</label>
            <input
              type="date"
              className="input"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Eintanzen</label>
            <input
              className="input"
              value={form.warmup}
              onChange={(e) => setForm({ ...form, warmup: e.target.value })}
              placeholder="z. B. Cha Cha Cha"
            />
          </div>
          <div>
            <label className="label">Unterricht</label>
            <input
              className="input"
              value={form.lesson}
              onChange={(e) => setForm({ ...form, lesson: e.target.value })}
              placeholder="z. B. Jive Basics"
            />
          </div>
          <div>
            <label className="label">Austanzen</label>
            <input
              className="input"
              value={form.cooldown}
              onChange={(e) => setForm({ ...form, cooldown: e.target.value })}
              placeholder="z. B. Discofox"
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(deletingEntry)}
        onClose={() => {
          if (!deleting) setDeletingEntry(null);
        }}
        title="Eintrag löschen?"
        footer={
          <>
            <button
              className="btn-secondary"
              onClick={() => setDeletingEntry(null)}
              disabled={deleting}
            >
              Abbrechen
            </button>
            <button
              className="btn-primary bg-red-600 hover:bg-red-700"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? "Löschen…" : "Endgültig löschen"}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Soll der Eintrag vom{" "}
          <span className="font-semibold">{formatDate(deletingEntry?.date)}</span>{" "}
          wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden.
        </p>
      </Modal>
    </div>
  );
}
