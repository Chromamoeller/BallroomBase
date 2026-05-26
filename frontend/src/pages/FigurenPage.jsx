import { useEffect, useMemo, useState } from "react";

import { api } from "../api/client.js";
import DanceTabs from "../components/DanceTabs.jsx";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
      />

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
            <div className="card p-6 text-sm text-slate-500">
              Für diesen Tanz sind noch keine Figuren hinterlegt.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleFigures.map((f) => (
                <div key={f.id} className="card flex flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">
                        {f.name}
                      </h3>
                      {isAdmin && !f.visible && (
                        <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-rose-600">
                          Ausgeblendet
                        </div>
                      )}
                    </div>
                    {f.difficulty && (
                      <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                        {f.difficulty}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 text-sm text-slate-600">
                    <div>
                      <div className="font-medium text-slate-800">Schritte</div>
                      <div>{f.steps || "Nicht angegeben"}</div>
                    </div>
                    <div>
                      <div className="font-medium text-slate-800">Count</div>
                      <div>{f.count || "Nicht angegeben"}</div>
                    </div>
                    <div>
                      <div className="font-medium text-slate-800">
                        Fußarbeit
                      </div>
                      <div>{f.footwork || "Nicht angegeben"}</div>
                    </div>
                    <div>
                      <div className="font-medium text-slate-800">Drehung</div>
                      <div>{f.amountOfTurn || "Nicht angegeben"}</div>
                    </div>
                    {f.precedes && (
                      <div>
                        <div className="font-medium text-slate-800">
                          Vorangehende Figuren
                        </div>
                        <div>{f.precedes}</div>
                      </div>
                    )}
                    {f.follows && (
                      <div>
                        <div className="font-medium text-slate-800">
                          Folgende Figuren
                        </div>
                        <div>{f.follows}</div>
                      </div>
                    )}
                  </div>

                  {f.description && (
                    <p className="mt-4 text-sm text-slate-600">
                      {f.description}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedVideoFigure(f)}
                    className="btn-secondary mt-5 self-start"
                  >
                    Video abspielen
                  </button>
                </div>
              ))}
            </div>
          )}

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
                <p className="text-sm text-slate-600">
                  Falls das Video geladen wird, kannst du hier die Aufnahme
                  sehen.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
                Dieses Video ist derzeit nicht verfügbar. Sobald ein Link
                hinterlegt ist, kannst du es hier abspielen.
              </div>
            )}
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
