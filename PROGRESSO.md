# Orion Print — Progresso de Desenvolvimento

**Versão atual:** 6.1
**Última atualização:** 16/05/2026
**Stack:** Node.js + Express + MongoDB + HTML/CSS/JS (single-page)
**Deploy:** Railway → `https://theikos-at-production.up.railway.app/`
**Repositório GitHub:** `https://github.com/clalves13/theikos-at`
**Nome do sistema:** Orion Print (renomeado de Theikós AT)

> ⚠️ Pendente: Renomear serviço no Railway de `theikos-at` → `orion-at` e projeto `zippy-eagerness` → `orion-at` (fazer após estabilizar o sistema)

---

## ⚠️ LEIA ANTES DE CONTINUAR — ESTADO ATUAL DO PROJETO

### Estrutura de arquivos no PC local (`C:\theikos_at\`)
```
theikos_at/
├── public/
│   ├── index.html       (~7960 linhas) — sistema principal ✅ v6.1
│   ├── portal.html      (~280 linhas)  — portal do cliente /portal
│   └── monitor.html     (~320 linhas)  — monitor impressoras /monitor
├── orion-agente/
│   ├── dist/
│   │   ├── orion-agente-win.exe  (~38MB) — executável atual (terminal)
│   │   ├── config.json           — template de configuração
│   │   ├── install.bat           — instala serviço Windows
│   │   ├── uninstall.bat         — remove serviço Windows
│   │   └── README.txt
│   ├── node_modules/
│   ├── agent.js                  ✅ v6.1 — pede chave na 1ª execução
│   ├── build-exe.js              ✅ corrigido
│   ├── service-install.js
│   ├── service-uninstall.js
│   └── package.json
├── server.js            (~1210 linhas) ✅ v6.1
├── package.json         ✅ restaurado
├── package-lock.json
├── .gitignore
├── PROGRESSO.md
└── railway.toml
```

---

## 🆕 Alterações v6.1 — 16/05/2026 parte 3

### ✅ Fluxo de instalação do agente reformulado

**`server.js`:**
- Chave gerada **automaticamente** ao cadastrar cliente
- `GET /download/agente` — serve o `.exe` para download (requer login)
- `POST /api/monitor/registrar-agente` — valida chave e registra agente
- `crypto` e `fs` adicionados aos imports

**`index.html`:**
- **Configurações → Agente de Monitoramento** — nova aba com botão "⬇ Baixar Agente (.exe)" e URL do servidor para copiar
- **Card do cliente** — mostra primeiros 16 chars da chave + botão 📋 copiar chave completa
- Funções JS: `baixarAgente()`, `copiarUrlAgente()`
- `_cfgLabels` atualizado com entrada `agente`

**`agent.js`:**
- Na 1ª execução sem `config.json`, pede URL + chave via terminal
- Valida chave no servidor antes de salvar
- Salva `config.json` automaticamente

### ✅ Problemas resolvidos
- `package.json` da raiz restaurado (deletado por engano no `git add -A`)
- `build-exe.js` reescrito do zero (tinha comandos de terminal em vez de JS)
- Projeto duplicado `exciting-adventure` deletado no Railway

---

## 🆕 Alterações v6.0 — 16/05/2026 parte 2

### ✅ Renomeação completa Theikós → Orion no server.js
- `theikos_at` → `orion_at` (banco de dados)
- `theikos2026` → `orion2026` (session secret)
- `THEIKÓS AT` → `ORION PRINT` (template de email)

### ✅ index.html 100% limpo — zero ocorrências de Theikós

---

## 🆕 Alterações v5.9 — 16/05/2026 parte 1

### 🖨 Monitor de Impressoras
- Botão Monitor em cada card de cliente
- Modal com gerar chave, baixar config, copiar chave
- Agente SNMP completo com suporte a HP, Kyocera, Ricoh, Xerox, Canon, Konica Minolta, Brother, Epson, Samsung

### 🔤 Renomeação + Logo
- Logo `orion.jpg` em base64 em todas as telas
- Endereço: Rua Adriana Bernardo Cesário, 49 — Vale do Jatobá, BH/MG | CEP: 30.666-000
- Telefone: (31) 97255-1262

---

## 🔮 PRÓXIMA GRANDE ETAPA — Wizard Gráfico Electron

### Objetivo
Instalador visual profissional para o agente, igual ao PrintWayy.

### Fluxo das 5 telas planejadas
```
Tela 1 → Bem-vindo (logo Orion Print + versão)
Tela 2 → Digite a chave do cliente (copia do sistema)
Tela 3 → Impressoras encontradas na rede (SNMP scan + checkboxes)
Tela 4 → Instalando... (barra de progresso + serviço Windows)
Tela 5 → ✅ Sucesso  ou  ❌ Falha (com motivo)
```

### Stack
- **Electron** — janela Windows com HTML/CSS/JS
- **electron-builder** — gera `.exe` instalador (~60-80MB)
- **agent.js** existente reaproveitado como backend

### Quando fazer
Após módulos Frota e Relatórios. Estimativa: 2-3 dias dedicados.

