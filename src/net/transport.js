// Two interchangeable transports behind one interface (see core.js):
//   join(topic, presenceKey, {status, presence, pos}) → room {track(meta), send(event, payload) → bool, leave(), tick()}
//   rpc(fn, args) → Promise<{data, error}>        disconnect()
// - supabase: supabase-js v2 Realtime (presence + broadcast on channel `town:<n>`) and PostgREST RPCs.
// - local:    BroadcastChannel between tabs of the same origin (presence via heartbeats) + a localStorage "database".
//             Used for tests (?net=local); the cloud shell can't reach supabase.co.

const flattenPresence = (state) => {
  const out = [];
  if (!state || typeof state !== 'object') return out;
  for (const key of Object.keys(state)) {
    const arr = state[key];
    if (Array.isArray(arr) && arr.length) out.push({ key, meta: arr[arr.length - 1] }); // newest entry for this key
  }
  return out;
};

// ------------------------------------------------------------------ Supabase Realtime
export function createSupabaseTransport({ url, key }) {
  let client = null, loading = null;
  function getClient() {
    if (client) return Promise.resolve(client);
    if (!loading) {
      loading = import('@supabase/supabase-js').then(({ createClient }) => {
        client = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          // core.js tears the socket down on errors and retries with its own backoff; this only bounds the
          // socket's internal reconnect loop in between.
          realtime: { reconnectAfterMs: (tries) => Math.min(60000, 2000 * 2 ** Math.max(0, tries - 1)) },
        });
        return client;
      });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }
  return {
    kind: 'supabase',
    join(topic, presenceKey, h) {
      let ch = null, closed = false;
      getClient().then((c) => {
        if (closed) return;
        ch = c.channel(topic, { config: { presence: { key: presenceKey }, broadcast: { self: false, ack: false } } });
        const sync = () => { if (!closed && ch) h.presence(flattenPresence(ch.presenceState())); };
        ch.on('presence', { event: 'sync' }, sync)
          .on('presence', { event: 'join' }, () => {}) // 'sync' follows every join/leave diff with the full state
          .on('presence', { event: 'leave' }, () => {})
          .on('broadcast', { event: 'pos' }, (m) => { if (!closed && m) h.pos(m.payload); })
          .subscribe((status, err) => {
            if (closed) return;
            if (status === 'SUBSCRIBED') h.status('joined');
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') h.status('error', status + (err && err.message ? ': ' + err.message : ''));
            else if (status === 'CLOSED') h.status('closed', 'CLOSED');
          });
      }).catch((e) => { if (!closed) h.status('error', 'supabase-js failed to load: ' + (e && e.message)); });
      return {
        track(meta) {
          if (!ch || closed || ch.state !== 'joined') return Promise.resolve('not joined');
          return ch.track(meta).catch(() => 'error');
        },
        // only send while joined: otherwise supabase-js falls back to REST (and warns)
        send(event, payload) {
          if (!ch || closed || ch.state !== 'joined') return false;
          ch.send({ type: 'broadcast', event, payload }).catch(() => {});
          return true;
        },
        async leave() {
          closed = true;
          const c = ch;
          ch = null;
          if (!c) return 'ok';
          try { await client.removeChannel(c); } catch (e) { /* ignore */ }
          try { c.teardown(); } catch (e) { /* ignore */ }
          return 'ok';
        },
        tick() {},
      };
    },
    async rpc(fn, args) {
      try {
        const c = await getClient();
        return await (args ? c.rpc(fn, args) : c.rpc(fn));
      } catch (e) { return { data: null, error: { message: (e && e.message) || String(e) } }; }
    },
    async disconnect() {
      try { if (client && client.realtime) await client.realtime.disconnect(); } catch (e) { /* ignore */ }
    },
  };
}

// ------------------------------------------------------------------ local mock (BroadcastChannel)
/**
 * Same semantics as Supabase presence/broadcast, between tabs of one browser: each tracked tab announces itself
 * ('hi') on track and every heartbeatSec; peers expire after expireSec of silence; 'bye' on leave/pagehide.
 * A newly joined tab asks 'who' and reports its first presence sync after a short collection window.
 */
