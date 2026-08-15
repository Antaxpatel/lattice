import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Gpu } from '../lib/types';
import { fmtNum } from '../lib/format';
import { Search } from 'lucide-react';

export default function Gpus() {
  const [gpus, setGpus] = useState<Gpu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/gpus');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load GPUs');
        setGpus(Array.isArray(data) ? data : []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const cats = useMemo(() => ['all', ...Array.from(new Set(gpus.map((g) => g.category)))], [gpus]);
  const filtered = gpus.filter((g) => {
    const hit = `${g.name} ${g.vendor} ${g.architecture}`.toLowerCase().includes(q.toLowerCase());
    return hit && (cat === 'all' || g.category === cat);
  });

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="mono text-[11px] tracking-[0.22em] uppercase text-copper">Silicon</p>
          <h1 className="display text-5xl mt-1">GPU library</h1>
          <p className="text-mist mt-2 max-w-xl">Published VRAM, memory bandwidth, and PCIe generation. Pick a card and drop it into the calculator.</p>
        </div>
        <p className="mono text-xs text-mist">{filtered.length} cards</p>
      </div>

      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mist" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, vendor, arch…" className="w-full bg-ink-2 hairline rounded-full pl-9 pr-4 py-2.5 text-sm outline-none focus:border-copper/50" />
        </div>
        <div className="flex flex-wrap gap-2">
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`px-3 py-1.5 rounded-full text-xs capitalize ${cat === c ? 'bg-copper text-ink' : 'hairline text-mist'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-6 text-rose text-sm">{error}</p>}
      {loading ? (
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 9 }).map((_, i) => <div key={i} className="h-40 rounded-2xl bg-panel animate-pulse" />)}</div>
      ) : (
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((g) => (
            <article key={g.id} className="bg-ink-2 hairline rounded-2xl p-5 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] mono text-mist">{g.vendor} · {g.architecture}</p>
                  <h2 className="font-medium mt-0.5">{g.name}</h2>
                </div>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-panel text-mist">{g.category}</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-y-2 text-xs">
                <div><dt className="text-mist">VRAM</dt><dd className="mono text-paper">{fmtNum(g.vram_gb, 0)} GB</dd></div>
                <div><dt className="text-mist">Bandwidth</dt><dd className="mono text-paper">{fmtNum(g.bandwidth_gbs, 0)} GB/s</dd></div>
                <div><dt className="text-mist">PCIe</dt><dd className="mono text-paper">Gen {g.pcie_gen} ×{g.pcie_lanes}</dd></div>
                <div><dt className="text-mist">TDP</dt><dd className="mono text-paper">{fmtNum(g.tdp_w, 0)} W</dd></div>
              </dl>
              <Link to={`/calculator?gpu=${g.id}`} className="mt-5 text-center text-xs py-2 rounded-full border border-line hover:border-copper/60">
                Use in calculator
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
