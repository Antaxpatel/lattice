import supabase from './db-client.js';

function parseHfId(input) {
  if (!input || typeof input !== 'string') return '';
  let cleaned = input.trim().replace(/\/$/, '');
  cleaned = cleaned.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (cleaned.startsWith('huggingface.co/')) {
    cleaned = cleaned.slice('huggingface.co/'.length);
  }
  cleaned = cleaned.replace(/\/(tree|blob|resolve|raw)\/.+$/i, '');
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  return parts[0] || '';
}

function estimateFromName(id) {
  const lower = (id || '').toLowerCase();
  const moe = lower.match(/(\d+)x(\d+(?:\.\d+)?)b/);
  if (moe) {
    const experts = parseFloat(moe[1]);
    const each = parseFloat(moe[2]);
    const total = experts * each * 0.83;
    const active = each * 1.85;
    return { total, active, experts, expertsPerTok: 2 };
  }
  const activeM = lower.match(/a(\d+(?:\.\d+)?)b/);
  const totalM = lower.match(/(\d+(?:\.\d+)?)b/);
  const total = totalM ? parseFloat(totalM[1]) : 0;
  const active = activeM ? parseFloat(activeM[1]) : total;
  return { total, active, experts: 0, expertsPerTok: 0 };
}

function extractArch(config, card, hfId) {
  const cfg = config || {};
  const arch = String(cfg.architectures?.[0] || cfg.model_type || card?.pipeline_tag || 'unknown');
  const hidden = Number(cfg.hidden_size || cfg.d_model || 0);
  const layers = Number(cfg.num_hidden_layers || cfg.n_layer || cfg.num_layers || 0);
  const heads = Number(cfg.num_attention_heads || cfg.n_head || 0);
  const kvHeads = Number(cfg.num_key_value_heads || cfg.num_kv_heads || heads || 0);
  const headDim = Number(cfg.head_dim || (heads && hidden ? Math.floor(hidden / heads) : 0));
  const intermediate = Number(cfg.intermediate_size || cfg.ffn_dim || cfg.d_ff || 0);
  const vocab = Number(cfg.vocab_size || 0);
  const ctx = Number(
    cfg.max_position_embeddings || cfg.max_seq_len || cfg.seq_length || cfg.model_max_length || 4096
  );
  const numExperts = Number(
    cfg.num_local_experts || cfg.num_experts || cfg.n_routed_experts || cfg.moe_num_experts || 0
  );
  const expertsPerTok = Number(
    cfg.num_experts_per_tok || cfg.num_experts_per_token || cfg.moe_top_k || 0
  );

  let totalParams = 0;
  if (card?.safetensors?.total) totalParams = Number(card.safetensors.total);
  else if (card?.safetensors?.parameters) {
    totalParams = Object.values(card.safetensors.parameters).reduce((a, b) => a + Number(b || 0), 0);
  }

  const guessed = estimateFromName(hfId);
  let totalB = totalParams ? totalParams / 1e9 : guessed.total;
  const isMoe =
    numExperts > 1 ||
    /moe|mixtral|deepseek_v|qwen2_moe|qwen3_moe/i.test(arch) ||
    guessed.experts > 1 ||
    /a\d+(\.\d+)?b/i.test(hfId);

  let activeB = totalB;
  if (isMoe) {
    if (guessed.active && guessed.active < totalB) activeB = guessed.active;
    const experts = numExperts || guessed.experts || 8;
    const k = expertsPerTok || guessed.expertsPerTok || 2;
    if (experts > 0 && k > 0) {
      const ffnFrac = 0.67;
      activeB = totalB * (1 - ffnFrac + ffnFrac * (k / experts));
    }
  }

  return {
    hf_id: hfId,
    name: card?.id?.split('/')?.pop() || hfId,
    architecture: arch,
    total_params_b: Number(totalB.toFixed(3)),
    active_params_b: Number(activeB.toFixed(3)),
    hidden_size: hidden,
    num_layers: layers,
    num_attention_heads: heads,
    num_kv_heads: kvHeads,
    head_dim: headDim,
    intermediate_size: intermediate,
    vocab_size: vocab,
    context_length: ctx,
    num_experts: numExperts || guessed.experts || 0,
    num_experts_per_tok: expertsPerTok || guessed.expertsPerTok || 0,
    is_moe: Boolean(isMoe),
    dtype: String(cfg.torch_dtype || card?.cardData?.base_model || 'bf16'),
    license: String(card?.cardData?.license || card?.license || 'unknown'),
    downloads: Number(card?.downloads || 0),
  };
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Lattice-Calculator/1.0' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function lookupHuggingFace(hfId) {
  const card = await fetchJson(`https://huggingface.co/api/models/${encodeURIComponent(hfId)}`);
  let config =
    (await fetchJson(`https://huggingface.co/${hfId}/resolve/main/config.json`)) ||
    (await fetchJson(`https://huggingface.co/${hfId}/raw/main/config.json`));
  if (!card && !config) return null;
  return extractArch(config, card || { id: hfId }, hfId);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { q, moe } = req.query || {};
      let query = supabase.from('models').select('*').order('downloads', { ascending: false });
      if (moe === 'true') query = query.eq('is_moe', true);
      const { data, error } = await query;
      if (error) throw error;
      let rows = data || [];
      if (q && typeof q === 'string') {
        const s = q.toLowerCase();
        rows = rows.filter((m) =>
          `${m.hf_id} ${m.name} ${m.architecture}`.toLowerCase().includes(s)
        );
      }
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const hfId = parseHfId(req.body?.hf_id || req.body?.url || '');
      if (!hfId || !hfId.includes('/')) {
        return res.status(400).json({ error: 'Enter a Hugging Face repo like org/model or a full HF URL.' });
      }

      const { data: existing } = await supabase.from('models').select('*').eq('hf_id', hfId).maybeSingle();
      if (existing && !req.body?.refresh) return res.status(200).json(existing);

      const looked = await lookupHuggingFace(hfId);
      if (!looked && !existing) {
        return res.status(404).json({
          error: `Could not fetch ${hfId} from Hugging Face. The repo may be gated, private, or missing a config.json.`,
        });
      }

      const row = looked || existing;
      if (existing) {
        const { data, error } = await supabase.from('models').update(row).eq('id', existing.id).select().single();
        if (error) throw error;
        return res.status(200).json(data);
      }
      const { data, error } = await supabase.from('models').insert(row).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
