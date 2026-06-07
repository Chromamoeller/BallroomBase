import { useEffect, useRef, useState } from "react";

import { api } from "../api/client.js";
import Modal from "../components/Modal.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const ROLE_OPTIONS = [
  { value: "teilnehmer", label: "Teilnehmer" },
  { value: "admin", label: "Administrator" },
];

export default function NutzerPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const emptyForm = {
    username: "",
    password: "",
    role: "teilnehmer",
    courseId: "",
    hasFourCard: false,
    fourCardHours: 0,
  };
  const [form, setForm] = useState(emptyForm);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [u, c] = await Promise.all([api.users(), api.courses()]);
      setUsers(u);
      setCourses(c);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      courseId: user.courseId ? String(user.courseId) : "",
    });
    setFormError(null);
    setOpen(true);
  }

  function openEdit(u) {
    setEditingId(u.id);
    setForm({
      username: u.username,
      password: "",
      role: u.role,
      courseId: u.courseId ? String(u.courseId) : "",
      hasFourCard: Boolean(u.hasFourCard),
      fourCardHours: Number(u.fourCardHours ?? 0),
    });
    setFormError(null);
    setOpen(true);
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const { blob, filename } = await api.exportUsers();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  function triggerImport() {
    setImportResult(null);
    setError(null);
    fileInputRef.current?.click();
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    setError(null);
    setImportResult(null);
    try {
      const result = await api.importUsers(file);
      setImportResult(result);
      if (result.created > 0) {
        await load();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  async function confirmDelete() {
    if (!deletingUser) return;
    setDeleting(true);
    try {
      await api.deleteUser(deletingUser.id);
      setUsers((prev) => prev.filter((x) => x.id !== deletingUser.id));
      setDeletingUser(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.username.trim()) {
      setFormError("Benutzername erforderlich.");
      return;
    }
    if (!editingId && !form.password) {
      setFormError("Passwort erforderlich.");
      return;
    }
    if (!form.courseId) {
      setFormError("Bitte einen Kurs auswählen.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        const payload = {
          username: form.username.trim(),
          role: form.role,
          courseId: Number(form.courseId),
          hasFourCard: form.hasFourCard,
        };
        if (form.hasFourCard) {
          const hours = Number(form.fourCardHours);
          if (
            !Number.isInteger(hours) ||
            hours < 0 ||
            hours > 4
          ) {
            setFormError("Stundenzahl muss zwischen 0 und 4 liegen.");
            setSaving(false);
            return;
          }
          payload.fourCardHours = hours;
        }
        if (form.password) payload.password = form.password;
        const updated = await api.updateUser(editingId, payload);
        setUsers((prev) =>
          prev
            .map((x) => (x.id === editingId ? updated : x))
            .sort((a, b) => a.username.localeCompare(b.username)),
        );
      } else {
        const created = await api.createUser({
          username: form.username.trim(),
          password: form.password,
          role: form.role,
          courseId: Number(form.courseId),
          hasFourCard: form.hasFourCard,
        });
        setUsers((prev) =>
          [...prev, created].sort((a, b) =>
            a.username.localeCompare(b.username),
          ),
        );
      }
      setOpen(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Nutzer verwalten"
        description="Lege neue Teilnehmer oder Administratoren für die Kurse an."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Nutzer als CSV exportieren"
              title="Nutzer als CSV exportieren"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
              </svg>
              <span className="hidden sm:inline">
                {exporting ? "Export…" : "Export"}
              </span>
            </button>
            <button
              type="button"
              onClick={triggerImport}
              disabled={importing}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Nutzer aus CSV importieren"
              title="Nutzer aus CSV importieren"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 21V9m0 0l-4 4m4-4l4 4M5 3h14" />
              </svg>
              <span className="hidden sm:inline">
                {importing ? "Import…" : "Import"}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
              aria-label="Nutzer hinzufügen"
              title="Nutzer hinzufügen"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {importResult && (
        <div className="mb-4 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="flex items-center justify-between">
            <div>
              <strong>{importResult.created}</strong> Nutzer importiert
              {importResult.skipped?.length > 0 && (
                <>
                  , <strong>{importResult.skipped.length}</strong> übersprungen
                  (bereits vorhanden)
                </>
              )}
              {importResult.errors?.length > 0 && (
                <>
                  , <strong>{importResult.errors.length}</strong> Fehler
                </>
              )}
              .
            </div>
            <button
              type="button"
              onClick={() => setImportResult(null)}
              className="text-emerald-700 hover:text-emerald-900"
              aria-label="Schließen"
            >
              ×
            </button>
          </div>
          {importResult.skipped?.length > 0 && (
            <div className="text-xs text-emerald-700">
              Übersprungen: {importResult.skipped.join(", ")}
            </div>
          )}
          {importResult.errors?.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-red-700">
              {importResult.errors.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Lade Nutzer…</div>
      ) : users.length === 0 ? (
        <div className="card p-6 text-sm text-slate-500">
          Es sind noch keine Nutzer angelegt.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Benutzername
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Rolle
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Kurs
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    4er-Karte
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-sm font-medium text-slate-900">
                      {u.username}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-700">
                      {u.role === "admin" ? "Administrator" : "Teilnehmer"}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-700">
                      {u.courseName}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-700">
                      {u.hasFourCard ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                          Ja ({u.fourCardHours}/4)
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(u)}
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
                          type="button"
                          onClick={() => setDeletingUser(u)}
                          disabled={u.id === user.id}
                          aria-label="Löschen"
                          title={
                            u.id === user.id
                              ? "Du kannst dich nicht selbst löschen"
                              : "Löschen"
                          }
                          className="text-slate-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-slate-400"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M9 2a1 1 0 0 0-.894.553L7.382 4H4a1 1 0 0 0 0 2h12a1 1 0 1 0 0-2h-3.382l-.724-1.447A1 1 0 0 0 11 2H9zM5 8a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8zm3 2a1 1 0 0 1 2 0v5a1 1 0 1 1-2 0v-5zm4 0a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0v-5z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => (saving ? null : setOpen(false))}
        title={editingId ? "Nutzer bearbeiten" : "Neuen Nutzer anlegen"}
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
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="user-username">
              Benutzername
            </label>
            <input
              id="user-username"
              type="text"
              className="input"
              value={form.username}
              onChange={(e) => updateField("username", e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="user-password">
              {editingId ? "Passwort (leer lassen zum Beibehalten)" : "Passwort"}
            </label>
            <input
              id="user-password"
              type="text"
              className="input"
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
              autoComplete="new-password"
              placeholder={
                editingId ? "Nur ausfüllen zum Ändern" : "Initiales Passwort"
              }
              required={!editingId}
            />
          </div>
          <div>
            <label className="label" htmlFor="user-role">
              Rolle
            </label>
            <select
              id="user-role"
              className="input"
              value={form.role}
              onChange={(e) => updateField("role", e.target.value)}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="user-course">
              Kurs
            </label>
            <select
              id="user-course"
              className="input"
              value={form.courseId}
              onChange={(e) => updateField("courseId", e.target.value)}
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
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.hasFourCard}
              onChange={(e) => updateField("hasFourCard", e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Hat eine 4er-Karte
          </label>
          {editingId && form.hasFourCard && (
            <div>
              <label className="label" htmlFor="user-four-card-hours">
                Genutzte Stunden auf der 4er-Karte (0–4)
              </label>
              <input
                id="user-four-card-hours"
                type="number"
                min={0}
                max={4}
                step={1}
                className="input"
                value={form.fourCardHours}
                onChange={(e) =>
                  updateField(
                    "fourCardHours",
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
              />
              <p className="mt-1 text-xs text-slate-500">
                Wird beim nächsten Anwesenheits-Update neu aus der Historie
                berechnet.
              </p>
            </div>
          )}

          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}
          <button type="submit" className="hidden" aria-hidden="true" />
        </form>
      </Modal>

      <Modal
        open={Boolean(deletingUser)}
        onClose={() => (deleting ? null : setDeletingUser(null))}
        title="Nutzer löschen?"
        footer={
          <>
            <button
              className="btn-secondary"
              onClick={() => setDeletingUser(null)}
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
          Soll der Nutzer{" "}
          <span className="font-semibold">{deletingUser?.username}</span>{" "}
          wirklich gelöscht werden? Alle Anwesenheitseinträge dieses Nutzers
          werden ebenfalls entfernt. Diese Aktion kann nicht rückgängig gemacht
          werden.
        </p>
      </Modal>
    </div>
  );
}
