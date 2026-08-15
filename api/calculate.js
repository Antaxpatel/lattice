import supabase from './db-client.js';

const GGUF = [
  { family: 'GGUF', name: 'Q2_K', bpw: 2.63, quality: 58, quality_label: 'Emergency', backend: 'llama.cpp / Ollama', notes: 'Last-resort fit. Expect noticeable degradation, especially on reasoning.' },
  { family: 'GGUF', name: 'Q3_K_S', bpw: 3.50, quality: 70, quality_label: 'Low', backend: 'llama.cpp / Ollama', notes: 'Usable for chat; weak on code and long-form fidelity.' },
  { family: 'GGUF', name: 'Q3_K_M', bpw: 3.91, quality: 76, quality_label: 'Fair', backend: 'llama.cpp / Ollama', notes: 'Minimum I would actually ship for a 70B-class model.' },
  { family: 'GGUF', name: 'Q4_K_S', bpw: 4.58, quality: 84, quality_label: 'Good', backend: 'llama.cpp / Ollama', notes: 'Lean 4-bit. Good when VRAM is tight.' },
  { family: 'GGUF', name: 'Q4_K_M', bpw: 4.85, quality: 88, quality_label: 'Sweet spot', backend: 'llama.cpp / Ollama', notes: 'Default recommendation for local inference.' },
  { family: 'GGUF', name: 'Q5_K_S', bpw: 5.32, quality: 91, quality_label: 'High', backend: 'llama.cpp / Ollama', notes: 'Diminishing returns vs Q4_K_M; nicer on small models.' },
  { family: 'GGUF', name: 'Q5_K_M', bpw: 5.69, quality: 93, quality_label: 'High', backend: 'llama.cpp / Ollama', notes: 'Near-transparent for most instruction models.' },
  { family: 'GGUF', name: 'Q6_K', bpw: 6.59, quality: 96, quality_label: 'Excellent', backend: 'llama.cpp / Ollama', notes: 'Very close to source. Preferred if VRAM allows.' },
  { family: 'GGUF', name: 'Q8_0', bpw: 8.50, quality: 98, quality_label: 'Near-lossless', backend: 'llama.cpp / Ollama', notes: 'Overkill unless you are evaluating or serving high-stakes work.' },
  { family: 'GGUF', name: 'F16', bpw: 16.0, quality: 100, quality_label: 'Source', backend: 'llama.cpp / vLLM / Transformers', notes: 'Native weights. Rarely worth it on consumer GPUs.' },
];

const EXL2 = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 8.0].map((bpw) => {
  const quality = Math.min(99, Math.round(50 + bpw * 6.2));
  let label = 'Low';
  if (bpw >= 6) label = 'Excellent';
  else if (bpw >= 5) label = 'High';
  else if (bpw >= 4) label = 'Sweet spot';
  else if (bpw >= 3) label = 'Fair';
  return {
    family: 'EXL2',
    name: `EXL2 ${bpw.toFixed(1)}`,
    bpw,
    quality,
    quality_label: label,
    backend: 'ExLlamaV2 / tabbyAPI',
    notes: bpw === 4.5
      ? 'Best TPS-per-VRAM on NVIDIA for 4-bit-class quality.'
      : 'EXL2 uses GPTQ-style grouping; decode is typically faster than GGUF on NVIDIA.',
  };
});

const KV_BYTES = { fp16: 2, q8: 1, q4: 0.5 };

function num(v, d = 0) {
  const x = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(x) ? x : d;
}

function pcieBandwidth(gen, lanes) {
  const perLane = { 3: 0.985, 4: 1.969, 5: 3.938, 6: 7.877 };
  const g = perLane[gen] || perLane[4];
  return Number((g * lanes * 0.8).toFixed(2));
}

