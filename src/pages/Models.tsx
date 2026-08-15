import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ModelRow } from '../lib/types';
import { fmtNum, fmtParams } from '../lib/format';
import { Search } from 'lucide-react';

export default function Models() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [moeOnly, setMoeOnly] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/models');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load models');
        setModels(Array.isArray(data) ? data : []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const filtered = models.filter((m) => {
    const hit = `${m.hf_id} ${m.name} ${m.architecture}`.toLowerCase().includes(q.toLowerCase());
    return hit && (!moeOnly || m.is_moe);
  });

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
      <p className="mono text-[11px] tracking-[0.22em] uppercase text-teal">Checkpoints</p>
      <h1 className="display text-5xl mt-1">Cached models</h1>
      <p className="text-mist mt-2 max-w-2xl">Architecture cards Lattice has already resolved. Paste any other Hugging Face URL in the calculator and we will pull config.json.</p>

      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mist" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hf id or architecture…" className="w-full bg-ink-2 hairline rounded-full pl-9 pr-4 py-2.5 text-sm outline-none" />
        </div>
        <button onClick={() => setMoeOnly((v) => !v)} className={`px-4 py-2 rounded-full text-xs ${moeOnly ? 'bg-teal text-ink' : 'hairline text-mist'}`}>
          MoE only
        </button>
      </div>

      {error && <p className="mt-6 text-rose text-sm">{error}</p>}
      {loading ? (
        <div className="mt-8 space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-panel animate-pulse" />)}</div>
      ) : (
        <div className="mt-8 overflow-x-auto scroll-thin hairline rounded-2xl">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-[11px] uppercase tracking-wider text-mist bg-ink-2">
              <tr>
                <th className="text-left font-normal px-4 py-3">Model</th>
                <th className="text-left font-normal px-4 py-3">Params</th>
                <th className="text-left font-normal px-4 py-3">Layers</th>
                <th className="text-left font-normal px-4 py-3">GQA</th>
                <th className="text-left font-normal px-4 py-3">Context</th>
                <th className="text-left font-normal px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-[11px] text-mist mono">{m.hf_id}</p>
                  </td>
                  <td className="px-4 py-3 mono text-xs">
                    {m.is_moe ? (
                      <span><span className="text-teal">{fmtParams(m.active_params_b)}</span> / {fmtParams(m.total_params_b)}</span>
                    ) : fmtParams(m.total_params_b)}
                    {m.is_moe && <span className="ml-2 text-[10px] text-teal">MoE {m.num_experts}×{m.num_experts_per_tok}</span>}
                  </td>
                  <td className="px-4 py-3 mono text-xs">{m.num_layers}</td>
                  <td className="px-4 py-3 mono text-xs">{m.num_kv_heads}/{m.num_attention_heads}</td>
                  <td className="px-4 py-3 mono text-xs">{fmtNum(m.context_length, 0)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/calculator?hf=${encodeURIComponent(m.hf_id)}`} className="text-xs text-copper hover:text-copper-2">Calculate →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
