// Door 22: Letters to Santa (task `letters`, WAVE3.md §Door 22). Elf Pepper's mail sack burst: five letters flutter about the park
// (LETTERS.flutter). Come within 1.0 of one and it flutters on to its second spot; catch it there. With all five, tell Pepper: pick
// 1 of 3 gifts (ready-made choices only, ui.choose, NO free text; stored with progress.wish.set), then post the letters in Santa's
// mailbox beside the Reindeer Rest (permanent from the moment door 22 opens). One InstancedMesh of letters + the mailbox + its flag.
import * as THREE from 'three';
import { box, xf, merge, FELT } from '../../core/prims.js';
import { LETTERS } from '../../core/layout.js';
import * as PROPS from './props.js';
import { letterGeo, mailboxGeo, MAILBOX_FLAG } from './props.js';

const N = LETTERS.flutter.length;
const FLY = 1.2; // flutter arc seconds
const SCALE = 2.3; // letters are tiny: show them bigger (polish: 1.5 still vanished against the snow from the follow camera)
const HOVER = 0.4; // flutter height above the ground
const WISHES = [
  { label: 'A cosy Santa coat', value: 'coat:santa' },
  { label: 'A starlight crown', value: 'hat:starlight' },
  { label: 'A shimmering aurora scarf', value: 'scarf:aurora' },
];
const smooth = (u) => u * u * (3 - 2 * u);
const easeOutBack = (u) => { const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };

/** The mailbox flag, pivot at its origin, arm along +y with a gold pennant towards +x (used when props.js has no flag of its own). */
function ownFlagGeo() {
  return merge([
    xf(box(0.012, 0.12, 0.012, '#f5f1ea', FELT), [0, 0.06, 0]),
    xf(box(0.05, 0.034, 0.01, '#e3aa3a', FELT), [0.03, 0.1, 0]),
  ]);
}

