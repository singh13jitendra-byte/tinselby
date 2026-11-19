// Headless harness: runs the real pack/index.js with stubbed DOM + engine; exposes window.__pack
import * as THREE from 'three';
const noop = () => {};
const el = () => { const e = { style: { setProperty: noop }, children: [], classList: { add: noop, remove: noop, toggle: noop }, appendChild(c) { e.children.push(c); return c; }, remove: noop, querySelectorAll: () => [], addEventListener: noop, setProperty: noop, setAttribute: noop, set innerHTML(v) {}, set textContent(v) {}, getContext: () => new Proxy({}, { get: () => () => ({}) }) }; return e; };
globalThis.document = { createElement: el, body: el(), createElementNS: el };
globalThis.window = globalThis; globalThis.innerWidth = 390; globalThis.innerHeight = 844;
globalThis.location = { search: '?mgauto' };
globalThis.matchMedia = () => ({ matches: false });
globalThis.addEventListener = noop; globalThis.removeEventListener = noop;
globalThis.devicePixelRatio = 1;
globalThis.HTMLElement = class {}; globalThis.requestAnimationFrame = noop;
const mod = (await import('./index.js')).default;
const scene = new THREE.Scene();
const engine = { scene, mat: new THREE.MeshBasicMaterial(), camera: new THREE.PerspectiveCamera(35, 0.46) };
let finished = null;
const mg = { hud: { setScore: noop, setGoal: noop }, add(o) { scene.add(o); return o; }, onDispose(f) { disposers.push(f); }, onTap: noop, onKey: noop, setPlayerVisible: noop, addUpdate: noop, intro: async () => {}, finish(r) { finished = r; } };
const disposers = [];
const shots = [];
const ctx = { engine, cam: { setMode: noop, playShot(sp) { shots.push(sp); } }, uiRoot: el(), audio: { sfx: noop }, life: { hideDistrict: () => noop } };
await mod.start(ctx, mg);
const p = window.__pack;
const mode = process.argv[2] || 'newbie';
p.bot(mode);
const geoBefore = 0;
let t = 0;
const snap = [];
while (!p.finished && t < 200) { p.ff(1 / 30 * 1, 1 / 30); t += 1 / 30; if (Math.abs(t % 10) < 0.034) snap.push(JSON.stringify(p.state)); }
console.log(mode, 'finished', JSON.stringify(p.result), 'time', t.toFixed(1), 'result', JSON.stringify(finished));
console.log('budget', JSON.stringify(p.budget()));
console.log('log tumbles', p.model && p.state.tumbles);
console.log(JSON.stringify(p.pres));
for (const f of disposers) f();
console.log('after dispose hook', window.__pack === undefined ? 'removed' : 'present', 'scene children', scene.children.length);

for (const [w, h] of [[390, 844], [844, 390], [1280, 720], [667, 375]]) {
  globalThis.innerWidth = w; globalThis.innerHeight = h; engine.camera.aspect = w / h;
  const out = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  shots[0].update(0.5, out);
  console.log(w, h, 'cam', out.pos.toArray().map((v) => +v.toFixed(2)), 'target', out.target.toArray().map((v) => +v.toFixed(2)));
}
{
  globalThis.innerWidth = 390; globalThis.innerHeight = 844; engine.camera.aspect = 390 / 844; engine.camera.fov = 36;
  const out = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  shots[0].update(0.5, out);
  engine.camera.position.copy(out.pos); engine.camera.lookAt(out.target); engine.camera.updateMatrixWorld(); engine.camera.updateProjectionMatrix();
  const grp = scene.children[0]; grp.updateMatrixWorld(true);
  const ims = grp.children.filter((c) => c.isInstancedMesh);
  const m = new THREE.Matrix4(), v = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion();
  for (const im of ims.slice(0, 2)) for (let i = 0; i < 12; i++) {
    im.getMatrixAt(i, m); m.premultiply(grp.matrixWorld); m.decompose(v, q, s);
    if (s.x < 1e-6) continue;
    const p = v.clone().project(engine.camera);
    console.log('inst', i, 'world', v.toArray().map((x) => +x.toFixed(3)), 'scale', s.toArray().map((x) => +x.toFixed(2)), 'screen px', Math.round((p.x + 1) / 2 * 390), Math.round((1 - p.y) / 2 * 844));
  }
}
