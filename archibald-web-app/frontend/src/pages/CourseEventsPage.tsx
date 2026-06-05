import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listCourseEvents, createCourseEventFE, deleteCourseEventFE, type CourseEvent,
} from '../services/visit-planning.service';

export function CourseEventsPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '', instructor: '', city: '', provincia: '',
    eventDate: new Date().toISOString().slice(0, 10),
    costEur: '', productCategories: '', thresholdEur: '', notes: '',
  });

  const load = () => {
    setLoading(true);
    listCourseEvents()
      .then(setCourses)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createCourseEventFE({
        title: form.title, instructor: form.instructor || null,
        city: form.city, provincia: form.provincia || null,
        eventDate: form.eventDate,
        costEur: form.costEur ? parseFloat(form.costEur) : null,
        productCategories: form.productCategories
          ? form.productCategories.split(',').map(s => s.trim()).filter(Boolean)
          : [],
        thresholdEur: form.thresholdEur ? parseFloat(form.thresholdEur) : null,
        notes: form.notes || null, isActive: true,
      });
      setShowForm(false);
      setForm({
        title: '', instructor: '', city: '', provincia: '',
        eventDate: new Date().toISOString().slice(0, 10),
        costEur: '', productCategories: '', thresholdEur: '', notes: '',
      });
      load();
    } catch (err) { alert('Errore: ' + (err instanceof Error ? err.message : String(err))); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questo corso?')) return;
    try { await deleteCourseEventFE(id); load(); }
    catch (err) { alert('Errore: ' + (err instanceof Error ? err.message : String(err))); }
  };

  const INPUT: React.CSSProperties = {
    border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13, width: '100%',
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <button
          onClick={() => navigate('/giri')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}
        >←</button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🎓 Corsi &amp; Eventi</h1>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Caricamento...</div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 600 }}>{courses.length} eventi totali</div>
            <button
              onClick={() => setShowForm(v => !v)}
              style={{
                background: '#2563eb', color: 'white', border: 'none', borderRadius: 8,
                padding: '6px 14px', fontSize: 13, cursor: 'pointer',
              }}
            >
              + Aggiungi
            </button>
          </div>

          {showForm && (
            <form
              onSubmit={handleCreate}
              style={{ background: '#f8fafc', borderRadius: 10, padding: 16, marginBottom: 16 }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <input
                  placeholder="Titolo *" required value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={INPUT}
                />
                <input
                  placeholder="Formatore" value={form.instructor}
                  onChange={e => setForm(f => ({ ...f, instructor: e.target.value }))} style={INPUT}
                />
                <input
                  placeholder="Città *" required value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))} style={INPUT}
                />
                <input
                  placeholder="Provincia (es. NA)" value={form.provincia}
                  onChange={e => setForm(f => ({ ...f, provincia: e.target.value }))} style={INPUT}
                />
                <input
                  type="date" required value={form.eventDate}
                  onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))} style={INPUT}
                />
                <input
                  placeholder="Costo €" type="number" min="0" value={form.costEur}
                  onChange={e => setForm(f => ({ ...f, costEur: e.target.value }))} style={INPUT}
                />
                <input
                  placeholder="Categorie prodotti (virgola separata)" value={form.productCategories}
                  onChange={e => setForm(f => ({ ...f, productCategories: e.target.value }))} style={INPUT}
                />
                <input
                  placeholder="Soglia acquisto per corso gratis €" type="number" min="0"
                  value={form.thresholdEur}
                  onChange={e => setForm(f => ({ ...f, thresholdEur: e.target.value }))} style={INPUT}
                />
              </div>
              <input
                placeholder="Note" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                style={{ ...INPUT, marginBottom: 10 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="submit"
                  style={{
                    background: '#2563eb', color: 'white', border: 'none', borderRadius: 6,
                    padding: '7px 16px', cursor: 'pointer', fontSize: 13,
                  }}
                >Salva</button>
                <button
                  type="button" onClick={() => setShowForm(false)}
                  style={{
                    background: 'none', border: '1px solid #d1d5db', borderRadius: 6,
                    padding: '7px 16px', cursor: 'pointer', fontSize: 13,
                  }}
                >Annulla</button>
              </div>
            </form>
          )}

          {courses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>
              Nessun corso. Aggiungi i prossimi eventi formativi per ricevere suggerimenti durante le visite.
            </div>
          ) : (
            courses.map(c => (
              <div
                key={c.id}
                style={{
                  background: 'white', border: '1px solid #e5e7eb', borderRadius: 10,
                  padding: '12px 16px', marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>
                      📅 {c.eventDate.slice(0, 10)} — {c.title}
                    </div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                      {c.city}{c.provincia ? ` (${c.provincia})` : ''}
                      {c.instructor ? ` · Formatore: ${c.instructor}` : ''}
                    </div>
                    {c.costEur != null && (
                      <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>
                        💶 €{c.costEur}
                        {c.thresholdEur != null && (
                          <span style={{ color: '#16a34a' }}>
                            {' '}— 🎁 gratis con ≥€{c.thresholdEur} di acquisto
                          </span>
                        )}
                      </div>
                    )}
                    {c.productCategories.length > 0 && (
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                        Categorie: {c.productCategories.join(', ')}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(c.id)}
                    style={{
                      background: '#fee2e2', color: '#991b1b', border: 'none',
                      borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    Elimina
                  </button>
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
