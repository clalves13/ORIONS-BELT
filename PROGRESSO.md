# Orion Print — Progresso de Desenvolvimento

**Versão atual:** 6.0
**Última atualização:** 16/05/2026
**Stack:** Node.js + Express + MongoDB + HTML/CSS/JS (single-page)
**Deploy:** Railway → `https://theikos-at-production.up.railway.app/`
**Repositório GitHub:** `https://github.com/clalves13/theikos-at`
**Nome do sistema:** Orion Print (renomeado de Theikós AT)

> ⚠️ Pendente: Renomear serviço no Railway de `theikos-at` → `orion-at` e projeto `zippy-eagerness` → `orion-at` (aguardando conclusão das alterações antes de renomear para não quebrar URL ativa)

---

## ⚠️ LEIA ANTES DE CONTINUAR — ESTADO ATUAL DO PROJETO

### Estrutura de arquivos no PC local (`C:\theikos_at\`)
```
theikos_at/
├── public/
│   ├── index.html       (~7900 linhas) — sistema principal
│   ├── portal.html      (~280 linhas)  — portal do cliente /portal
│   └── monitor.html     (~320 linhas)  — monitor impressoras /monitor
├── orion-agente/
│   ├── dist/
│   │   ├── orion-agente-win.exe  (~38MB) — executável gerado
│   │   ├── config.json           — template de configuração
│   │   ├── install.bat           — instala serviço Windows
│   │   ├── uninstall.bat         — remove serviço Windows
│   │   └── README.txt            — instruções de instalação
│   ├── node_modules/             — dependências locais
│   ├── agent.js                  — agente SNMP de monitoramento
│   ├── build-exe.js              — script para gerar .exe ✅ CORRIGIDO
│   ├── service-install.js        — registra agente como serviço Windows
│   ├── service-uninstall.js      — remove o serviço Windows
│   └── package.json
├── server.js            (~1191 linhas) ✅ 100% renomeado para Orion
├── index.html           ✅ 100% renomeado para Orion
├── package-lock.json
├── .gitignore
├── PROGRESSO.md
└── railway.toml
```

---

## 🆕 Alterações da sessão 16/05/2026 — parte 2 (v5.9 → v6.0)

### ✅ build-exe.js corrigido
- Arquivo estava com comandos de terminal dentro dele em vez de JavaScript
- Reescrito corretamente — gera o `.exe` via `pkg`
- Build rodado com sucesso localmente: `orion-agente-win.exe` (~38MB) gerado

### ✅ Arquivos do agente criados
- `service-install.js` — registra OrionAgente como serviço Windows via `node-windows`
- `service-uninstall.js` — remove o serviço Windows
- `config.json` template já presente na pasta `dist/`

### ✅ server.js 100% limpo (Theikós → Orion)
Substituições realizadas:
- Linha 17: `client.db('theikos_at')` → `client.db('orion_at')`
- Linha 43: `'theikos2026'` → `'orion2026'`
- Linha 46: `dbName:'theikos_at'` → `dbName:'orion_at'`
- Linha 597: `THEIKÓS AT` no template de email → `ORION PRINT`

### ✅ index.html 100% limpo
- Sem nenhuma ocorrência de Theikós restante

### ✅ Projeto duplicado no Railway deletado
- `exciting-adventure` deletado — estava consumindo crédito desnecessariamente
- Restou apenas `zippy-eagerness` (projeto principal)

### ✅ GitHub atualizado
- Todos os arquivos do agente enviados via `git push origin main`

---

## 🆕 Alterações da sessão 16/05/2026 — parte 1 (v5.8 → v5.9)

### 🖨 Monitor de Impressoras — interface no sistema
- Botão 🖨 Monitor adicionado em cada card de cliente (módulo Clientes)
- Modal completo de configuração do agente por cliente
- Botão ⚙ Gerar Nova chave → `POST /api/clientes/:id/monitor-key`
- Botão ⬇ Baixar config.json → gera arquivo preenchido e faz download automático
- Botão 📋 Copiar chave
- Instruções passo a passo de instalação no modal

### 📦 Empacotamento do agente em .exe
- `build-exe.js` usa `pkg` para empacotar Node.js + agent.js em .exe standalone
- O .exe NÃO precisa de Node.js instalado no PC do cliente
- Usa `sc create` do Windows para registrar como serviço
- Gera pasta `dist/` com: `.exe`, `install.bat`, `uninstall.bat`, `config.json`, `README.txt`

### 🔤 Renomeação completa: Theikós → Orion Print
- Substituído em todos os arquivos: `index.html`, `server.js`, `portal.html`, `monitor.html`, agente
- Logo `orion.jpg` inserida em base64 em todas as telas (login, sidebar, PDF de OS, portal, monitor)
- Fundo preto da logo removido via Pillow (Python)

### 🗺 Endereço atualizado
- Rua Adriana Bernardo Cesário, 49 — Vale do Jatobá, Belo Horizonte/MG | CEP: 30.666-000
- Telefone: (31) 97255-1262

---

## 🆕 Alterações da sessão 15/05/2026 (v5.7 → v5.8)

### 🌐 Portal do Cliente — módulo completo
- Página separada em `/portal` (`public/portal.html`)
- Login próprio independente do sistema interno (`req.session.portal_cliente`)
- Funcionalidades: Meus Chamados (cards por status), Abrir Chamado, Ver Detalhes/PDF
- OS abertas no portal chegam com `origem: 'portal'`
- Admin: Usuários → aba 🌐 Portal do Cliente — gerencia logins, senhas, envio por email

