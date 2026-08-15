export default function Guide() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14">
      <p className="mono text-[11px] tracking-[0.22em] uppercase text-copper">Methodology</p>
      <h1 className="display text-5xl mt-2 leading-tight">How Lattice estimates a box.</h1>
      <p className="text-mist mt-4 leading-relaxed">
        These are engineering first-order models, not a replacement for a bench. They exist so you stop buying a 24 GB card for a 70B Q8 and calling it a day.
      </p>

      <section className="mt-12">
        <h2 className="display text-3xl">Weights</h2>
        <p className="text-mist mt-3 leading-relaxed">
          Weight VRAM is <span className="text-paper mono text-sm">params_billion × (bits_per_weight / 8)</span> gigabytes.
          A 70B Q4_K_M (~4.85 bpw) is ~42.4 GB of weights before KV or CUDA. GGUF K-quants are not uniform 4.00-bit; we use measured average bpw, not the marketing integer.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="display text-3xl">Active vs total (MoE)</h2>
        <p className="text-mist mt-3 leading-relaxed">
          Mixture-of-Experts stores every expert on disk and, unless you expert-offload, in VRAM. Decode only streams the routed experts plus the shared attention / dense trunk.
          We estimate active parameters as:
        </p>
        <pre className="mt-4 bg-ink-2 hairline rounded-xl p-4 text-xs text-copper-2 overflow-x-auto mono">{`active ≈ total × ( (1 − ffn_frac) + ffn_frac × (k / N) )`}</pre>
        <p className="text-mist mt-3 leading-relaxed">
          where <em>N</em> is routed experts, <em>k</em> is experts per token, and <em>ffn_frac ≈ 0.67</em>. DeepSeek-style MLA shrinks the KV term separately. Hugging Face <code className="text-paper">config.json</code> wins when present; name heuristics (8x7B, A3B) are the fallback.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="display text-3xl">KV cache</h2>
        <p className="text-mist mt-3 leading-relaxed">
          <span className="text-paper mono text-sm">2 × layers × kv_heads × head_dim × seq × batch × bytes</span>.
          GQA (Llama 3, Qwen2) keeps kv_heads ≪ query heads, which is why a 70B at 8k is only a couple of gigabytes of KV in fp16.
          Q8 / Q4 KV is a real lever when context is the thing that blows the card, not the weights.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="display text-3xl">Tokens per second</h2>
        <p className="text-mist mt-3 leading-relaxed">
          Autoregressive decode is memory-bound. Bytes moved per token ≈ active weights + a fraction of the resident KV. Divide published HBM bandwidth by that, then apply a kernel factor (~0.58 llama.cpp, ~0.72 EXL2, a bit worse for MoE routing and multi-GPU without NVLink).
        </p>
        <p className="text-mist mt-3 leading-relaxed">
          If weights spill, the spilled fraction is clocked at practical PCIe bandwidth (Gen3/4/5 × lanes × 0.8), not HBM. That is why a 70B Q4 half-offloaded on a 16 GB card feels like a slide projector.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="display text-3xl">Overhead</h2>
        <p className="text-mist mt-3 leading-relaxed">
          CUDA context, allocator slack, and decode activations. We add ~0.7–1.4 GB plus a small activation term. vLLM / TensorRT-LLM want more than llama.cpp. If a fit is within 0.5 GB, treat it as a maybe.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="display text-3xl">What we do not model</h2>
        <ul className="text-mist mt-3 space-y-2 text-sm leading-relaxed list-disc pl-5">
          <li>Speculative decoding, draft models, or lookup decoding.</li>
          <li>Prefix cache hits, paged attention fragmentation, or multi-user contention.</li>
          <li>Power / thermal throttling on laptop GPUs.</li>
          <li>Exact EXL2 measurement tables per checkpoint (we use nominal bpw).</li>
        </ul>
      </section>
    </div>
  );
}
