# Theikós AT — Progresso de Desenvolvimento

**Versão atual:** 5.8
**Última atualização:** 15/05/2026
**Stack:** Node.js + Express + MongoDB + HTML/CSS/JS (single-page)
**Deploy:** Railway → `https://theikos-at-production.up.railway.app/`
**Domínio customizado:** A configurar (comprar domínio → Railway Settings → Domains → Add Custom Domain → apontar CNAME)

---

## 🆕 Alterações da sessão 15/05/2026 (v5.7 → v5.8)

### 🌐 Portal do Cliente — módulo novo

**Arquivo novo:** `public/portal.html` — página separada acessível em `/portal`

**Funcionalidades do cliente:**
- Login próprio com usuário e senha (independente do sistema interno)
- Auto-login se sessão ainda estiver ativa
- KPIs: Total de chamados, Em aberto, Concluídos, Equipamentos
- **Meus Chamados** — cards visuais com status colorido (Aberta, Em andamento, Concluída, Cancelada), filtro por status, dados do técnico, prazo SLA, data de abertura
- **Abrir Chamado** — formulário completo (tipo, prioridade/SLA, equipamento, defeito, contato)
- **Ver Detalhes / PDF** — modal com todos os dados da OS (defeito, procedimento, peças, observações, campo de assinatura) + botão imprimir/gerar PDF via `window.print()`
- Seleção de equipamento cadastrado (preenche modelo e nº série automaticamente)
- Sessão separada da sessão do sistema interno (`req.session.portal_cliente`)
- OS abertas no portal chegam com `origem: 'portal'` para rastreamento

**Endpoints novos no server.js:**
- `GET /portal` e `GET /portal/*` → serve `portal.html`
- `POST /api/portal/login` — autenticação do cliente
- `POST /api/portal/logout`
- `GET /api/portal/me` — sessão atual
- `GET /api/portal/ordens` — OS do cliente logado
- `POST /api/portal/chamado` — abre novo chamado
- `GET /api/portal/equipamentos` — equipamentos do cliente
- `GET /api/portal/ordens/:id/pdf` — dados completos para impressão
- `POST /api/clientes/:id/portal-acesso` — admin cria/atualiza credenciais (requireAdmin)
- `POST /api/clientes/:id/portal-enviar-email` — admin envia credenciais por email
- `GET /api/portal/clientes-acesso` — lista todos clientes com status do portal (requireAdmin)

**Painel Admin — Usuários → aba "🌐 Portal do Cliente":**
- Tabela de todos os clientes com login, status (Ativo/Inativo/Sem acesso) e último acesso
- Painel lateral de configuração: login, senha (com gerador automático), toggle ativo/inativo
- Botão "📧 Enviar por E-mail" — manda email com link do portal + credenciais via SMTP Yahoo
- Email HTML profissional com logo, tabela de credenciais e link clicável

**Campos adicionados ao documento de cliente no MongoDB:**
- `portal_login`, `portal_senha_hash`, `portal_ativo`, `portal_criado_em`, `portal_ultimo_acesso`

---

## 🆕 Alterações da sessão 14/05/2026 (v5.6 → v5.7)

### 📅 Agenda / Calendário — módulo novo
- Novo item **"Agenda"** na sidebar, posicionado logo abaixo de OS/Atendimento
- Nova coleção MongoDB: `agenda` (adicionada também ao reset do sistema)
- Novos endpoints REST: `GET/POST /api/agenda`, `PUT/DELETE /api/agenda/:id` — com filtro por mês/ano

**Visão Mês:**
- Grid de calendário com navegação entre meses (‹ Anterior / Próximo ›) e botão "Hoje"
- Dia atual destacado em laranja; dia selecionado destacado em azul
- Até 2 eventos por célula + indicador "+N mais"
- OS abertas/em andamento aparecem automaticamente no dia do SLA (sem criar evento separado)
- Clique no dia exibe os eventos no painel lateral direito

**Visão Lista:**
- Tabela com todos os eventos do mês, ordenados por data/hora
- Colunas: Data, Hora, Tipo, Título, Técnico, Cliente, Status, Ações