function kvCacheGb(model, seq, batch, kvDtype) {
  const layers = num(model.num_layers);
  const kvHeads = num(model.num_kv_heads) || num(model.num_attention_heads) || 8;
  let headDim = num(model.head_dim);
  if (!headDim) {
    const hidden = num(model.hidden_size);
    const heads = num(model.num_attention_heads) || 1;
    headDim = heads ? hidden / heads : 128;
  }
  const bytes = KV_BYTES[kvDtype] || 2;
  let factor = 1;
  const arch = String(model.architecture || '').toLowerCase();
  if (/deepseek|mla/.test(arch)) factor = 0.28;
  const gb = (2 * layers * kvHeads * headDim * seq * batch * bytes * factor) / 1e9;
  const perTokenMb = layers && kvHeads && headDim
    ? (2 * layers * kvHeads * headDim * bytes * factor) / 1e6
    : 0;
  return { gb, perTokenMb, bytes };
}

function overheadGb(model, batch, seq, gpuCount) {
  const hidden = num(model.hidden_size, 4096);
  const cuda = 0.7 + 0.18 * Math.max(1, gpuCount);
  const activations = (batch * Math.min(seq, 4096) * hidden * 2 * 3) / 1e9;
  const runtime = 0.35;
  return cuda + Math.min(activations, 4.5) + runtime;
}

function tpsFor(model, hw, quant, kv, settings) {
  const activeB = num(model.active_params_b) || num(model.total_params_b);
  const totalB = num(model.total_params_b);
  const weightGb = totalB * (quant.bpw / 8);
  const usable = hw.usableVram;
  const offloadGb = Math.max(0, weightGb + kv.gb + hw.overhead - usable);
  const resident = Math.max(0, weightGb - Math.max(0, weightGb - Math.max(0, usable - kv.gb - hw.overhead)));

  const activeBytes = activeB * 1e9 * (quant.bpw / 8);
  const kvRead = kv.gb * 1e9 * 0.55;
  const gpuBw = hw.bandwidth * 1e9 * Math.max(1, hw.gpuCount);
  const pcieBw = hw.pcieGbs * 1e9;

  let util = quant.family === 'EXL2' ? 0.72 : 0.58;
  if (model.is_moe) util *= 0.9;
  if (hw.gpuCount > 1) util *= hw.gpuCount >= 4 ? 0.78 : 0.86;
  if (offloadGb > 0.25) util *= 0.72;

  const gpuFrac = weightGb <= 0 ? 1 : Math.min(1, resident / weightGb);
  const cpuFrac = 1 - gpuFrac;
  const bytesPerTok = activeBytes + kvRead;
  const time =
    (bytesPerTok * gpuFrac) / Math.max(gpuBw, 1) +
    (bytesPerTok * cpuFrac) / Math.max(pcieBw, 1e7);
  const decode = (1 / Math.max(time, 1e-9)) * util;

  const prefillUtil = quant.family === 'EXL2' ? 0.42 : 0.32;
  const flopLimit = (hw.fp16Tflops * 1e12 * prefillUtil) / (2 * activeB * 1e9);
  const bwLimit = decode * (settings.batch || 1) * 6;
  const prefill = Math.min(flopLimit || bwLimit, bwLimit);

  return {
    tps: Number(Math.max(0.05, decode).toFixed(2)),
    tpsPrefill: Number(Math.max(1, prefill).toFixed(1)),
    weightGb: Number(weightGb.toFixed(2)),
    offloadGb: Number(offloadGb.toFixed(2)),
    residentGb: Number(resident.toFixed(2)),
  };
}

function gpusNeeded(totalGb, vramEach) {
  if (vramEach <= 0) return 99;
  return Math.max(1, Math.ceil(totalGb / (vramEach * 0.95)));
}

