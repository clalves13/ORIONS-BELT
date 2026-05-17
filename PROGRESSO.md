# Orion Print — Progresso de Desenvolvimento

**Versão atual:** 7.0
**Última atualização:** 17/05/2026
**Stack:** Node.js + Express + MongoDB + HTML/CSS/JS (single-page)
**Deploy:** Railway → `https://orion-em-production.up.railway.app/`
**Repositório GitHub:** `https://github.com/clalves13/orion-at`
**Nome do sistema:** Orion Print

---

## ⚠️ LEIA ANTES DE CONTINUAR — ESTADO ATUAL DO PROJETO

### Estrutura de arquivos no PC local (`C:\theikos_at\`)
```
theikos_at/
├── public/
│   ├── index.html       (~8570 linhas) ✅ v7.0
│   ├── portal.html      (~280 linhas)  ✅ Orion Client
│   └── monitor.html     (~320 linhas)  ✅ Orion View
├── orion-agente/
│   ├── dist/
│   │   ├── orion-agente-win.exe  (~38MB)
│   │   ├── config.json
│   │   ├── install.bat
│   │   ├── uninstall.bat
│   │   └── README.txt
│   ├── agent.js                  ✅ pede chave na 1ª execução
│   ├── build-exe.js              ✅
│   ├── service-install.js
│   ├── service-uninstall.js
│   └── package.json
├── server.js            (~1221 linhas) ✅ v7.0
├── package.json         ✅
├── package-lock.json
├── .gitignore
├── PROGRESSO.md
└── railway.toml
```

---

## 🆕 Alterações v7.0 — 16/05/2026

### ✅ Relatórios — módulo completo expandido
Nova página **Relatórios** na sidebar com filtros e 8 painéis:

**Filtros globais:**
- Período (De/Até) com atalhos: 7d, 30d, 90d, Este mês, Este ano, Tudo
- Filtro por Técnico e por Cliente

**Painéis:**
1. KPIs do período — Total OS, Concluídas, Em andamento, Abertas, Atrasadas, Receita
2. OS por Status — barras de progresso com percentuais
3. Produtividade por Técnico — OS, concluídas, eficiência %, receita
4. OS por Cliente (Top 10) — ranking com receita
5. Desempenho de SLA — % no prazo, atrasadas, estouradas
6. Resumo Financeiro — receita, gastos, resultado
7. Logística e Frota — rotas, km, litros, custo
8. Estoque Crítico — itens zerados e abaixo do mínimo

Botão 🖨 PDF em cada painel. Abre com período "Este mês" por padrão.

### ✅ Veículos / Frota na Logística (v6.2)
Nova aba 🚗 Veículos dentro de Logística:
- Cadastro: placa, tipo, marca, modelo, ano, cor, km, responsável
- CRLV com vencimento + alerta (15/30/60/90 dias)
- Seguro com seguradora, apólice, valor, vigência, vencimento + alerta
- Cards visuais: 🟢 ok / 🟡 próximo / 🔴 vencido
- Alertas automáticos nas Notificações
- Coleção MongoDB: `veiculos`

### ✅ Infraestrutura renomeada
- GitHub: `theikos-at` → `orion-at`
- Railway serviço renomeado para `orion-em`
- SESSION_SECRET atualizado para `orion2026`

### ✅ Agente de Monitoramento (v6.1)
- Chave gerada automaticamente ao cadastrar cliente
- GET /download/agente — download do .exe
- POST /api/monitor/registrar-agente — valida chave
- Configurações → aba "Agente de Monitoramento"
- Card do cliente mostra chave com 📋 copiar

---

## 🎨 Ajustes de UI — 17/05/2026

### ✅ monitor.html (Orion View)
- **Logo:** aumentada para 52×52px com efeito `drop-shadow` laranja/dourado para destacar no fundo escuro do header (`--nv: #0d1f3c`)
- **Botão "Atualizar":** corrigido — estava invisível (branco sobre branco por herdar `.btn-ghost` com `background:#fff` mas ter `color:#fff`). Agora usa `background: rgba(255,255,255,.12)` com borda sutil para ser visível no header escuro.
- **Botão "Simulador":** mantido com `background: var(--ac)` (laranja) e `color:#fff`, funcionando corretamente.

### ✅ portal.html (Orion Client)
- Renomeado de "Portal do Cliente" → **Orion Client**
- Logo maior (44px) com fundo transparente

---

## ✅ TODOS OS MÓDULOS CONCLUÍDOS