**Painel lateral (visão mês):**
- Título com dia da semana e data selecionada
- Lista de eventos do dia com status badge, hora, técnico e cliente
- KPIs do mês: Total, Visitas, Preventivas, Confirmados, Pendentes

**Modal de evento (criar/editar):**
- Campos: Título, Tipo, Status, Data/Hora Início e Fim, Técnico, Cliente, OS Vinculada, Local, Descrição
- Botão "Excluir" visível apenas na edição

**Filtros na topbar:**
- Por técnico (select populado dinamicamente)
- Por tipo (OS, Visita, Preventiva, Reunião, Outros)
- Toggle Mês / Lista

**Sistema de cores por tipo:**
- OS → azul | Visita → verde | Preventiva → amarelo | Reunião → roxo | Outros → cinza | Cancelado → vermelho riscado

**Funções auxiliares adicionadas:**
- `navAgendaFromOS(osId)` — navega para a agenda no dia de SLA de uma OS
- `navAgendaDia(dataStr)` — navega para a agenda em um dia específico (uso futuro)

---

## 🆕 Alterações da sessão 12/05/2026 — parte 2 (v5.5 → v5.6)

### ✈️ Callmebot substituído por Telegram
- Integração de recuperação de senha migrada de WhatsApp/Callmebot → **Telegram Bot API**
- Funciona 100% no Brasil via `api.telegram.org`
- **Setup:** criar bot via `@BotFather` → obter token → configurar `TELEGRAM_BOT_TOKEN` no Railway
- Campo de usuário renomeado: "WhatsApp" → **"Telegram Chat ID"**
- Novo painel em Configurações → Integração Telegram:
  - Campo de token (com show/hide, salvo apenas no Railway por segurança)
  - Botão **"Buscar Chat IDs"** → chama `/api/telegram-updates` e lista quem já conversou com o bot, com botão de copiar Chat ID para o cadastro do usuário
  - Botão de envio de mensagem de teste
- `server.js`: função `enviarTelegram()` substituiu `enviarWhatsApp()`
- Endpoint `/api/telegram-updates` (GET, admin) — lista últimos contatos do bot
- Endpoint `/api/test-telegram` (POST, admin) — envia mensagem de teste
- Variável de ambiente: `TELEGRAM_BOT_TOKEN` (substituiu `CALLMEBOT_KEY`)

### ⚠️ Botão "Zerar Sistema" (usuário master/coringa)
- Visível **somente** quando logado como `master` — não aparece para nenhum outro perfil
- Localização: módulo Usuários → topbar (botão vermelho "⚠️ Zerar Sistema")
- Modal de confirmação com:
  - Aviso detalhado do que será apagado
  - Campo de digitação obrigatória: `APAGAR TUDO`
  - Feedback visual de erro se confirmação estiver errada
- Ao confirmar: chama `POST /api/reset-system` que apaga todas as coleções MongoDB
- Coleções apagadas: users, tecnicos, clientes, equipamentos, ordens, laboratorio, historico, estoque, estoque_movs, supr_cli, supr_movs, logistica, abastecimento, checklist, manutencao, pedidos_pecas, eq_baixados, lancamentos, contratos, financeiro, counter, sessions, notificacoes, configuracoes
- **Preservado:** apenas o usuário `master` (hardcoded no server, não está no MongoDB)
- Após conclusão: sessão destruída → logout automático → tela de login
- `server.js`: endpoint `/api/reset-system` protegido por `requireAuth` + verificação `isMaster`

---

## 🆕 Alterações da sessão 12/05/2026 — parte 1 (v5.4 → v5.5)

### ⚙️ Configurações — submenu expansível na sidebar (refeito)
- Menu de Configurações virou **submenu expansível** direto na sidebar (igual referência visual enviada)
- Clique em "Configurações" abre/fecha o grupo; cada item navega direto para o painel correspondente
- Item ativo fica destacado em laranja com borda esquerda; pai fica marcado com `has-active`
- Ao trocar de módulo, o submenu fecha e limpa os ativos corretamente
- Removido o nav lateral interno da página (card com lista dentro do conteúdo) — navegação agora é 100% pela sidebar
- Topbar atualiza o título e subtítulo conforme o item selecionado
- Itens do submenu: Dados da Empresa · E-mail / SMTP · Alertas · Suprimentos e Estoque · Prazos de SLA · Integração WhatsApp