function buildResult(model, input) {
  const gpuCount = Math.max(1, Math.min(16, num(input.gpu_count, 1)));
  const vram = num(input.vram_gb);
  const bandwidth = num(input.bandwidth_gbs);
  const pcieGen = num(input.pcie_gen, 4);
  const pcieLanes = num(input.pcie_lanes, 16);
  const systemRam = num(input.system_ram_gb, 64);
  const context = Math.max(256, Math.min(1048576, num(input.context_length, 8192)));
  const batch = Math.max(1, Math.min(128, num(input.batch_size, 1)));
  const kvDtype = ['fp16', 'q8', 'q4'].includes(input.kv_dtype) ? input.kv_dtype : 'fp16';
  const gpuName = input.gpu_name || 'Custom GPU';

  const pcieGbs = pcieBandwidth(pcieGen, pcieLanes);
  const overhead = overheadGb(model, batch, context, gpuCount);
  const usable = vram * gpuCount * 0.96;
  const kv = kvCacheGb(model, context, batch, kvDtype);
  const hw = {
    bandwidth,
    gpuCount,
    pcieGbs,
    usableVram: usable,
    overhead,
    fp16Tflops: num(input.fp16_tflops, bandwidth * 0.16),
  };

  const warnings = [];
  if (!num(model.num_layers) || !num(model.hidden_size)) {
    warnings.push('Architecture fields are incomplete. KV-cache size is estimated and may be off for exotic models.');
  }
  if (context > num(model.context_length) && num(model.context_length) > 0) {
    warnings.push(`Requested context (${context}) exceeds the model card window (${model.context_length}). Quality and RoPE scaling are on you.`);
  }
  if (model.is_moe && kvDtype === 'fp16') {
    warnings.push('MoE decode is bound by active experts, not total weights. TPS looks better than the parameter count suggests.');
  }
  if (vram < 8) warnings.push('Under 8 GB VRAM you will live in aggressive quant + offload territory.');

  const allSpecs = [...GGUF, ...EXL2];
  const quants = allSpecs.map((q) => {
    const perf = tpsFor(model, hw, q, kv, { batch });
    const totalGb = Number((perf.weightGb + kv.gb + overhead).toFixed(2));
    const need = gpusNeeded(totalGb, vram);
    const fits = totalGb <= usable && need <= gpuCount;
    return {
      family: q.family,
      name: q.name,
      bpw: q.bpw,
      quality: q.quality,
      quality_label: q.quality_label,
      weight_gb: perf.weightGb,
      kv_gb: Number(kv.gb.toFixed(3)),
      overhead_gb: Number(overhead.toFixed(2)),
      total_gb: totalGb,
      fits,
      gpus_needed: need,
      offload_gb: perf.offloadGb,
      tps: perf.tps,
      tps_prefill: perf.tpsPrefill,
      backend: q.backend,
      notes: q.notes,
    };
  });

  const fitting = quants.filter((q) => q.fits).sort((a, b) => b.quality - a.quality);
  const ggufFit = fitting.filter((q) => q.family === 'GGUF');
  const exlFit = fitting.filter((q) => q.family === 'EXL2');
  const pick =
    ggufFit.find((q) => q.name === 'Q4_K_M') ||
    ggufFit.find((q) => q.name === 'Q5_K_M') ||
    ggufFit[0] ||
    exlFit[0] ||
    quants.find((q) => q.name === 'Q4_K_M') ||
    quants[0];

  const configs = [];

  if (ggufFit.length) {
    const best = ggufFit[0];
    const sweet = ggufFit.find((q) => q.name === 'Q4_K_M') || ggufFit.find((q) => q.bpw >= 4 && q.bpw <= 5.2) || best;
    const fast = [...ggufFit].sort((a, b) => b.tps - a.tps)[0];
    configs.push({
      id: 'daily',
      title: 'Daily driver',
      subtitle: 'Best local default',
      quant: sweet.name,
      backend: 'llama.cpp · Ollama · LM Studio',
      gpu_count: gpuCount,
      tps: sweet.tps,
      vram_used_gb: sweet.total_gb,
      quality: sweet.quality,
      fit: 'single',
      notes: [
        `${sweet.name} at ${context} ctx, batch ${batch}`,
        model.is_moe ? `MoE active ${model.active_params_b}B / total ${model.total_params_b}B` : `Dense ${model.total_params_b}B`,
        'Keep KV in VRAM. Flash-attn / llama.cpp graph offload stays on GPU.',
      ],
      command: `llama-cli -m ${String(model.name).toLowerCase()}-${sweet.name.toLowerCase()}.gguf -c ${context} -ngl 99`,
    });
    if (best.name !== sweet.name) {
      configs.push({
        id: 'quality',
        title: 'Quality first',
        subtitle: 'Highest quant that still fits',
        quant: best.name,
        backend: best.backend,
        gpu_count: gpuCount,
        tps: best.tps,
        vram_used_gb: best.total_gb,
        quality: best.quality,
        fit: 'single',
        notes: [`${best.name} · ${best.quality_label}`, best.notes],
        command: `llama-cli -m model-${best.name.toLowerCase()}.gguf -c ${context} -ngl 99`,
      });
    }
    if (fast && fast.name !== sweet.name) {
      configs.push({
        id: 'speed',
        title: 'Throughput',
        subtitle: 'Fastest fitting GGUF',
        quant: fast.name,
        backend: 'llama.cpp (server) / koboldcpp',
        gpu_count: gpuCount,
        tps: fast.tps,
        vram_used_gb: fast.total_gb,
        quality: fast.quality,
        fit: 'single',
        notes: [`~${fast.tps} tok/s decode`, 'Raise batch or parallel slots for multi-user.'],
        command: `llama-server -m model-${fast.name.toLowerCase()}.gguf -c ${context} -ngl 99 --parallel ${Math.max(2, batch)}`,
      });
    }
  }

  if (exlFit.length) {
    const ex = exlFit.find((q) => q.bpw >= 4 && q.bpw <= 5) || exlFit[0];
    configs.push({
      id: 'exl2',
      title: 'NVIDIA speed run',
      subtitle: 'ExLlamaV2 kernels',
      quant: ex.name,
      backend: 'tabbyAPI · ExLlamaV2 · text-generation-webui',
      gpu_count: gpuCount,
      tps: ex.tps,
      vram_used_gb: ex.total_gb,
      quality: ex.quality,
      fit: 'single',
      notes: [
        'EXL2 typically beats GGUF decode on Ada/Blackwell.',
        'Not ideal for Apple / AMD / CPU offload.',
      ],
      command: `tabbyAPI --model ${model.hf_id} --max-seq-len ${context} --gpu-split auto`,
    });
  }

  const q4 = quants.find((q) => q.name === 'Q4_K_M');
  if (q4 && !q4.fits) {
    const need = q4.gpus_needed;
    if (need > gpuCount && need <= 8) {
      const multiHw = { ...hw, gpuCount: need, usableVram: vram * need * 0.96 };
      const multiPerf = tpsFor(model, multiHw, GGUF.find((g) => g.name === 'Q4_K_M'), kv, { batch });
      configs.push({
        id: 'multi',
        title: `${need}-GPU tensor split`,
        subtitle: 'Stack VRAM until Q4_K_M fits',
        quant: 'Q4_K_M',
        backend: 'vLLM · llama.cpp tensor split · ExLlamaV2',
        gpu_count: need,
        tps: multiPerf.tps,
        vram_used_gb: q4.total_gb,
        quality: q4.quality,
        fit: 'multi',
        notes: [
          `Need ~${q4.total_gb} GB combined (weights + KV + overhead).`,
          gpuCount > 1 ? 'Consumer cards without NVLink pay a PCIe tax on TP.' : 'Add cards or move to a cloud A100/H100 node.',
        ],
        command: `llama-cli -m model-q4_k_m.gguf -c ${context} -ngl 99 -sm row -mg 0`,
      });
    }

    if (systemRam + usable > q4.total_gb) {
      const off = tpsFor(model, hw, GGUF.find((g) => g.name === 'Q4_K_M'), kv, { batch });
      configs.push({
        id: 'offload',
        title: 'CPU + GPU hybrid',
        subtitle: 'llama.cpp layer offload',
        quant: 'Q4_K_M',
        backend: 'llama.cpp (-ngl) / Ollama',
        gpu_count: gpuCount,
        tps: off.tps,
        vram_used_gb: usable,
        quality: q4.quality,
        fit: 'offload',
        notes: [
          `~${off.offloadGb} GB of weights spill to system RAM over PCIe ${pcieGen}.x${pcieLanes} (~${pcieGbs} GB/s).`,
          'TPS collapses to the PCIe/RAM bound. Fine for batch jobs, painful for chat.',
        ],
        command: `llama-cli -m model-q4_k_m.gguf -c ${context} -ngl 40`,
      });
    } else {
      configs.push({
        id: 'impossible',
        title: 'Will not fit',
        subtitle: 'Need more VRAM or RAM',
        quant: 'Q2_K',
        backend: '—',
        gpu_count: gpuCount,
        tps: 0,
        vram_used_gb: q4.total_gb,
        quality: 0,
        fit: 'impossible',
        notes: [
          `Q4_K_M wants ~${q4.total_gb} GB. This box has ${usable.toFixed(1)} GB usable VRAM and ${systemRam} GB RAM.`,
          'Drop context, switch to a smaller / more-sparse checkpoint, or rent a bigger node.',
        ],
        command: '# no viable local command at this quant',
      });
    }
  }

  if (!configs.length && pick) {
    configs.push({
      id: 'fallback',
      title: pick.fits ? 'Runnable' : 'Tight fit',
      subtitle: pick.family,
      quant: pick.name,
      backend: pick.backend,
      gpu_count: gpuCount,
      tps: pick.tps,
      vram_used_gb: pick.total_gb,
      quality: pick.quality,
      fit: pick.fits ? 'single' : 'offload',
      notes: [pick.notes],
      command: `llama-cli -m model.gguf -c ${context} -ngl 99`,
    });
  }

  const activationRatio = num(model.total_params_b)
    ? num(model.active_params_b) / num(model.total_params_b)
    : 1;

  return {
    model,
    hardware: {
      gpu_name: gpuName,
      vram_gb: vram,
      bandwidth_gbs: bandwidth,
      pcie_gen: pcieGen,
      pcie_lanes: pcieLanes,
      gpu_count: gpuCount,
      system_ram_gb: systemRam,
      pcie_gbs: pcieGbs,
      usable_vram_gb: Number(usable.toFixed(2)),
    },
    settings: { context_length: context, batch_size: batch, kv_dtype: kvDtype },
    recommended_quant: pick?.name || 'Q4_K_M',
    recommended_family: pick?.family || 'GGUF',
    fits: Boolean(pick?.fits),
    tps_estimate: pick?.tps || 0,
    vram_used_gb: pick?.total_gb || 0,
    quants,
    configs,
    moe: {
      is_moe: Boolean(model.is_moe),
      total_params_b: num(model.total_params_b),
      active_params_b: num(model.active_params_b),
      activation_ratio: Number(activationRatio.toFixed(4)),
      experts: num(model.num_experts),
      experts_per_tok: num(model.num_experts_per_tok),
      note: model.is_moe
        ? `Only ${num(model.active_params_b)}B of ${num(model.total_params_b)}B parameters fire per token. VRAM still has to hold every expert (unless you expert-offload). TPS follows the active path.`
        : 'Dense model: every parameter is touched on every decode step.',
    },
    kv: {
      bytes: kv.bytes,
      per_token_mb: Number(kv.perTokenMb.toFixed(4)),
      at_context_gb: Number(kv.gb.toFixed(3)),
      dtype: kvDtype,
    },
    warnings,
  };
}

