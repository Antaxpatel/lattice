import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiSend } from '../lib/api';
import type { SavedCalc } from '../lib/types';
import { fmtTps, timeAgo } from '../lib/format';
import { Trash2 } from 'lucide-react';

export default function History() {
  const [rows, setRows] = useState<SavedCalc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const data = await apiGet<SavedCalc[]>('/api/calculations', true);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const remove = async (id: number) => {
    try {
      await apiSend('/api/calculations', 'DELETE', { id }, true);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12">
      <p className="mono text-[11px] tracking-[0.22em] uppercase text-copper">Saved</p>
      <h1 className="display text-5xl mt-1">Calculation history</h1>
      {error && <p className="mt-4 text-rose text-sm">{error}</p>}
      {loading ? (
        <div className="mt-8 space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-panel animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <div className="mt-10 bg-ink-2 hairline rounded-2xl p-10 text-center">
          <p className="display text-2xl">Nothing on the bench yet.</p>
          <p className="text-mist text-sm mt-2">Run a fit and hit Save.</p>
          <Link to="/calculator" className="inline-block mt-5 text-sm bg-copper text-ink px-4 py-2 rounded-full">Open calculator</Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="bg-ink-2 hairline rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{r.hf_id}</p>
                <p className="text-xs text-mist mt-1">
                  {r.gpu_name} · {r.gpu_count}× {r.vram_gb} GB · ctx {r.context_length} · {r.recommended_quant}
                </p>
                <p className="text-[11px] text-mist mono mt-1">{timeAgo(r.created_at)}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${r.fits ? 'bg-teal-dim/40 text-ok' : 'bg-rose/15 text-rose'}`}>
                  {r.fits ? 'Fits' : 'Tight'}
                </span>
                <span className="mono text-sm">{fmtTps(r.tps_estimate)}</span>
                <Link to={`/calculator?saved=${r.id}`} className="text-xs text-copper">Open</Link>
                <button onClick={() => remove(r.id)} className="text-mist hover:text-rose" aria-label="Delete">
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
