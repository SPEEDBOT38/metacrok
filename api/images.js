// /api/images — POST { run_id, idx } paints one of the three ads; GET ?run_id=&idx= returns the image.
// One file on purpose: Vercel's free plan allows 12 serverless functions in total.
import { createImage, serveImage } from '../lib/images-api.js';

export const access = 'public';
export const methods = ['GET', 'POST'];

export default function (req, res) { return req.method === 'GET' ? serveImage(req, res) : createImage(req, res); }
