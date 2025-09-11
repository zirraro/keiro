import type { NextApiRequest, NextApiResponse } from 'next';
import { supabasePublic } from '../../lib/supabase';

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const { error } = await supabasePublic.from('brands').select('id').limit(1);
  res.status(200).json({ ok: !error, db: error ? 'down' : 'up', ts: Date.now() });
}
