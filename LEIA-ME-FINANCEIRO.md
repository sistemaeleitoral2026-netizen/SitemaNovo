# Menu Financeiro — Painel do Mandato (Matheus do Beiju)

## Arquivos (mesmos caminhos do repositório `sitemanovo`)
| Arquivo | O que é |
|---|---|
| `alimentacao-app/supabase/gabinete/financeiro.sql` | Tabelas `fin_*`. Rodar no projeto **GABINETE** (não no Nerites) |
| `api/_financeiro.js` | Configuração, leitura dos portais oficiais e cálculo do resumo mensal |
| `api/folha-cron.js` | Rotina diária: folha da Câmara (salário e equipe) + portal de despesas (VIEP) |
| `api/gabinete.js` | Ponte: recursos `financeiro`, `financeiro-lancamento`, `-excluir`, `-status`, `-competencia`, `-equipe` |
| `alimentacao-app/api/*` | Cópias idênticas dos 3 arquivos acima (o repositório mantém as duas pastas) |
| `alimentacao-app/src/lib/gabinete.ts` | Funções do financeiro no front |
| `alimentacao-app/src/pages/PainelMandatoPage.tsx` | Carrega o financeiro e grava o que o painel manda |
| `alimentacao-app/public/painel-do-mandato/index.html` | Painel com o menu **Financeiro** e os 5 submenus |
| `vercel.json` | Cron diário (9h de Brasília) + tempo máximo das funções |

## Passo a passo
1. **Supabase GABINETE:** abra o SQL Editor e rode `financeiro.sql`.
2. **Vercel:** a variável `CRON_SECRET` precisa existir (texto longo aleatório). `GABINETE_SUPABASE_URL` e `GABINETE_SERVICE_ROLE_KEY` já são usadas pela ponte.
   Opcionais: `FIN_DESDE` (padrão `2026-01`), `FIN_TETO_VIEP` (padrão `20000`), `FIN_TETO_GABINETE` (padrão `48331`, estimado).
3. **Deploy** e **carga inicial**. Repita até `"faltam": 0`, porque ela grava 4 meses por vez:
   `curl -H "Authorization: Bearer SEU_CRON_SECRET" https://SEU-DOMINIO/api/folha-cron`
4. Entre no Painel do Mandato e abra **Financeiro**.

## Submenus
- **Painel:** recebido, gasto e saldo do mês; VIEP usada × teto (sobrou e a receber); cota de gabinete × teto; despesas por categoria; últimos 6 meses.
- **Despesas:** lançar, editar e excluir notas, com origem (VIEP, recurso próprio ou outra fonte), categoria, mês da despesa e situação (pendente, enviado, reembolsado, glosado, pago).
- **Verbas da Câmara:** o que caiu na conta, oficial: salário bruto, desconto e líquido, VIEP recebida e empenhos.
- **Conciliação:** liga cada pagamento da VIEP ao mês a que ele se refere e mostra o fechamento mês a mês.
- **Equipe do gabinete:** quem trabalhou no período dele, quem continua e quem saiu, custo de cada um e dados extras (função real, telefone, quem indicou).

Só **admin** e **diretoria** alteram dados. Os outros perfis só veem.

## Para ajustar depois (`api/_financeiro.js`, bloco CONFIG)
- Quando sair o gabinete próprio dele (2027), acrescente em `gabinetes` a nova lotação com `desde`.
- O teto da cota de gabinete (R$ 48.331) é **estimado**. Confirme com a Câmara pelo e-SIC.
