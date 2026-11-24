'use strict';
/* =====================================================================
   SecureChat — criptografia de ponta a ponta (E2EE)

   - Cada aparelho tem um par de chaves X25519. A privada é gerada no
     navegador, marcada como NÃO exportável e guardada só no IndexedDB
     deste aparelho. A pública vai para key_registry no Supabase.
   - Cada mensagem usa uma chave aleatória própria (AES-256-GCM, IV de
     12 bytes). Essa chave é "embrulhada" para cada aparelho de cada
     membro da conversa com ECDH(X25519) -> HKDF-SHA256 -> AES-256-GCM.
   - O servidor guarda só: texto cifrado, IVs, chave pública do remetente
     e as chaves embrulhadas. Não consegue ler conteúdo, nome de arquivo
     nem tipo de arquivo.
   - O contexto (sala, remetente, tipo) entra como AAD: um texto cifrado
     não pode ser movido para outra conversa sem falhar na verificação.

   Limite conhecido: chaves estáticas por aparelho (sem Double Ratchet / Signal /
   MLS). Não há forward secrecy completo: se a chave privada de um aparelho
   vazar, mensagens antigas destinadas a ele podem ser lidas. Esta é uma PoC
   madura em ECDH+AES-GCM para navegadores — NÃO declare como Signal Protocol
   pronto para produção. Cada mensagem já usa AES efêmero; o gap é a identidade
   de longo prazo do aparelho.
   ===================================================================== */