| Módulo | Status |
|--------|--------|
| Dashboard | ✅ KPIs, gráficos, filtros, notificações SLA |
| OS / Atendimentos | ✅ SLA, origem, histórico técnico |
| Agenda / Calendário | ✅ Visão mês + lista |
| Logística | ✅ Rotas, abastecimento, checklist, manutenção, veículos |
| Laboratório | ✅ Bancada, pedidos peças, escopo, baixados |
| Histórico | ✅ OS finalizadas + lançamentos manuais |
| Estoque | ✅ Peças, movimentações, alertas |
| Suprimentos Cliente | ✅ Estoque por cliente |
| Técnicos | ✅ Cards visuais, níveis, fotos |
| Usuários | ✅ Perfis, recuperação senha, Portal do Cliente |
| Contratos | ✅ Fixo mensal, franquia cópias, renovação auto |
| Financeiro | ✅ Lançamentos, DRE, Fluxo de Caixa |
| Notificações | ✅ SLA, estoque, contratos, CRLV, seguro |
| Configurações | ✅ Sidebar + aba Agente de Monitoramento |
| Portal do Cliente | ✅ /portal — Orion Client — chamados, PDF |
| Monitor Impressoras | ✅ /monitor — Orion View — SNMP em tempo real |
| Relatórios | ✅ Página completa — filtros + 8 painéis + PDF |

---

## 🔮 ÚNICA PENDÊNCIA — Wizard Gráfico Electron

Instalador visual profissional para o agente (igual ao PrintWayy).

### Fluxo das 5 telas
```
Tela 1 → Bem-vindo (logo Orion Print + versão)
Tela 2 → Digite a chave do cliente
Tela 3 → Impressoras encontradas na rede (SNMP scan + checkboxes)
Tela 4 → Instalando... (barra de progresso)
Tela 5 → ✅ Sucesso  ou  ❌ Falha
```

### Stack
- Electron + electron-builder → gera .exe (~60-80MB)
- agent.js reaproveitado como backend

### Estimativa
2-3 dias dedicados. Não bloqueia o uso do sistema.

---

## 🏠 Próximos passos após Wizard

Migração para **Hostinger VPS** (produção definitiva):
- Site + sistema no mesmo servidor
- ~R$40-60/mês
- Node.js + MongoDB no VPS

---

## 🔗 Como continuar em novo chat

1. Suba `public/index.html` + `server.js` + `PROGRESSO.md`
2. Diga: **"Continuando o projeto Orion Print. Veja o PROGRESSO.md."**

---

## 🗄️ Coleções MongoDB (banco: `orion_at`)

| Coleção | Módulo |
|---------|--------|
| users | Usuários |
| tecnicos | Técnicos |
| clientes | monitor_key (auto), monitor_ativo, portal_login |
| equipamentos | Equipamentos |
| ordens | OS |
| laboratorio | Bancada |
| historico | Histórico |
| estoque | Peças |
| estoque_movs | Movimentações |
| supr_cli | Suprimentos por cliente |
| supr_movs | Movimentos suprimentos |
| logistica | Rotas |
| abastecimento | Abastecimento |
| checklist | Checklists |
| manutencao | Manutenções |
| veiculos | 🆕 Frota (placa, CRLV, seguro) |
| pedidos_pecas | Pedidos peças |
| eq_baixados | Equipamentos baixados |
| lancamentos | Lançamentos manuais |
| contratos | Contratos |
| financeiro | Financeiro |
| counter | Contador OS |
| sessions | Sessões |
| notificacoes | Notificações |
| configuracoes | Configurações |
| agenda | Agenda |
| monitor_impressoras | Impressoras monitoradas |
| monitor_telemetria | Histórico coletas SNMP |

---

## 🌐 Variáveis Railway

| Variável | Status |
|----------|--------|
| MONGODB_URI | ✅ ativo |
| SESSION_SECRET | ✅ `orion2026` |
| SMTP_PASS | ✅ ativo |
| TELEGRAM_BOT_TOKEN | ✅ ativo |

---

## 🖨 Monitor — Endpoints

| Endpoint | Descrição |
|----------|-----------|
| GET /download/agente | Download .exe |
| POST /api/monitor/registrar-agente | Valida chave |
| GET /api/monitor/ping | Teste |
| POST /api/monitor/telemetria | Recebe dados |
| GET /api/monitor/impressoras | Lista impressoras |
| GET /api/monitor/historico | Histórico |
| GET /api/monitor/dashboard | KPIs |
| POST /api/monitor/simular | Dados fictícios |
| DELETE /api/monitor/simular | Remove simulação |
| POST /api/clientes/:id/monitor-key | Nova chave |
