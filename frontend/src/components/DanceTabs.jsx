const CATEGORIES = {
  standard: [
    "border-sky-200",
    "bg-sky-50",
    "text-sky-700",
    "hover:border-sky-300",
    "hover:bg-sky-100",
  ].join(" "),
  latein: [
    "border-rose-200",
    "bg-rose-50",
    "text-rose-700",
    "hover:border-rose-300",
    "hover:bg-rose-100",
  ].join(" "),
  other: [
    "border-slate-200",
    "bg-white",
    "text-slate-600",
    "hover:border-slate-300",
    "hover:bg-slate-50",
  ].join(" "),
};

const ACTIVE_STYLES = {
  standard: [
    "border-sky-600",
    "bg-sky-600",
    "text-white",
    "hover:bg-sky-600",
  ].join(" "),
  latein: [
    "border-rose-600",
    "bg-rose-600",
    "text-white",
    "hover:bg-rose-600",
  ].join(" "),
  other: [
    "border-slate-700",
    "bg-slate-900",
    "text-white",
    "hover:bg-slate-900",
  ].join(" "),
};

function getDanceCategory(name) {
  const normalized = name.toLowerCase();
  if (
    normalized.includes("langsamer") ||
    normalized.includes("tango") ||
    normalized.includes("wiener") ||
    normalized.includes("slowfox") ||
    normalized.includes("quickstep")
  ) {
    return "standard";
  }
  if (
    normalized.includes("cha") ||
    normalized.includes("rumba") ||
    normalized.includes("samba") ||
    normalized.includes("jive") ||
    normalized.includes("paso")
  ) {
    return "latein";
  }
  return "other";
}

export default function DanceTabs({ dances, activeId, onSelect }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {dances.map((d) => {
        const category = getDanceCategory(d.name);
        const categoryStyle = CATEGORIES[category] ?? CATEGORIES.other;
        const activeStyle = activeId === d.id ? ACTIVE_STYLES[category] : "";

        return (
          <button
            key={d.id}
            onClick={() => onSelect(d.id)}
            className={[
              "tab",
              categoryStyle,
              activeStyle,
              "min-w-[12rem] flex-1 justify-center text-center px-5 py-3",
            ]
              .join(" ")
              .trim()}
          >
            {d.name}
          </button>
        );
      })}
    </div>
  );
}
