import { NavLink } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";

const NAV_ITEMS = [
  { to: "/figuren", label: "Figuren" },
  { to: "/folgen", label: "Folgen" },
  { to: "/historie", label: "Historie" },
  { to: "/anwesenheit", label: "Anwesenheitsliste" },
];

const ADMIN_NAV_ITEMS = [{ to: "/nutzer", label: "Nutzer verwalten" }];

export default function Sidebar({ isOpen = false, onClose = () => {} }) {
  const { user, logout, isAdmin } = useAuth();
  const items = isAdmin ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS;

  return (
    <>
      {/* Overlay (nur Mobile, wenn offen) */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          "fixed left-0 top-0 z-40 flex h-screen w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white shadow-card",
          "transition-transform duration-200 ease-out",
          isOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
        ].join(" ")}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-brand-600">
              DanceFans
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {user?.username}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {user?.role === "admin" ? "Administrator" : "Teilnehmer"} · {user?.courseName}
            </div>
          </div>
          <button
            type="button"
            aria-label="Menü schließen"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-6">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                [
                  "block rounded-lg px-4 py-2.5 text-sm font-medium transition",
                  isActive
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 px-4 py-4">
          <button onClick={logout} className="btn-secondary w-full">
            Abmelden
          </button>
        </div>
      </aside>
    </>
  );
}
