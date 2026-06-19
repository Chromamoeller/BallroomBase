import { useEffect, useState } from "react";

import { api } from "../api/client.js";
import Modal from "../components/Modal.jsx";
import PageHeader from "../components/PageHeader.jsx";

const emptyParticipant = { name: "", paid: false };

const emptyForm = {
  name: "",
  time: "",
  startDate: "",
  hours: "",
  participants: [{ ...emptyParticipant }],
};

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export default function KursePage() {
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [deletingProgram, setDeletingProgram] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.coursePrograms();
        if (!cancelled) setPrograms(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      participants: [{ ...emptyParticipant }],
    });
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (program) => {
    setEditingId(program.id);
    setForm({
      name: program.name || "",
      time: program.time || "",
      startDate: program.startDate || "",
      hours: program.hours == null ? "" : String(program.hours),
      participants:
        program.participants && program.participants.length > 0
          ? program.participants.map((p) => ({ name: p.name, paid: p.paid }))
          : [{ ...emptyParticipant }],
    });
    setFormError(null);
    setModalOpen(true);
  };

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateParticipant = (index, field, value) => {
    setForm((current) => ({
      ...current,
      participants: current.participants.map((p, i) =>
        i === index ? { ...p, [field]: value } : p,
      ),
    }));
  };

  const addParticipant = (index) => {
    setForm((current) => {
      const next = [...current.participants];
      next.splice(index + 1, 0, { ...emptyParticipant });
      return { ...current, participants: next };
    });
  };

  const removeParticipant = (index) => {
    setForm((current) => {
      if (current.participants.length <= 1) {
        return { ...current, participants: [{ ...emptyParticipant }] };
      }
      return {
        ...current,
        participants: current.participants.filter((_, i) => i !== index),
      };
    });
  };

  async function submitForm(event) {
    event.preventDefault();
    if (!form.name.trim()) {
      setFormError("Bitte einen Namen angeben.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const participants = form.participants
        .map((p) => ({ name: p.name.trim(), paid: p.paid }))
        .filter((p) => p.name.length > 0);
      const payload = {
        name: form.name.trim(),
        time: form.time,
        startDate: form.startDate,
        hours: form.hours === "" ? null : Number(form.hours),
        participants,
      };
      if (editingId != null) {
        const updated = await api.updateCourseProgram(editingId, payload);
        setPrograms((current) =>
          current.map((p) => (p.id === editingId ? updated : p)),
        );
      } else {
        const created = await api.createCourseProgram(payload);
        setPrograms((current) => [created, ...current]);
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deletingProgram) return;
    setDeleting(true);
    try {
      await api.deleteCourseProgram(deletingProgram.id);
      setPrograms((current) =>
        current.filter((p) => p.id !== deletingProgram.id),
      );
      setDeletingProgram(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Kurse"
        description="Lege Kurse mit Teilnehmern und Bezahlstatus an."
        action={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
            aria-label="Kurs hinzufügen"
            title="Kurs hinzufügen"
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
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Lade Kurse…
        </div>
      ) : programs.length === 0 ? (
        <div className="card p-6 text-sm text-slate-500 dark:text-slate-400">
          Es sind noch keine Kurse angelegt. Lege über das +-Symbol oben rechts
          einen neuen Kurs an.
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {programs.map((program) => {
            const paidCount = program.participants.filter(
              (p) => p.paid,
            ).length;
            return (
              <div key={program.id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {program.name}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(program)}
                      aria-label="Bearbeiten"
                      title="Bearbeiten"
                      className="text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
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
                      onClick={() => setDeletingProgram(program)}
                      aria-label="Löschen"
                      title="Löschen"
                      className="text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
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
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Uhrzeit
                    </dt>
                    <dd className="mt-0.5 text-slate-800 dark:text-slate-100">
                      {program.time || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Start
                    </dt>
                    <dd className="mt-0.5 text-slate-800 dark:text-slate-100">
                      {formatDate(program.startDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Stunden
                    </dt>
                    <dd className="mt-0.5 text-slate-800 dark:text-slate-100">
                      {program.hours ?? "—"}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-700">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Teilnehmer
                    </span>
                    {program.participants.length > 0 && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {paidCount}/{program.participants.length} bezahlt
                      </span>
                    )}
                  </div>
                  {program.participants.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Keine Teilnehmer hinterlegt.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {program.participants.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="text-slate-700 dark:text-slate-200">
                            {p.name}
                          </span>
                          {p.paid ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                              Bezahlt
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                              Offen
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          if (saving) return;
          setModalOpen(false);
        }}
        title={editingId != null ? "Kurs bearbeiten" : "Neuen Kurs anlegen"}
        footer={
          <>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              disabled={saving}
              className="btn-secondary"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={submitForm}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? "Speichern…" : "Speichern"}
            </button>
          </>
        }
      >
        <form onSubmit={submitForm} className="space-y-4">
          <div>
            <label className="label" htmlFor="kurs-name">
              Name
            </label>
            <input
              id="kurs-name"
              type="text"
              className="input"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="z.B. Anfängerkurs Standard"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="kurs-time">
                Uhrzeit
              </label>
              <input
                id="kurs-time"
                type="time"
                className="input"
                value={form.time}
                onChange={(e) => updateField("time", e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="kurs-start">
                Startdatum
              </label>
              <input
                id="kurs-start"
                type="date"
                className="input"
                value={form.startDate}
                onChange={(e) => updateField("startDate", e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="kurs-hours">
                Stundenanzahl
              </label>
              <input
                id="kurs-hours"
                type="number"
                min="0"
                className="input"
                value={form.hours}
                onChange={(e) => updateField("hours", e.target.value)}
                placeholder="z.B. 10"
              />
            </div>
          </div>

          <div>
            <span className="label">Teilnehmer</span>
            <div className="space-y-2">
              {form.participants.map((participant, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    className="input flex-1"
                    value={participant.name}
                    onChange={(e) =>
                      updateParticipant(index, "name", e.target.value)
                    }
                    placeholder="Name des Teilnehmers"
                  />
                  <label className="flex flex-shrink-0 cursor-pointer items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={participant.paid}
                      onChange={(e) =>
                        updateParticipant(index, "paid", e.target.checked)
                      }
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                    />
                    Bezahlt
                  </label>
                  <button
                    type="button"
                    onClick={() => addParticipant(index)}
                    className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
                    aria-label="Teilnehmer hinzufügen"
                    title="Teilnehmer hinzufügen"
                  >
                    <svg
                      width="16"
                      height="16"
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
                  <button
                    type="button"
                    onClick={() => removeParticipant(index)}
                    disabled={
                      form.participants.length <= 1 && participant.name === ""
                    }
                    className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    aria-label="Teilnehmer entfernen"
                    title="Teilnehmer entfernen"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/30 dark:text-red-200">
              {formError}
            </div>
          )}
          <button type="submit" className="hidden" aria-hidden="true" />
        </form>
      </Modal>

      <Modal
        open={Boolean(deletingProgram)}
        onClose={() => (deleting ? null : setDeletingProgram(null))}
        title="Kurs löschen?"
        footer={
          <>
            <button
              className="btn-secondary"
              onClick={() => setDeletingProgram(null)}
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
        <p className="text-sm text-slate-700 dark:text-slate-200">
          Soll der Kurs{" "}
          <span className="font-semibold">{deletingProgram?.name}</span> wirklich
          gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden.
        </p>
      </Modal>
    </div>
  );
}
