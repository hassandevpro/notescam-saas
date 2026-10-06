import { readFileSync } from 'node:fs';
for (const l of readFileSync('.env.local','utf8').split(/\r?\n/)) { const m=l.match(/^([A-Z_]+)=(.*)$/); if(m) process.env[m[1]]??=m[2]; }
const q = readFileSync(0,'utf8');
const r = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:q})});
const t = await r.text(); if(!r.ok){console.log(r.status,t.slice(0,500));process.exit(1);}
for (const row of JSON.parse(t)) console.log(Object.values(row).map(v=>v===null?'∅':String(v)).join(' | '));
