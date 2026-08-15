import { useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiSend } from '../lib/api';
import type { Gpu, GpuProfile } from '../lib/types';
import { fmtNum } from '../lib/format';
import { Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const empty = {
  name: '',
  gpu_id: '' as string | number,
  gpu_name: '',
  vram_gb: 24,
  bandwidth_gbs: 1008,
  pcie_gen: 4,
  pcie_lanes: 16,
  gpu_count: 1,
  system_ram_gb: 64,
};

export default function Profiles() {
  const [rows, setRows] = useState<GpuProfile[]>([]);
  const [gpus, setGpus] = useState<Gpu[]>([]);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [p, g] = await Promise.all([apiGet<GpuProfile[]>('/api/profiles', true), fetch('/api/gpus').then((r) => r.json())]);
      setRows(Array.isArray(p) ? p : []);
      if (Array.isArray(g)) setGpus(g);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onGpu = (id: string) => {
    const g = gpus.find((x) => String(x.id) === id);
    if (!g) {
      setForm((f) => ({ ...f, gpu_id: '', gpu_name: f.gpu_name }));
      return;
    }
    setForm((f) => ({
      ...f,
      gpu_id: g.id,
      gpu_name: g.name,
      vram_gb: Number(g.vram_gb),
      bandwidth_gbs: Number(g.bandwidth_gbs),
      pcie_gen: Number(g.pcie_gen),
      pcie_lanes: Number(g.pcie_lanes),
    }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('Give the rig a name.');
      return;
    }
    setBusy(true);
    try {
      await apiSend('/api/profiles', 'POST', {
        ...form,
        gpu_id: form.gpu_id || null,
        gpu_name: form.gpu_name || form.name,
      }, true);
      setForm(empty);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await apiSend('/api/profiles', 'DELETE', { id }, true);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12">
      <p className="mono text-[11px] tracking-[0.22em] uppercase text-copper">Your hardware</p>
      <h1 className="display text-5xl mt-1">Saved rigs</h1>

      <form onSubmit={submit} className="mt-8 bg-ink-2 hairline rounded-2xl p-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <label className="text-xs text-mist sm:col-span-2 lg:col-span-1">Name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full bg-ink hairline rounded-xl px-3 py-2 text-sm" placeholder="Home 4090" />
        </label>
        <label className="text-xs text-mist sm:col-span-2">Catalog GPU
          <select value={String(form.gpu_id)} onChange={(e) => onGpu(e.target.value)} className="mt-1 w-full bg-ink hairline rounded-xl px-3 py-2 text-sm">
            <option value="">Custom / pick one</option>
            {gpus.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-mist">VRAM GB
          <input type="number" value={form.vram_gb} onChange={(e) => setForm({ ...form, vram_gb: Number(e.target.value) })} className="mt-1 w-full bg-ink hairline rounded-xl px-3 py-2 text-sm" />
        </label>
        <label className="text-xs text-mist">Bandwidth GB/s
          <input type="number" value={form.bandwidth_gbs} onChange={(e) => setForm({ ...form, bandwidth_gbs: Number(e.target.value) })} className="mt-1 w-full bg-ink hairline rounded-xl px-3 py-2 text-sm" />
        </label>
        <label className="text-xs text-mist">PCIe gen
          <input type="number" value={form.pcie_gen} onChange={(e) => setForm({ ...form, pcie_gen: Number(e.target.value) })} className="mt-1 w-full bg-ink hairline rounded-xl px-3 py-2 text-sm" />
        </label>
        <label className="text-xs text-mist">GPU count
          <input type="number" value={form.gpu_count} onChange={(e) => setForm({ ...form, gpu_count: Number(e.target.value) })} className="mt-1 w-full bg-ink hairline rounded-xl px-3 py-2 text-sm" />
        </label>
        <label className="text-xs text-mist">System RAM GB
          <input type="number" value={form.system_ram_gb} onChange={(e) => setForm({ ...form, system_ram_gb: Number(e.target.value) })} className="mt-1 w-full bg-ink hairline rounded-xl px-3 py-2 text-sm" />
        </label>
        <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3">
          <button disabled={busy} className="bg-copper text-ink text-sm px-4 py-2 rounded-full disabled:opacity-50">{busy ? 'Saving…' : 'Save rig'}</button>
          {error && <p className="text-rose text-sm">{error}</p>}
        </div>
      </form>

      {loading ? (
        <div className="mt-8 space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-panel animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-mist mt-8 text-sm">No saved rigs yet.</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="bg-panel hairline rounded-2xl p-5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-mist mt-1">{r.gpu_name} · {r.gpu_count}× {fmtNum(r.vram_gb, 0)} GB · {fmtNum(r.bandwidth_gbs, 0)} GB/s · {r.system_ram_gb} GB RAM</p>
              </div>
              <Link to={`/calculator?profile=${r.id}`} className="text-xs text-copper">Use</Link>
              <button onClick={() => remove(r.id)} className="text-mist hover:text-rose" aria-label="Delete"><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
