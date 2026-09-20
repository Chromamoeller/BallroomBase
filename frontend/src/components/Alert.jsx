const VARIANTS = {
  error:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-900/30 dark:text-red-200",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-900/30 dark:text-emerald-200",
};

export default function Alert({
  variant = "error",
  compact = false,
  className = "",
  children,
}) {
  const padding = compact ? "px-3 py-2" : "px-4 py-3";
  return (
    <div
      className={["rounded-lg border text-sm", padding, VARIANTS[variant], className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
