# Atualização e dados reais

## Garantias automáticas

1. Cada deploy recebe o identificador do commit da Vercel (`VERCEL_GIT_COMMIT_SHA`).
2. Todo iframe de `/sistemas/` recebe esse identificador na URL por `systemUrl(...)`.
3. O HTML principal e todos os arquivos de `/sistemas/**` são entregues com `no-store` também na CDN.
4. Abas abertas consultam o HTML atual ao ganhar foco e recarregam quando o arquivo principal mudou.
5. O Service Worker do Chat Seguro não guarda a interface e apaga caches das versões anteriores.
6. O Financeiro Pessoal incorporado usa `remote=1` e inicia vazio até receber o banco. A Assessoria MB ignora registros locais antigos enquanto aguarda o banco, preservando apenas alterações ainda pendentes de sincronização.

## Barreira contra regressão

`npm run build` executa primeiro `build-checks/validate-freshness.cjs`. A validação interrompe o build e o CI se detectar:

- iframe com URL fixa;
- remoção do identificador de build ou da atualização automática;
- remoção dos cabeçalhos `no-store` do navegador/CDN;
- retorno de cache de interface no Service Worker;
- Financeiro Pessoal fora do modo banco;
- remoção da espera pelo banco na Assessoria MB.

Assim, uma alteração futura — manual ou feita por IA — não chega à produção se reintroduzir esse problema.

## Limites honestos

As garantias impedem exibição persistente de uma versão antiga quando há conexão com a internet e o deploy concluiu. Falhas externas de internet, Vercel ou Supabase ainda podem impedir a atualização. Nesses casos, a aplicação deve falhar de forma explícita; não se deve substituir o banco por dados fictícios.
