import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { category, vendor, q } = req.query || {};
      let query = supabase.from('gpus').select('*').order('vram_gb', { ascending: false });
      if (category) query = query.eq('category', category);
      if (vendor) query = query.eq('vendor', vendor);
      const { data, error } = await query;
      if (error) throw error;
      let rows = data || [];
      if (q && typeof q === 'string') {
        const s = q.toLowerCase();
        rows = rows.filter((g) =>
          `${g.name} ${g.vendor} ${g.architecture} ${g.category}`.toLowerCase().includes(s)
        );
      }
      return res.status(200).json(rows);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
