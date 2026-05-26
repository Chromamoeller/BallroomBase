import { NavLink } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";

const NAV_ITEMS = [
  { to: "/figuren", label: "Figuren" },
  { to: "/folgen", label: "Folgen" },
  { to: "/historie", label: "Historie" },
  { to: "/anwesenheit", label: "Anwesenheitsliste" },
];

const ADMIN_NAV_ITEMS = [{ to: "/nutzer", label: "Nutzer verwalten" }];

export default function Sidebar() {
  const { user, logout, isAdmin } = useAuth();
  const items = isAdmin ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS;

  return (
    <aside className="fixed left-0 top-0 z-20 flex h-screen w-72 flex-col border-r border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-200 px-6 py-6">
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

      <nav className="flex-1 space-y-1 px-4 py-6">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
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
  );
}