async function getUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body || {};
    let model = null;

    if (body.model_id) {
      const { data, error } = await supabase.from('models').select('*').eq('id', body.model_id).maybeSingle();
      if (error) throw error;
      model = data;
    } else if (body.hf_id) {
      const { data } = await supabase.from('models').select('*').eq('hf_id', body.hf_id).maybeSingle();
      model = data;
    }

    if (!model) return res.status(400).json({ error: 'Unknown model. Look it up from Hugging Face first.' });
    if (!num(body.vram_gb) || !num(body.bandwidth_gbs)) {
      return res.status(400).json({ error: 'VRAM (GB) and memory bandwidth (GB/s) are required.' });
    }

    const result = buildResult(model, body);

    if (body.save) {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: 'Sign in to save calculations.' });
      const { data: saved, error } = await supabase
        .from('calculations')
        .insert({
          user_id: user.id,
          model_id: model.id,
          hf_id: model.hf_id,
          profile_id: body.profile_id || null,
          gpu_name: result.hardware.gpu_name,
          vram_gb: result.hardware.vram_gb,
          bandwidth_gbs: result.hardware.bandwidth_gbs,
          pcie_gen: result.hardware.pcie_gen,
          gpu_count: result.hardware.gpu_count,
          context_length: result.settings.context_length,
          batch_size: result.settings.batch_size,
          recommended_quant: result.recommended_quant,
          fits: result.fits,
          tps_estimate: result.tps_estimate,
          vram_used_gb: result.vram_used_gb,
          result_json: result,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ ...result, saved_id: saved.id });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