### 📧 Painel E-mail / SMTP — expandido
- Host SMTP editável (não mais `readonly`) — suporta Yahoo, Gmail, qualquer servidor
- Porta como `<select>` com opções: 587 TLS (padrão), 465 SSL, 25 sem criptografia
- Campo "Nome do remetente" e "Reply-to" adicionados
- Toggle TLS/STARTTLS
- Botão de mostrar/ocultar senha
- Help-tip explica Yahoo e Gmail lado a lado

### 🐛 Bug: menu sumia ao clicar em Configurações
- **Causa:** `nav()` limpava todos `.ni` — o bloco `.ni-parent`/`.ni-child` não era `.ni`, então perdia estado mas também não ativava nada visível, causando aparência de "menu sumiu"
- **Correção:** `nav()` agora fecha o submenu cfg quando troca de módulo, e `navCfg()` ativa a página cfg + abre o submenu sem depender da classe `.ni`

---

## 🆕 Alterações da sessão 11/05/2026 (v5.3 → v5.4)

### 🎨 Sistema de Botões Unificado
- Todos os `.btn` agora têm **altura fixa** (`34px` base, `30px` para `-sm`, `26px` para `-xs`)
- **Borda visível** `1.5px` em todos os tipos (ghost, danger, success, info)
- `border-radius: 8px` consistente em todo o sistema
- `.btn-xs` tem `border-radius: 6px` para contextos compactos (tabelas)
- Eliminada variação de padding inconsistente — substituído por `height` + `padding horizontal`
- Todos os botões forçam `font-family: Sora` e alinhamento `justify-content: center`

### 🔤 Fontes Padronizadas
- Regra global garante `font-family: Sora` e `font-size: 12px` em **todos** os `button` fora do sistema `.btn`
- Removida exceção `.sb-toggle` da regra de reset (botão agora é div, não button)
- Login button (`.lbtn`) alinhado: `height: 40px`, `border-radius: 9px`, sem padding manual

### 🔘 Sidebar Recolhível — botão movido para dentro
- **Antes:** botão `position:fixed` flutuando na borda direita da sidebar, sobrepondo conteúdo
- **Depois:** botão integrado ao rodapé da própria sidebar, acima do usuário logado
- Expandido: mostra ícone + texto "Recolher menu"
- Recolhido: mostra apenas o ícone centralizado com seta invertida
- Removido `collapsed-pos` e toda lógica de `left:` dinâmico do JS
- CSS do toggle reescrito sem `position:fixed`

### 🔑 "Esqueceu a senha?" — corrigido (funcionava só após login)
- **Causa:** modal `m-forgot` tem `z-index: 1000`, mas a tela de login tem `z-index: 9999`, cobrindo o modal
- **Correção:** `openForgotPassword()` agora eleva o modal para `z-index: 10000` antes de abri-lo
- Funciona corretamente **antes do login**, direto da tela de autenticação
- Nenhuma alteração na lógica de envio de código (email/WhatsApp) ou nas 3 etapas

---

## ✅ Módulos Concluídos

### 📅 Agenda / Calendário
- Calendário visual mensal com navegação entre meses
- OS abertas aparecem automaticamente no dia do SLA
- Eventos manuais: Visita, Preventiva, Reunião, Outros
- Painel lateral com eventos do dia selecionado e KPIs do mês
- Visão lista com tabela filtrável
- Filtros por técnico e tipo
- Modal completo para criar/editar/excluir eventos
- Coleção MongoDB: agenda

### 🏠 Dashboard (redesenhado)
- 4 KPIs principais com gradiente de cor e ícone SVG (OS Abertas, Concluídas, Gasto Total, Estoque Crítico)
- Faixa compacta com 6 KPIs secundários (OS Total, Lab, Retrabalhos, Rotas, Combustível, Itens Estoque)
- Gráficos reorganizados em 3 colunas com respiro visual
- Filtro de período (De/Até) + botões rápidos 7d / 30d / 90d
- Sino de notificações na topbar com badge vermelho e painel de OS com SLA atrasado
- Botão ? de ajuda integrado na topbar
- Alertas de estoque abaixo do mínimo
- Exportação PDF

