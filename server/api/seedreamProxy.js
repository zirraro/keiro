import express from 'express';
import fetch from 'node-fetch';
const router = express.Router();

const BASE = 'https://api.seedream.ai';
const KEY  = process.env.SEEDREAM_API_KEY;

router.post('/seedream', async (req, res) => {
  try {
    const r = await fetch(`${BASE}/v1/images/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'PROXY_FAILED', detail: String(e) });
  }
});

export default router;
