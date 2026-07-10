# Orion AT — Resumo da Análise e Plano de Ação
*(documento de continuidade — cole ou anexe isso no novo chat para retomar exatamente daqui)*

## 1. O que é o sistema
Orion AT é um sistema real e funcional de gestão para outsourcing/assistência técnica de impressão. Stack: Node.js/Express + MongoDB Atlas + Cloudinary + sessões, deploy via Railway. Módulos: Dashboard/KPIs, Ordens de Serviço (assinatura digital + fotos), Laboratório, Logística/frota, Clientes/Equipamentos, Estoque, Financeiro (com MRR), Contratos, Agenda, Relatórios PDF, Portal do cliente (SSE em tempo real), e um agente SNMP compilado em .exe (serviço Windows) que coleta contadores/toner remotamente.

Hoje é uma base única (um `server.js`, um banco Mongo, uma sessão de auth) servindo três frentes:
- **Orion Print/Gestão** (index.html) — painel interno administrativo.
- **Orion Monitoramento** (monitor.html + orion-agente.js) — coleta SNMP e dashboard de frota.
- **Orion Client** (portal.html) — portal público do cliente final.

## 2. Nicho e concorrência (validado por pesquisa real)
- Outsourcing de impressão no Brasil é mercado maduro: ~80% das impressoras corporativas vendidas já vêm em contrato de outsourcing (dado citado pela HP). Players como DocService gerenciam 500 mil+ equipamentos.
- Concorrentes diretos: **ILUX/Softilux** e **AgoraOS** (ERPs brasileiros de outsourcing, com faturamento fiscal nativo). Concorrentes de monitoramento: **FMAudit, PrintFleet, MPS Monitor, YSoft SafeQ, Print Audit/ECI Printanista** (cobram em dólar, focados só em monitoramento).
- Diferencial do Orion AT: junta FSM completo + monitoramento próprio + portal em tempo real num produto só — combinação que nenhum concorrente pesquisado oferece de forma unificada e barata.

## 3. Lacunas identificadas (seção 5 original)
1. Faturamento fiscal (NF-e/NFS-e) automático — falta.
2. Cobrança automática ligada a contador/franquia do contrato — falta o elo final.
3. Suporte multi-fabricante SNMP em escala.
4. Certificado de assinatura de código (.exe dispara SmartScreen).
5. App mobile nativo (hoje só web responsivo).
6. Multi-tenancy real (isolamento de dados por empresa cliente).
7. Auditoria/LGPD.
8. Itens de estabilização já listados no PROGRESSO.md (testes em produção real, etc.).

## 4. Estimativa de aceitação B2B (qualitativa, não medida)
- Uso interno: 85–90%.
- Venda como produto para terceiros, no estado atual: 30–45%.
- Com os itens da seção 3 resolvidos + reposicionamento: 50–60% (estimativa).

## 5. Decisão estratégica: dividir em dois produtos complementares
- **Produto A — Orion Gestão**: OS, laboratório, logística, estoque, financeiro, contratos, agenda, portal do cliente. Vende para qualquer assistência técnica.
- **Produto B — Orion Monitor**: agente SNMP + dashboard de frota + alertas. Vende sozinho como "porta de entrada" barata (land-and-expand), competindo em preço com FMAudit/PrintFleet/MPS Monitor.

## 6. Baratear custo de infraestrutura (baixo/zero custo)
| Atual | Custo | Alternativa |
|---|---|---|
| Railway | US$5–20+/mês | Oracle Cloud Free Tier (VM ARM permanente) ou Fly.io free |
| MongoDB Atlas M10 | US$60+/mês | Atlas M0 gratuito (512MB) para começar |
| Cloudinary | US$89–99+/mês | Cloudflare R2 (10GB grátis, sem custo de egress) — **status 09/07/2026: deixou de ser só otimização de custo, virou bloqueio ativo** (limite de 10MB do plano grátis do Cloudinary impede upload do `.exe` do agente, 36.9MB). Decisão adiada entre correção rápida (`upload_large_stream`, chunked, sem trocar de provedor) ou migração completa pro R2 — ver PROGRESSO.md sessão 12. |
| Certificado EV code signing | US$280–410/ano | Certificado **OV** (Sectigo/Certum, ~US$100–130/ano) — desde 2026 a Microsoft removeu o bypass automático de SmartScreen até para EV, então EV caro perdeu a vantagem prática |