### 📝 OS / Atendimentos
- KPIs clicáveis no topo (Total, Abertas, Em Andamento, Concluídas, Canceladas)
- Filtros por status, técnico e período + busca por texto
- Mudança de status direto na tabela
- Modal com 5 abas: Resumo, Técnico, Gastos, Histórico do equipamento, Assinaturas
- Campo Tipo de OS: Corretiva, Preventiva, Urgente, Instalação, Outros
- Campo Prazo SLA: 12h / 24h / 48h / Manual
- Coluna SLA na tabela com badge colorido em tempo real
- Bloqueio de nova OS para Nº Série com OS em aberto
- Troca de Nº Série
- Exportação Excel e PDF

### ⏱ SLA (integrado nas OS)
- Badge visual em tempo real: verde (no prazo), amarelo (risco), vermelho piscando (atrasado)
- Sino de notificações mostra OS atrasadas ou com menos de 2h restantes
- Atualização automática a cada 1 minuto
- Alertas de SLA na Central de Notificações

### 🚛 Logística
- 4 abas: Rotas, Abastecimento, Checklist, Manutenção
- KPIs: km total, litros, custo total, próxima manutenção
- Exportação Excel

### 🔬 Laboratório Técnico
- 4 abas: Bancada, Pedidos de Peças, Escopo (checklist 20 itens), Baixados
- Baixa no estoque ao confirmar uso de peça
- Exportação Excel

### 📂 Histórico de Atendimentos
- Aba OS Finalizadas: tabela com KPIs, filtros, Timeline visual do atendimento
- Aba Lançamentos Manuais: atendimentos sem OS com modal completo
- Exportação Excel por aba
- Coleção MongoDB: lancamentos

### 📦 Estoque
- 3 abas: Peças, Movimentações, Alertas
- KPIs: total, abaixo do mínimo, zerados, valor total
- Entradas/saídas manuais com modal
- Exportação Excel
- Coleção MongoDB: estoque_movs

### 🖨 Suprimentos do Cliente
- 2 abas: Estoque por Cliente, Histórico Global
- Cards visuais por suprimento com alerta de baixo estoque
- Exportação Excel

### 👤 Técnicos (reformulado)
- Cards visuais com faixa colorida por nível hierárquico
- Foto com upload base64
- Níveis: Estagiário → Aux. Técnico → Téc. Júnior → Téc. Pleno → Téc. Master → Supervisor de Operações → Gerente
- Funções: Campo, Lab, Impressão, Informática, Redes, Dev. de Sistemas, Suporte TI, Refrigeração, etc.
- Campos completos: CPF, admissão, status, salário, endereço
- Botão OS navega direto para OS do técnico

### 🔐 Usuários do Sistema (reformulado)
- 3 abas: Usuários, Perfis de Acesso, Recuperação de Senha
- 9 perfis com controle de abas visíveis por perfil
- Usuário coringa oculto da API
- Último acesso gravado a cada login

**Perfis e abas:**

| Perfil | Abas |
|--------|------|
| admin / supervisor | Todas |
| administrativo | Tudo exceto Usuários |
| tecnico | OS, Lab, Estoque, Clientes, Suprimentos, Histórico |
| laboratorio | Lab, OS, Estoque, Clientes, Suprimentos, Histórico |
| logistica | Logística, OS, Clientes, Estoque, Dashboard, Relatórios |
| comercial | Dashboard, Clientes, OS, Estoque, Histórico |
| financeiro | Dashboard, OS, Histórico, Relatórios |
| rh | Técnicos, Usuários, Dashboard |

### 📋 Contratos
- Cards visuais com status (verde/laranja/vermelho)
- Tipos: Fixo Mensal e Franquia de Cópias
- 4 abas: Ativos, A Vencer (30d), Vencidos, Todos
- Renovação automática lança receita no Financeiro
- Badge no menu com urgências
- Coleção MongoDB: contratos

