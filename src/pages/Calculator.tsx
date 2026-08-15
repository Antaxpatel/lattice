import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiGet, apiSend, authHeaders } from '../lib/api';
import type { CalcResult, Gpu, GpuProfile, ModelRow, QuantRow, SavedCalc } from '../lib/types';
import { fmtGb, fmtNum, fmtParams, fmtTps, n } from '../lib/format';
import { useAuth } from '../contexts/AuthContext';
import { AlertTriangle, Check, Loader2, Search } from 'lucide-react';

export default function Calculator() {
  const { user } = useAuth();
  const [params] = useSearchParams();

  const [gpus, setGpus] = useState<Gpu[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [profiles, setProfiles] = useState<GpuProfile[]>([]);
  const [boot, setBoot] = useState(true);
  const [bootError, setBootError] = useState('');

  const [hfInput, setHfInput] = useState('deepseek-ai/DeepSeek-V3');
  const [model, setModel] = useState<ModelRow | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState('');

  const [gpuId, setGpuId] = useState<string>('');
  const [gpuName, setGpuName] = useState('NVIDIA GeForce RTX 4090');
  const [vram, setVram] = useState(24);
  const [bw, setBw] = useState(1008);
  const [pcieGen, setPcieGen] = useState(4);
  const [pcieLanes, setPcieLanes] = useState(16);
  const [gpuCount, setGpuCount] = useState(1);
  const [ram, setRam] = useState(64);
  const [fp16, setFp16] = useState(82.6);
  const [profileId, setProfileId] = useState<number | null>(null);

  const [ctx, setCtx] = useState(8192);
  const [batch, setBatch] = useState(1);
  const [kvDtype, setKvDtype] = useState('fp16');
  const [family, setFamily] = useState<'all' | 'GGUF' | 'EXL2'>('all');

  const [result, setResult] = useState<CalcResult | null>(null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [calcError, setCalcError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    const run = async () => {
      try {
        const [gRes, mRes] = await Promise.all([fetch('/api/gpus'), fetch('/api/models')]);
        const g = await gRes.json();
        const m = await mRes.json();
        if (!gRes.ok) throw new Error(g.error || 'Failed to load GPUs');
        if (!mRes.ok) throw new Error(m.error || 'Failed to load models');
        const gpuList: Gpu[] = Array.isArray(g) ? g : [];
        const modelList: ModelRow[] = Array.isArray(m) ? m : [];
        setGpus(gpuList);
        setModels(modelList);

        if (user) {
          try {
            const p = await apiGet<GpuProfile[]>('/api/profiles', true);
            setProfiles(Array.isArray(p) ? p : []);
          } catch {
            /* optional */
          }
        }

        const hfQ = params.get('hf');
        const gpuQ = params.get('gpu');
        const profileQ = params.get('profile');
        const savedQ = params.get('saved');

        if (hfQ) {
          setHfInput(hfQ);
          const found = modelList.find((x) => x.hf_id === hfQ);
          if (found) setModel(found);
        } else {
          const pref = modelList.find((x) => x.hf_id === 'deepseek-ai/DeepSeek-V3') || modelList[0];
          if (pref) {
            setModel(pref);
            setHfInput(pref.hf_id);
          }
        }

        if (gpuQ) {
          const gFound = gpuList.find((x) => String(x.id) === gpuQ);
          if (gFound) applyGpu(gFound);
        } else {
          const def = gpuList.find((x) => /RTX 4090$/.test(x.name)) || gpuList[0];
          if (def) applyGpu(def);
        }

        if (profileQ && user) {
          try {
            const p = await apiGet<GpuProfile[]>('/api/profiles', true);
            const hit = (Array.isArray(p) ? p : []).find((x) => String(x.id) === profileQ);
            if (hit) applyProfile(hit);
          } catch { /* ignore */ }
        }

        if (savedQ && user) {
          try {
            const rows = await apiGet<SavedCalc[]>('/api/calculations', true);
            const hit = (Array.isArray(rows) ? rows : []).find((x) => String(x.id) === savedQ);
            if (hit) {
              setHfInput(hit.hf_id);
              setGpuName(hit.gpu_name);
              setVram(n(hit.vram_gb));
              setBw(n(hit.bandwidth_gbs));
              setPcieGen(n(hit.pcie_gen, 4));
              setGpuCount(n(hit.gpu_count, 1));
              setCtx(n(hit.context_length, 8192));
              setBatch(n(hit.batch_size, 1));
              const found = modelList.find((x) => x.hf_id === hit.hf_id);
              if (found) setModel(found);
              if (hit.result_json?.quants?.length) setResult(hit.result_json);
            }
          } catch { /* ignore */ }
        }
      } catch (e: unknown) {
        setBootError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setBoot(false);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function applyGpu(g: Gpu) {
    setGpuId(String(g.id));
    setGpuName(g.name);
    setVram(n(g.vram_gb));
    setBw(n(g.bandwidth_gbs));
    setPcieGen(n(g.pcie_gen, 4));
    setPcieLanes(n(g.pcie_lanes, 16));
    setFp16(n(g.fp16_tflops, 80));
  }

  function applyProfile(p: GpuProfile) {
    setProfileId(p.id);
    setGpuName(p.gpu_name);
    setVram(n(p.vram_gb));
    setBw(n(p.bandwidth_gbs));
    setPcieGen(n(p.pcie_gen, 4));
    setPcieLanes(n(p.pcie_lanes, 16));
    setGpuCount(n(p.gpu_count, 1));
    setRam(n(p.system_ram_gb, 64));
    if (p.gpu_id) setGpuId(String(p.gpu_id));
  }

  const lookup = async (id?: string) => {
    const target = (id || hfInput).trim();
    setLookupError('');
    if (!target) {
      setLookupError('Paste a Hugging Face repo id or URL.');
      return;
    }
    setLookupBusy(true);
    try {
      const data = await apiSend<ModelRow>('/api/models', 'POST', { hf_id: target });
      setModel(data);
      setHfInput(data.hf_id);
      setModels((prev) => {
        const rest = prev.filter((m) => m.hf_id !== data.hf_id);
        return [data, ...rest];
      });
    } catch (e: unknown) {
      setLookupError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLookupBusy(false);
    }
  };

  const calculate = async (e?: FormEvent, save = false) => {
    e?.preventDefault();
    setCalcError('');
    setSaveMsg('');
    if (!model) {
      setCalcError('Look up a model first.');
      return;
    }
    if (vram <= 0 || bw <= 0) {
      setCalcError('VRAM and bandwidth must be greater than zero.');
      return;
    }
    if (ctx < 256 || ctx > 1048576) {
      setCalcError('Context must be between 256 and 1,048,576 tokens.');
      return;
    }
    setCalcBusy(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/calculate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model_id: model.id,
          hf_id: model.hf_id,
          gpu_name: gpuName,
          vram_gb: vram,
          bandwidth_gbs: bw,
          pcie_gen: pcieGen,
          pcie_lanes: pcieLanes,
          gpu_count: gpuCount,
          system_ram_gb: ram,
          fp16_tflops: fp16,
          context_length: ctx,
          batch_size: batch,
          kv_dtype: kvDtype,
          profile_id: profileId,
          save: save && Boolean(user),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Calculation failed');
      setResult(data);
      if (save) setSaveMsg(user ? 'Saved to your history.' : 'Sign in to save runs.');
    } catch (err: unknown) {
      setCalcError(err instanceof Error ? err.message : 'Calculation failed');
    } finally {
      setCalcBusy(false);
    }
  };

  const popular = models.slice(0, 8);
  const quants = useMemo(() => {
    if (!result) return [];
    return result.quants.filter((q) => family === 'all' || q.family === family);
  }, [result, family]);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
      <div className="max-w-2xl">
        <p className="mono text-[11px] tracking-[0.22em] uppercase text-copper">Fit engine</p>
        <h1 className="display text-4xl sm:text-5xl mt-1">Hardware & quantization</h1>
        <p className="text-mist mt-2 text-sm leading-relaxed">
          Resolve a Hugging Face checkpoint, describe the box, get VRAM, tokens/sec, and a command that is not cargo-cult <span className="mono">-ngl 99</span>.
        </p>
      </div>

      {bootError && <p className="mt-4 text-rose text-sm">{bootError}</p>}
      {boot ? (
        <div className="mt-10 grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 h-[480px] rounded-2xl bg-panel animate-pulse" />
          <div className="lg:col-span-7 h-[480px] rounded-2xl bg-panel animate-pulse" />
        </div>
      ) : (
        <div className="mt-8 grid lg:grid-cols-12 gap-6 items-start">
          <form onSubmit={(e) => calculate(e, false)} className="lg:col-span-5 space-y-5">
            <section className="bg-ink-2 hairline rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">1 · Model</h2>
                {model?.is_moe && <span className="text-[10px] uppercase tracking-wider text-teal">MoE</span>}
              </div>
              <div className="mt-3 flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mist" />
                  <input
                    value={hfInput}
                    onChange={(e) => setHfInput(e.target.value)}
                    placeholder="org/model or huggingface.co/…"
                    className="w-full bg-ink hairline rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-copper/50"
                  />
                </div>
                <button type="button" onClick={() => lookup()} disabled={lookupBusy} className="px-3 rounded-xl bg-panel hairline text-sm disabled:opacity-50">
                  {lookupBusy ? <Loader2 size={14} className="animate-spin" /> : 'Fetch'}
                </button>
              </div>
              {lookupError && <p className="text-rose text-xs mt-2">{lookupError}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {popular.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setHfInput(m.hf_id); setModel(m); }}
                    className={`text-[11px] px-2.5 py-1 rounded-full ${model?.id === m.id ? 'bg-copper text-ink' : 'bg-ink text-mist hairline'}`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
              {model && (
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <Stat k="Stored" v={fmtParams(model.total_params_b)} />
                  <Stat k="Active / tok" v={fmtParams(model.active_params_b)} accent={model.is_moe} />
                  <Stat k="Layers" v={String(model.num_layers)} />
                  <Stat k="KV / Q heads" v={`${model.num_kv_heads}/${model.num_attention_heads}`} />
                  <Stat k="Hidden" v={fmtNum(model.hidden_size, 0)} />
                  <Stat k="Train ctx" v={fmtNum(model.context_length, 0)} />
                  {model.is_moe && (
                    <div className="col-span-2 text-[11px] text-mist leading-relaxed">
                      {model.num_experts} experts, top-{model.num_experts_per_tok}. VRAM holds the herd; bandwidth only pays the ones that fire.
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="bg-ink-2 hairline rounded-2xl p-5">
              <h2 className="text-sm font-medium">2 · Hardware</h2>
              {profiles.length > 0 && (
                <label className="block text-xs text-mist mt-3">Saved rig
                  <select
                    value={profileId ?? ''}
                    onChange={(e) => {
                      const p = profiles.find((x) => String(x.id) === e.target.value);
                      if (p) applyProfile(p);
                      else setProfileId(null);
                    }}
                    className="mt-1 w-full bg-ink hairline rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="">None</option>
                    {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              )}
              <label className="block text-xs text-mist mt-3">Catalog GPU
                <select
                  value={gpuId}
                  onChange={(e) => {
                    const g = gpus.find((x) => String(x.id) === e.target.value);
                    if (g) applyGpu(g);
                    else setGpuId('');
                  }}
                  className="mt-1 w-full bg-ink hairline rounded-xl px-3 py-2 text-sm"
                >
                  <option value="">Custom specs</option>
                  {gpus.map((g) => <option key={g.id} value={g.id}>{g.name} · {fmtNum(g.vram_gb, 0)} GB</option>)}
                </select>
              </label>
              <label className="block text-xs text-mist mt-3">Label
                <input value={gpuName} onChange={(e) => setGpuName(e.target.value)} className="mt-1 w-full bg-ink hairline rounded-xl px-3 py-2 text-sm" />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Num label="VRAM GB" value={vram} set={setVram} min={4} max={192} />
                <Num label="Bandwidth GB/s" value={bw} set={setBw} min={100} max={20000} />
                <Num label="PCIe gen" value={pcieGen} set={setPcieGen} min={3} max={5} />
                <Num label="PCIe lanes" value={pcieLanes} set={setPcieLanes} min={4} max={16} />
                <Num label="GPU count" value={gpuCount} set={setGpuCount} min={1} max={8} />
                <Num label="System RAM GB" value={ram} set={setRam} min={8} max={2048} />
              </div>
            </section>

            <section className="bg-ink-2 hairline rounded-2xl p-5">
              <h2 className="text-sm font-medium">3 · Workload</h2>
              <label className="block text-xs text-mist mt-3">
                Context {fmtNum(ctx, 0)} tokens
                <input type="range" min={1024} max={131072} step={1024} value={Math.min(ctx, 131072)} onChange={(e) => setCtx(Number(e.target.value))} className="w-full mt-2 accent-copper" />
              </label>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Num label="Context (exact)" value={ctx} set={setCtx} min={256} max={1048576} />
                <Num label="Batch / slots" value={batch} set={setBatch} min={1} max={64} />
              </div>
              <label className="block text-xs text-mist mt-3">KV cache dtype
                <select value={kvDtype} onChange={(e) => setKvDtype(e.target.value)} className="mt-1 w-full bg-ink hairline rounded-xl px-3 py-2 text-sm">
                  <option value="fp16">fp16 / bf16</option>
                  <option value="q8">Q8 KV</option>
                  <option value="q4">Q4 KV</option>
                </select>
              </label>
            </section>

            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={calcBusy} className="flex-1 min-w-[140px] bg-copper text-ink rounded-full py-2.5 text-sm font-medium disabled:opacity-50">
                {calcBusy ? 'Computing…' : 'Calculate fit'}
              </button>
              <button type="button" onClick={() => calculate(undefined, true)} disabled={calcBusy} className="px-5 py-2.5 rounded-full hairline text-sm disabled:opacity-50">
                Save run
              </button>
            </div>
            {calcError && <p className="text-rose text-sm">{calcError}</p>}
            {saveMsg && <p className="text-ok text-sm">{saveMsg}</p>}
          </form>

          <div className="lg:col-span-7 lg:sticky lg:top-20">
            {!result ? (
              <EmptyState />
            ) : (
              <Results result={result} quants={quants} family={family} setFamily={setFamily} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Num({ label, value, set, min, max }: { label: string; value: number; set: (n: number) => void; min: number; max: number }) {
  return (
    <label className="text-xs text-mist">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        className="mt-1 w-full bg-ink hairline rounded-xl px-3 py-2 text-sm"
      />
    </label>
  );
}

function Stat({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="bg-ink rounded-xl px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-mist">{k}</p>
      <p className={`mono text-sm mt-0.5 ${accent ? 'text-teal' : ''}`}>{v}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="relative overflow-hidden rounded-2xl min-h-[420px] hairline">
      <img src="/images/gpu-fans.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-35" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/30" />
      <div className="relative p-8 flex flex-col justify-end h-full min-h-[420px]">
        <p className="display text-3xl">Results land here.</p>
        <p className="text-mist text-sm mt-2 max-w-sm">Fetch a model, confirm the box, hit calculate. We will tell you if Q4_K_M is a fantasy.</p>
      </div>
    </div>
  );
}

function Results({
  result, quants, family, setFamily,
}: {
  result: CalcResult;
  quants: QuantRow[];
  family: 'all' | 'GGUF' | 'EXL2';
  setFamily: (f: 'all' | 'GGUF' | 'EXL2') => void;
}) {
  const rec = result.quants.find((q) => q.name === result.recommended_quant);
  const maxTps = Math.max(...result.quants.map((q) => q.tps), 1);
  const usable = result.hardware.usable_vram_gb;

  return (
    <div className="space-y-4">
      <div className="bg-ink-2 hairline rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] mono text-mist">{result.model.hf_id}</p>
            <p className="display text-3xl mt-1">{result.recommended_quant}</p>
            <p className="text-sm text-mist mt-1">{result.recommended_family} · {result.hardware.gpu_name} ×{result.hardware.gpu_count}</p>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full ${result.fits ? 'bg-teal-dim/40 text-ok' : 'bg-rose/15 text-rose'}`}>
            {result.fits ? 'Fits in VRAM' : 'Needs offload / more GPUs'}
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <HeroStat label="Decode" value={fmtTps(result.tps_estimate)} />
          <HeroStat label="Used" value={fmtGb(result.vram_used_gb)} />
          <HeroStat label="Usable VRAM" value={fmtGb(usable)} />
          <HeroStat label="KV @ ctx" value={fmtGb(result.kv.at_context_gb, 2)} />
        </div>
        {rec && (
          <div className="mt-4">
            <div className="flex justify-between text-[11px] text-mist mb-1">
              <span>VRAM budget</span>
              <span className="mono">{fmtGb(rec.total_gb)} / {fmtGb(usable)}</span>
            </div>
            <div className="h-2 rounded-full bg-ink overflow-hidden flex">
              <div className="bg-copper" style={{ width: `${Math.min(100, (rec.weight_gb / usable) * 100)}%` }} />
              <div className="bg-teal" style={{ width: `${Math.min(100 - (rec.weight_gb / usable) * 100, (rec.kv_gb / usable) * 100)}%` }} />
              <div className="bg-mist/40" style={{ width: `${Math.min(20, (rec.overhead_gb / usable) * 100)}%` }} />
            </div>
            <p className="text-[10px] text-mist mt-1.5">Copper weights · teal KV · grey overhead</p>
          </div>
        )}
      </div>

      {result.moe.is_moe && (
        <div className="bg-ink-2 hairline rounded-2xl p-5">
          <p className="text-xs uppercase tracking-wider text-teal">Sparse MoE</p>
          <p className="text-sm text-mist mt-2 leading-relaxed">{result.moe.note}</p>
          <div className="mt-3 h-2 rounded-full bg-ink overflow-hidden">
            <div className="h-full bg-teal" style={{ width: `${Math.max(4, result.moe.activation_ratio * 100)}%` }} />
          </div>
          <p className="mono text-[11px] text-mist mt-2">
            {fmtParams(result.moe.active_params_b)} active · {fmtParams(result.moe.total_params_b)} stored · {(result.moe.activation_ratio * 100).toFixed(1)}%
          </p>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="bg-copper/10 border border-copper/30 rounded-2xl p-4 text-sm text-copper-2 space-y-1">
          {result.warnings.map((w) => (
            <p key={w} className="flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{w}</p>
          ))}
        </div>
      )}

      <div>
        <p className="text-xs uppercase tracking-wider text-mist mb-2">Recommended stacks</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {result.configs.map((c) => (
            <article key={c.id} className="bg-ink-2 hairline rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-[11px] text-mist">{c.subtitle}</p>
                </div>
                <span className="mono text-xs text-copper">{c.quant}</span>
              </div>
              <p className="mono text-lg mt-2">{fmtTps(c.tps)}</p>
              <p className="text-[11px] text-mist">{c.backend} · {fmtGb(c.vram_used_gb)}</p>
              <ul className="mt-2 space-y-1">
                {c.notes.map((n) => <li key={n} className="text-[11px] text-mist flex gap-1.5"><Check size={12} className="text-teal shrink-0 mt-0.5" />{n}</li>)}
              </ul>
              <pre className="mt-3 bg-ink rounded-lg px-2.5 py-2 text-[10px] text-copper-2 overflow-x-auto mono">{c.command}</pre>
            </article>
          ))}
        </div>
      </div>

      <div className="bg-ink-2 hairline rounded-2xl overflow-hidden">
        <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-line">
          <p className="text-sm font-medium mr-auto">Quant ladder</p>
          {(['all', 'GGUF', 'EXL2'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFamily(f)} className={`text-[11px] px-2.5 py-1 rounded-full ${family === f ? 'bg-copper text-ink' : 'text-mist hairline'}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-xs min-w-[640px]">
            <thead className="text-[10px] uppercase tracking-wider text-mist">
              <tr>
                <th className="text-left font-normal px-3 py-2">Quant</th>
                <th className="text-left font-normal px-3 py-2">bpw</th>
                <th className="text-left font-normal px-3 py-2">VRAM</th>
                <th className="text-left font-normal px-3 py-2">TPS</th>
                <th className="text-left font-normal px-3 py-2">Fit</th>
              </tr>
            </thead>
            <tbody>
              {quants.map((q) => (
                <tr key={`${q.family}-${q.name}`} className={`border-t border-line ${q.name === result.recommended_quant ? 'bg-copper/5' : ''}`}>
                  <td className="px-3 py-2">
                    <p className="text-paper">{q.name}</p>
                    <p className="text-[10px] text-mist">{q.quality_label} · {q.family}</p>
                  </td>
                  <td className="px-3 py-2 mono">{q.bpw.toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-ink overflow-hidden max-w-[90px]">
                        <div className={q.fits ? 'bg-teal h-full' : 'bg-rose h-full'} style={{ width: `${Math.min(100, (q.total_gb / usable) * 100)}%` }} />
                      </div>
                      <span className="mono">{fmtGb(q.total_gb, 1)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-ink overflow-hidden max-w-[90px]">
                        <div className="bg-copper h-full" style={{ width: `${(q.tps / maxTps) * 100}%` }} />
                      </div>
                      <span className="mono">{fmtTps(q.tps)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {q.fits ? <span className="text-ok">Yes</span> : <span className="text-rose">+{fmtGb(q.offload_gb, 1)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink rounded-xl px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-mist">{label}</p>
      <p className="mono text-sm mt-0.5">{value}</p>
    </div>
  );
}
