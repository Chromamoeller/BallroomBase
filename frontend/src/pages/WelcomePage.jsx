import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";

const QUICK_LINKS = [
  {
    to: "/figuren",
    title: "Figuren",
    description: "Alle Tanzfiguren deines Kurses – Schritte, Fußarbeit und Videos.",
  },
  {
    to: "/folgen",
    title: "Folgen",
    description: "Choreografien aus einzelnen Figuren zusammenstellen.",
  },
  {
    to: "/historie",
    title: "Historie",
    description: "Vergangene Unterrichtsstunden mit Inhalten einsehen.",
  },
  {
    to: "/anwesenheit",
    title: "Anwesenheit",
    description: "Stundenstand und Anwesenheit der Teilnehmer verwalten.",
  },
];

export default function WelcomePage() {
  const { user, isAdmin } = useAuth();

  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="mb-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">
          DanceFans
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          Willkommen, {user?.username}!
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          {isAdmin ? "Administrator" : "Teilnehmer"} · Kurs:{" "}
          <span className="font-medium text-slate-700">{user?.courseName}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="card block p-5 transition hover:border-brand-300 hover:shadow-md"
          >
            <h2 className="text-sm font-semibold text-slate-900">{link.title}</h2>
            <p className="mt-1.5 text-sm text-slate-500">{link.description}</p>
          </Link>
        ))}
      </div>

      <div className="mt-10 text-center">
        <Link to="/figuren" className="btn-primary px-6 py-2.5 text-sm">
          Los geht's
        </Link>
      </div>
    </div>
  );
}
