// Gera o par de chaves VAPID para as notificações push.
// Uso (em alimentacao-app): node build-checks/chat-seguro/gen-vapid-chat.mjs
//  - a PÚBLICA vai em VITE_CHAT_VAPID_PUBLIC_KEY e CHAT_VAPID_PUBLIC_KEY (Vercel)
//  - a PRIVADA vai SOMENTE em CHAT_VAPID_PRIVATE_KEY na Vercel (nunca no site/git)
import { createECDH } from 'node:crypto';
const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
console.log('VAPID_PUBLIC_KEY=' + b64url(ecdh.getPublicKey()));
const priv = ecdh.getPrivateKey(); // garante 32 bytes (pode vir com zero à esquerda omitido)
console.log('VAPID_PRIVATE_KEY=' + b64url(Buffer.concat([Buffer.alloc(32 - priv.length), priv])));
