// Photo → rigged, animated 3D model via Tripo3D API v3.
// Docs: https://developers.tripo3d.com/llms.txt  (upload → image-to-model → rig-check → rig → retarget)
const fs = require('fs');

const BASE = 'https://openapi.tripo3d.ai/v3';

// Animations Tripo can put on each kind of skeleton. Quadrupeds only get a walk.
const PRESETS = {
  biped: ['preset:idle', 'preset:walk', 'preset:run', 'preset:jump'],
  quadruped: ['preset:quadruped:walk'],
  hexapod: ['preset:hexapod:walk'],
  octopod: ['preset:octopod:walk'],
  serpentine: ['preset:serpentine:march'],
  aquatic: ['preset:aquatic:march']
};

async function makePet3D({ apiKey, photoPath, outPath, onProgress = () => {} }) {
  const auth = { Authorization: `Bearer ${apiKey}` };

  async function api(route, body) {
    const res = await fetch(BASE + route, body
      ? { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { headers: auth });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.code !== 0) throw new Error(`Tripo ${route}: ${json.message || res.status}${json.suggestion ? ` (${json.suggestion})` : ''}`);
    return json.data;
  }

  async function wait(taskId, label) {
    for (;;) {
      const t = await api(`/tasks/${taskId}`);
      if (t.status === 'success') return t.output;
      if (['failed', 'cancelled', 'banned', 'expired'].includes(t.status)) throw new Error(`Tripo ${label} ${t.status}`);
      onProgress(`${label}… ${t.progress ?? 0}%`);
      await new Promise((r) => setTimeout(r, 3000)); // ponytail: fixed poll; honour Retry-After if we start hitting 429s
    }
  }

  onProgress('Uploading photo…');
  const form = new FormData();
  form.append('file', await fs.openAsBlob(photoPath, { type: 'image/png' }), 'pet.png');
  const up = await fetch(`${BASE}/files`, { method: 'POST', headers: auth, body: form }).then((r) => r.json());
  if (up.code !== 0) throw new Error(`Tripo upload: ${up.message}`);

  const gen = await api('/generation/image-to-model', { input: up.data.file_token, model: 'v3.1-20260211', texture: true, pbr: true });
  await wait(gen.task_id, 'Sculpting your pet in 3D');

  const check = await wait((await api('/animations/rig-check', { input: gen.task_id })).task_id, 'Checking its shape');
  if (!check.riggable) throw new Error("Tripo couldn't build a skeleton for this model");
  const rigType = check.rig_type || 'quadruped';

  // v2.5 rig model is the one that handles animals (the default is biped-only)
  const rig = await api('/animations/rig', { input: gen.task_id, model: 'v2.5-20260210', rig_type: rigType, spec: 'tripo', out_format: 'glb' });
  await wait(rig.task_id, 'Giving it bones');

  const anim = await api('/animations/retarget', {
    input: rig.task_id, animations: PRESETS[rigType] || PRESETS.quadruped,
    out_format: 'glb', bake_animation: true, export_with_geometry: true, animate_in_place: true
  });
  const out = await wait(anim.task_id, 'Teaching it to walk');

  // model_url is a temporary signed link: download it now
  onProgress('Downloading…');
  const glb = await fetch(out.model_url);
  if (!glb.ok) throw new Error(`Download failed: ${glb.status}`);
  fs.writeFileSync(outPath, Buffer.from(await glb.arrayBuffer()));
  return { rigType };
}

module.exports = { makePet3D };
