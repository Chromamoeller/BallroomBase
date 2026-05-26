import { useEffect, useMemo, useState } from "react";

import { api } from "../api/client.js";
import DanceTabs from "../components/DanceTabs.jsx";
import Modal from "../components/Modal.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function FigurenPage() {
  const { user, isAdmin } = useAuth();
  const [dances, setDances] = useState([]);
  const [figures, setFigures] = useState([]);
  const [activeDance, setActiveDance] = useState(null);
  const [selectedVideoFigure, setSelectedVideoFigure] = useState(null);
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const [visibilityItems, setVisibilityItems] = useState([]);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const FOOT_OPTIONS = ["Linker Fuß", "Rechter Fuß"];
  const DIRECTION_OPTIONS = [
    "Vor",
    "Zurück",
    "Seitwärts links",
    "Seitwärts rechts",
    "Diagonal vor links",
    "Diagonal vor rechts",
    "Diagonal zurück links",
    "Diagonal zurück rechts",
    "Am Platz",
    "Drehung links",
    "Drehung rechts",
  ];
  const emptyStep = { foot: "", direction: "" };
  const emptyForm = {
    danceId: "",
    name: "",
    precedesRows: [""],
    followsRows: [""],
    stepRows: [{ ...emptyStep }],
  };
  const [createForm, setCreateForm] = useState(emptyForm);
  const [createError, setCreateError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, f] = await Promise.all([
          api.dances(),
          api.figures(user.courseId),
        ]);
        if (cancelled) return;
        setDances(d);
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

  const visibleFigures = useMemo(
    () =>
      figures.filter(
        (f) => f.danceId === activeDance && (isAdmin || f.visible),
      ),
    [figures, activeDance, isAdmin],
  );

  useEffect(() => {
    setVisibilityItems(
      figures
        .filter((f) => f.danceId === activeDance)
        .map((f) => ({
          id: f.id,
          name: f.name,
          danceName: f.danceName,
          visible: Boolean(f.visible),
        })),
    );
  }, [figures, activeDance]);

  const toggleVisibility = (id) => {
    setVisibilityItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, visible: !item.visible } : item,
      ),
    );
  };

  const openCreateModal = () => {
    setCreateForm({
      ...emptyForm,
      precedesRows: [""],
      followsRows: [""],
      stepRows: [{ ...emptyStep }],
      danceId: activeDance ? String(activeDance) : "",
    });
    setCreateError(null);
    setCreateModalOpen(true);
  };

  const updateRelationRow = (field, index, value) => {
    setCreateForm((current) => ({
      ...current,
      [field]: current[field].map((row, i) => (i === index ? value : row)),
    }));
  };

  const addRelationRow = (field, index) => {
    setCreateForm((current) => {
      const next = [...current[field]];
      next.splice(index + 1, 0, "");
      return { ...current, [field]: next };
    });
  };

  const removeRelationRow = (field, index) => {
    setCreateForm((current) => {
      if (current[field].length <= 1) {
        return { ...current, [field]: [""] };
      }
      return {
        ...current,
        [field]: current[field].filter((_, i) => i !== index),
      };
    });
  };

  const buildRelationString = (rows) =>
    rows.map((r) => r.trim()).filter((r) => r.length > 0).join(", ");

  const relationOptions = useMemo(() => {
    const danceIdNum = Number(createForm.danceId);
    if (!danceIdNum) return [];
    return figures
      .filter((f) => f.danceId === danceIdNum)
      .map((f) => f.name)
      .sort((a, b) => a.localeCompare(b));
  }, [figures, createForm.danceId]);

  const updateCreateField = (field, value) => {
    setCreateForm((current) => ({ ...current, [field]: value }));
  };

  const updateStepRow = (index, field, value) => {
    setCreateForm((current) => ({
      ...current,
      stepRows: current.stepRows.map((row, i) =>
        i === index ? { ...row, [field]: value } : row,
      ),
    }));
  };

  const addStepRow = (index) => {
    setCreateForm((current) => {
      const next = [...current.stepRows];
      next.splice(index + 1, 0, { ...emptyStep });
      return { ...current, stepRows: next };
    });
  };

  const removeStepRow = (index) => {
    setCreateForm((current) => {
      if (current.stepRows.length <= 1) return current;
      return {
        ...current,
        stepRows: current.stepRows.filter((_, i) => i !== index),
      };
    });
  };

  const buildStepsString = (rows) =>
    rows
      .map((r) => `${r.foot} ${r.direction}`.trim())
      .filter((s) => s.length > 0)
      .map((s, i) => `${i + 1}. ${s}`)
      .join(", ");

  const submitCreateFigure = async (event) => {
    event.preventDefault();
    if (!createForm.danceId) {
      setCreateError("Bitte einen Tanz auswählen.");
      return;
    }
    if (!createForm.name.trim()) {
      setCreateError("Bitte einen Namen angeben.");
      return;
    }
    setCreateSaving(true);
    setCreateError(null);
    try {
      const created = await api.addFigure(user.courseId, {
        danceId: Number(createForm.danceId),
        name: createForm.name.trim(),
        precedes: buildRelationString(createForm.precedesRows),
        follows: buildRelationString(createForm.followsRows),
        steps: buildStepsString(createForm.stepRows),
      });
      setFigures((current) => [...current, created]);
      setActiveDance(created.danceId);
      setCreateModalOpen(false);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreateSaving(false);
    }
  };

  const saveVisibility = async () => {
    setVisibilitySaving(true);
    try {
      await api.updateFigureVisibility(user.courseId, visibilityItems);
      setFigures((current) =>
        current.map((figure) => {
          const item = visibilityItems.find((v) => v.id === figure.id);
          return item ? { ...figure, visible: item.visible } : figure;
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
        title="Figuren"
        description="Übersicht aller Figuren deines Kurses, gruppiert nach Tanz."
        action={
          isAdmin ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
              aria-label="Figur hinzufügen"
              title="Figur hinzufügen"
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
          ) : null
        }
      />

      {loading ? (
        <div className="text-sm text-slate-500">Lade Figuren…</div>
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

          {visibleFigures.length === 0 ? (
            <div className="card p-6 text-sm text-slate-500">
              Für diesen Tanz sind noch keine Figuren hinterlegt.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleFigures.map((f) => (
                <div key={f.id} className="card flex flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">
                        {f.name}
                      </h3>
                      {isAdmin && !f.visible && (
                        <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-rose-600">
                          Ausgeblendet
                        </div>
                      )}
                    </div>
                    {f.difficulty && (
                      <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                        {f.difficulty}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 text-sm text-slate-600">
                    <div>
                      <div className="font-medium text-slate-800">Schritte</div>
                      <div>{f.steps || "Nicht angegeben"}</div>
                    </div>
                    <div>
                      <div className="font-medium text-slate-800">Count</div>
                      <div>{f.count || "Nicht angegeben"}</div>
                    </div>
                    <div>
                      <div className="font-medium text-slate-800">
                        Fußarbeit
                      </div>
                      <div>{f.footwork || "Nicht angegeben"}</div>
                    </div>
                    <div>
                      <div className="font-medium text-slate-800">Drehung</div>
                      <div>{f.amountOfTurn || "Nicht angegeben"}</div>
                    </div>
                    {f.precedes && (
                      <div>
                        <div className="font-medium text-slate-800">
                          Vorangehende Figuren
                        </div>
                        <div>{f.precedes}</div>
                      </div>
                    )}
                    {f.follows && (
                      <div>
                        <div className="font-medium text-slate-800">
                          Folgende Figuren
                        </div>
                        <div>{f.follows}</div>
                      </div>
                    )}
                  </div>

                  {f.description && (
                    <p className="mt-4 text-sm text-slate-600">
                      {f.description}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedVideoFigure(f)}
                    className="btn-secondary mt-5 self-start"
                  >
                    Video abspielen
                  </button>
                </div>
              ))}
            </div>
          )}

          <Modal
            open={Boolean(selectedVideoFigure)}
            onClose={() => setSelectedVideoFigure(null)}
            title={selectedVideoFigure?.name ?? "Video"}
            footer={
              <button
                onClick={() => setSelectedVideoFigure(null)}
                className="btn-secondary"
              >
                Schließen
              </button>
            }
          >
            {selectedVideoFigure?.videoUrl ? (
              <div className="space-y-4">
                <video
                  controls
                  className="w-full rounded-2xl bg-slate-900"
                  src={selectedVideoFigure.videoUrl}
                />
                <p className="text-sm text-slate-600">
                  Falls das Video geladen wird, kannst du hier die Aufnahme
                  sehen.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
                Dieses Video ist derzeit nicht verfügbar. Sobald ein Link
                hinterlegt ist, kannst du es hier abspielen.
              </div>
            )}
          </Modal>

          <Modal
            open={createModalOpen}
            onClose={() => (createSaving ? null : setCreateModalOpen(false))}
            title="Neue Figur hinzufügen"
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
                  onClick={submitCreateFigure}
                  disabled={createSaving}
                  className="btn-primary"
                >
                  {createSaving ? "Speichern…" : "Speichern"}
                </button>
              </>
            }
          >
            <form onSubmit={submitCreateFigure} className="space-y-4">
              <div>
                <label className="label" htmlFor="figure-dance">
                  Tanz
                </label>
                <select
                  id="figure-dance"
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
                <label className="label" htmlFor="figure-name">
                  Name der Figur
                </label>
                <input
                  id="figure-name"
                  type="text"
                  className="input"
                  value={createForm.name}
                  onChange={(e) => updateCreateField("name", e.target.value)}
                  placeholder="z.B. Damen-Solodrehung"
                  required
                />
              </div>

              <div>
                <span className="label">Vorherige Figuren</span>
                <div className="space-y-2">
                  {createForm.precedesRows.map((row, index) => (
                    <div key={index} className="flex items-center gap-2">
                      {relationOptions.length > 0 ? (
                        <select
                          className="input flex-1"
                          value={row}
                          onChange={(e) =>
                            updateRelationRow(
                              "precedesRows",
                              index,
                              e.target.value,
                            )
                          }
                        >
                          <option value="">Figur auswählen…</option>
                          {relationOptions.map((opt) => (
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
                            updateRelationRow(
                              "precedesRows",
                              index,
                              e.target.value,
                            )
                          }
                          placeholder="Figur, die vorher getanzt werden kann"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => addRelationRow("precedesRows", index)}
                        className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
                        aria-label="Vorherige Figur hinzufügen"
                        title="Vorherige Figur hinzufügen"
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
                        onClick={() => removeRelationRow("precedesRows", index)}
                        disabled={
                          createForm.precedesRows.length <= 1 && row === ""
                        }
                        className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Vorherige Figur entfernen"
                        title="Vorherige Figur entfernen"
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

              <div>
                <span className="label">Folgende Figuren</span>
                <div className="space-y-2">
                  {createForm.followsRows.map((row, index) => (
                    <div key={index} className="flex items-center gap-2">
                      {relationOptions.length > 0 ? (
                        <select
                          className="input flex-1"
                          value={row}
                          onChange={(e) =>
                            updateRelationRow(
                              "followsRows",
                              index,
                              e.target.value,
                            )
                          }
                        >
                          <option value="">Figur auswählen…</option>
                          {relationOptions.map((opt) => (
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
                            updateRelationRow(
                              "followsRows",
                              index,
                              e.target.value,
                            )
                          }
                          placeholder="Figur, die danach getanzt werden kann"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => addRelationRow("followsRows", index)}
                        className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
                        aria-label="Folgende Figur hinzufügen"
                        title="Folgende Figur hinzufügen"
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
                        onClick={() => removeRelationRow("followsRows", index)}
                        disabled={
                          createForm.followsRows.length <= 1 && row === ""
                        }
                        className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Folgende Figur entfernen"
                        title="Folgende Figur entfernen"
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

              <div>
                <span className="label">Schritte</span>
                <div className="space-y-2">
                  {createForm.stepRows.map((row, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <select
                        className="input flex-1"
                        value={row.foot}
                        onChange={(e) =>
                          updateStepRow(index, "foot", e.target.value)
                        }
                      >
                        <option value="">Fuß…</option>
                        {FOOT_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <select
                        className="input flex-1"
                        value={row.direction}
                        onChange={(e) =>
                          updateStepRow(index, "direction", e.target.value)
                        }
                      >
                        <option value="">Richtung…</option>
                        {DIRECTION_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => addStepRow(index)}
                        className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
                        aria-label="Schritt hinzufügen"
                        title="Schritt hinzufügen"
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
                        onClick={() => removeStepRow(index)}
                        disabled={createForm.stepRows.length <= 1}
                        className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Schritt entfernen"
                        title="Schritt entfernen"
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
            title={`Figuren Sichtbarkeit verwalten – ${dances.find((d) => d.id === activeDance)?.name ?? "Tanz"}`}
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
                  Keine Figuren zum Verwalten vorhanden.
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
        </>
      )}
    </div>
  );
}
