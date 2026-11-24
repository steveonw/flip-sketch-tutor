// ---------- storage ----------
// Progress and settings live in this browser (localStorage). API keys are kept only in
// memory unless "remember" is ticked, and never go into exports.
const Store = (() => {
  const LS = 'flip-sketch-tutor:';
  const mem = {};
  let ok = true;
  return {
    get ok() { return ok; },
    get(k) {
      try { const t = localStorage.getItem(LS + k); if (t) return JSON.parse(t); } catch (e) { ok = false; }
      return mem[k] ? clone(mem[k]) : null;
    },
    set(k, v) {
      mem[k] = clone(v);
      try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { ok = false; }
    },
    del(k) { delete mem[k]; try { localStorage.removeItem(LS + k); } catch (e) {} },
  };
})();

// Attempt records (with pictures) go in IndexedDB so they survive a reload.
// If IndexedDB is unavailable they are kept in memory for this visit only.
const Records = (() => {
  let dbp = null, memOnly = false;
  const mem = [];
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open('flip-sketch-tutor', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('attempts')) {
            const s = db.createObjectStore('attempts', { keyPath: 'id' });
            s.createIndex('ts', 'ts');
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { memOnly = true; resolve(null); };
        req.onblocked = () => { memOnly = true; resolve(null); };
      } catch (e) { memOnly = true; resolve(null); }
    });
    return dbp;
  }
  function tx(db, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction('attempts', mode);
      const out = fn(t.objectStore('attempts'));
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  return {
    get memoryOnly() { return memOnly; },
    async put(a) {
      const i = mem.findIndex(x => x.id === a.id);
      if (i >= 0) mem[i] = a; else mem.push(a);
      const db = await open();
      if (!db) return;
      try { await tx(db, 'readwrite', s => s.put(a)); } catch (e) { memOnly = true; }
    },
    async all() {
      const db = await open();
      if (!db) return mem.slice().sort((a, b) => a.ts - b.ts);
      try {
        const rows = await tx(db, 'readonly', s => s.getAll());
        const byId = new Map((rows || []).map(r => [r.id, r]));
        mem.forEach(r => byId.set(r.id, r));
        return [...byId.values()].sort((a, b) => a.ts - b.ts);
      } catch (e) { memOnly = true; return mem.slice().sort((a, b) => a.ts - b.ts); }
    },
    async clear() {
      mem.length = 0;
      const db = await open();
      if (db) { try { await tx(db, 'readwrite', s => s.clear()); } catch (e) {} }
    },
  };
})();
