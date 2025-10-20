'use client';
import React, { useState } from 'react';
export default function Page(){
  const [t,setT] = useState('');
  return (
    <div className="p-6 space-y-3">
      <h2 className="text-xl font-semibold">Set access_token (Bearer)</h2>
      <input className="border rounded w-full p-2" value={t} onChange={e=>setT(e.target.value)} placeholder="eyJhbGciOi..." />
      <div className="flex gap-3">
        <button className="border rounded px-4 py-2" onClick={()=>{ localStorage.setItem('access_token', t); alert('Token set'); }}>Save token</button>
        <button className="border rounded px-4 py-2" onClick={()=>{ localStorage.removeItem('access_token'); alert('Token cleared'); }}>Clear token</button>
      </div>
      <p className="text-sm opacity-70">➡️ Ensuite, va sur <code>/generate</code> (Bearer par défaut).</p>
    </div>
  );
}