export default function create(ctx, env) {
  const { engine, game, interact, player, colliders, layout } = ctx;
  const { n } = env;
  const S = game.state;
  const MB = LETTERS.mailbox;
  const gy = (x, z) => { try { return colliders.heightAt(x, z) || 0; } catch (e) { return 0; } };
  const playing = () => S.phase === 'play';
  const revealed = () => { try { return !!ctx.city?.isRevealed?.('park'); } catch (e) { return true; } };
  const busyElsewhere = () => !!ctx.minigames?.active;
  const giverPos = () => { const p = env.giverPos?.(n) || env.giver; return p ? { x: p.x, z: p.z } : { x: layout.DOOR_SPOTS[n].x, z: layout.DOOR_SPOTS[n].z }; };

  // ---- spots (nudged off colliders before our mailbox collider goes in)
  const nudge = ([x, z]) => { const p = { x, z }; try { colliders.resolve(p, 0.1); } catch (e) { /* optional */ } return p; };
  const mb = nudge([MB.x, MB.z]); mb.x = MB.x; mb.z = MB.z; // the mailbox itself stays exactly where the layout puts it
  let mbCol = null;
  try { mbCol = colliders.addCircle(MB.x, MB.z, 0.14, 'mailbox'); } catch (e) { /* optional */ }

  // ---- mailbox (permanent from door 22 open) + flag on a pivot
  const mGeo = mailboxGeo();
  const fGeo = (typeof PROPS.mailboxFlagGeo === 'function' ? PROPS.mailboxFlagGeo() : null) || ownFlagGeo();
  const mbGroup = new THREE.Group();
  mbGroup.position.set(MB.x, gy(MB.x, MB.z), MB.z);
  mbGroup.rotation.y = MB.heading;
  const mbMesh = new THREE.Mesh(mGeo, engine.mat);
  mbMesh.castShadow = true; mbMesh.receiveShadow = true;
  const pivot = new THREE.Group();
  pivot.position.set(MAILBOX_FLAG.x, MAILBOX_FLAG.y, MAILBOX_FLAG.z);
  const flagMesh = new THREE.Mesh(fGeo, engine.mat);
  flagMesh.castShadow = true;
  pivot.add(flagMesh);
  mbGroup.add(mbMesh, pivot);
  mbGroup.visible = false;
  engine.scene.add(mbGroup);
  const FLAG_DOWN = -Math.PI * 0.9;
  let flagU = 0; // 0 down … 1 up
  let flagAnim = -1;
  pivot.rotation.z = FLAG_DOWN;
  const mailTop = new THREE.Vector3();

  // ---- letters
  const lGeo = letterGeo();
  const mesh = new THREE.InstancedMesh(lGeo, engine.mat, N);
  mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false; mesh.visible = false;
  engine.scene.add(mesh);
  const dummy = new THREE.Object3D();
  const hideM = new THREE.Matrix4().makeScale(0, 0, 0);

  // ---- markers (polish): cream letters on white snow were hard to spot. Each waiting / resting letter gets a soft shadow on
  // the ground (reads by day) and a gold halo that twinkles behind it (reads at dusk and night). 2 tiny InstancedMeshes
  // (5 quads each), only while the letters are out.
  const blobTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cg = cv.getContext('2d'), grd = cg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    grd.addColorStop(0.65, 'rgba(255,255,255,0.16)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = grd; cg.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })();
  const markGeo = new THREE.PlaneGeometry(2, 2);
  const shadeMat = new THREE.MeshBasicMaterial({ map: blobTex, color: '#27304f', transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const haloMat = new THREE.MeshBasicMaterial({ map: blobTex, color: '#ffc65e', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const shadeMesh = new THREE.InstancedMesh(markGeo, shadeMat, N), haloMesh = new THREE.InstancedMesh(markGeo, haloMat, N);
  for (const m of [shadeMesh, haloMesh]) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; m.visible = false; for (let i = 0; i < N; i++) m.setMatrixAt(i, hideM); engine.scene.add(m); }
  shadeMesh.name = 'w3-letter-shade'; haloMesh.name = 'w3-letter-halo'; haloMesh.renderOrder = 2;
  const qFlat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const mM = new THREE.Matrix4(), mP = new THREE.Vector3(), mS = new THREE.Vector3(), mC = new THREE.Color();
  for (let i = 0; i < N; i++) haloMesh.setColorAt(i, mC.setScalar(0));
  const L = LETTERS.flutter.map(([a, b], i) => {
    const A = nudge(a), B = nudge(b);
    return { i, a: A, b: B, state: 'wait', t: 0, x: A.x, y: HOVER, z: A.z, yaw: i, ph: i * 1.3 + 0.4, from: null, delay: 0 };
  });

  // ---- state
  let accepted = false, finished = false, wished = false, choosing = false;
  let posting = null; // { t, flagged, done }
  const caught = () => L.filter((l) => l.state === 'gone' || l.state === 'caught' || l.state === 'post').length;
  const allCaught = () => caught() === N;
  const active = () => accepted && !finished && env.ds(n) === 'open';
  const doorOpen = () => { const s = env.ds(n); return s === 'open' || s === 'done'; };

  function resetLetters() {
    for (const l of L) { l.state = 'wait'; l.t = 0; l.x = l.a.x; l.z = l.a.z; l.y = HOVER; l.delay = 0; }
  }
  function setFlag(up, animate) { flagU = up ? 1 : 0; flagAnim = animate ? 0 : -1; pivot.rotation.z = up ? 0 : FLAG_DOWN; }
  function resetAll() { accepted = false; finished = false; wished = false; choosing = false; posting = null; resetLetters(); setFlag(false, false); }
  function finalLook() { accepted = true; finished = true; wished = true; posting = null; for (const l of L) l.state = 'gone'; if (flagU < 1 && flagAnim < 0) setFlag(true, false); }

  // ---- interact spots
  const spots = L.map((l) => interact.add({
    id: 'letter-' + l.i, x: l.b.x, z: l.b.z, r: 0.7, label: 'Catch the letter', icon: 'letter',
    enabled: () => playing() && active() && l.state === 'rest' && !busyElsewhere(),
    onInteract: () => catchLetter(l),
  }));
  const postSpot = interact.add({
    id: 'letters-post', x: MB.x, z: MB.z, r: 0.9, label: 'Post the letters', icon: 'letter',
    enabled: () => playing() && active() && allCaught() && wished && !posting && !busyElsewhere(),
    onInteract: () => startPost(),
  });

  function catchLetter(l) {
    if (l.state !== 'rest') return;
    l.state = 'caught'; l.t = 0; l.from = { x: l.x, y: l.y, z: l.z };
    env.sfx('pickup', l.x, l.z);
    const step = caught();
    game.emit('task:progress', { id: 'letters', step, of: N });
    const k = N - step;
    if (k > 0) env.toast(`Letter caught! ${k} to go`, 2000);
    else env.toast('All five caught! Back to Elf Pepper', 2800);
  }

  async function askWish() {
    if (choosing) return;
    choosing = true;
    env.say(n, 'wish');
    let v = null;
    try {
      if (typeof ctx.ui?.choose === 'function') v = await ctx.ui.choose({ title: 'Dear Santa, for Christmas I wish for…', options: WISHES.map((o) => ({ ...o })) });
      else v = WISHES[0].value; // no UI card (headless): the first gift
    } catch (e) { console.warn('[letters] choose', e); v = null; }
    choosing = false;
    if (!WISHES.some((o) => o.value === v) || S.phase !== 'play') return; // cancelled: asked again on the next talk
    try { ctx.progress?.wish?.set?.(v); } catch (e) { console.warn('[letters] wish.set', e); }
    wished = true;
    env.sfx('ui');
    env.toast("Wish written! Now post it in Santa's mailbox", 3000);
  }

  function startPost() {
    if (posting || !allCaught() || !wished) return;
    posting = { t: 0, flagged: false, done: false, from: { x: player.pos.x, y: 0.7, z: player.pos.z } };
    for (const l of L) { l.state = 'post'; l.t = 0; l.delay = l.i * 0.18; l.from = null; }
    env.sfx('whoosh', MB.x, MB.z);
  }

  function finishTask() {
    if (finished) return;
    finished = true;
    try { ctx.tasks?.reindeer?.hop?.(); } catch (e) { /* optional: Clover hops in the Rest */ }
    env.say(n, 'posted');
    env.taskComplete('letters');
    env.completeDoor(n);
    try { env.giver?.hop?.(); } catch (e) { /* */ }
  }

  function update(dt, t) {
    if (env.ds(n) === 'done' && !finished) finalLook();
    const hid = busyElsewhere();
    const showBox = doorOpen() && revealed() && !hid;
    if (mbGroup.visible !== showBox) mbGroup.visible = showBox;
    if (mbCol) mbCol.enabled = showBox;
    if (flagAnim >= 0) {
      flagAnim += dt;
      const u = Math.min(1, flagAnim / 0.55);
      pivot.rotation.z = FLAG_DOWN * (1 - easeOutBack(u));
      if (u >= 1) { flagU = 1; flagAnim = -1; pivot.rotation.z = 0; }
    }
    if (posting) { // timeline runs on the clock even when hidden
      posting.t += dt;
      if (!posting.flagged && L.every((l) => l.state === 'gone')) {
        posting.flagged = true; posting.at = posting.t;
        setFlag(true, true);
        env.sfx('sleighBells', MB.x, MB.z);
        try { ctx.tasks?.reindeer?.hop?.(); } catch (e) { /* optional */ }
      }
      if (posting.flagged && posting.t - posting.at > 0.9) { posting = null; finishTask(); }
    }
    const show = accepted && !finished && revealed() && !hid;
    if (!show && !(posting)) { if (mesh.visible) { mesh.visible = false; shadeMesh.visible = false; haloMesh.visible = false; } return; }
    mesh.visible = true; shadeMesh.visible = true; haloMesh.visible = true;
    const lamp = Math.max(0, Math.min(1, engine.env?.lamp ?? 1)); // 0 broad day … 1 night
    const camQ = engine.camera.quaternion;
    const px = player.pos.x, pz = player.pos.z;
    mailTop.set(0, 0.62, 0.0); mbGroup.localToWorld(mailTop);
    for (const l of L) {
      let vis = true, yaw, tilt, roll, sc = SCALE;
      if (l.state === 'wait' || l.state === 'rest') {
        const base = l.state === 'wait' ? l.a : l.b;
        const w = t * 1.0 + l.ph;
        l.x = base.x + Math.cos(w * 0.7) * 0.15; l.z = base.z + Math.sin(w * 0.9) * 0.15;
        l.y = HOVER + Math.sin(t * 1.7 + l.ph) * 0.075;
        yaw = t * 1.5 + l.ph; tilt = 0.5 + Math.sin(t * 2.3 + l.ph) * 0.35; roll = Math.sin(t * 1.9 + l.ph * 2) * 0.3; // tipped up: the face shows from the follow camera
        if (l.state === 'wait' && playing() && accepted && Math.hypot(px - l.x, pz - l.z) < 1.0) {
          l.state = 'fly'; l.t = 0; l.from = { x: l.x, y: l.y, z: l.z };
          env.sfx('whoosh', l.x, l.z);
        }
      } else if (l.state === 'fly') {
        l.t += dt;
        const u = Math.min(1, l.t / FLY), e = smooth(u);
        const bx = l.b.x + Math.cos(t * 0.7 + l.ph) * 0.15 * u, bz = l.b.z + Math.sin(t * 0.9 + l.ph) * 0.15 * u;
        l.x = l.from.x + (bx - l.from.x) * e; l.z = l.from.z + (bz - l.from.z) * e;
        l.y = l.from.y + (HOVER - l.from.y) * e + Math.sin(u * Math.PI) * 0.8;
        yaw = t * 9 + l.ph; tilt = Math.sin(u * 12) * 0.6; roll = Math.sin(u * 9) * 0.5;
        if (u >= 1) { l.state = 'rest'; l.t = 0; }
      } else if (l.state === 'caught') {
        l.t += dt;
        const u = Math.min(1, l.t / 0.4), e = u * u;
        l.x = l.from.x + (px - l.from.x) * e; l.z = l.from.z + (pz - l.from.z) * e; l.y = l.from.y + (0.55 - l.from.y) * e;
        yaw = t * 12; tilt = 0.3; roll = 0; sc = SCALE * (1 - e * 0.8);
        if (u >= 1) l.state = 'gone';
      } else if (l.state === 'post') {
        l.delay -= dt;
        if (l.delay > 0) {
          l.x = px; l.z = pz; l.y = 0.7; yaw = t * 4; tilt = 0; roll = 0; sc = 0;
        } else {
          if (!l.from) { l.from = { x: px, y: 0.7, z: pz }; env.sfx('pop', px, pz); }
          l.t += dt;
          const u = Math.min(1, l.t / 0.7), e = smooth(u);
          l.x = l.from.x + (mailTop.x - l.from.x) * e; l.z = l.from.z + (mailTop.z - l.from.z) * e;
          l.y = l.from.y + (mailTop.y - l.from.y) * e + Math.sin(u * Math.PI) * 0.35;
          yaw = t * 10 + l.ph; tilt = 0.2; roll = 0;
          sc = SCALE * (1 - 0.4 * u);
          if (u >= 1) l.state = 'gone';
        }
      } else vis = false;
      if (vis && sc > 0.001) {
        dummy.position.set(l.x, gy(l.x, l.z) + l.y, l.z);
        dummy.rotation.set(tilt, yaw, roll);
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        mesh.setMatrixAt(l.i, dummy.matrix);
      } else mesh.setMatrixAt(l.i, hideM);
      // markers: only for letters still out in the park
      const out = vis && (l.state === 'wait' || l.state === 'rest' || l.state === 'fly');
      if (out) {
        const g = gy(l.x, l.z), h = Math.max(0, l.y), near = 1 / (1 + h * 1.4);
        const sr = 0.085 * SCALE * (0.75 + 0.5 * (1 - near));
        shadeMesh.setMatrixAt(l.i, mM.compose(mP.set(l.x, g + 0.03, l.z), qFlat, mS.set(sr, sr, 1)));
        const tw = 0.75 + 0.25 * Math.sin(t * 4.2 + l.ph * 3);
        const hr = 0.13 * SCALE * (0.9 + 0.1 * tw);
        haloMesh.setMatrixAt(l.i, mM.compose(mP.set(l.x, g + l.y, l.z), camQ, mS.set(hr, hr, 1)));
        haloMesh.setColorAt(l.i, mC.setScalar((0.22 + 0.4 * lamp) * tw));
      } else { shadeMesh.setMatrixAt(l.i, hideM); haloMesh.setMatrixAt(l.i, hideM); }
    }
    mesh.instanceMatrix.needsUpdate = true;
    shadeMesh.instanceMatrix.needsUpdate = true; haloMesh.instanceMatrix.needsUpdate = true;
    if (haloMesh.instanceColor) haloMesh.instanceColor.needsUpdate = true;
  }

  const nearestLetter = () => {
    let best = null, bd = 1e9;
    for (const l of L) {
      if (l.state === 'gone' || l.state === 'caught' || l.state === 'post') continue;
      const d = Math.hypot(player.pos.x - l.x, player.pos.z - l.z);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  };

  const act = {
    id: 'letters', n,
    get busy() { return choosing || !!posting; },
    onGiver() {
      if (finished || env.ds(n) === 'done') return;
      if (!accepted) {
        accepted = true;
        resetLetters();
        env.say(n, 'accept');
        game.emit('task:progress', { id: 'letters', step: 0, of: N });
        return;
      }
      if (!allCaught()) { env.say(n, 'remind'); return; }
      if (!wished) { askWish(); return; }
      env.toast("Post the letters in Santa's mailbox", 2600);
    },
    objective() {
      if (!active() || posting) return null;
      if (!allCaught()) {
        const l = nearestLetter();
        return l ? { id: 'letters-catch', text: `Catch the runaway letters (${caught()}/${N})`, icon: 'letter', x: l.state === 'wait' ? l.a.x : l.b.x, z: l.state === 'wait' ? l.a.z : l.b.z } : null;
      }
      if (!wished) { const o = giverPos(); return { id: 'letters-bring', text: 'Bring the letters to Elf Pepper', icon: 'letter', x: o.x, z: o.z }; }
      return { id: 'letters-post', text: "Post the letters in Santa's mailbox", icon: 'letter', x: MB.x, z: MB.z };
    },
    giverOff(g) { return g === env.giver && active() && allCaught() && wished && !choosing; }, // wish chosen: Pepper steps aside so the mailbox wins
    giverLabel() { return active() && allCaught() && !wished ? { label: 'Write to Santa', icon: 'letter' } : null; },
    onDoll: () => false, dollLabel: () => null,
    update,
    sync({ reset } = {}) {
      if (reset) resetAll();
      if (env.ds(n) === 'done') finalLook();
    },
    get state() { return { accepted, finished, caught: caught(), wished, choosing, posting: !!posting, flagUp: flagU >= 1, mailbox: mbGroup.visible, letters: mesh.visible, states: L.map((l) => l.state) }; },
    catchAll() { // debug: accept, then catch every letter at once
      if (!accepted && env.ds(n) !== 'done') act.onGiver();
      for (const l of L) if (l.state === 'wait' || l.state === 'fly' || l.state === 'rest') { l.state = 'rest'; l.x = l.b.x; l.z = l.b.z; catchLetter(l); }
    },
    post() { // debug: finish the wish (first gift) if needed, then post
      if (!allCaught()) act.catchAll();
      if (!wished) { try { ctx.progress?.wish?.set?.(WISHES[0].value); } catch (e) { /* */ } wished = true; }
      startPost();
    },
    budget() { const l = lGeo.attributes.position.count / 3, m = mGeo.attributes.position.count / 3, f = fGeo.attributes.position.count / 3; return { calls: 3, letter: l, mailbox: m, flag: f, tris: l * N + m + f }; },
    async selfTest(T) {
      await T.talk(n); // accept
      T.check(accepted && !finished, 'letters: Pepper accepted, letters flutter');
      for (let i = 0; i < N; i++) {
        const l = L[i];
        T.teleport(l.a.x + 0.4, l.a.z + 0.2); // within 1.0: the letter flutters away
        T.step(50);
        T.check(l.state === 'rest', `letters: letter ${i} fluttered to its second spot (${l.state})`);
        await T.go(l.b.x, l.b.z, 'letter-' + i);
        T.step(15);
        T.check(l.state === 'caught' || l.state === 'gone', `letters: letter ${i} caught (${l.state})`);
      }
      T.check(allCaught(), 'letters: all five caught');
      await T.talk(n); // wish (ui.choose is stubbed to the first gift by the host selftest)
      for (let k = 0; k < 30 && !wished; k++) { T.step(2); await T.tick(0); }
      T.check(wished, 'letters: a wish was chosen');
      if (ctx.progress?.wish) T.check(ctx.progress.wish.get() === 'coat:santa', `letters: progress.wish = ${ctx.progress.wish.get()}`);
      await T.go(MB.x, MB.z, 'letters-post');
      for (let k = 0; k < 60 && env.ds(n) !== 'done'; k++) { T.step(5); await T.tick(0); }
      T.check(env.ds(n) === 'done', 'letters: door 22 done after posting');
      T.step(5);
      T.check(flagU >= 1 && mbGroup.visible, 'letters: mailbox flag is up');
    },
  };
  act.dispose = () => {
    for (const sp of [...spots, postSpot]) { try { interact.remove(sp); } catch (e) { /* */ } }
    engine.scene.remove(mesh, mbGroup, shadeMesh, haloMesh);
    lGeo.dispose(); mGeo.dispose(); fGeo.dispose(); markGeo.dispose(); shadeMat.dispose(); haloMat.dispose(); blobTex.dispose();
  };
  act.hook = { get state() { return act.state; }, catchAll: () => act.catchAll(), post: () => act.post() };
  try { (window.__w3 = window.__w3 || {}).letters = act.hook; } catch (e) { /* no window */ }
  act.sync();
  return act;
}