export function createLocalTransport({ clock = () => performance.now() / 1000, prefix = 'tinselby-net:', heartbeatSec = 2, expireSec = 12, storage = null } = {}) {
  const rooms = new Set();
  const mem = new Set();
  const SPIRIT_KEY = 'tinselby.localnet.spirit';
  const ls = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const readDb = () => {
    try { const a = JSON.parse(ls.getItem(SPIRIT_KEY) || '[]'); return new Set(Array.isArray(a) ? a : []); } catch (e) { return mem; }
  };
  const writeDb = (s) => { try { ls.setItem(SPIRIT_KEY, JSON.stringify([...s])); } catch (e) { /* in-memory only */ } };

  const t = {
    kind: 'local',
    join(topic, presenceKey, h) {
      let bc = null;
      try { bc = new BroadcastChannel(prefix + topic); } catch (e) { bc = null; }
      if (!bc) {
        setTimeout(() => h.status('error', 'BroadcastChannel unavailable'), 0);
        return { track: async () => 'error', send: () => false, leave: async () => 'ok', tick() {} };
      }
      const peers = new Map(); // presenceKey → {meta, seen}
      let me = null, open = true, ready = false, queued = false, lastBeat = -1e9;
      const post = (m) => { try { bc.postMessage(m); } catch (e) { /* closed */ } };
      const emitSync = () => {
        const list = [];
        for (const [k, p] of peers) list.push({ key: k, meta: p.meta });
        if (me) list.push({ key: presenceKey, meta: me });
        h.presence(list);
      };
      const queueSync = () => {
        if (!ready || queued) return;
        queued = true;
        setTimeout(() => { queued = false; if (open) emitSync(); }, 0);
      };
      bc.onmessage = (ev) => {
        const m = ev.data;
        if (!open || !m || typeof m !== 'object') return;
        if (m.t === 'who') { if (me) post({ t: 'hi', key: presenceKey, meta: me }); }
        else if (m.t === 'hi' && typeof m.key === 'string' && m.key !== presenceKey) {
          const p = peers.get(m.key);
          const changed = !p || JSON.stringify(p.meta) !== JSON.stringify(m.meta);
          peers.set(m.key, { meta: m.meta, seen: clock() });
          if (changed) queueSync();
        } else if (m.t === 'bye' && typeof m.key === 'string') { if (peers.delete(m.key)) queueSync(); }
        else if (m.t === 'b' && m.event === 'pos') h.pos(m.payload);
      };
      const beat = () => {
        if (!open) return;
        const now = clock();
        if (me && now - lastBeat >= heartbeatSec) { lastBeat = now; post({ t: 'hi', key: presenceKey, meta: me }); }
        let dropped = false;
        for (const [k, p] of peers) if (now - p.seen > expireSec) { peers.delete(k); dropped = true; }
        if (dropped) queueSync();
      };
      const iv = setInterval(beat, heartbeatSec * 1000);
      setTimeout(() => {
        if (!open) return;
        h.status('joined');
        post({ t: 'who' });
        setTimeout(() => { if (!open) return; ready = true; emitSync(); }, 350);
      }, 0);
      const room = {
        track(meta) { if (!open) return Promise.resolve('closed'); me = meta; lastBeat = -1e9; beat(); queueSync(); return Promise.resolve('ok'); },
        send(event, payload) { if (!open) return false; post({ t: 'b', event, payload }); return true; },
        leave() {
          if (!open) return Promise.resolve('ok');
          open = false;
          clearInterval(iv);
          if (me) post({ t: 'bye', key: presenceKey });
          try { bc.close(); } catch (e) { /* ignore */ }
          rooms.delete(room);
          return Promise.resolve('ok');
        },
        tick: beat,
      };
      rooms.add(room);
      return room;
    },
    tick() { for (const r of rooms) r.tick(); },
    /** Same shapes as the real database functions (supabase/migrations). */
    async rpc(fn, args) {
      const db = readDb();
      if (fn === 'town_spirit') {
        const helpers = new Set([...db].map((s) => String(s).split(':')[0])).size;
        return { data: [{ doors: db.size, helpers }], error: null };
      }
      if (fn === 'open_door') {
        const p = args && args.p_player, d = args && args.p_door;
        if (typeof p !== 'string' || !Number.isInteger(d) || d < 1 || d > 24) return { data: null, error: { message: 'invalid door' } };
        db.add(p + ':' + d);
        writeDb(db);
        return { data: db.size, error: null };
      }
      return { data: null, error: { message: 'unknown function ' + fn } };
    },
    disconnect() {},
    leaveAll() { for (const r of [...rooms]) r.leave(); },
  };
  return t;
}