## 7. Como resolver os itens da seção 3, priorizado por esforço/impacto
- **Imediato/baixo esforço:** PWA (manifest + service worker) em vez de app nativo; certificado OV + submissão de reputação ao SmartScreen.
- **Curto prazo:** multi-tenant (`tenant_id` em todas as coleções) — fazer **antes** de separar bancos; LGPD/auditoria (coleção `audit_log` + política de retenção, usando modelos gratuitos da ANPD como base); SNMP multi-fabricante via **Printer-MIB padrão (RFC 3805)**, que cobre a maioria dos fabricantes modernos sem precisar de integração proprietária por marca.
- **Médio prazo:** faturamento automático contador→NF via API paga por nota (**Focus NFe** ou **PlugNotas**, sem mensalidade fixa alta) — não construir motor fiscal próprio.

## 8. Sequência de execução (ordem e prazos)
0. **Hoje:** backup total do Mongo + branch git de segurança + ambiente de staging no stack gratuito.
1. **Semana 1:** trocar Cloudinary→R2; comprar certificado OV; assinar o .exe.
2. **Semana 1-2 (paralelo):** PWA no index.html e portal.html.
3. **Semana 2-3:** modularizar `server.js` em domínios (`/core`, `/routes/gestao`, `/routes/monitor`, `/routes/portal`) sem mudar comportamento — preparação para separação física.
4. **Semana 3-5:** multi-tenant (`tenant_id`) — fazer enquanto ainda é um banco só.
5. **Semana 4-6 (paralelo):** LGPD/auditoria.
6. **Mês 2:** separação física em monorepo (`/packages/core`, `/apps/orion-gestao`, `/apps/orion-monitor`, `/apps/orion-client`), cada um com deploy próprio, mas ainda no mesmo cluster Mongo gratuito (bancos separados: `orion_gestao`, `orion_monitor`).
7. **Mês 2-3:** Printer-MIB padrão no agente (dentro de `orion-monitor`).
8. **Mês 3:** integração Focus NFe/PlugNotas (dentro de `orion-gestao`) — deixado por último por depender de fatores externos (habilitação NFS-e municipal, certificado digital do cliente).
9. **Só quando houver o 1º cliente pagante do Orion Monitor separado:** migrar para repositórios Git físicos distintos (evita custo duplo de DevOps sem necessidade comprovada).

## 9. Arquitetura final das três bases
| Hoje (unificado) | Depois | Parte de | Banco |
|---|---|---|---|
| Orion Print (index.html) | `orion-gestao` | Produto A | `orion_gestao` (com `tenant_id`) |
| Orion Client (portal.html) | `orion-client` | Produto A (face pública) | mesmo `orion_gestao`, acesso via API interna restrita |
| Orion Monitoramento (monitor.html + agente) | `orion-monitor` | Produto B | `orion_monitor` (independente, vendável sozinho) |

## 10. Correções importantes feitas pelo usuário (não reverter)
- **Fluxo de autenticação real:** Orion Monitor ↔ Orion Agente (coleta de dados). É o **Agente** quem controla/gera o acesso (login) do **Orion Client** para aquele cliente específico — não o Monitor diretamente.
- **Orion Client é isolado:** não tem acesso a nenhum outro módulo, cliente ou tenant.
- **Transparência de faturamento (ponto validado):** como a cobrança (NF) será calculada a partir da leitura de contador do Agente, o cliente final deve poder ver os **mesmos dados que fundamentam a cobrança dele** — contador atual, franquia contratada, excedente, histórico de leitura do próprio equipamento. NÃO deve ver: custo/margem interna da empresa, dados de outros clientes, financeiro interno, observações internas de técnico. Isso também é um diferencial comercial (prevenção de disputa de fatura) frente a concorrentes que não expõem essa leitura de forma clara ao cliente.
- **Um único agente de monitoramento (09/07/2026):** existiam dois códigos-fonte paralelos pro agente SNMP — um hand-rolled (`orion-agente.js`, morto, nunca gerou o `.exe` real) e outro usando a lib `net-snmp` (`agent.js`, o que de fato é compilado e distribuído). O primeiro foi removido do repositório; `orion-agente/agent.js` (net-snmp) é agora a única fonte oficial. Não recriar o hand-rolled nem manter os dois em paralelo.
- **`admin` (bootstrap) e `master` (coringa) são contas com propósitos diferentes, não devem se sobrepor:** `admin` é um perfil administrativo normal (`role:'admin'`, `perfil:'Administrador'`), `master` é o login oculto de acesso irrestrito via `MASTER_PASSWORD`. A conta `admin` não deve carregar `isMaster:true` — isso já causou um bug (mascarou por meses um erro real de perfil na conta `admin` de produção). Funcionalidades de altíssimo risco (ex: Simulador do Monitor, que injeta/apaga dados) devem checar `isMaster`, nunca só `role==='admin'`.

## 11. Próximo passo em aberto quando a conversa foi pausada
Estávamos prestes a detalhar o **fluxo técnico de autenticação entre Monitor → Agente → Client**, incorporando a correção do item 10, quando a conversa foi pausada pelo limite de uso. É o ponto natural para retomar no novo chat.
