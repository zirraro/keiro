const API_BASE = process.env.SEEDREAM_API_BASE || 'https://api.seedream.ai'; // ajuste si besoin

function assertKey() {
  const key = process.env.SEEDREAM_API_KEY;
  if (!key) throw new Error('Missing SEEDREAM_API_KEY');
  return key;
}

export async function seedreamGenerate(payload: any, timeoutMs = 30000) {
  const key = assertKey();
  const url = `${API_BASE}/v1/images/generate`; // adapte si endpoint différent
  const controller = new AbortController();
  const t = setTimeout(()=>controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const txt = await res.text();
    if (!res.ok) {
      throw new Error(`Seedream generate ${res.status}: ${txt}`);
    }
    try { return JSON.parse(txt); } catch { return txt; }
  } finally {
    clearTimeout(t);
  }
}

export async function seedreamEdit(payload: any, timeoutMs = 30000) {
  const key = assertKey();
  const url = `${API_BASE}/v1/images/edit`; // adapte si endpoint différent
  const controller = new AbortController();
  const t = setTimeout(()=>controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const txt = await res.text();
    if (!res.ok) {
      throw new Error(`Seedream edit ${res.status}: ${txt}`);
    }
    try { return JSON.parse(txt); } catch { return txt; }
  } finally {
    clearTimeout(t);
  }
}
