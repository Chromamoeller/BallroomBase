import { Fragment, useEffect, useMemo, useState } from "react";

import { api } from "../api/client.js";
import DanceTabs from "../components/DanceTabs.jsx";
import Modal from "../components/Modal.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function FolgenPage() {
  const { user, isAdmin } = useAuth();
  const [dances, setDances] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [figures, setFigures] = useState([]);
  const [activeDance, setActiveDance] = useState(null);
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const [visibilityItems, setVisibilityItems] = useState([]);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const emptyCreateForm = {
    danceId: "",
    name: "",
    description: "",
    figureRows: [""],
  };
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [editingId, setEditingId] = useState(null);
  const [deletingSequence, setDeletingSequence] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, s, f] = await Promise.all([
          api.dances(),
          api.sequences(user.courseId),
          api.figures(user.courseId),
        ]);
        if (cancelled) return;
        setDances(d);
        setSequences(s);
        setFigures(f);
        setActiveDance(d[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.courseId]);

  const figureOptions = useMemo(() => {
    const danceIdNum = Number(createForm.danceId);
    if (!danceIdNum) return [];
    return figures
      .filter((f) => f.danceId === danceIdNum)
      .map((f) => f.name)
      .sort((a, b) => a.localeCompare(b));
  }, [figures, createForm.danceId]);

  const openCreateModal = () => {
    setEditingId(null);
    setCreateForm({
      ...emptyCreateForm,
      danceId: activeDance ? String(activeDance) : "",
      figureRows: [""],
    });
    setCreateError(null);
    setCreateModalOpen(true);
  };

  const openEditModal = (sequence) => {
    setEditingId(sequence.id);
    const rows = (sequence.figures || "")
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    setCreateForm({
      danceId: sequence.danceId ? String(sequence.danceId) : "",
      name: sequence.name || "",
      description: sequence.description || "",
      figureRows: rows.length > 0 ? rows : [""],
    });
    setCreateError(null);
    setCreateModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingSequence) return;
    setDeleting(true);
    try {
      await api.deleteSequence(user.courseId, deletingSequence.id);
      setSequences((current) =>
        current.filter((s) => s.id !== deletingSequence.id),
      );
      setDeletingSequence(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const updateCreateField = (field, value) => {
    setCreateForm((current) => ({ ...current, [field]: value }));
  };

  const updateFigureRow = (index, value) => {
    setCreateForm((current) => ({
      ...current,
      figureRows: current.figureRows.map((row, i) =>
        i === index ? value : row,
      ),
    }));
  };

  const addFigureRow = (index) => {
    setCreateForm((current) => {
      const next = [...current.figureRows];
      next.splice(index + 1, 0, "");
      return { ...current, figureRows: next };
    });
  };

  const removeFigureRow = (index) => {
    setCreateForm((current) => {
      if (current.figureRows.length <= 1) {
        return { ...current, figureRows: [""] };
      }
      return {
        ...current,
        figureRows: current.figureRows.filter((_, i) => i !== index),
      };
    });
  };

  const submitCreateSequence = async (event) => {
    event.preventDefault();
    if (!createForm.danceId) {
      setCreateError("Bitte einen Tanz auswählen.");
      return;
    }
    if (!createForm.name.trim()) {
      setCreateError("Bitte einen Namen angeben.");
      return;
    }
    const figuresValue = createForm.figureRows
      .map((r) => r.trim())
      .filter((r) => r.length > 0)
      .join(", ");
    setCreateSaving(true);
    setCreateError(null);
    try {
      const payload = {
        danceId: Number(createForm.danceId),
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        figures: figuresValue,
      };
      if (editingId) {
        const updated = await api.updateSequence(
          user.courseId,
          editingId,
          payload,
        );
        setSequences((current) =>
          current.map((s) => (s.id === editingId ? updated : s)),
        );
        setActiveDance(updated.danceId);
      } else {
        const created = await api.addSequence(user.courseId, payload);
        setSequences((current) => [...current, created]);
        setActiveDance(created.danceId);
      }
      setCreateModalOpen(false);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreateSaving(false);
    }
  };

  const visible = useMemo(
    () =>
      sequences.filter(
        (s) => s.danceId === activeDance && (isAdmin || s.visible),
      ),
    [sequences, activeDance, isAdmin],
  );

  useEffect(() => {
    setVisibilityItems(
      sequences
        .filter((s) => s.danceId === activeDance)
        .map((s) => ({
          id: s.id,
          name: s.name,
          danceName: s.danceName,
          visible: Boolean(s.visible),
        })),
    );
  }, [sequences, activeDance]);

  const toggleVisibility = (id) => {
    setVisibilityItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, visible: !item.visible } : item,
      ),
    );
  };

  const saveVisibility = async () => {
    setVisibilitySaving(true);
    try {
      await api.updateSequenceVisibility(user.courseId, visibilityItems);
      setSequences((current) =>
        current.map((sequence) => {
          const item = visibilityItems.find((v) => v.id === sequence.id);
          return item ? { ...sequence, visible: item.visible } : sequence;
        }),
      );
      setVisibilityModalOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setVisibilitySaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Folgen"
        description="Choreografische Folgen aus mehreren Figuren."
        action={
          isAdmin ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
                aria-label="Folge hinzufügen"
                title="Folge hinzufügen"
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
          ) : null
        }
      />

      {loading ? (
        <div className="text-sm text-slate-500">Lade Folgen…</div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : (
        <>
          <DanceTabs
            dances={dances}
            activeId={activeDance}
            onSelect={setActiveDance}
          />

          {isAdmin && (
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={() => setVisibilityModalOpen(true)}
                className="btn-secondary"
              >
                Sichtbarkeit verwalten
              </button>
            </div>
          )}

          {visible.length === 0 ? (
            <div className="card p-6 text-sm text-slate-500">
              Für diesen Tanz sind noch keine Folgen hinterlegt.
            </div>
          ) : (
            <div className="space-y-4">
              {visible.map((s) => (
                <div key={s.id} className="card p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-900">
                      {s.name}
                    </h3>
                    <div className="flex items-center gap-2">
                      {isAdmin && !s.visible && (
                        <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                          Ausgeblendet
                        </span>
                      )}
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(s)}
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
                            onClick={() => setDeletingSequence(s)}
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
                                d="M9 2a1 1 0 0 0-.894.553L7.382 4H4a1 1 0 0 0 0 2h12a1 1 0 1 0 0-2h-3.382l-.724-1.447A1 1 0 0 0 11 2H9zM5 8a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8zm3 2a1 1 0 0 1 2 0v5a1 1 0 1 1-2 0v-5zm4 0a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0v-5z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {s.description && (
                    <p className="mt-1 text-sm text-slate-600">
                      {s.description}
                    </p>
                  )}
                  {s.figures && (() => {
                    const parts = s.figures
                      .split(",")
                      .map((p) => p.trim())
                      .filter((p) => p.length > 0);
                    return (
                      <div className="mt-3">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Enthaltene Figuren
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {parts.map((part, idx) => (
                            <Fragment key={idx}>
                              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                                {part}
                              </span>
                              {idx < parts.length - 1 && (
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="text-slate-400"
                                  aria-hidden="true"
                                >
                                  <path d="M9 6l6 6-6 6" />
                                </svg>
                              )}
                            </Fragment>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}

          <Modal
            open={createModalOpen}
            onClose={() => (createSaving ? null : setCreateModalOpen(false))}
            title={editingId ? "Folge bearbeiten" : "Neue Folge hinzufügen"}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={createSaving}
                  className="btn-secondary"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={submitCreateSequence}
                  disabled={createSaving}
                  className="btn-primary"
                >
                  {createSaving ? "Speichern…" : "Speichern"}
                </button>
              </>
            }
          >
            <form onSubmit={submitCreateSequence} className="space-y-4">
              <div>
                <label className="label" htmlFor="sequence-dance">
                  Tanz
                </label>
                <select
                  id="sequence-dance"
                  className="input"
                  value={createForm.danceId}
                  onChange={(e) => updateCreateField("danceId", e.target.value)}
                  required
                >
                  <option value="">Tanz auswählen…</option>
                  {dances.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label" htmlFor="sequence-name">
                  Name der Folge
                </label>
                <input
                  id="sequence-name"
                  type="text"
                  className="input"
                  value={createForm.name}
                  onChange={(e) => updateCreateField("name", e.target.value)}
                  placeholder="z.B. Grundschritt-Kombination"
                  required
                />
              </div>

              <div>
                <span className="label">Figuren in Reihenfolge</span>
                <div className="space-y-2">
                  {createForm.figureRows.map((row, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="inline-flex h-9 w-7 flex-shrink-0 items-center justify-center text-xs font-semibold text-slate-500">
                        {index + 1}.
                      </span>
                      {figureOptions.length > 0 ? (
                        <select
                          className="input flex-1"
                          value={row}
                          onChange={(e) =>
                            updateFigureRow(index, e.target.value)
                          }
                        >
                          <option value="">Figur auswählen…</option>
                          {figureOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          className="input flex-1"
                          value={row}
                          onChange={(e) =>
                            updateFigureRow(index, e.target.value)
                          }
                          placeholder="Name der Figur"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => addFigureRow(index)}
                        className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
                        aria-label="Figur hinzufügen"
                        title="Figur hinzufügen"
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
                        onClick={() => removeFigureRow(index)}
                        disabled={
                          createForm.figureRows.length <= 1 && row === ""
                        }
                        className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Figur entfernen"
                        title="Figur entfernen"
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
                {figureOptions.length === 0 && createForm.danceId && (
                  <div className="mt-2 text-xs text-slate-500">
                    Für diesen Tanz sind noch keine Figuren angelegt — du
                    kannst die Namen frei eintippen.
                  </div>
                )}
              </div>

              <div>
                <label className="label" htmlFor="sequence-description">
                  Beschreibung (optional)
                </label>
                <textarea
                  id="sequence-description"
                  className="input"
                  rows={3}
                  value={createForm.description}
                  onChange={(e) =>
                    updateCreateField("description", e.target.value)
                  }
                  placeholder="Zusätzliche Hinweise oder Erklärung der Folge"
                />
              </div>

              {createError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {createError}
                </div>
              )}
              <button type="submit" className="hidden" aria-hidden="true" />
            </form>
          </Modal>

          <Modal
            open={visibilityModalOpen}
            onClose={() => setVisibilityModalOpen(false)}
            title={`Folgen Sichtbarkeit verwalten – ${dances.find((d) => d.id === activeDance)?.name ?? "Tanz"}`}
            footer={
              <button
                onClick={saveVisibility}
                disabled={visibilitySaving}
                className="btn-primary"
              >
                {visibilitySaving ? "Speichern…" : "Speichern"}
              </button>
            }
          >
            <div className="space-y-3">
              {visibilityItems.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
                  Keine Folgen zum Verwalten vorhanden.
                </div>
              ) : (
                visibilityItems.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <input
                      type="checkbox"
                      checked={item.visible}
                      onChange={() => toggleVisibility(item.id)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                    />
                    <div>
                      <div className="font-medium text-slate-900">
                        {item.name}
                      </div>
                      <div className="text-sm text-slate-500">
                        {item.danceName}
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>
          </Modal>

          <Modal
            open={Boolean(deletingSequence)}
            onClose={() => (deleting ? null : setDeletingSequence(null))}
            title="Folge löschen?"
            footer={
              <>
                <button
                  className="btn-secondary"
                  onClick={() => setDeletingSequence(null)}
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
              Soll die Folge{" "}
              <span className="font-semibold">{deletingSequence?.name}</span>{" "}
              wirklich gelöscht werden? Diese Aktion kann nicht rückgängig
              gemacht werden.
            </p>
          </Modal>
        </>
      )}
    </div>
  );
}