(function () {
  const subtle = crypto.subtle;
  const te = new TextEncoder();
  const td = new TextDecoder();
  const SALT = te.encode('securechat-e2ee-v1');

  function b64(buf) {
    const a = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(s) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }
  function rand(n) { return crypto.getRandomValues(new Uint8Array(n)); }
  function concat(...parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  // ------------------------------------------------------------ backend X25519
  // Web Crypto nativo quando existe (Chrome 133+, Safari 17+, Firefox 130+);
  // senão, @noble/curves (auditada, sem dependências), hospedada no próprio site (/vendor).
  let backend = null; let noble = null;
  function loadNoble() {
    if (window.NobleX25519) return Promise.resolve(window.NobleX25519);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/sistemas/chat-seguro/vendor/noble-x25519.js';
      s.onload = () => (window.NobleX25519 ? resolve(window.NobleX25519) : reject(new Error('noble indisponível')));
      s.onerror = () => reject(new Error('não foi possível carregar a criptografia'));
      document.head.appendChild(s);
    });
  }
  async function detect() {
    if (backend) return backend;
    if (!subtle) throw new Error('Criptografia indisponível: abra o site por HTTPS.');
    try {
      await subtle.generateKey({ name: 'X25519' }, false, ['deriveBits']);
      backend = 'webcrypto';
    } catch {
      noble = await loadNoble(); backend = 'noble';
    }
    return backend;
  }

  async function generate() {
    await detect();
    if (backend === 'webcrypto') {
      const kp = await subtle.generateKey({ name: 'X25519' }, false, ['deriveBits']);
      const pub = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
      return { pub: b64(pub), priv: kp.privateKey, kind: 'webcrypto', created: Date.now() };
    }
    const priv = rand(32);
    return { pub: b64(noble.getPublicKey(priv)), priv, kind: 'noble', created: Date.now() };
  }

  async function ecdh(device, peerPubB64) {
    const peer = unb64(peerPubB64);
    if (peer.length !== 32) throw new Error('chave pública inválida');
    let secret;
    if (device.kind === 'webcrypto') {
      const pk = await subtle.importKey('raw', peer, { name: 'X25519' }, false, []);
      secret = new Uint8Array(await subtle.deriveBits({ name: 'X25519', public: pk }, device.priv, 256));
    } else {
      if (!noble) noble = await loadNoble();
      secret = noble.getSharedSecret(device.priv, peer);
    }
    if (secret.every((b) => b === 0)) throw new Error('chave pública fraca rejeitada');
    return secret;
  }

  // chave de embrulho entre dois aparelhos (a mesma calculada dos dois lados)
  const wrapCache = new Map();
  async function wrapKey(device, peerPubB64) {
    const id = device.pub + '|' + peerPubB64;
    if (wrapCache.has(id)) return wrapCache.get(id);
    const p = (async () => {
      const secret = await ecdh(device, peerPubB64);
      const ikm = await subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
      const pair = [device.pub, peerPubB64].sort().join('|');
      return subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: te.encode('wrap|' + pair) },
        ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    })();
    wrapCache.set(id, p);
    p.catch(() => wrapCache.delete(id));
    return p;
  }

  const gcm = (key, iv, data, aad, op) => subtle[op]({ name: 'AES-GCM', iv, additionalData: te.encode(aad), tagLength: 128 }, key, data);

  /**
   * Cifra `obj` (e opcionalmente os bytes de um arquivo) para uma lista de chaves públicas.
   * Retorna { env, fileCipher, K } — env vai para o banco; fileCipher para o storage.
   */
  async function encrypt(device, recipients, obj, aad, fileBytes) {
    const Kraw = rand(32);
    const K = await subtle.importKey('raw', Kraw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    const payload = { ...obj };
    let fileCipher = null;
    if (fileBytes) {
      const fiv = rand(12);
      fileCipher = new Uint8Array(await gcm(K, fiv, fileBytes, aad + '|file', 'encrypt'));
      payload.fiv = b64(fiv);
    }
    const iv = rand(12);
    const c = new Uint8Array(await gcm(K, iv, te.encode(JSON.stringify(payload)), aad, 'encrypt'));
    const keys = {};
    for (const r of new Set(recipients)) {
      const wk = await wrapKey(device, r);
      const wiv = rand(12);
      const w = new Uint8Array(await gcm(wk, wiv, Kraw, aad + '|key', 'encrypt'));
      keys[r] = b64(concat(wiv, w));
    }
    Kraw.fill(0);
    return { env: { v: 1, c: b64(c), iv: b64(iv), sk: device.pub, keys }, fileCipher, K, payload };
  }

  /** Decifra um envelope. Lança Error('nokey') se não foi cifrado para este aparelho. */
  async function decrypt(device, env, aad) {
    const entry = env && env.keys && env.keys[device.pub];
    if (!entry) throw new Error('nokey');
    const raw = unb64(entry);
    const wk = await wrapKey(device, env.sk);
    const Kraw = new Uint8Array(await gcm(wk, raw.subarray(0, 12), raw.subarray(12), aad + '|key', 'decrypt'));
    const K = await subtle.importKey('raw', Kraw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    Kraw.fill(0);
    const plain = await gcm(K, unb64(env.iv), unb64(env.c), aad, 'decrypt');
    return { obj: JSON.parse(td.decode(plain)), K };
  }

  async function decryptFile(K, fivB64, bytes, aad) {
    return new Uint8Array(await gcm(K, unb64(fivB64), bytes, aad + '|file', 'decrypt'));
  }

  // ------------------------------------------------------------ número de segurança
  // 60 dígitos (12 blocos de 5), como nos apps de mensagem: muda se qualquer
  // aparelho de qualquer um dos dois mudar.
  async function fingerprint(userA, keysA, userB, keysB) {
    const one = async (u, ks) => new Uint8Array(await subtle.digest('SHA-256',
      te.encode('sc-fp1|' + u + '|' + [...ks].sort().join(','))));
    const [fa, fb] = await Promise.all([one(userA, keysA), one(userB, keysB)]);
    const [x, y] = userA < userB ? [fa, fb] : [fb, fa];
    const h = new Uint8Array(await subtle.digest('SHA-512', concat(x, y)));
    const groups = [];
    for (let i = 0; i < 12; i++) {
      let n = 0;
      for (let j = 0; j < 5; j++) n = (n * 256 + h[i * 5 + j]) % 100000;
      groups.push(String(n).padStart(5, '0'));
    }
    return groups;
  }

  // ------------------------------------------------------------ armazenamento local
  function idb() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open('securechat-e2ee', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('devices');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function tx(mode, fn) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const t = db.transaction('devices', mode);
      const req = fn(t.objectStore('devices'));
      t.oncomplete = () => { db.close(); resolve(req && req.result); };
      t.onerror = () => { db.close(); reject(t.error); };
    });
  }
  const loadDevice = (uid) => tx('readonly', (s) => s.get(uid));
  const saveDevice = (uid, dev) => tx('readwrite', (s) => s.put(dev, uid));

  // só para testes: força o backend (ex.: simular navegador antigo sem X25519 nativo)
  function _forceBackend(b, lib) { backend = b; if (lib) noble = lib; }
  window.E2EE = { generate, encrypt, decrypt, decryptFile, fingerprint, loadDevice, saveDevice, b64, unb64, backend: () => backend, detect, _forceBackend };
})();
