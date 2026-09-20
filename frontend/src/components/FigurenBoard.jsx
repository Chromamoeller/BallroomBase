import { Fragment, useState } from "react";

export const DIFFICULTY_META = {
  Leicht: {
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  Mittel: {
    className: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  },
  Schwer: {
    className:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  },
};

function Icon({ path, size = 16, strokeWidth = 2 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const iconButton =
  "inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200";

function ColumnHeader({
  column,
  count,
  isAdmin,
  isFirst,
  isLast,
  onRename,
  onDelete,
  onMove,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const editable = isAdmin && column.id !== null;

  function startEdit() {
    setDraft(column.name);
    setEditing(true);
  }

  function commit() {
    const name = draft.trim();
    setEditing(false);
    if (name && name !== column.name) onRename(name);
  }

  return (
    <div className="mb-3 flex items-center gap-2">
      {editing ? (
        <input
          autoFocus
          value={draft}
          maxLength={60}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          aria-label="Spaltenname"
          className="input h-8 min-w-0 flex-1 py-1 text-sm font-semibold"
        />
      ) : (
        <h3
          className={`min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100 ${
            editable ? "cursor-text" : ""
          }`}
          title={editable ? "Zum Umbenennen anklicken" : undefined}
          onClick={editable ? startEdit : undefined}
        >
          {column.name}
        </h3>
      )}
      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
        {count}
      </span>
      {editable && !editing && !confirming && (
        <div className="flex items-center">
          <button
            type="button"
            className={iconButton}
            disabled={isFirst}
            onClick={() => onMove(-1)}
            aria-label="Spalte nach links"
            title="Nach links"
          >
            <Icon path="m15 6-6 6 6 6" />
          </button>
          <button
            type="button"
            className={iconButton}
            disabled={isLast}
            onClick={() => onMove(1)}
            aria-label="Spalte nach rechts"
            title="Nach rechts"
          >
            <Icon path="m9 6 6 6-6 6" />
          </button>
          <button
            type="button"
            className={`${iconButton} hover:!text-red-600 dark:hover:!text-red-400`}
            onClick={() => setConfirming(true)}
            aria-label="Spalte löschen"
            title="Spalte löschen"
          >
            <Icon path="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" />
          </button>
        </div>
      )}
      {editable && confirming && (
        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-500 dark:text-slate-400">Löschen?</span>
          <button
            type="button"
            className="rounded-md bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-700"
            onClick={() => {
              setConfirming(false);
              onDelete();
            }}
          >
            Ja
          </button>
          <button
            type="button"
            className="rounded-md px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            onClick={() => setConfirming(false)}
          >
            Nein
          </button>
        </div>
      )}
    </div>
  );
}

function AddColumn({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  function submit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-14 w-72 flex-shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-500 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:text-slate-400 dark:hover:border-brand-400 dark:hover:text-brand-300"
      >
        <Icon path="M12 5v14M5 12h14" strokeWidth={2.5} />
        Spalte hinzufügen
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="w-72 flex-shrink-0 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
    >
      <input
        autoFocus
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder="Name der Spalte"
        aria-label="Name der neuen Spalte"
        className="input"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Abbrechen
        </button>
        <button type="submit" className="btn-primary" disabled={!name.trim()}>
          Anlegen
        </button>
      </div>
    </form>
  );
}

function Card({
  figure,
  number,
  isAdmin,
  draggable,
  dragging,
  onOpen,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
}) {
  const difficulty = DIFFICULTY_META[figure.difficulty];
  return (
    <div
      data-card
      data-id={figure.id}
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`${figure.name} – Details anzeigen`}
      className={`card flex items-center gap-3 p-3 transition hover:border-brand-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:hover:border-brand-500 ${
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
        {number}
      </div>
      <div className="min-w-0 flex-1">
        <div className="break-words text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
          {figure.name}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {difficulty && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${difficulty.className}`}
            >
              {figure.difficulty}
            </span>
          )}
          {isAdmin && !figure.visible && (
            <span className="text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
              Ausgeblendet
            </span>
          )}
          {isAdmin && (
            <span className="ml-auto flex items-center">
              <button
                type="button"
                className={iconButton}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                aria-label="Bearbeiten"
                title="Bearbeiten"
              >
                <Icon path="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </button>
              <button
                type="button"
                className={`${iconButton} hover:!text-red-600 dark:hover:!text-red-400`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                aria-label="Löschen"
                title="Löschen"
              >
                <Icon path="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" />
              </button>
            </span>
          )}
        </div>
      </div>
      <span
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 dark:border-slate-600 dark:text-slate-300"
        aria-hidden="true"
      >
        <Icon path="m9 6 6 6-6 6" size={14} strokeWidth={2.5} />
      </span>
    </div>
  );
}

export default function FigurenBoard({
  figures,
  columns,
  isAdmin,
  canDrag,
  onOpen,
  onEdit,
  onDelete,
  onMoveCards,
  onAddColumn,
  onRenameColumn,
  onDeleteColumn,
  onMoveColumn,
}) {
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);

  const columnIds = new Set(columns.map((c) => c.id));
  const byColumn = new Map([[null, []], ...columns.map((c) => [c.id, []])]);
  for (const f of figures) {
    const key = columnIds.has(f.columnId) ? f.columnId : null;
    byColumn.get(key).push(f);
  }
  for (const list of byColumn.values()) {
    list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  }

  const lanes = [];
  if (byColumn.get(null).length > 0 || isAdmin || columns.length === 0) {
    lanes.push({
      id: null,
      name: columns.length === 0 ? "Alle Figuren" : "Nicht zugeordnet",
    });
  }
  lanes.push(...columns);

  function dropIndexFor(e) {
    const cards = [...e.currentTarget.querySelectorAll("[data-card]")].filter(
      (el) => Number(el.dataset.id) !== dragId,
    );
    let index = 0;
    for (const el of cards) {
      const rect = el.getBoundingClientRect();
      if (e.clientY > rect.top + rect.height / 2) index += 1;
    }
    return index;
  }

  function handleDragOver(e, laneId) {
    if (dragId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const index = dropIndexFor(e);
    if (!over || over.laneId !== laneId || over.index !== index) {
      setOver({ laneId, index });
    }
  }

  function handleDrop(e, laneId) {
    if (dragId === null) return;
    e.preventDefault();
    const index = dropIndexFor(e);
    const moved = figures.find((f) => f.id === dragId);
    const sourceLane = columnIds.has(moved.columnId) ? moved.columnId : null;

    const target = byColumn.get(laneId).filter((f) => f.id !== dragId);
    target.splice(index, 0, moved);
    const items = target.map((f, i) => ({ id: f.id, columnId: laneId, position: i + 1 }));
    if (sourceLane !== laneId) {
      byColumn
        .get(sourceLane)
        .filter((f) => f.id !== dragId)
        .forEach((f, i) => items.push({ id: f.id, columnId: sourceLane, position: i + 1 }));
    }
    setDragId(null);
    setOver(null);
    onMoveCards(items);
  }

  return (
    <div className="-mx-1 flex items-start gap-4 overflow-x-auto px-1 pb-4">
      {lanes.map((lane) => {
        const list = byColumn.get(lane.id);
        const isOver = over?.laneId === lane.id;
        let shown = 0;
        const indicator = (
          <div
            key="drop-indicator"
            className="my-1 h-1 rounded-full bg-brand-500"
            aria-hidden="true"
          />
        );
        const realIndex = columns.findIndex((c) => c.id === lane.id);
        return (
          <section
            key={lane.id ?? "unassigned"}
            className="w-72 flex-shrink-0 rounded-2xl bg-slate-100/80 p-3 dark:bg-slate-900/40"
            aria-label={lane.name}
          >
            <ColumnHeader
              column={lane}
              count={list.length}
              isAdmin={isAdmin}
              isFirst={realIndex === 0}
              isLast={realIndex === columns.length - 1}
              onRename={(name) => onRenameColumn(lane.id, name)}
              onDelete={() => onDeleteColumn(lane.id)}
              onMove={(dir) => onMoveColumn(lane.id, dir)}
            />
            <div
              className={`min-h-16 space-y-2 rounded-xl transition ${
                isOver ? "bg-brand-50/60 dark:bg-brand-900/10" : ""
              }`}
              onDragOver={(e) => handleDragOver(e, lane.id)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  setOver((cur) => (cur?.laneId === lane.id ? null : cur));
                }
              }}
              onDrop={(e) => handleDrop(e, lane.id)}
            >
              {list.map((f, i) => {
                const isDragged = f.id === dragId;
                const before = isOver && !isDragged && over.index === shown;
                if (!isDragged) shown += 1;
                return (
                  <Fragment key={f.id}>
                    {before && indicator}
                    <Card
                      figure={f}
                      number={i + 1}
                      isAdmin={isAdmin}
                      draggable={canDrag}
                      dragging={isDragged}
                      onOpen={() => onOpen(f)}
                      onEdit={() => onEdit(f)}
                      onDelete={() => onDelete(f)}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(f.id));
                        setDragId(f.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                    />
                  </Fragment>
                );
              })}
              {isOver && over.index === shown && indicator}
              {list.length === 0 && !isOver && (
                <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-400 dark:border-slate-600 dark:text-slate-500">
                  {isAdmin ? "Karten hierher ziehen" : "Keine Figuren"}
                </div>
              )}
            </div>
          </section>
        );
      })}
      {isAdmin && <AddColumn onAdd={onAddColumn} />}
    </div>
  );
}