---

## ✅ Módulos Concluídos

| Módulo | Status |
|--------|--------|
| Dashboard | ✅ KPIs, gráficos, filtros, notificações SLA |
| OS / Atendimentos | ✅ SLA, origem, histórico técnico |
| Agenda / Calendário | ✅ Visão mês + lista |
| Logística | ✅ Rotas, abastecimento, checklist, manutenção |
| Laboratório | ✅ Bancada, pedidos peças, escopo, baixados |
| Histórico | ✅ OS finalizadas + lançamentos manuais |
| Estoque | ✅ Peças, movimentações, alertas |
| Suprimentos Cliente | ✅ Estoque por cliente |
| Técnicos | ✅ Cards visuais, níveis, fotos |
| Usuários | ✅ Perfis, recuperação senha, Portal do Cliente |
| Contratos | ✅ Fixo mensal, franquia cópias, renovação auto |
| Financeiro | ✅ Lançamentos, DRE, Fluxo de Caixa |
| Notificações | ✅ SLA, estoque crítico, contratos |
| Configurações | ✅ Sidebar + aba Agente de Monitoramento |
| Portal do Cliente | ✅ /portal — chamados, PDF |
| Monitor Impressoras | ✅ /monitor — dashboard SNMP em tempo real |

---

## 🔄 Pendente

| Item | Status | Notas |
|------|--------|-------|
| Frota | ❌ Pendente | Veículos, CRLV, seguro, vencimentos |
| Relatórios expandidos | ⚠️ Parcial | Existe básico, precisa expandir |
| Wizard Electron | 🔮 Planejado | Após Frota e Relatórios |
| Renomear Railway | ⚠️ Pendente | `zippy-eagerness`→`orion-at`, `theikos-at`→`orion-at` |
| SESSION_SECRET Railway | ⚠️ Pendente | Atualizar para `orion2026` nas variáveis |
| Renomear repo GitHub | ⚠️ Pendente | `theikos-at` → `orion-at` |

---

## 📋 Checklist Railway (fazer quando sistema estiver estável)

1. Railway → `zippy-eagerness` → Settings → renomear `orion-at`
2. Card `theikos-at` → Settings → renomear `orion-at`
3. URL muda para `orion-at-production.up.railway.app`
4. Variável `SESSION_SECRET` → `orion2026`
5. `config.json` de `orion-agente/dist/` → atualizar `serverUrl`
6. GitHub: Settings → Repository name → `orion-at`
7. Terminal: `git remote set-url origin https://github.com/clalves13/orion-at.git`

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
| ordens | OS (sla_horas, sla_deadline, tipo, origem) |
| laboratorio | Bancada |
| historico | Histórico |
| estoque | Peças |
| estoque_movs | Movimentações |
| supr_cli | Suprimentos por cliente |
| supr_movs | Movimentos suprimentos |
| logistica | Rotas |
| abastecimento | Abastecimento |
| checklist | Checklists veículos |
| manutencao | Manutenções veículos |
| pedidos_pecas | Pedidos peças (lab) |
| eq_baixados | Equipamentos baixados |
| lancamentos | Lançamentos manuais |
| contratos | Contratos |
| financeiro | Financeiro |
| counter | Contador OS |
| sessions | Sessões login |
| notificacoes | Notificações |
| configuracoes | Configurações sistema |
| agenda | Agenda/Calendário |
| monitor_impressoras | Estado atual impressoras |
| monitor_telemetria | Histórico coletas SNMP |

---

## 🌐 Variáveis de Ambiente no Railway

| Variável | Status | Notas |
|----------|--------|-------|
| MONGODB_URI | ✅ ativo | Banco de dados |
| SESSION_SECRET | ⚠️ `theikos2026` | Atualizar para `orion2026` |
| SMTP_PASS | ✅ ativo | Email Yahoo |
| TELEGRAM_BOT_TOKEN | ✅ ativo | Recuperação via Telegram |

---

## 🖨 Monitor — Endpoints

| Endpoint | Descrição |
|----------|-----------|
| `GET /download/agente` | Download do .exe (requer login) |
| `POST /api/monitor/registrar-agente` | Valida chave e registra agente |
| `GET /api/monitor/ping` | Teste conectividade |
| `POST /api/monitor/telemetria` | Recebe dados do agente |
| `GET /api/monitor/impressoras?cliente_id=X` | Lista impressoras |
| `GET /api/monitor/historico?cliente_id=X` | Histórico coletas |
| `GET /api/monitor/dashboard` | KPIs gerais |
| `POST /api/monitor/simular` | 8 impressoras fictícias |
| `DELETE /api/monitor/simular` | Remove dados simulados |
| `POST /api/clientes/:id/monitor-key` | Gera nova chave manualmente |

---

## 💡 Próximas implementações (prioridade)

1. 🚗 **Frota** — CRLV, seguro, documentos, vencimentos
2. 📊 **Relatórios expandidos**
3. 🖥 **Wizard Electron** — instalador gráfico 5 telas (igual PrintWayy)
4. 🏠 **Migração** — Hostinger VPS (produção definitiva)
