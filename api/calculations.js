import supabase from './db-client.js';

async function requireUser(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: 'Invalid token' });
    return null;
  }
  return user;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await requireUser(req, res);
    if (!user) return;

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('calculations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (!body.hf_id || !body.result_json) {
        return res.status(400).json({ error: 'hf_id and result_json are required.' });
      }
      const { data, error } = await supabase
        .from('calculations')
        .insert({
          user_id: user.id,
          model_id: body.model_id || null,
          hf_id: body.hf_id,
          profile_id: body.profile_id || null,
          gpu_name: body.gpu_name || 'Custom',
          vram_gb: body.vram_gb,
          bandwidth_gbs: body.bandwidth_gbs,
          pcie_gen: body.pcie_gen || 4,
          gpu_count: body.gpu_count || 1,
          context_length: body.context_length || 8192,
          batch_size: body.batch_size || 1,
          recommended_quant: body.recommended_quant,
          fits: Boolean(body.fits),
          tps_estimate: body.tps_estimate || 0,
          vram_used_gb: body.vram_used_gb || 0,
          result_json: body.result_json,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'DELETE') {
      const id = req.body?.id || req.query?.id;
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { error } = await supabase.from('calculations').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
