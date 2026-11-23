/* Comprovantes — arquivos guardados no IndexedDB deste navegador.
   API: FPComprovantes.put(file) → id · get(id) → registro · del(id) · url(id) → blob URL */
(() => {
  'use strict';

  const DB_NAME = 'fp-comprovantes';
  const STORE = 'files';
  const MAX_BYTES = 10 * 1024 * 1024;
  const TIPOS = /^(image\/(png|jpe?g|webp|gif|heic|heif)|application\/pdf)$/i;

  let dbPromise = null;
  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('Este navegador não permite guardar arquivos.')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Falha ao abrir o armazenamento de comprovantes.'));
    });
    return dbPromise;
  }

  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      let out;
      Promise.resolve(fn(store)).then(r => { out = r; });
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Operação cancelada.'));
    });
  }

  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  function validar(file) {
    if (!file) return 'Nenhum arquivo selecionado.';
    if (file.size > MAX_BYTES) return 'O comprovante passa de 10 MB.';
    if (!TIPOS.test(file.type || '')) return 'Envie uma imagem (PNG, JPG, WEBP) ou um PDF.';
    return '';
  }

  async function put(file) {
    const erro = validar(file);
    if (erro) throw new Error(erro);
    const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const rec = { id, name: file.name || 'comprovante', type: file.type, size: file.size, blob: file, createdAt: new Date().toISOString() };
    await tx('readwrite', s => s.put(rec));
    return id;
  }

  async function get(id) {
    if (!id) return null;
    let out = null;
    await tx('readonly', s => reqP(s.get(id)).then(r => { out = r || null; }));
    return out;
  }

  async function del(id) {
    if (!id) return;
    try { await tx('readwrite', s => s.delete(id)); } catch { /* já removido */ }
  }

  const urls = new Map();
  async function url(id) {
    if (urls.has(id)) return urls.get(id);
    const rec = await get(id);
    if (!rec) return null;
    const u = URL.createObjectURL(rec.blob);
    urls.set(id, u);
    return u;
  }

  window.FPComprovantes = { put, get, del, url, validar, MAX_BYTES };
})();
