import { Link, Navigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";

export default function HomePage() {
  const { user } = useAuth();
  if (user) return <Navigate to="/figuren" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-3xl text-center">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">
          DanceFans
        </div>
        <h1 className="text-4xl font-semibold text-slate-900 sm:text-5xl">
          Willkommen bei DanceFans
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-slate-600 sm:text-lg">
          Die Plattform für die Organisation deines Tanzkurses. Verwalte Figuren,
          Folgen, Unterrichtshistorie und Anwesenheit zentral und übersichtlich.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3">
          <Link to="/login" className="btn-primary px-6 py-3 text-base">
            Zum Login
          </Link>
          <p className="text-sm text-slate-500">
            Bitte melde dich an, um fortzufahren.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { title: "Figuren & Folgen", text: "Alle Schritte und Choreografien sauber dokumentiert." },
            { title: "Unterrichtshistorie", text: "Behalte den Überblick über jede Unterrichtsstunde." },
            { title: "Anwesenheit", text: "Erfasse Stundenstand und Anwesenheit deiner Teilnehmer." },
          ].map((c) => (
            <div key={c.title} className="card p-5 text-left">
              <h3 className="text-sm font-semibold text-slate-900">{c.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{c.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
