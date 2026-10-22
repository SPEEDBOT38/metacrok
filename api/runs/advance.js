// POST /api/runs/advance — do the next bounded chunk of work for a run.
// The browser calls this in a loop; each call stays well under 60 s.
import { advance } from '../../lib/pipeline.js';
import { str } from '../../lib/util.js';

export const access = 'public';
export const methods = ['POST'];

export default async function (req, res) {
  const id = str(req.body && req.body.id, 20);
  if (!/^[a-z0-9]{6,20}$/.test(id)) return res.status(400).json({ error: 'bad run id' });
  const r = await advance(id);
  res.json(r);
}