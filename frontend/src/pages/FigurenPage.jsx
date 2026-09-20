import { useEffect, useMemo, useState } from "react";

import { api } from "../api/client.js";
import Alert from "../components/Alert.jsx";
import DanceTabs, { getDanceStyle } from "../components/DanceTabs.jsx";
import DanceInfoPanel from "../components/DanceInfoPanel.jsx";
import FigurenBoard, { DIFFICULTY_META } from "../components/FigurenBoard.jsx";
import Modal from "../components/Modal.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const stepDirectionMeta = (direction) => {
  const d = (direction || "").toLowerCase();
  if (d.includes("drehung"))
    return { type: d.includes("rechts") ? "turnRight" : "turnLeft" };
  if (d.includes("am platz") || d.trim() === "") return { type: "place" };
  let angle = 0;
  if (d.includes("diagonal vor links")) angle = -45;
  else if (d.includes("diagonal vor rechts")) angle = 45;
  else if (d.includes("diagonal zurück links")) angle = -135;
  else if (d.includes("diagonal zurück rechts")) angle = 135;
  else if (d.includes("zurück")) angle = 180;
  else if (d.includes("seitwärts links")) angle = -90;
  else if (d.includes("seitwärts rechts")) angle = 90;
  else if (d.includes("vor")) angle = 0;
  else return { type: "place" };
  return { type: "arrow", angle };
};

function Footprint({ side = "left", className }) {
  return (
    <svg
      viewBox="0 0 32 44"
      className={className}
      fill="currentColor"
      style={side === "right" ? { transform: "scaleX(-1)" } : undefined}
      aria-hidden="true"
    >
      <path d="M20.5 26.5c.6 3.2.9 5.4.4 8.2-.5 3-2.4 5.3-5.4 5.3-3.2 0-4.9-2.3-5.2-5.3-.3-2.7.1-4.8.7-8 .5-2.7 3-4.3 5.1-4.2 2 .1 3.9 1.4 4.4 4z" />
      <ellipse cx="8.5" cy="10" rx="2.6" ry="3.2" />
      <ellipse cx="14.5" cy="6.5" rx="2.8" ry="3.4" />
      <ellipse cx="20.5" cy="7.5" rx="2.6" ry="3.2" />
      <ellipse cx="25" cy="11.5" rx="2.2" ry="2.8" />
    </svg>
  );
}

function DirectionIcon({ direction, className }) {
  const meta = stepDirectionMeta(direction);
  if (meta.type === "place") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
      </svg>
    );
  }
  if (meta.type === "turnLeft" || meta.type === "turnRight") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={meta.type === "turnRight" ? { transform: "scaleX(-1)" } : undefined}
        aria-hidden="true"
      >
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `rotate(${meta.angle}deg)` }}
      aria-hidden="true"
    >
      <path d="M12 20V6" />
      <path d="M6 12l6-6 6 6" />
    </svg>
  );
}

