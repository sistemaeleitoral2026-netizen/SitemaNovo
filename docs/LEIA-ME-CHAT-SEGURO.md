# Chat Seguro (`/chat`)

Mensagens com **criptografia de ponta a ponta** dentro do sistema: conversas privadas, Sala Geral e
conversas temporárias, mensagens de **uma visão com comprovante** ("aberta por… às…"), alertas de
segurança, log de auditoria encadeado e Central de Segurança para admins.
Veio do projeto SecureChat; aqui roda no **mesmo login e no mesmo Supabase do Nerites**.

## Onde fica

| Parte | Caminho |
|---|---|
| Shell React (rota, acesso, ponte do login) | `alimentacao-app/src/pages/chat/ChatSeguroPage.tsx` |
| Interface (iframe) | `alimentacao-app/public/sistemas/chat-seguro/` (`app.js`, `e2ee.js`, `security-center.js`, `vendor/`) |
| Banco | `alimentacao-app/supabase/migrations/20261127_chat_seguro.sql` + `20261127b_chat_seguro_cron.sql` |
| Funções da Vercel | `api/_chat.js`, `api/chat-reveal.js`, `api/chat-delete-room.js`, `api/chat-push.js`, `api/chat-cleanup.js` (espelhadas em `alimentacao-app/api/`) |
| Teste da interface embutida | `alimentacao-app/build-checks/chat-seguro/test_embed.py` (Supabase simulado) |

## Quem acessa

- **Admin do Nerites** (`role`/`extra_roles`), ou
- quem for liberado em **/admin** com nível `admin` ou `editor` no sistema **Chat Seguro**
  (`profiles.acessos_externos->>'chat'`).
- Só essas pessoas aparecem como contatos. Tirou o acesso em /admin → o banco corta na hora (`sc_has_access`).
- Admin da Central de Segurança = admin do Nerites ou nível `admin` do Chat.

## Login (importante)

O iframe **não cria nem renova sessão**. A página React manda o token do login do sistema
(`chat-config`) e repassa os tokens renovados (`chat-token`). Assim o chat nunca disputa o refresh
token com o Nerites (o que deslogaria a pessoa). Sair / Trocar de sistema são pedidos à página.
Senha do bloqueio e de "apagar conversa" é conferida sem mexer na sessão do sistema.

## Banco: regras para não quebrar o Nerites

- **Tudo com prefixo `sc_`** (tabelas, funções, índices) e buckets `sc-files` / `sc-once`.
- **Não** cria `profiles`, **não** substitui `handle_new_user`/`is_admin`, **nenhum** gatilho em
  `auth.users`/`auth.sessions` (um erro ali travaria o login de todos os sistemas).
- Usa `profiles.nome` como nome exibido; o e-mail dos outros não aparece.

## Para colocar no ar (ainda NÃO foi aplicado)

1. **Supabase do Nerites → SQL Editor**: rode `20261127_chat_seguro.sql` inteiro.
2. **Realtime → Settings**: ligue canais privados (usado pelo "digitando…").
3. **Chaves das notificações**: em `alimentacao-app`, `node build-checks/chat-seguro/gen-vapid-chat.mjs`.
4. **Vercel → Environment Variables**:
   - `VITE_CHAT_VAPID_PUBLIC_KEY` (pública, vai para o site)
   - `CHAT_VAPID_PUBLIC_KEY`, `CHAT_VAPID_PRIVATE_KEY`, `CHAT_VAPID_SUBJECT` (`mailto:...`)
   - `CHAT_WEBHOOK_SECRET` (senha longa aleatória)
   - (já existentes: `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
5. Publicar (push) para as funções `/api/chat-*` existirem.
6. **Database → Webhooks** (dois, método POST, URL `https://sitema-novo.vercel.app/api/chat-push`,
   header `x-webhook-secret` = `CHAT_WEBHOOK_SECRET`): um para INSERT em `sc_messages`, outro para
   INSERT em `sc_security_alerts`.
7. **Database → Extensions**: `pg_cron` e `pg_net`; depois edite e rode `20261127b_chat_seguro_cron.sql`.
8. Em **/admin**, libere o Chat Seguro para quem vai usar.

## Limites

- Chaves de criptografia ficam **só no aparelho** (trocar de aparelho/limpar navegador = histórico antigo ilegível ali).
- Print/gravação de tela no celular não podem ser bloqueados por site; o app detecta só teclas no computador e avisa.
- Notificação no **iPhone** só funciona com app instalado na Tela de Início; o site principal ainda não é PWA,
  então no iPhone o chat funciona, mas sem push.
- Sem "sigilo futuro" (Double Ratchet) e sem proteção pós-quântica.
- O servidor vê metadados (quem fala com quem, quando, tamanho aproximado).
