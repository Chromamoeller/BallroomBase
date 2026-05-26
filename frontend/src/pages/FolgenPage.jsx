import { useEffect, useMemo, useState } from "react";

import { api } from "../api/client.js";
import DanceTabs from "../components/DanceTabs.jsx";
import Modal from "../components/Modal.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function FolgenPage() {
  const { user, isAdmin } = useAuth();
  const [dances, setDances] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [activeDance, setActiveDance] = useState(null);
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const [visibilityItems, setVisibilityItems] = useState([]);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, s] = await Promise.all([
          api.dances(),
          api.sequences(user.courseId),
        ]);
        if (cancelled) return;
        setDances(d);
        setSequences(s);
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

  const visible = useMemo(
    () =>
      sequences.filter(
        (s) => s.danceId === activeDance && (isAdmin || s.visible),
      ),
    [sequences, activeDance, isAdmin],
  );

  useEffect(() => {
    setVisibilityItems(
      sequences
        .filter((s) => s.danceId === activeDance)
        .map((s) => ({
          id: s.id,
          name: s.name,
          danceName: s.danceName,
          visible: Boolean(s.visible),
        })),
    );
  }, [sequences, activeDance]);

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
      await api.updateSequenceVisibility(user.courseId, visibilityItems);
      setSequences((current) =>
        current.map((sequence) => {
          const item = visibilityItems.find((v) => v.id === sequence.id);
          return item ? { ...sequence, visible: item.visible } : sequence;
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
        title="Folgen"
        description="Choreografische Folgen aus mehreren Figuren."
      />

      {loading ? (
        <div className="text-sm text-slate-500">Lade Folgen…</div>
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

          {visible.length === 0 ? (
            <div className="card p-6 text-sm text-slate-500">
              Für diesen Tanz sind noch keine Folgen hinterlegt.
            </div>
          ) : (
            <div className="space-y-4">
              {visible.map((s) => (
                <div key={s.id} className="card p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-900">
                      {s.name}
                    </h3>
                    {isAdmin && !s.visible && (
                      <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                        Ausgeblendet
                      </span>
                    )}
                  </div>
                  {s.description && (
                    <p className="mt-1 text-sm text-slate-600">
                      {s.description}
                    </p>
                  )}
                  {s.figures && (
                    <div className="mt-3">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Enthaltene Figuren
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {s.figures.split(",").map((part, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
                          >
                            {part.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <Modal
            open={visibilityModalOpen}
            onClose={() => setVisibilityModalOpen(false)}
            title={`Folgen Sichtbarkeit verwalten – ${dances.find((d) => d.id === activeDance)?.name ?? "Tanz"}`}
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
                  Keine Folgen zum Verwalten vorhanden.
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
