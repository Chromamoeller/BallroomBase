import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { api } from "../api/client.js";
import DanceTabs from "../components/DanceTabs.jsx";
import DanceInfoPanel from "../components/DanceInfoPanel.jsx";
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
  const DIFFICULTY_OPTIONS = ["Leicht", "Mittel", "Schwer"];
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
    description: "",
    difficulty: "",
    videoUrl: "",
    count: "",
    footwork: "",
    amountOfTurn: "",
    precedesRows: [""],
    followsRows: [""],
    stepRows: [{ ...emptyStep }],
  };
  const [createForm, setCreateForm] = useState(emptyForm);
  const [createError, setCreateError] = useState(null);
  const [editingFigureId, setEditingFigureId] = useState(null);
  const [deletingFigure, setDeletingFigure] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [expandedFigures, setExpandedFigures] = useState(() => new Set());
  const [stepsOpenFor, setStepsOpenFor] = useState(() => new Set());
  const [infoPanelOpen, setInfoPanelOpen] = useState(true);
  const fileInputRef = useRef(null);

  const toggleFigureExpanded = (id) => {
    setExpandedFigures((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleStepsOpen = (id) => {
    setStepsOpenFor((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const parseStepsForDisplay = (str) => {
    if (!str) return [];
    return str
      .split(",")
      .map((p) => p.trim().replace(/^\d+\.\s*/, ""))
      .filter((s) => s.length > 0);
  };

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const { blob, filename } = await api.exportFigures(user.courseId);
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
      const result = await api.importFigures(user.courseId, file);
      setImportResult(result);
      if (result.created > 0) {
        const fresh = await api.figures(user.courseId);
        setFigures(fresh);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

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

  const activeDanceName = useMemo(
    () => dances.find((d) => d.id === activeDance)?.name ?? null,
    [dances, activeDance],
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
    setEditingFigureId(null);
    setCreateModalOpen(true);
  };

  const parseRelationString = (str) => {
    if (!str) return [""];
    const parts = str.split(",").map((p) => p.trim()).filter(Boolean);
    return parts.length > 0 ? parts : [""];
  };

  const parseStepsString = (str) => {
    if (!str) return [{ ...emptyStep }];
    const parts = str.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return [{ ...emptyStep }];
    return parts.map((part) => {
      const noNum = part.replace(/^\d+\.\s*/, "");
      const matchedFoot = FOOT_OPTIONS.find((f) => noNum.startsWith(f));
      if (matchedFoot) {
        return {
          foot: matchedFoot,
          direction: noNum.slice(matchedFoot.length).trim(),
        };
      }
      return { foot: "", direction: noNum };
    });
  };

  const openEditModal = (figure) => {
    setCreateForm({
      danceId: figure.danceId ? String(figure.danceId) : "",
      name: figure.name || "",
      description: figure.description || "",
      difficulty: figure.difficulty || "",
      videoUrl: figure.videoUrl || "",
      count: figure.count || "",
      footwork: figure.footwork || "",
      amountOfTurn: figure.amountOfTurn || "",
      precedesRows: parseRelationString(figure.precedes),
      followsRows: parseRelationString(figure.follows),
      stepRows: parseStepsString(figure.steps),
    });
    setCreateError(null);
    setEditingFigureId(figure.id);
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
      const payload = {
        danceId: Number(createForm.danceId),
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        difficulty: createForm.difficulty.trim(),
        videoUrl: createForm.videoUrl.trim(),
        count: createForm.count.trim(),
        footwork: createForm.footwork.trim(),
        amountOfTurn: createForm.amountOfTurn.trim(),
        precedes: buildRelationString(createForm.precedesRows),
        follows: buildRelationString(createForm.followsRows),
        steps: buildStepsString(createForm.stepRows),
      };
      if (editingFigureId != null) {
        const updated = await api.updateFigure(
          user.courseId,
          editingFigureId,
          payload,
        );
        setFigures((current) =>
          current.map((f) =>
            f.id === editingFigureId ? { ...f, ...updated } : f,
          ),
        );
        setActiveDance(updated.danceId);
      } else {
        const created = await api.addFigure(user.courseId, payload);
        setFigures((current) => [...current, created]);
        setActiveDance(created.danceId);
      }
      setCreateModalOpen(false);
      setEditingFigureId(null);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreateSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingFigure) return;
    setDeleting(true);
    try {
      await api.deleteFigure(user.courseId, deletingFigure.id);
      setFigures((current) =>
        current.filter((f) => f.id !== deletingFigure.id),
      );
      setDeletingFigure(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Figuren als CSV exportieren"
                title="Figuren als CSV exportieren"
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
                aria-label="Figuren aus CSV importieren"
                title="Figuren aus CSV importieren"
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
            </div>
          ) : null
        }
      />

      {importResult && (
        <div className="mb-4 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="flex items-center justify-between">
            <div>
              <strong>{importResult.created}</strong> Figuren importiert
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
            <div className="card p-6 text-sm text-slate-500 dark:text-slate-400">
              Für diesen Tanz sind noch keine Figuren hinterlegt.
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleFigures.map((f) => {
                const isExpanded = expandedFigures.has(f.id);
                const showSteps = stepsOpenFor.has(f.id);
                const stepItems = parseStepsForDisplay(f.steps);
                return (
                  <Fragment key={f.id}>
                  <div className="card flex flex-col p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {f.name}
                        </h3>
                        {isAdmin && !f.visible && (
                          <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                            Ausgeblendet
                          </div>
                        )}
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(f)}
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
                            onClick={() => setDeletingFigure(f)}
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
                      )}
                    </div>

                    <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300">
                      {f.precedes && (
                        <div>
                          <div className="font-medium text-slate-800 dark:text-slate-100">
                            Vorangehende Figuren
                          </div>
                          <div>{f.precedes}</div>
                        </div>
                      )}
                      {f.follows && (
                        <div>
                          <div className="font-medium text-slate-800 dark:text-slate-100">
                            Folgende Figuren
                          </div>
                          <div>{f.follows}</div>
                        </div>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                        {f.difficulty && (
                          <div>
                            <div className="font-medium text-slate-800 dark:text-slate-100">
                              Schwierigkeit
                            </div>
                            <span className="mt-1 inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                              {f.difficulty}
                            </span>
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-slate-800 dark:text-slate-100">
                            Count
                          </div>
                          <div>{f.count || "Nicht angegeben"}</div>
                        </div>
                        <div>
                          <div className="font-medium text-slate-800 dark:text-slate-100">
                            Fußarbeit
                          </div>
                          <div>{f.footwork || "Nicht angegeben"}</div>
                        </div>
                        <div>
                          <div className="font-medium text-slate-800 dark:text-slate-100">
                            Drehung
                          </div>
                          <div>{f.amountOfTurn || "Nicht angegeben"}</div>
                        </div>
                        {f.description && (
                          <div>
                            <div className="font-medium text-slate-800 dark:text-slate-100">
                              Beschreibung
                            </div>
                            <p>{f.description}</p>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedVideoFigure(f)}
                          className="btn-secondary mt-1 self-start"
                        >
                          Video abspielen
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleStepsOpen(f.id)}
                      aria-pressed={showSteps}
                      className="btn-secondary mt-4 self-start"
                    >
                      {showSteps ? "Schritte ausblenden" : "Schritte anzeigen"}
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleFigureExpanded(f.id)}
                      aria-expanded={isExpanded}
                      aria-label={
                        isExpanded ? "Weniger anzeigen" : "Mehr anzeigen"
                      }
                      title={isExpanded ? "Weniger anzeigen" : "Mehr anzeigen"}
                      className="mt-4 flex w-full items-center justify-center rounded-md py-1 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                  </div>

                  {showSteps && (
                    <div className="card flex flex-col p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-300">
                            Schritte
                          </div>
                          <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                            {f.name}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleStepsOpen(f.id)}
                          aria-label="Schritte ausblenden"
                          title="Schritte ausblenden"
                          className="text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      {stepItems.length === 0 ? (
                        <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                          Für diese Figur sind keine Schritte hinterlegt.
                        </div>
                      ) : (
                        <ol className="mt-4 flex flex-col items-start gap-2">
                          {stepItems.map((step, idx) => (
                            <li
                              key={idx}
                              className="inline-flex w-fit max-w-full items-center gap-2 rounded-lg border-2 border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                            >
                              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 border-slate-300 text-[10px] font-bold leading-none text-slate-600 dark:border-slate-600 dark:text-slate-300">
                                {idx + 1}
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                  </Fragment>
                );
              })}
            </div>
          )}

          <DanceInfoPanel
            danceName={activeDanceName}
            open={infoPanelOpen}
            onToggle={() => setInfoPanelOpen((v) => !v)}
          />

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
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Falls das Video geladen wird, kannst du hier die Aufnahme
                  sehen.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                Dieses Video ist derzeit nicht verfügbar. Sobald ein Link
                hinterlegt ist, kannst du es hier abspielen.
              </div>
            )}
          </Modal>

          <Modal
            open={createModalOpen}
            onClose={() => {
              if (createSaving) return;
              setCreateModalOpen(false);
              setEditingFigureId(null);
            }}
            title={
              editingFigureId != null
                ? "Figur bearbeiten"
                : "Neue Figur hinzufügen"
            }
            footer={
              <>
                <button
                  type="button"
                  onClick={() => {
                    setCreateModalOpen(false);
                    setEditingFigureId(null);
                  }}
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
                <label className="label" htmlFor="figure-difficulty">
                  Schwierigkeit
                </label>
                <select
                  id="figure-difficulty"
                  className="input"
                  value={createForm.difficulty}
                  onChange={(e) =>
                    updateCreateField("difficulty", e.target.value)
                  }
                >
                  <option value="">Nicht angegeben</option>
                  {DIFFICULTY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
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

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="figure-count">
                    Count
                  </label>
                  <input
                    id="figure-count"
                    type="text"
                    className="input"
                    value={createForm.count}
                    onChange={(e) => updateCreateField("count", e.target.value)}
                    placeholder="z.B. 1 2 3 4 5 6"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="figure-footwork">
                    Fußarbeit
                  </label>
                  <input
                    id="figure-footwork"
                    type="text"
                    className="input"
                    value={createForm.footwork}
                    onChange={(e) =>
                      updateCreateField("footwork", e.target.value)
                    }
                    placeholder="z.B. Ballen, ganze Sohle"
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="figure-turn">
                  Drehung
                </label>
                <input
                  id="figure-turn"
                  type="text"
                  className="input"
                  value={createForm.amountOfTurn}
                  onChange={(e) =>
                    updateCreateField("amountOfTurn", e.target.value)
                  }
                  placeholder="z.B. 1/2 nach links"
                />
              </div>

              <div>
                <label className="label" htmlFor="figure-video">
                  Video-URL
                </label>
                <input
                  id="figure-video"
                  type="url"
                  className="input"
                  value={createForm.videoUrl}
                  onChange={(e) =>
                    updateCreateField("videoUrl", e.target.value)
                  }
                  placeholder="https://…"
                />
              </div>

              <div>
                <label className="label" htmlFor="figure-description">
                  Beschreibung
                </label>
                <textarea
                  id="figure-description"
                  className="input"
                  rows={3}
                  value={createForm.description}
                  onChange={(e) =>
                    updateCreateField("description", e.target.value)
                  }
                  placeholder="Zusätzliche Hinweise oder Beschreibung der Figur"
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
            open={Boolean(deletingFigure)}
            onClose={() => (deleting ? null : setDeletingFigure(null))}
            title="Figur löschen?"
            footer={
              <>
                <button
                  className="btn-secondary"
                  onClick={() => setDeletingFigure(null)}
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
              Soll die Figur{" "}
              <span className="font-semibold">{deletingFigure?.name}</span>{" "}
              wirklich gelöscht werden? Diese Aktion kann nicht rückgängig
              gemacht werden.
            </p>
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