### 💰 Financeiro
- Receitas automáticas ao fechar contrato/renovar e ao concluir OS
- 3 abas: Lançamentos, DRE, Fluxo de Caixa
- DRE agrupado por mês com gráfico de barras
- Coleção MongoDB: financeiro

### 🔔 Notificações
- Sino no menu lateral com badge e painel de alertas
- Página dedicada com 4 abas: Todas, Críticas, Avisos, Informações
- Alertas automáticos: SLA estourado/em risco, estoque crítico, contratos vencidos, OS paradas, manutenções vencidas

### ⚙️ Configurações
- 5 seções: Dados da Empresa, Email (SMTP Yahoo), WhatsApp (Callmebot), Prazos SLA por tipo, Alertas on/off

### 🔑 Recuperação de Senha (tela de login)
- Modal de 3 etapas acessível diretamente na tela de login (z-index corrigido)
- Código de 6 dígitos via Email (Yahoo SMTP) ou WhatsApp (Callmebot)
- Expira em 15min, máximo 5 tentativas
- Fecha automaticamente ao fazer login

### 📖 Manual de Ajuda Integrado
- Botão ? na topbar abre modal com navegação por módulo
- Tópicos: Visão Geral, Dashboard, OS, SLA, Logística, Lab, Estoque, Clientes, Usuários

### 🔘 Sidebar Recolhível
- Botão integrado ao rodapé da sidebar (não mais flutuante)
- Colapsa para 56px (só ícones), expande o conteúdo principal
- Texto "Recolher menu" visível expandido, apenas ícone invertido quando recolhido
- Estado salvo no localStorage

---

## 🔄 Pendente / Em andamento

| Item | Status | Notas |
|------|--------|-------|
| Agenda / Calendário | ✅ Concluído | Visão mês + lista, eventos manuais + OS por SLA |
| Frota | ❌ Pendente | Veículos, CRLV, seguro, vencimentos |
| Relatórios expandidos | ⚠️ Parcial | Existe básico, precisa expandir |
| Portal do cliente | ✅ Concluído | Login, abertura de chamado, acompanhamento, PDF |

---

## 📁 Arquivos do Projeto

```
projeto/
├── public/
│   ├── index.html      (~7700 linhas)
│   └── portal.html     (~280 linhas)
├── server.js           (~990 linhas)
└── PROGRESSO.md
```

---

## 🔗 Como continuar em novo chat

1. Suba index.html + server.js + PROGRESSO.md
2. Diga: "Continuando o projeto Theikós AT. Veja o PROGRESSO.md — quero trabalhar em X"

---

## 🗄️ Coleções MongoDB

| Coleção | Módulo |
|---------|--------|
| users | Usuários |
| tecnicos | Técnicos |
| clientes | Clientes |
| equipamentos | Equipamentos |
| ordens | OS (inclui sla_horas, sla_deadline, tipo) |
| laboratorio | Bancada do lab |
| historico | Histórico |
| estoque | Peças e suprimentos |
| estoque_movs | Movimentações de estoque |
| supr_cli | Suprimentos por cliente |
| supr_movs | Movimentos de suprimentos |
| logistica | Rotas |
| abastecimento | Abastecimentos |
| checklist | Checklists de veículos |
| manutencao | Manutenções de veículos |
| pedidos_pecas | Pedidos de peças (lab) |
| eq_baixados | Equipamentos baixados |
| lancamentos | Lançamentos manuais histórico |
| contratos | Contratos de clientes |
| financeiro | Lançamentos financeiros |
| counter | Contador de OS |
| sessions | Sessões de login |
| agenda | Agenda / Calendário |

---

## 🌐 Variáveis de Ambiente no Railway

| Variável | Para que serve |
|----------|---------------|
| MONGODB_URI | Banco de dados |
| SESSION_SECRET | Segurança das sessões |
| SMTP_PASS | Recuperação por email (senha de app Yahoo) |
| TELEGRAM_BOT_TOKEN | Recuperação via Telegram (token do bot criado no @BotFather) |

---

## 💡 Próximas implementações aprovadas

1. 🚗 Frota — CRLV, seguro, documentos, vencimentos
2. 📊 Relatórios expandidos
