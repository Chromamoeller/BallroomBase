import { getDanceInfo } from "../data/danceInfo.js";

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-slate-800 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}

function PanelBody({ danceName, info }) {
  if (!danceName) {
    return (
      <div className="p-5 text-sm text-slate-500 dark:text-slate-400">
        Wähle einen Tanz, um zusätzliche Infos zu sehen.
      </div>
    );
  }
  if (!info) {
    return (
      <div className="p-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {danceName}
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Für diesen Tanz sind noch keine Hintergrund-Infos hinterlegt.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 p-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-300">
          {info.category}
        </div>
        <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
          {danceName}
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <InfoRow label="Tempo" value={info.bpm} />
        <InfoRow label="Takt" value={info.timeSignature} />
        <InfoRow label="Grundrhythmus" value={info.basicRhythm} />
        <InfoRow label="Herkunft" value={info.origin} />
        <InfoRow label="Charakter" value={info.character} />
      </div>
      {info.songs?.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Passende Songs
          </div>
          <ul className="mt-2 space-y-1.5">
            {info.songs.map((song, idx) => (
              <li
                key={idx}
                className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5 text-sm last:border-0 last:pb-0 dark:border-slate-700"
              >
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {song.title}
                </span>
                <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                  {song.artist}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function DanceInfoPanel({ danceName, open, onToggle }) {
  const info = danceName ? getDanceInfo(danceName) : null;

  return (
    <div
      className={[
        "fixed right-0 top-16 bottom-4 z-30 flex items-stretch",
        "transition-transform duration-300 ease-out",
        "lg:top-4",
        open ? "translate-x-0" : "translate-x-80",
      ].join(" ")}
      aria-hidden={!open}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={open ? "Info-Panel einklappen" : "Info-Panel ausklappen"}
        aria-expanded={open}
        className="my-auto flex h-16 w-8 items-center justify-center rounded-l-lg border border-r-0 border-slate-200 bg-white text-slate-500 shadow-md transition hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
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
          className={open ? "" : "rotate-180"}
          aria-hidden="true"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      <aside className="w-80 max-w-[calc(100vw-3rem)] overflow-y-auto border-l border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
        <PanelBody danceName={danceName} info={info} />
      </aside>
    </div>
  );
}