### 📊 Coluna Origem na tabela de OS
- Badge colorido: Portal (roxo), Suporte (azul), Admin (amarelo), Sistema (cinza), Presencial (cinza)
- Campo "Origem do Chamado" no modal de OS

### 🔧 SLA corrigido
- `PUT /api/ordens/:id` agora salva `tipo`, `sla_prazo`, `sla_deadline`, `origem`

### 📂 Histórico técnico no modal de OS
- Aba "📂 Hist. Equipamento" busca via `/api/historico-tecnico?nserie=...`
- KPIs: total atendimentos, concluídos, retrabalhos, gasto acumulado

---

## ✅ Módulos Concluídos (todos)

| Módulo | Status |
|--------|--------|
| Dashboard | ✅ KPIs, gráficos, filtros, notificações SLA |
| OS / Atendimentos | ✅ Completo com SLA, origem, histórico técnico |
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
| Configurações | ✅ Submenu sidebar |
| Portal do Cliente | ✅ /portal — chamados, acompanhamento, PDF |
| Monitor Impressoras | ✅ /monitor — dashboard SNMP em tempo real |

---

## 🔄 Pendente / Em andamento

| Item | Status | Notas |
|------|--------|-------|
| Renomear no Railway | ⚠️ Pendente | Projeto `zippy-eagerness` → `orion-at`, serviço `theikos-at` → `orion-at` |
| Atualizar SESSION_SECRET no Railway | ⚠️ Pendente | Trocar para `orion2026` nas variáveis de ambiente |
| Atualizar config.json dist/ | ⚠️ Pendente | `serverUrl` precisa da nova URL após renomear no Railway |
| Renomear repositório GitHub | ⚠️ Pendente | `theikos-at` → `orion-at` em Settings do repo |
| Frota | ❌ Pendente | Veículos, CRLV, seguro, vencimentos |
| Relatórios expandidos | ⚠️ Parcial | Existe básico, precisa expandir |

---

## 📋 Checklist para renomear no Railway (fazer após subir arquivos)

1. Acesse `railway.app` → projeto `zippy-eagerness`
2. Engrenagem (Settings) → **Em geral** → renomear para `orion-at` → Salvar
3. Clique no card `theikos-at` → aba **Settings** → renomear para `orion-at` → Salvar
4. A URL muda para `orion-at-production.up.railway.app`
5. Atualize a variável `SESSION_SECRET` → `orion2026`
6. Atualize `serverUrl` no `config.json` de `orion-agente/dist/` para a nova URL
7. Faça novo `git push` com o `config.json` atualizado
8. No GitHub: Settings → General → Repository name → `orion-at` → Rename
9. No terminal local: `git remote set-url origin https://github.com/clalves13/orion-at.git`

---

## 🔗 Como continuar em novo chat

1. Suba `index.html` + `server.js` + `PROGRESSO.md`
2. Diga: **"Continuando o projeto Orion Print. Veja o PROGRESSO.md."**

---

## 🗄️ Coleções MongoDB

| Coleção | Módulo |
|---------|--------|
| users | Usuários |
| tecnicos | Técnicos |
| clientes | Clientes (monitor_key, monitor_ativo, portal_login, portal_senha_hash) |
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
| monitor_impressoras | Estado atual impressoras monitoradas |
| monitor_telemetria | Histórico coletas SNMP |

---

## 🌐 Variáveis de Ambiente no Railway

| Variável | Para que serve |
|----------|---------------|
| MONGODB_URI | Banco de dados |
| SESSION_SECRET | Segurança das sessões (atualizar para `orion2026`) |
| SMTP_PASS | Recuperação por email (senha app Yahoo) |
| TELEGRAM_BOT_TOKEN | Recuperação via Telegram |

---

## 🖨 Monitor de Impressoras — Detalhes Técnicos

### Como funciona
```
Impressora na rede do cliente
       ↓ (SNMP protocol — porta UDP 161)
   orion-agente-win.exe (roda como serviço Windows)
       ↓ (HTTPS POST a cada 15 min)
   Railway server.js → MongoDB
       ↓
   /monitor (dashboard em tempo real)
```

### Fabricantes suportados
HP, Kyocera, Ricoh, Xerox, Canon, Konica Minolta/bizhub, Brother, Epson, Samsung, Genérico (Printer MIB RFC 3805)

### Endpoints do Monitor
- `GET /api/monitor/ping` — teste conectividade
- `POST /api/monitor/telemetria` — recebe dados do agente (autenticado por clientKey)
- `GET /api/monitor/impressoras?cliente_id=X` — lista impressoras
- `GET /api/monitor/historico?cliente_id=X` — histórico coletas
- `GET /api/monitor/dashboard` — KPIs gerais
- `POST /api/monitor/simular` — insere 8 impressoras fictícias para teste
- `DELETE /api/monitor/simular` — remove dados simulados
- `POST /api/clientes/:id/monitor-key` — gera chave (requireAdmin)

### Fluxo de instalação no cliente
1. Admin: Clientes → 🖨 Monitor → ⚙ Gerar Nova → ⬇ Baixar config.json
2. Técnico: copia pasta `orion-agente/dist/` para PC do cliente
3. Cola o `config.json` baixado na pasta
4. Executa `install.bat` como Administrador
5. Serviço `OrionAgente` aparece no `services.msc` rodando em background

---

## 💡 Próximas implementações aprovadas

- 🚗 **Frota** — CRLV, seguro, documentos, vencimentos
- 📊 **Relatórios expandidos**
- 🏠 **Migração futura** — Hostinger VPS (produção definitiva paga)
