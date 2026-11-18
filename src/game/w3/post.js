// Door 18: Christmas Cards (task `post`, WAVE3.md §Door 18). Postie Percy hands you a bundle of four cards (carried in your hands);
// give one to each of the four original friends (POST.to = doors 1–4: Mrs Holly, Pip, Ilse, Bram) by talking to them: the host's
// onDoll / dollLabel hooks call into this activity, so "Give a card to {who}" beats Play again. Then back to Percy → door done.
// The post box (POST.box) is a permanent prop while the market is revealed. Mid-task progress is not saved.
import * as THREE from 'three';
import { POST } from '../../core/layout.js';
import { postBoxGeo, bundleGeo } from './props.js';

const OF = POST.to.length;

export default function create(ctx, env) {
  const { engine, game, interact, player, colliders, layout } = ctx;
  const { n } = env;
  const S = game.state;
  const gy = (x, z) => { try { return colliders.heightAt(x, z) || 0; } catch (e) { return 0; } };
  const playing = () => S.phase === 'play';
  const revealed = () => { try { return !!ctx.city?.isRevealed?.('market'); } catch (e) { return true; } };
  const busyElsewhere = () => !!ctx.minigames?.active;

  // ---- post box (permanent): one mesh + a small collider
  const boxGeo = postBoxGeo();
  const box = new THREE.Mesh(boxGeo, engine.mat);
  box.castShadow = true; box.receiveShadow = true;
  box.position.set(POST.box.x, gy(POST.box.x, POST.box.z), POST.box.z);
  box.rotation.y = POST.box.heading;
  box.visible = false;
  engine.scene.add(box);
  try { colliders.addCircle(POST.box.x, POST.box.z, 0.15, 'postbox'); } catch (e) { /* optional */ }
  let wob = 0; // post box wobble when a card goes in

  // ---- the carried bundle
  const bGeo = bundleGeo();
  let bundle = null;
  const hands = () => (player.carrying && player.carrying !== bundle) || !!S.carrying;
  const dropBundle = () => {
    if (bundle && player.carrying === bundle) player.carry(null);
    bundle?.removeFromParent();
    bundle = null;
  };
  const giveBundle = () => {
    bundle = new THREE.Mesh(bGeo, engine.mat);
    bundle.castShadow = false;
    player.carry(bundle);
  };

  // ---- state
  let accepted = false, finished = false;
  const left = new Set(); // friends (door numbers) still waiting for a card
  const friendPos = (k) => { const p = env.giverPos?.(k) || env.givers?.[k]; return p ? { x: p.x, z: p.z } : null; };
  const giverPos = () => friendPos(n) || { x: layout.DOOR_SPOTS[n].x, z: layout.DOOR_SPOTS[n].z };
  const friendOf = (doll) => POST.to.find((k) => env.givers?.[k] === doll) ?? null;
  const active = () => accepted && !finished && env.ds(n) === 'open';
  const delivered = () => OF - left.size;

  function resetAll() { dropBundle(); accepted = false; finished = false; left.clear(); }
  function finalLook() { dropBundle(); accepted = true; finished = true; left.clear(); }

  function finishTask() {
    if (finished) return;
    finished = true; wob = 0.6;
    dropBundle();
    env.taskComplete('post');
    env.completeDoor(n);
    env.say(n, 'done');
    try { env.giver?.hop?.(); } catch (e) { /* */ }
  }

  function accept() {
    if (hands()) { env.toast('Your hands are full! Put that down first.', 2600); return false; }
    accepted = true; finished = false;
    left.clear(); POST.to.forEach((k) => left.add(k));
    giveBundle();
    env.say(n, 'accept');
    game.emit('task:progress', { id: 'post', step: 0, of: OF });
    return true;
  }

  // ---- hooks used by game/index.js
  function onDoll(doll) {
    if (!active()) return false;
    const k = friendOf(doll);
    if (k == null || !left.has(k)) return false;
    left.delete(k);
    env.say(k, 'card');
    try { doll.hop?.(); } catch (e) { /* */ }
    const p = friendPos(k);
    env.sfx('gift', p?.x, p?.z);
    game.emit('task:progress', { id: 'post', step: delivered(), of: OF });
    const r = left.size;
    if (r > 0) env.toast(`Card delivered! ${r} to go`, 2200);
    else env.toast('All delivered! Pop back to Postie Percy', 2800);
    return true;
  }
  function dollLabel(doll) {
    if (!active()) return null;
    const k = friendOf(doll);
    return k != null && left.has(k) ? { label: `Give a card to ${doll.who}`, icon: 'letter' } : null;
  }

  function nearestFriend() {
    let best = null, bd = 1e9;
    for (const k of left) {
      const p = friendPos(k);
      if (!p) continue;
      const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
      if (d < bd) { bd = d; best = { k, ...p }; }
    }
    return best;
  }

  function update(dt) {
    if (env.ds(n) === 'done' && !finished) finalLook();
    const show = revealed() && !busyElsewhere();
    if (box.visible !== show) box.visible = show;
    if (!show) return;
    if (wob > 0) {
      wob = Math.max(0, wob - dt);
      box.rotation.z = Math.sin(wob * 30) * 0.06 * Math.min(1, wob * 3);
    } else if (box.rotation.z) box.rotation.z = 0;
    if (accepted && !finished && bundle && player.carrying === bundle) {
      const s = 0.6 + 0.4 * (left.size / OF); // the bundle thins out
      bundle.scale.set(1, Math.max(0.35, s), 1);
    }
  }

  const act = {
    id: 'post', n,
    get busy() { return false; },
    onGiver() {
      if (finished || env.ds(n) === 'done') return;
      if (!accepted) { accept(); return; }
      if (left.size > 0) { env.say(n, 'remind'); return; }
      finishTask();
    },
    objective() {
      if (!active()) return null;
      if (left.size > 0) {
        const f = nearestFriend();
        return f ? { id: 'post-deliver', text: `Deliver Christmas cards (${delivered()}/${OF})`, icon: 'letter', x: f.x, z: f.z } : null;
      }
      const o = giverPos();
      return { id: 'post-back', text: 'Tell Postie Percy', icon: 'letter', x: o.x, z: o.z };
    },
    giverLabel() { return active() && left.size === 0 ? { label: 'Tell Postie Percy', icon: 'letter' } : null; },
    onDoll, dollLabel,
    update,
    sync({ reset } = {}) {
      if (reset) resetAll();
      if (env.ds(n) === 'done') finalLook();
    },
    get state() { return { accepted, finished, delivered: delivered(), left: [...left], carrying: !!bundle && player.carrying === bundle, boxVisible: box.visible }; },
    deliverAll() { // debug: accept, then give every friend a card (no walking)
      if (!accepted) act.onGiver();
      for (const k of [...left]) onDoll(env.givers[k]);
    },
    budget() { return { calls: 1, box: boxGeo.attributes.position.count / 3, bundle: bGeo.attributes.position.count / 3, tris: boxGeo.attributes.position.count / 3 }; },
    async selfTest(T) {
      await T.talk(n); // accept: four cards, in your hands
      T.check(accepted && left.size === OF, 'post: Percy accepted, four cards in the bundle');
      T.check(player.carrying === bundle && !!bundle, 'post: the bundle is carried');
      const o0 = act.objective();
      T.check(o0 && /Deliver Christmas cards \(0\/4\)/.test(o0.text), `post: objective "${o0 && o0.text}"`);
      for (const k of POST.to) {
        const g = env.givers[k];
        const lab = dollLabel(g);
        T.check(lab && lab.label === `Give a card to ${g.who}`, `post: label "${lab && lab.label}"`);
        const p = friendPos(k);
        T.teleport(p.x + 0.32, p.z + 0.22);
        const cur = ctx.interact.current;
        const hooked = !!cur && /Give a card to/.test(cur.label);
        T.check(hooked, `post: spot label for ${g.who} is "${cur && cur.label}"`);
        if (hooked) { game.emit('interact'); await T.tick(); } // the host hook (onDoll) handles it
        if (left.has(k)) onDoll(g); // host hook missing (Doors agent): call it directly, never press E (that would start a game)
        T.step(10);
        T.check(!left.has(k), `post: card delivered to ${g.who}`);
      }
      T.check(left.size === 0 && delivered() === OF, 'post: all four cards delivered');
      const o1 = act.objective();
      T.check(o1 && o1.text === 'Tell Postie Percy', `post: objective "${o1 && o1.text}"`);
      await T.talk(n); // done
      T.step(5);
      T.check(env.ds(n) === 'done', 'post: door 18 done after telling Percy');
      T.check(!player.carrying, 'post: bundle gone');
    },
  };
  act.dispose = () => { dropBundle(); engine.scene.remove(box); boxGeo.dispose(); bGeo.dispose(); };
  act.hook = { get state() { return act.state; }, deliverAll: () => act.deliverAll() };
  try { (window.__w3 = window.__w3 || {}).post = act.hook; } catch (e) { /* no window */ }
  act.sync();
  return act;
}