function RelationList({ title, value }) {
  const items = (value || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="mt-2 text-sm text-slate-400 dark:text-slate-500">
          Keine hinterlegt
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-200"
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailFact({ title, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {title}
      </div>
      <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
        {value || "–"}
      </div>
    </div>
  );
}

export default function FigurenPage() {
  const { user, isAdmin } = useAuth();
  const [dances, setDances] = useState([]);
  const [figures, setFigures] = useState([]);
  const [activeDance, setActiveDance] = useState(null);
  const [detailFigureId, setDetailFigureId] = useState(null);
  const [search, setSearch] = useState("");
  const [boardError, setBoardError] = useState(null);
  const [columns, setColumns] = useState([]);
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
  // footwork wird nicht mehr gepflegt, beim Bearbeiten aber durchgereicht,
  // damit importierte Werte nicht verloren gehen.
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
  const [viewStepsFigure, setViewStepsFigure] = useState(null);
  const [viewStepsSection, setViewStepsSection] = useState("men");
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
  const [stepsModalFigure, setStepsModalFigure] = useState(null);
  const [stepsModalRows, setStepsModalRows] = useState([]);
  const [stepsModalLadyRows, setStepsModalLadyRows] = useState([]);
  const [stepsModalActive, setStepsModalActive] = useState(null);
  const [stepsModalSaving, setStepsModalSaving] = useState(false);

  const parseStepsString = (str) => {
    if (!str) return [{ ...emptyStep }];
    const parts = str
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
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

  const stepRowsOf = (str) =>
    parseStepsString(str).filter((r) => r.foot || r.direction);

  // Video öffnet sich anstelle des Figuren-Modals; beim Schließen geht es
  // wieder zurück zur Figur.
  const openVideo = (figure) => {
    if (!figure) return;
    setDetailFigureId(null);
    setSelectedVideoFigure(figure);
  };

  const closeVideo = () => {
    const figure = selectedVideoFigure;
    setSelectedVideoFigure(null);
    if (figure) setDetailFigureId(figure.id);
  };

  const openViewSteps = (figure) => {
    setViewStepsSection(stepRowsOf(figure.steps).length > 0 ? "men" : "lady");
    setViewStepsFigure(figure);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, f, c] = await Promise.all([
          api.dances(),
          api.figures(user.courseId),
          api.figureColumns(user.courseId),
        ]);
        if (cancelled) return;
        setDances(d);
        setFigures(f);
        setColumns(c);
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

  const displayedFigures = useMemo(() => {
    const query = search.trim().toLowerCase();
    return visibleFigures.filter(
      (f) => !query || f.name.toLowerCase().includes(query),
    );
  }, [visibleFigures, search]);

  const danceColumns = useMemo(
    () =>
      columns
        .filter((c) => c.danceId === activeDance)
        .sort((a, b) => a.position - b.position || a.id - b.id),
    [columns, activeDance],
  );

  const reloadBoard = async () => {
    try {
      const [f, c] = await Promise.all([
        api.figures(user.courseId),
        api.figureColumns(user.courseId),
      ]);
      setFigures(f);
      setColumns(c);
    } catch (err) {
      setError(err.message);
    }
  };

  const moveCards = async (items) => {
    const byId = new Map(items.map((i) => [i.id, i]));
    setFigures((current) =>
      current.map((f) =>
        byId.has(f.id)
          ? { ...f, columnId: byId.get(f.id).columnId, position: byId.get(f.id).position }
          : f,
      ),
    );
    try {
      await api.updateFiguresBoard(user.courseId, items);
    } catch (err) {
      setBoardError(err.message);
      await reloadBoard();
    }
  };

  const addColumn = async (name) => {
    try {
      const created = await api.addFigureColumn(user.courseId, activeDance, name);
      setColumns((current) => [...current, created]);
    } catch (err) {
      setBoardError(err.message);
    }
  };

  const renameColumn = async (id, name) => {
    try {
      await api.renameFigureColumn(user.courseId, id, name);
      setColumns((current) =>
        current.map((c) => (c.id === id ? { ...c, name } : c)),
      );
    } catch (err) {
      setBoardError(err.message);
    }
  };

  const deleteColumn = async (id) => {
    try {
      await api.deleteFigureColumn(user.courseId, id);
      setColumns((current) => current.filter((c) => c.id !== id));
      setFigures((current) =>
        current.map((f) => (f.columnId === id ? { ...f, columnId: null } : f)),
      );
    } catch (err) {
      setBoardError(err.message);
    }
  };

  const moveColumn = async (id, direction) => {
    const ids = danceColumns.map((c) => c.id);
    const from = ids.indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    setColumns((current) =>
      current.map((c) =>
        ids.includes(c.id) ? { ...c, position: ids.indexOf(c.id) + 1 } : c,
      ),
    );
    try {
      await api.reorderFigureColumns(user.courseId, activeDance, ids);
    } catch (err) {
      setBoardError(err.message);
      await reloadBoard();
    }
  };

  const detailFigure = useMemo(
    () => figures.find((f) => f.id === detailFigureId) ?? null,
    [figures, detailFigureId],
  );

  const activeDanceName = useMemo(
    () => dances.find((d) => d.id === activeDance)?.name ?? null,
    [dances, activeDance],
  );
  const danceStyle = getDanceStyle(activeDanceName);

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
    const parts = str
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : [""];
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
    rows
      .map((r) => r.trim())
      .filter((r) => r.length > 0)
      .join(", ");

  const buildStepsString = (rows) =>
    rows
      .map((r) => `${r.foot} ${r.direction}`.trim())
      .filter((s) => s.length > 0)
      .map((s, i) => `${i + 1}. ${s}`)
      .join(", ");

  const openStepsModal = (figure) => {
    setStepsModalFigure(figure);
    setStepsModalRows(stepRowsOf(figure.steps));
    setStepsModalLadyRows(stepRowsOf(figure.stepsLady));
    setStepsModalActive(null);
  };

  const closeStepsModal = () => {
    if (stepsModalSaving) return;
    setStepsModalFigure(null);
    setStepsModalActive(null);
  };

  const stepsSetRows = (section) =>
    section === "lady" ? setStepsModalLadyRows : setStepsModalRows;

  const stepsModalToggleFoot = (section, foot) => {
    setStepsModalActive((prev) =>
      prev && prev.section === section && prev.foot === foot
        ? null
        : { section, foot },
    );
  };

  const stepsModalAddDirection = (direction) => {
    if (!stepsModalActive) return;
    const { section, foot } = stepsModalActive;
    stepsSetRows(section)((prev) => [...prev, { foot, direction }]);
    setStepsModalActive(null);
  };

  const stepsModalRemoveRow = (section, index) => {
    stepsSetRows(section)((prev) => prev.filter((_, i) => i !== index));
  };

  const saveStepsModal = async () => {
    if (!stepsModalFigure) return;
    setStepsModalSaving(true);
    try {
      const updated = await api.updateFigure(
        user.courseId,
        stepsModalFigure.id,
        {
          danceId: stepsModalFigure.danceId,
          name: stepsModalFigure.name,
          description: stepsModalFigure.description || "",
          difficulty: stepsModalFigure.difficulty || "",
          videoUrl: stepsModalFigure.videoUrl || "",
          count: stepsModalFigure.count || "",
          footwork: stepsModalFigure.footwork || "",
          amountOfTurn: stepsModalFigure.amountOfTurn || "",
          precedes: stepsModalFigure.precedes || "",
          follows: stepsModalFigure.follows || "",
          steps: buildStepsString(stepsModalRows),
          stepsLady: buildStepsString(stepsModalLadyRows),
        },
      );
      setFigures((current) =>
        current.map((f) =>
          f.id === stepsModalFigure.id ? { ...f, ...updated } : f,
        ),
      );
      setStepsModalFigure(null);
      setStepsModalActive(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setStepsModalSaving(false);
    }
  };

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
      if (detailFigureId === deletingFigure.id) setDetailFigureId(null);
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

      {loading ? (
        <div className="text-sm text-slate-500 dark:text-slate-400">Lade Figuren…</div>
      ) : error ? (
        <Alert>{error}</Alert>
      ) : (
        <>
          <DanceTabs
            dances={dances}
            activeId={activeDance}
            onSelect={setActiveDance}
          />

          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div
                className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full ${danceStyle.iconBg} ${danceStyle.iconColor}`}
              >
                {danceStyle.icon}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold text-slate-900 dark:text-slate-100">
                  Figuren – {activeDanceName ?? "Tanz"}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {visibleFigures.length}{" "}
                  {visibleFigures.length === 1 ? "Figur" : "Figuren"} in deinem
                  Kurs
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <svg
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Figur suchen…"
                  aria-label="Figur suchen"
                  className="input w-56 rounded-full pl-10"
                />
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setVisibilityModalOpen(true)}
                  className="btn-secondary"
                >
                  Sichtbarkeit verwalten
                </button>
              )}
            </div>
          </div>

          {boardError && (
            <Alert className="mb-4">
              {boardError}{" "}
              <button
                type="button"
                className="ml-2 font-semibold underline"
                onClick={() => setBoardError(null)}
              >
                Schließen
              </button>
            </Alert>
          )}

          {displayedFigures.length === 0 && !isAdmin ? (
            <div className="card p-6 text-sm text-slate-500 dark:text-slate-400">
              {visibleFigures.length === 0
                ? "Für diesen Tanz sind noch keine Figuren hinterlegt."
                : "Keine Figur passt zu deiner Suche."}
            </div>
          ) : (
            <FigurenBoard
              figures={displayedFigures}
              columns={danceColumns}
              isAdmin={isAdmin}
              canDrag={isAdmin && !search.trim()}
              onOpen={(f) => setDetailFigureId(f.id)}
              onEdit={openEditModal}
              onDelete={setDeletingFigure}
              onMoveCards={moveCards}
              onAddColumn={addColumn}
              onRenameColumn={renameColumn}
              onDeleteColumn={deleteColumn}
              onMoveColumn={moveColumn}
            />
          )}

          <DanceInfoPanel
            danceName={activeDanceName}
            open={infoPanelOpen}
            onToggle={() => setInfoPanelOpen((v) => !v)}
          />

          <Modal
            open={Boolean(detailFigure)}
            onClose={() => setDetailFigureId(null)}
            title={detailFigure?.name ?? "Figur"}
            footer={
              <>
                {(stepRowsOf(detailFigure?.steps).length > 0 ||
                  stepRowsOf(detailFigure?.stepsLady).length > 0 ||
                  isAdmin) && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      const fig = detailFigure;
                      setDetailFigureId(null);
                      openViewSteps(fig);
                    }}
                  >
                    Schritte anzeigen
                  </button>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => openVideo(detailFigure)}
                >
                  <svg
                    className="mr-2 h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM8.5 6.8a.6.6 0 0 1 .92-.5l4.2 2.7a.6.6 0 0 1 0 1l-4.2 2.7a.6.6 0 0 1-.92-.5V6.8z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Video
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setDetailFigureId(null)}
                >
                  Schließen
                </button>
              </>
            }
          >
            {detailFigure && (
              <div className="space-y-6">
                <RelationList
                  title="Vorherige Figuren"
                  value={detailFigure.precedes}
                />
                <RelationList
                  title="Folgende Figuren"
                  value={detailFigure.follows}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailFact
                    title="Schrittanzahl"
                    value={detailFigure.count}
                  />
                  <DetailFact
                    title="Drehungsumfang"
                    value={detailFigure.amountOfTurn}
                  />
                </div>
              </div>
            )}
          </Modal>

          <Modal
            open={Boolean(selectedVideoFigure)}
            onClose={closeVideo}
            title={selectedVideoFigure?.name ?? "Video"}
            footer={
              <button onClick={closeVideo} className="btn-secondary">
                Schließen
              </button>
            }
          >
            {selectedVideoFigure?.videoUrl ? (
              <video
                controls
                autoPlay
                playsInline
                className="w-full rounded-2xl bg-slate-900"
                src={selectedVideoFigure.videoUrl}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
                <svg
                  className="h-10 w-10 text-slate-300 dark:text-slate-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m22 8-6 4 6 4V8z" />
                  <rect x="2" y="6" width="14" height="12" rx="2" />
                  <path d="M3 3l18 18" />
                </svg>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Leider ist hierzu noch kein Video vorhanden.
                </p>
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
                  <option value="">Keine Angabe</option>
                  {Object.keys(DIFFICULTY_META).map((level) => (
                    <option key={level} value={level}>
                      {level}
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

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="figure-count">
                    Anzahl
                  </label>
                  <input
                    id="figure-count"
                    type="text"
                    className="input"
                    value={createForm.count}
                    onChange={(e) => updateCreateField("count", e.target.value)}
                    placeholder="z.B. 6"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="figure-turn">
                    Drehungsumfang
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
              </div>

              {createError && <Alert compact>{createError}</Alert>}
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
            open={Boolean(stepsModalFigure)}
            onClose={closeStepsModal}
            title={`Schritte – ${stepsModalFigure?.name ?? ""}`}
            footer={
              <>
                <button
                  type="button"
                  onClick={closeStepsModal}
                  disabled={stepsModalSaving}
                  className="btn-secondary"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={saveStepsModal}
                  disabled={stepsModalSaving}
                  className="btn-primary"
                >
                  {stepsModalSaving ? "Speichern…" : "Speichern"}
                </button>
              </>
            }
          >
            <div className="space-y-6">
              {[
                {
                  section: "men",
                  title: "Männerschritte",
                  rows: stepsModalRows,
                },
                {
                  section: "lady",
                  title: "Damenschritte",
                  rows: stepsModalLadyRows,
                },
              ].map(({ section, title, rows }) => (
                <div
                  key={section}
                  className="space-y-3 rounded-xl border-2 border-slate-200 p-4 dark:border-slate-700"
                >
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {title}
                  </div>

                  {rows.length > 0 && (
                    <ol className="flex flex-col gap-2">
                      {rows.map((row, idx) => (
                        <li
                          key={idx}
                          className="flex items-center gap-2 rounded-lg border-2 border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                        >
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 border-slate-300 text-[10px] font-bold leading-none text-slate-600 dark:border-slate-600 dark:text-slate-300">
                            {idx + 1}
                          </span>
                          <span className="flex-1">
                            {row.foot} {row.direction}
                          </span>
                          <button
                            type="button"
                            onClick={() => stepsModalRemoveRow(section, idx)}
                            className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400"
                            aria-label="Schritt entfernen"
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
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}

                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Neuer Schritt
                    </div>
                    <div className="flex gap-3">
                      {FOOT_OPTIONS.map((foot) => {
                        const isActive =
                          stepsModalActive?.section === section &&
                          stepsModalActive?.foot === foot;
                        return (
                          <button
                            key={foot}
                            type="button"
                            onClick={() => stepsModalToggleFoot(section, foot)}
                            className={`flex-1 rounded-xl border-2 py-3 text-sm font-semibold transition ${
                              isActive
                                ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-900/30 dark:text-brand-300"
                                : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand-500"
                            }`}
                          >
                            {foot === "Linker Fuß"
                              ? "L – Linker Fuß"
                              : "R – Rechter Fuß"}
                          </button>
                        );
                      })}
                    </div>

                    {stepsModalActive?.section === section && (
                      <div className="flex flex-wrap gap-2">
                        {DIRECTION_OPTIONS.map((dir) => (
                          <button
                            key={dir}
                            type="button"
                            onClick={() => stepsModalAddDirection(dir)}
                            className="rounded-lg border-2 border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand-500 dark:hover:bg-brand-900/30 dark:hover:text-brand-300"
                          >
                            {dir}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Modal>

          <Modal
            open={Boolean(viewStepsFigure)}
            onClose={() => setViewStepsFigure(null)}
            title={`Schritte – ${viewStepsFigure?.name ?? ""}`}
            footer={
              <>
                {isAdmin && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      const fig = viewStepsFigure;
                      setViewStepsFigure(null);
                      openStepsModal(fig);
                    }}
                  >
                    Bearbeiten
                  </button>
                )}
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setViewStepsFigure(null)}
                >
                  Schließen
                </button>
              </>
            }
          >
            {viewStepsFigure &&
              (() => {
                const menRows = stepRowsOf(viewStepsFigure.steps);
                const ladyRows = stepRowsOf(viewStepsFigure.stepsLady);
                const hasMen = menRows.length > 0;
                const hasLady = ladyRows.length > 0;

                if (!hasMen && !hasLady) {
                  return (
                    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
                      <Footprint
                        side="left"
                        className="h-10 w-10 text-slate-300 dark:text-slate-600"
                      />
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Für diese Figur sind noch keine Schritte hinterlegt.
                      </p>
                    </div>
                  );
                }

                const showTabs = hasMen && hasLady;
                const activeSection = showTabs
                  ? viewStepsSection
                  : hasMen
                    ? "men"
                    : "lady";
                const rows = activeSection === "lady" ? ladyRows : menRows;
                const metaChips = [
                  viewStepsFigure.count && {
                    label: "Schrittanzahl",
                    value: viewStepsFigure.count,
                  },
                  viewStepsFigure.amountOfTurn && {
                    label: "Drehungsumfang",
                    value: viewStepsFigure.amountOfTurn,
                  },
                ].filter(Boolean);

                return (
                  <div className="space-y-5">
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-white shadow-sm">
                      <Footprint
                        side="left"
                        className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rotate-12 text-white/10"
                      />
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
                        Schrittfolge
                      </div>
                      <div className="mt-1 text-xl font-bold">
                        {viewStepsFigure.name}
                      </div>
                      {metaChips.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {metaChips.map((chip) => (
                            <span
                              key={chip.label}
                              className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium backdrop-blur"
                            >
                              <span className="text-white/60">
                                {chip.label}
                              </span>
                              <span className="font-semibold">
                                {chip.value}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {showTabs && (
                      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
                        {[
                          { key: "men", label: "Herr", symbol: "♂" },
                          { key: "lady", label: "Dame", symbol: "♀" },
                        ].map((tab) => {
                          const active = activeSection === tab.key;
                          return (
                            <button
                              key={tab.key}
                              type="button"
                              onClick={() => setViewStepsSection(tab.key)}
                              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition ${
                                active
                                  ? "bg-white text-brand-700 shadow-sm dark:bg-slate-700 dark:text-brand-200"
                                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                              }`}
                            >
                              <span className="text-base leading-none">
                                {tab.symbol}
                              </span>
                              {tab.label}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <ol className="space-y-0">
                      {rows.map((step, idx) => {
                        const isLeft = /link/i.test(step.foot);
                        const isLast = idx === rows.length - 1;
                        const meta = stepDirectionMeta(step.direction);
                        const rotate = meta.type === "arrow" ? meta.angle : 0;
                        return (
                          <li key={idx} className="relative flex gap-4 pb-4 last:pb-0">
                            <div className="relative flex w-14 flex-shrink-0 justify-center">
                              {!isLast && (
                                <span className="absolute -bottom-4 left-1/2 top-14 w-px -translate-x-1/2 border-l-2 border-dashed border-slate-200 dark:border-slate-700" />
                              )}
                              <div
                                className={`relative flex h-14 w-14 items-center justify-center rounded-2xl ring-1 ${
                                  isLeft
                                    ? "bg-brand-50 ring-brand-200 dark:bg-brand-950/40 dark:ring-brand-900/70"
                                    : "bg-rose-50 ring-rose-200 dark:bg-rose-950/40 dark:ring-rose-900/70"
                                }`}
                              >
                                <span
                                  className="block transition-transform"
                                  style={{ transform: `rotate(${rotate}deg)` }}
                                >
                                  <Footprint
                                    side={isLeft ? "left" : "right"}
                                    className={`h-7 w-7 ${
                                      isLeft
                                        ? "text-brand-500 dark:text-brand-400"
                                        : "text-rose-500 dark:text-rose-400"
                                    }`}
                                  />
                                </span>
                                <span className="absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600">
                                  {idx + 1}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-1 flex-col justify-center">
                              <div
                                className={`text-[11px] font-semibold uppercase tracking-wider ${
                                  isLeft
                                    ? "text-brand-600 dark:text-brand-300"
                                    : "text-rose-500 dark:text-rose-300"
                                }`}
                              >
                                {isLeft ? "Linker Fuß" : "Rechter Fuß"}
                              </div>
                              <div className="mt-1 flex items-center gap-2">
                                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-600">
                                  <DirectionIcon
                                    direction={step.direction}
                                    className="h-3.5 w-3.5 text-slate-500 dark:text-slate-300"
                                  />
                                </span>
                                <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                  {step.direction || "Am Platz"}
                                </span>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                );
              })()}
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
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                  Keine Figuren zum Verwalten vorhanden.
                </div>
              ) : (
                visibilityItems.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40"
                  >
                    <input
                      type="checkbox"
                      checked={item.visible}
                      onChange={() => toggleVisibility(item.id)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400 dark:border-slate-500 dark:bg-slate-700"
                    />
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {item.name}
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">
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
