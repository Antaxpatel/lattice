import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Cpu, Gauge, Layers, Zap } from 'lucide-react';
import type { Gpu, ModelRow } from '../lib/types';
import { fmtNum, fmtParams, n } from '../lib/format';

export default function Home() {
  const [gpus, setGpus] = useState<Gpu[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const [g, m] = await Promise.all([fetch('/api/gpus'), fetch('/api/models')]);
        const gd = await g.json();
        const md = await m.json();
        if (Array.isArray(gd)) setGpus(gd);
        if (Array.isArray(md)) setModels(md);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const moe = models.filter((m) => m.is_moe).slice(0, 4);
  const featuredGpus = gpus.slice(0, 6);

  return (
    <div>
      <section className="relative overflow-hidden min-h-[88vh] flex items-end">
        <img src="/images/hero-rack.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/30" />
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 pb-20 pt-28 w-full">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mono text-[11px] tracking-[0.28em] uppercase text-copper-2 mb-5"
          >
            Local inference · Sparse MoE · GGUF / EXL2
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="display text-[3.1rem] sm:text-6xl lg:text-7xl leading-[0.95] max-w-4xl"
          >
            Will it run.<br />
            <span className="text-copper">At what quant.</span><br />
            At what speed.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="mt-6 max-w-xl text-mist text-base sm:text-lg leading-relaxed"
          >
            Paste any Hugging Face model. Pair it with your VRAM, memory bandwidth, and PCIe generation.
            Lattice splits active vs total parameters, sizes the KV cache, and names the quant that actually fits.
          </motion.p>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="mt-8 flex flex-wrap gap-3">
            <Link to="/calculator" className="inline-flex items-center gap-2 bg-copper text-ink px-5 py-2.5 rounded-full text-sm font-medium hover:bg-copper-2">
              Open the calculator <ArrowRight size={16} />
            </Link>
            <Link to="/guide" className="inline-flex items-center gap-2 border border-line px-5 py-2.5 rounded-full text-sm text-paper hover:border-copper/50">
              Read the method
            </Link>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-20">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Layers, t: 'Active vs total', d: 'Sparse MoE models advertise 671B and run like 37B. VRAM still stores every expert. Decode bandwidth only pays for the ones that fire.' },
            { icon: Gauge, t: 'First-order TPS', d: 'Tokens/sec from published HBM bandwidth, bytes moved per token, and a kernel utilization factor — not a marketing FLOP chart.' },
            { icon: Zap, t: 'Quant that fits', d: 'GGUF and EXL2 ladders, KV dtype, CUDA overhead, and honest offload / multi-GPU fallbacks when a single card cannot hold the weights.' },
          ].map((c) => (
            <div key={c.t} className="bg-ink-2 hairline rounded-2xl p-6">
              <c.icon className="text-copper mb-4" size={22} />
              <h3 className="display text-2xl">{c.t}</h3>
              <p className="text-mist text-sm mt-2 leading-relaxed">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative py-20">
        <img src="/images/gpu-pcb.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-ink/75" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex items-end justify-between gap-4 mb-8">
            <div>
              <p className="mono text-[11px] tracking-[0.22em] uppercase text-teal">Sparse architectures</p>
              <h2 className="display text-4xl mt-2">MoE is not a free lunch</h2>
            </div>
            <Link to="/models" className="text-sm text-copper hover:text-copper-2 hidden sm:inline">All models →</Link>
          </div>
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-40 rounded-2xl bg-panel animate-pulse" />)}</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {moe.map((m) => (
                <Link key={m.id} to={`/calculator?hf=${encodeURIComponent(m.hf_id)}`} className="bg-ink-2/90 hairline rounded-2xl p-5 hover:border-copper/40 transition">
                  <p className="text-[11px] mono text-mist truncate">{m.hf_id}</p>
                  <p className="display text-xl mt-1 leading-tight">{m.name}</p>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-2xl text-teal mono">{fmtParams(m.active_params_b)}</span>
                    <span className="text-mist text-xs">active</span>
                    <span className="text-mist text-xs ml-auto">{fmtParams(m.total_params_b)} stored</span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-line overflow-hidden">
                    <div className="h-full bg-teal" style={{ width: `${Math.max(6, Math.min(100, (n(m.active_params_b) / Math.max(n(m.total_params_b), 0.01)) * 100))}%` }} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="mono text-[11px] tracking-[0.22em] uppercase text-copper">Catalog</p>
            <h2 className="display text-4xl mt-2">Known silicon</h2>
          </div>
          <Link to="/gpus" className="text-sm text-copper hover:text-copper-2">Full library →</Link>
        </div>
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-panel animate-pulse" />)}</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featuredGpus.map((g) => (
              <Link key={g.id} to={`/calculator?gpu=${g.id}`} className="bg-panel hairline rounded-2xl p-5 flex items-start gap-4 hover:border-copper/40">
                <Cpu className="text-copper mt-0.5" size={18} />
                <div className="min-w-0">
                  <p className="font-medium truncate">{g.name}</p>
                  <p className="text-xs text-mist mt-1 mono">
                    {fmtNum(g.vram_gb, 0)} GB · {fmtNum(g.bandwidth_gbs, 0)} GB/s · PCIe {g.pcie_gen}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 pb-8">
        <div className="relative overflow-hidden rounded-3xl min-h-[320px] flex items-end">
          <img src="/images/datacenter.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/75 to-transparent" />
          <div className="relative p-8 sm:p-12 max-w-lg">
            <h2 className="display text-4xl">Stop guessing ngl.</h2>
            <p className="text-mist mt-3">Look up a checkpoint, pick a card, get a command line.</p>
            <Link to="/calculator" className="inline-flex mt-6 items-center gap-2 bg-paper text-ink px-5 py-2.5 rounded-full text-sm font-medium">
              Run a fit <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
