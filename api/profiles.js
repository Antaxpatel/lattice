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
        .from('gpu_profiles')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { name, gpu_id, gpu_name, vram_gb, bandwidth_gbs, pcie_gen, pcie_lanes, gpu_count, system_ram_gb } = req.body || {};
      if (!name || !vram_gb || !bandwidth_gbs) {
        return res.status(400).json({ error: 'Name, VRAM, and bandwidth are required.' });
      }
      const { data, error } = await supabase
        .from('gpu_profiles')
        .insert({
          user_id: user.id,
          name: String(name).slice(0, 80),
          gpu_id: gpu_id || null,
          gpu_name: gpu_name || name,
          vram_gb,
          bandwidth_gbs,
          pcie_gen: pcie_gen || 4,
          pcie_lanes: pcie_lanes || 16,
          gpu_count: gpu_count || 1,
          system_ram_gb: system_ram_gb || 64,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      const allowed = ['name', 'gpu_id', 'gpu_name', 'vram_gb', 'bandwidth_gbs', 'pcie_gen', 'pcie_lanes', 'gpu_count', 'system_ram_gb'];
      const patch = {};
      for (const k of allowed) if (rest[k] !== undefined) patch[k] = rest[k];
      const { data, error } = await supabase
        .from('gpu_profiles')
        .update(patch)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const id = req.body?.id || req.query?.id;
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { error } = await supabase.from('gpu_profiles').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
