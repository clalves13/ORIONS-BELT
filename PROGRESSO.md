# Orion AT — Registro de Progresso Unificado

**Repositório:** https://github.com/clalves13/orion-at (redirecionando para `ORIONS-BELT` — renomeação em andamento, ver Sessão 9)
**Branch:** main  
**Arquivo principal:** `index.html`  
**Última atualização:** 05/07/2026 (sessão 11)

---

## Visão geral do sistema

Sistema de gestão de assistência técnica para impressoras — Orion Print.  
Stack: HTML/CSS/JS puro, single-file (~10.747 linhas), backend via API REST.

### Módulos

| Módulo | Status |
|---|---|
| Dashboard | ✅ KPIs + gráficos |
| Ordens de Serviço | ✅ CRUD + assinaturas digitais + fotos |
| Logística | ✅ Rotas + frota + checklist + manutenção |
| Laboratório | ✅ Bancada + pedidos de peças + escopo + baixados |
| Clientes / Equipamentos | ✅ Cadastro + histórico |
| Técnicos | ✅ Cadastro + perfis |
| Estoque | ✅ Controle + movimentos + alertas |
| Financeiro | ✅ Lançamentos + KPIs + MRR |
| Contratos | ✅ Gestão + MRR por periodicidade |
| Relatórios | ✅ PDF + impressão |
| Agenda | ✅ Calendário interativo |
| Notificações / SLA | ✅ Alertas em tempo real |
| Usuários / Permissões | ✅ Perfis + acesso por módulo |
| Configurações | ✅ Sistema + empresa + e-mail + alertas |

---

## Arquitetura do index.html

```
<head>
  <style> ... </style>        ← CSS principal (~730 linhas)
</head>
<body>
  #login-screen               ← Tela de login
  #sidebar                    ← Menu lateral fixo
  #main                       ← Conteúdo principal
    #page-dashboard
    #page-os
    #page-laboratorio
    #page-clientes
    #page-usuarios
    ... (1 div.page por módulo)
  .mov (modais)               ← Todos os modais flutuantes
  <script> bloco 1 </script>  ← JS principal
  <script> bloco 2 </script>  ← JS auxiliar (cards de anexos)
</body>
```

---

## Histórico completo de correções e melhorias

---

### Sessão 1 — Features iniciais

**feat: Câmera na Nova OS**
- Seção "Fotos e Anexos" com `📷 Tirar Foto` (câmera traseira) e `📁 Escolher Arquivo`
- Preview em grid com botão remover
- Nova OS: fotos ficam pendentes e são enviadas ao Cloudinary após salvar
- OS existente: fotos já salvas no grid, novas enviadas imediatamente

**feat: Assinaturas com quadro identificado**
- Técnico (cabeçalho azul escuro) e Cliente (cabeçalho verde escuro), impossível confundir

---

### Sessão 2 — Bugs críticos e responsivo

**Fix 1 — `osFormRenderGrid` inexistente**
- Problema: `else osFormRenderGrid([])` — função não existe
- Correção: `else osFormRenderPending()`

**Fix 2 — `setTimeout` duplicado apagava assinaturas ao editar OS**
- Problema: `setTimeout(()=>{sigOSInit();sigOSClear('tec');sigOSClear('cli');},80)` fora do bloco condicional executava sempre ao editar, sobrescrevendo assinaturas já carregadas
- Correção: linha removida

**Fix 3 — Erro de sintaxe JS derrubava toda a interatividade (causa raiz)**
- Problema: aspas simples não escapadas em `osFormRenderCard` (`window.open(a.url,'_blank')`) quebravam o segundo `<script>` inteiro, tornando todos os `onclick` inoperantes incluindo Nova OS
- Correção: `window.open(\\''+a.url+'\\',\\'_blank\\')` com escape correto

**Fix 4 — 3 blocos `<style id="dark-polish">` vazando CSS para a página**
- Problema: blocos CSS multilinha dentro de `w.document.write()` interpretados como `<style>` reais, aplicando `color: #e2e8f8 !important` em todos os filtros e selects
- Correção: todos os 3 blocos removidos

**Fix 5 — Texto de filtros e selects invisível**
- Consequência direta do Fix 4
- Correção adicional: `.filter-row select, .filter-row input, .filter-row button { color: var(--tx) !important; opacity: 1 !important }`

**feat: Layout responsivo para tablet e celular**
- Tablet (≤1024px): sidebar recolhe, grids 4→2 colunas, calendário empilha
- Celular (≤768px): sidebar vira overlay deslizante com hamburguer ☰, modais como bottom sheet, grids em 1 coluna, tabelas com scroll horizontal
- JS adicionado: `openMobileSidebar()`, `closeMobileSidebar()`, patch no `nav()` para atualizar título e fechar sidebar

---

### Sessão 3 — 22/05/2026 — Revisão geral da UI

**Fix 1 — Aba USUÁRIO sumida da sidebar**
- Causa: `#ni-usr` sem `data-modulo="usuarios"` — `applyPermissoes()` não conseguia exibi-lo
- Correção: adicionado `data-modulo="usuarios"` no item da sidebar e na `#page-usuarios`

**Fix 2 — Bug crítico em `loadAll` — destructuring errado**
- Causa: `Promise.all` com 15 APIs mas apenas 14 variáveis nomeadas — `veic` era `undefined`, causando crashes silenciosos em Logística e Veículos
- Correção:
```js
// Antes (errado)
const [tec, cli, eq, os, lab, hist, est, supr, log, abast, ck, manut, ped, baix] = ...
// Depois (correto)
const [tec, cli, eq, os, lab, hist, est, supr, log, abast, ck, manut, veic, ped, baix] = ...
```

**Fix 3 — Assinaturas não escreviam no canvas**
- Causa: `sigOSInit()` clonava o canvas com `cloneNode()` e tentava `offsetWidth` antes da reinserção no DOM — `width = 0` e contexto 2D inválido
- Correção: reescrita completa criando novo elemento `canvas`, inserindo no DOM antes de obter `offsetWidth`, criando `ctx` após inserção

**Fix 4 — Campos de data sem formatação automática**
- Correção: `setupDateMasks()` com máscara `DD/MM/AAAA` em tempo real, hookada no `openM()`

**Fix 5 — CEP sem auto-complete**
- Correção: `buscarCEP(cep, prefixo)` consultando ViaCEP ao digitar 8 dígitos, preenchendo `*-end`, `*-cidade`, `*-estado`, `*-bairro`

**Fix 6 — CPF/CNPJ sem validação**
- Correção: `formatCPF()`, `formatCNPJ()`, `validarCPF()`, `validarCNPJ()` com feedback visual verde/vermelho, listeners globais por delegação

**Fix 7 — Cascata de cadastros — selects não atualizavam**
- Correção: `populateAllSelects()` chamada após `saveTec`, `saveCli`, `saveEq`, `saveEstoque` via wrappers com 300ms de delay

**Fix 8 — Equipamento não preenchia modelo/série/contador ao selecionar**
- Correção: `fillEq(pfx)` agora preenche `modelo`, `nserie` e `contador`; para prefixo `o` alerta se já existe OS aberta para o mesmo NS

**Fix 9 — Equipamento em laboratório aparecia disponível para OS**
- Correção: `loadEqs('o')` filtra NS presentes em laboratório ativo (status ≠ Concluído/Baixado)

**Fix 10 — Cards do Dashboard saindo do quadro**
- Correção: `overflow: hidden` + `min-width: 0` em `#dash-inner` e `.dkpi-card`; `text-overflow: ellipsis` no `.dkpi-val`

**Fix 11 — Coluna de OS saindo do foco**
- Correção: `overflow-x: auto !important` no `.twrap`; `overflow: hidden` no `.card` da tabela

**Fix 12 — MRR de contratos incorreto para periodicidades anuais**
- Correção em `renderContKpis()` e `renderContratos()`:
```js
if (per === 'Anual')      return s + (v / 12);
if (per === 'Semestral')  return s + (v / 6);
if (per === 'Trimestral') return s + (v / 3);
return s + v;
```
Card exibe label `"Mensal (Anual/12x)"` conforme periodicidade

**Fix 13 — Card financeiro sem MRR de contratos**
- Correção: novo card `📋 MRR Contratos` em `renderFinKpis()` com mesma normalização por periodicidade

---

### Sessão 4 — 22/05/2026 — Impressão da OS e equipamentos

**Fix 1 — Impressão da OS quebrava em duas páginas**
- Correção: `@page { size: A4; margin: 10mm 12mm }`, `page-break-inside: avoid` em todas as seções, `body { width: 100% }`

**Fix 2 — Cabeçalho da OS com fundo escuro**
- Correção: cabeçalho 100% branco — logo à esquerda + nome/endereço ao lado, número OS à direita com separador cinza, linha azul embaixo

**Fix 3 — OS não preenchia a folha A4 inteira**
- Correção: `.os-doc` com `display: flex; flex-direction: column; min-height: 267mm`. Seções Defeito (`flex:1`), Procedimento (`flex:2`) e Observações (`flex:1`) crescem para preencher o espaço vertical. Assinaturas fixas no fundo via `margin-top: auto`. Layout em 2 colunas para Cliente+Equipamento e Gastos+Observações

**Fix 4 — Toggle TLS/STARTTLS sobreposto ao texto**
- Causa: `<label class="cfg-toggle">` com `position:absolute` engolia o texto do label
- Correção: texto movido para antes do `<label>`, fora do contexto de posicionamento

**Fix 5 — Equipamento em OS campo aparecia disponível para laboratório sem aviso**
- Correção: `loadEqs('l')` marca com `⚠ (em OS campo)` os equipamentos cujo NS está em OS de campo ativa

**Fix 6 — OS podia ser aberta para equipamento em laboratório**
- Correção: `saveOS()` bloqueia com alerta se NS estiver em laboratório ativo (status ≠ Concluído/Baixado)

**Fix 7 — Gastos do atendimento em coluna única desperdiçava espaço**
- Correção: tabela dividida em 2 colunas lado a lado (Viagem/Alimentação/Hospedagem | Combustível/Pedágios/Outros/TOTAL)

---

## Pontos de atenção para próximos chats

1. **Sempre verificar sintaxe JS** — rodar `node --check` nos dois blocos `<script>` extraídos
2. **Aspas em strings HTML geradas por JS:** usar `\\'` para aspas simples dentro de strings delimitadas por `'` — nunca `''` consecutivos sem escape
3. **CSS dentro de `w.document.write()`:** deve ser linha única ou variável JS — nunca multilinha com `<style>` visível ao parser HTML da página principal
4. **Dois blocos `<script>` independentes:** o bloco 2 contém `osFormRenderCard` — erros lá travam toda a interatividade da página
5. **Filtro OS↔Laboratório:** depende de `G.laboratorio` e `G.ordens` carregados — sempre após `loadAll()`
6. **MRR:** normalização por periodicidade está em dois lugares (`renderContKpis` e `renderContratos`) — manter sincronizados
7. **Impressão A4:** layout flex da OS depende de `min-height: 267mm` no `.os-doc` — não reduzir margens abaixo de `10mm`

---

## Pendências em aberto

- [ ] Testar CEP auto-complete em produção (requer acesso externo ao viacep.com.br)
- [ ] Validar retorno da API `/api/veiculos` no backend
- [ ] Testar assinaturas em dispositivo móvel (touch) após correção do canvas
- [ ] Confirmar gravação de periodicidades `Trimestral` e `Semestral` no banco
- [ ] Adicionar campo `estado` no modal de cliente (atualmente só `cidade`)
- [ ] Considerar campo `status` no cadastro de equipamento (`Em manutenção` / `Em laboratório`) para rastreamento mais granular
- [ ] Validar layout responsivo no celular real após deploy
- [ ] Compilar `OrionAgente.exe` em `orion-build/` e fazer upload via painel (0️⃣ Agente de Monitoramento)
- [ ] Testar download do pacote `.zip` com `.exe` no Windows após upload do exe
- [ ] Criar botão de desinstalação no painel (rota `OrionAgente.exe --uninstall`)

---

## Sessão 5 — 25/05/2026 — Agente de Monitoramento + Infraestrutura

### Fix 1 — ZIP corrompido ao baixar pacote do agente

**Sintoma:** Windows exibia "A pasta compactada é inválida" ao extrair o zip gerado pelo servidor.

**Causa raiz:** função `gerarZip` (manual, sem lib) tinha um `u16(0)` a mais no bloco do Central Directory. O comentário dizia `// compression, time, date` (3 valores), mas `compression` já estava declarado na linha anterior — o byte extra deslocava CRC, tamanhos e offsets corrompendo o arquivo inteiro.

```js
// ❌ ANTES — 3 u16 onde só cabem 2
u16(20), u16(20), u16(0), u16(0),  // versions, flags
u16(0), u16(0), u16(0),            // compression, time, date  ← u16 a mais!

// ✅ DEPOIS
u16(20), u16(20), u16(0), u16(0),  // ver_made, ver_needed, flags, compression
u16(0), u16(0),                    // time, date
```

**Arquivo corrigido:** `server.js`

---

### Fix 2 — Deploy quebrado: `package.json` do agente sobrescreveu o do servidor

**Sintoma:** Railway exibia `Cannot find module 'express'` — o servidor subia com o `package.json` do agente (`orion-agente@2.1.0`) no lugar do original.

**Causa:** os arquivos `orion-build/package.json` e `orion-build/OrionAgente.exe` foram commitados na raiz errada, e o `package.json` do agente conflitou com o do servidor.

**Correção:**
1. Pasta do agente renomeada para `orion-build/` (separada da raiz)
2. `.gitignore` atualizado: `orion-build/OrionAgente.exe`
3. `.exe` removido do histórico Git: `git rm --cached orion-build/OrionAgente.exe`

---

### Fix 3 — `https` não importado no server.js

**Sintoma:** crash no Railway ao tentar baixar o `.exe` do Cloudinary na rota de download.

**Causa:** `const https = require('https')` existia apenas dentro da string `AGENTE_JS` (código embutido do agente), não como import real do servidor.

**Correção:** adicionado `const https = require('https');` no topo do `server.js` junto aos demais imports.

---

### feat: Agente de monitoramento como executável `.exe`

**Motivação:** arquivos `.bat` são bloqueados por Windows Defender e SmartScreen em ambientes corporativos.

**Solução adotada:** `.exe` standalone compilado com `pkg` (Node.js embutido, ~50MB, sem dependências). O `.exe` é compilado uma vez, armazenado no Cloudinary, e o servidor monta o zip dinamicamente com o `.exe` + `config.json` personalizado por cliente.

**Arquitetura:**
```
orion-build/
├── orion-agente.js    ← código-fonte do agente (versionado)
├── package.json       ← config do pkg para compilação local
└── OrionAgente.exe    ← compilado localmente, NO .gitignore, upload via painel
```

**Fluxo de deploy do exe:**
1. `cd orion-build && npm install -g pkg`
2. `pkg orion-agente.js --target node18-win-x64 --output OrionAgente.exe --compress GZip`
3. Painel → Configurações → Agente de Monitoramento → **0️⃣ Enviar OrionAgente.exe**
4. Upload vai para Cloudinary — Railway não é impactado

**Comandos do exe:**
```
OrionAgente.exe              → roda o agente normalmente
OrionAgente.exe --install    → instala como serviço Windows (sc.exe nativo, sem pm2)
OrionAgente.exe --uninstall  → remove o serviço e a pasta C:\OrionAgente
```

**Rotas novas no server.js:**
| Rota | Método | Descrição |
|---|---|---|
| `/api/monitor/upload-exe` | POST | Admin faz upload do `.exe` → Cloudinary |
| `/api/monitor/exe-info` | GET | Retorna URL e data do `.exe` atual |
| `/download/pacote-agente/:id` | GET | ZIP com `.exe` + `config.json` do cliente |
| `/download/pacote-agente-legacy/:id` | GET | Rota antiga com `.bat` (mantida temporariamente) |

**Pacote que o cliente recebe:**
```
orion-agente-[cliente].zip
├── OrionAgente.exe    ← standalone, sem Node.js necessário
├── config.json        ← chave + config únicos do cliente
└── LEIA-ME.txt        ← instruções em 2 passos
```

**Instalação no cliente (2 passos):**
1. Extrair o zip
2. Botão direito no `OrionAgente.exe` → Executar como administrador → "Mais informações" → "Executar assim mesmo"

---

### feat: Botão de upload do exe no painel

**Localização:** Configurações → Agente de Monitoramento → seção **0️⃣ Executável do agente**

**Comportamento:**
- Carrega automaticamente ao abrir a aba mostrando status (✅ disponível / ⚠ sem exe)
- Botão **📤 Enviar OrionAgente.exe** abre seletor de arquivo (filtra `.exe`)
- Barra de progresso com tamanho em MB durante upload
- Badge colorido no header da seção (verde/vermelho)
- Instruções de instalação atualizadas para o fluxo com `.exe`

**Funções JS adicionadas ao `index.html`:**
- `agenteCarregarExeInfo()` — consulta `/api/monitor/exe-info` e atualiza status visual
- `agenteUploadExe(input)` — envia o arquivo via `FormData` para `/api/monitor/upload-exe`
- `navCfg` patchado para chamar `agenteCarregarExeInfo()` ao abrir a aba

---

### Pontos de atenção adicionais

8. **`orion-build/OrionAgente.exe` nunca vai para o Git** — sempre no `.gitignore`; compilar e subir via painel
9. **`.exe` no Cloudinary é universal** — mesmo binário para todos os clientes; só o `config.json` é personalizado
10. **`sc.exe` nativo do Windows** — instalador usa `sc create/start/delete` sem depender de `pm2` ou Node.js instalado no cliente
11. **SmartScreen na primeira execução** — cliente verá aviso "Windows protegeu seu PC"; orientar a clicar em "Mais informações" → "Executar assim mesmo". Sumiria com assinatura de código (code signing certificate), mas não é obrigatório

---

## Como fazer o deploy

```bash
# 1. Gerar token em: github.com/settings/tokens/new  (escopo: repo)
TOKEN="SEU_TOKEN_AQUI"

# 2. Clonar ou atualizar o repositório
git clone https://${TOKEN}@github.com/clalves13/orion-at.git
cd orion-at

# 3. Copiar o arquivo corrigido
cp /caminho/do/index.html ./index.html

# 4. Commit e push
git add index.html
git commit -m "fix: sessoes 3 e 4 — UI, impressao OS A4, equipamentos lab/campo"
git push https://${TOKEN}@github.com/clalves13/orion-at.git main
```

---

## Sessão 8 — 30/05/2026 — Validação, Busca Global, Alertas

### feat: Validação visual de formulários
- Função `_validField(id, msg)` — borda vermelha + foco + toast no campo inválido
- `saveOS`: valida cliente, defeito, técnico obrigatórios
- `saveCli`: valida nome do cliente
- `saveEq`: valida cliente e nome/modelo do equipamento
- `showToast` atualizado com suporte a tipo `warn` (laranja) e `error` (vermelho)

### feat: Busca global Ctrl+K
- Overlay modal com `EventSource` de teclado (↑↓ navegar, Enter selecionar, Esc fechar)
- Busca em OS (num, cliente, modelo, série, defeito), Clientes, Equipamentos, Técnicos
- Agrupado por seção, badge de status nas OS, ação de navegação direta
- Botão 🔍 na mobile topbar; atalho Ctrl+K funciona em qualquer página

### feat: Alerta de OS paradas sem atualização
- `verificarOSParadas()` chamada após cada `loadAll()`
- Card laranja no topo do dashboard listando OS abertas há >3 dias sem atualização
- Chips clicáveis que abrem a OS diretamente
- Botão × para dispensar o aviso

### feat: Portal em tempo real (SSE) — portal.html
- `iniciarSSEPortal()` conecta ao `GET /api/portal/ordens/stream`
- Evento `os_atualizada` atualiza card da OS sem recarregar
- `mostrarNotifPortal()` — notificação visual no canto inferior direito
- SSE iniciada no login e no auto-login; fechada no logout
- Reconexão automática após 10s se conexão cair

### Pontos de atenção adicionais (Sessão 8)
19. **`_validField(id, msg)`** — usar em todos os formulários novos; remove estilo no primeiro `input`
20. **Busca global** — depende de `G.ordens`, `G.clientes`, `G.equipamentos`, `G.tecnicos` carregados
21. **`verificarOSParadas()`** — limite em `DIAS_LIMITE = 3`; ajustar conforme política de SLA
22. **Portal SSE** — `notificarPortalCliente(clienteId, evento, dados)` deve ser chamada em qualquer rota que altere status de OS

### Pendências em aberto (atualizado 30/05/2026)
- [ ] Compilar `OrionAgente.exe` e fazer upload via painel
- [ ] Rodar botão 🔧 Migrar Histórico uma vez após deploy
- [ ] Testar alertas e-mail do monitor com agente real
- [ ] Conectar botão de busca também na sidebar desktop (Ctrl+K já funciona)
- [ ] Testar busca global com volume real de dados

---

## Sessão 9 — 02/07/2026 — Migração de infraestrutura, correções do dashboard e detecção automática de consumo

### Contexto e decisões estratégicas (não mudam código, mas orientam tudo que vem a seguir)

**Renomeação:** o sistema está virando **Orion Belt** (repositório GitHub já renomeado para `ORIONS-BELT`). Nomes internos (banco `orion_at`, textos na interface, `package.json`) continuam com o nome antigo — pendência marcada para quando o código for mexido de forma mais ampla, não uma tarefa isolada.

**Migração de hospedagem — Railway → Render:** o Railway deixou de oferecer tier gratuito permanente (só 30 dias de trial + US$5 de crédito). Migrado para o Render, que tem free tier real, sem cartão, e sem restrição de uso comercial. **Vercel foi descartado para o backend** (mantido só para frontends estáticos, se necessário) — motivos técnicos: função serverless tem limite de 10s no plano gratuito (mata o SSE do portal, que usa heartbeat de 25s) e o Hobby plan da Vercel proíbe uso comercial nos termos de serviço, mesmo em fase de teste sem cobrança.

**Divisão em dois produtos complementares (planejada, ainda não implementada fisicamente):**
- **Orion Gestão** — OS, laboratório, logística, estoque, financeiro, contratos, agenda, portal do cliente.
- **Orion Monitor** — agente SNMP + dashboard de frota + alertas, vendável separadamente como produto de entrada mais barato.

**Correção de arquitetura de autenticação (decidida, ainda não implementada no código):** hoje quem cria login/senha do portal do cliente é o admin do Gestão (rota `/api/clientes/:id/portal-acesso`, gravando em `clientes.portal_login`). Ficou definido que **deve ser o Agente/Monitor a controlar esse acesso**, não o Gestão — pendência arquitetural registrada, requer mudança de modelo de dados, não só mover arquivo.

**Transparência de faturamento (princípio validado):** quando o faturamento automático por contador for implementado, o cliente final deve ver os mesmos dados que fundamentam a cobrança dele (contador, franquia, excedente, histórico do próprio equipamento) — mas não custo/margem interna, dados de outros clientes, ou observações internas de técnico.

**Multi-tenant, LGPD, PWA, certificado de code signing, Printer-MIB padrão, faturamento via Focus NFe/PlugNotas:** todos ficaram definidos como próximos itens do roadmap, com prioridade em usar sempre a opção gratuita/de menor custo primeiro (ex.: certificado OV em vez de EV — desde 2026 a Microsoft removeu o bypass automático de SmartScreen até para EV, então o mais caro perdeu a vantagem prática).

---

### Fix 1 — Card "Suprimentos" do dashboard preso ao mês do servidor, ignorando o filtro de período

**Sintoma:** o card mostrava "Sem dados" mesmo havendo saídas de toner registradas dentro do período selecionado (De/Até) no topo do dashboard.

**Causa raiz:** `/api/dashboard` calculava consumo de toner comparando com `mesAtual` (mês corrente do servidor), sem nenhuma relação com os campos De/Até da tela — o filtro de período nunca era realmente aplicado a essa métrica.

**Decisão final (depois de iteração):** não seguir o filtro de período — foi identificado que, se o card acumulasse por qualquer período longo escolhido no filtro, o número cresceria sem limite conforme a base de dados aumenta (ex.: "1.000.000 de toners consumidos"), virando inútil em produção. Decisão: o card fica **sempre fixo no mês atual**, independente do filtro De/Até do resto do dashboard.

**Arquivo:** `server.js`, rota `GET /api/dashboard`

---

### Fix 2 — Card de Suprimentos virou ranking (não soma mais por cor de todos os clientes juntos)

**Antes:** somava toner consumido de TODOS os clientes juntos, agrupado só por cor (Preto/Magenta/Ciano/Amarelo/Grampos) — não dava para saber quem consumia mais.

**Depois:** `consumo_toner` retorna os **4 clientes que mais consumiram no mês atual**, ordenados do maior para o menor, cada um com o total e o detalhamento por cor. O gráfico (`renderGraficoPizzaToner` em `index.html`) virou um doughnut por cliente, com tooltip mostrando o detalhamento de cores daquele cliente ao passar o mouse.

**Arquivos:** `server.js` (rota `/api/dashboard`) e `public/index.html` (`renderGraficoPizzaToner`)

---

### Fix 3 — Botão "↻ Atualizar" do dashboard não reiniciava o cronômetro de auto-refresh

**Sintoma:** clicar no botão recarregava os dados, mas o badge de contagem regressiva (`120s → 0s`) continuava de onde estava, sem resetar.

**Causa:** o `onclick` chamava só `loadDash()`, que nunca toca em `_dashRefreshCount` nem reinicia o `setInterval` — são duas funções independentes.

**Correção:** `onclick="loadDash(); iniciarAutoRefreshDash();"` — o clique manual agora também reinicia o cronômetro para 120s.

**Arquivo:** `public/index.html`, botão do dashboard

---

### Feature — Detecção automática de troca de toner via SNMP (consumo real, sem lançamento manual)

**Motivação:** foi identificado que o motivo real de existir o Orion Monitor é justamente eliminar a dependência de alguém lembrar de lançar manualmente a saída de suprimento no sistema quando troca um toner num cliente. Consumo lançado manualmente é o mesmo ponto fraco dos concorrentes que fazem isso "no braço".

**Como funciona:** o agente (`orion-agente.js`) já coletava o nível de cada toner (Printer-MIB padrão) a cada ciclo (15 min por padrão) e envia para `POST /api/monitor/telemetria`. Não foi necessário alterar o agente — a inteligência nova ficou no backend, que já tinha o histórico por impressora (`monitor_impressoras`).

**Lógica implementada:** antes de sobrescrever a leitura de uma impressora, o backend compara com a leitura anterior. Se um toner estava em **≤15%** e a nova leitura mostra um salto de **+40 pontos ou mais**, o sistema entende que houve troca física do cartucho (esse salto só acontece nesse cenário real) e:
1. Registra automaticamente uma **saída** em `supr_movs` (mesmo efeito de um lançamento manual, mas automático).
2. Dá baixa no estoque do cliente em `supr_cli`.
3. Gera uma notificação interna avisando da detecção.

**Limiares (`<=15%` e `>=40 pontos`) são um ponto de partida, não calibrados ainda** — só é possível validar de verdade com impressora física respondendo SNMP e uma troca real de toner acontecendo entre dois ciclos de coleta. Ajustar depois de teste em produção real (mesma pendência já registrada na Sessão 8: "testar agente real").

**Arquivo:** `server.js`, rota `POST /api/monitor/telemetria`

---

### Pendências em aberto (atualizado 02/07/2026)
- [ ] Renomear `orion_at` → `Orion Belt` no banco, `package.json` e textos da interface
- [ ] Implementar multi-tenant (`tenant_id`) antes de qualquer venda a terceiros
- [ ] Mover controle de acesso do Orion Client do Gestão para o Agente/Monitor (mudança de modelo de dados)
- [ ] Migrar Cloudinary → Cloudflare R2 (custo)
- [ ] PWA (manifest + service worker) em `index.html` e `portal.html`
- [ ] Certificado OV de code signing para o `.exe` do agente + submissão de reputação ao SmartScreen
- [ ] Suporte multi-fabricante via Printer-MIB padrão (RFC 3805) no agente
- [ ] Faturamento automático contador→NF via Focus NFe ou PlugNotas (deixar por último — depende de fatores externos: habilitação NFS-e municipal, certificado digital do cliente)
- [ ] LGPD/auditoria — coleção `audit_log` + política de retenção
- [ ] **Calibrar os limiares de detecção automática de troca de toner com impressora real** (item novo desta sessão)
- [ ] Separação física em monorepo (`/apps/orion-gestao`, `/apps/orion-monitor`, `/apps/orion-client`) — só depois do multi-tenant estar pronto

---

## Sessão 10 — 05/07/2026 — Perfil Demo + falhas de segurança reais no Monitor e em Configurações

### Feature — Perfil "Demonstração" (somente visualização)

**Motivação:** precisar mostrar o sistema a terceiros (demonstração comercial) sem expor dados críticos nem risco de alguém alterar/excluir dados reais.

**Implementado em duas camadas** (a mais importante é a do backend — esconder botão na tela não impede alguém de chamar a API direto):
1. **Backend (`server.js`):** novo perfil `demo` em `PERFIS`, sem os módulos `usuarios`, `financeiro`, `tecnicos` e `contratos`. Middleware novo `bloqueiaEscritaDemo` bloqueia **qualquer** `POST/PUT/DELETE` para esse perfil (exceto `/api/logout`), retornando 403 — funciona mesmo se alguém tentar burlar a tela e chamar a API direto pelo navegador.
2. **Frontend (`index.html`):** módulos críticos somem da sidebar para esse perfil (`PERFIS_MODULOS.demo`, espelhando exatamente a lista do backend). Selo fixo laranja no topo (**"🔎 MODO DEMONSTRAÇÃO"**) sempre visível. A função central `api()` agora trata o erro 403 do modo demo com um aviso amigável (toast), em vez de erro cru — funciona em qualquer botão do sistema, sem precisar tratar tela por tela.

**Como criar:** Usuários → Novo Usuário → Perfil → "Demonstração (somente visualização)".

---

### Falha de segurança real encontrada — Monitor (`monitor.html`) estava 100% público, sem login

**Não era só "a tela não pede senha"** — a própria API por trás dela (`/api/monitor/impressoras`, `/historico`, `/dashboard`, e o simulador `/api/monitor/simular` POST/DELETE) **não tinha `requireAuth` nenhum**. Qualquer pessoa que soubesse a URL via dados de clientes/impressoras e podia até injetar ou apagar dados de teste — não dependia nem de estar logado, nem de ser perfil demo.

**Causa no frontend:** o código do `monitor.html` tinha literalmente os comentários `/* Esconder login — não é necessário */` e `// Iniciar monitor direto sem login` — foi construído de propósito sem autenticação.

**Correção:**
- Backend: `requireAuth` adicionado em `/api/monitor/impressoras`, `/historico`, `/dashboard`; `requireAuth + requireAdmin` no simulador (POST e DELETE) — ferramenta de teste que injeta/apaga dados nunca deveria estar acessível a quem não é admin.
- Frontend: `monitor.html` agora checa sessão real via `GET /api/me` antes de mostrar qualquer coisa. Sem sessão válida, redireciona para `/` (tela de login principal — usa o mesmo cookie de sessão do sistema, não tem senha própria separada). Botão do Simulador só aparece para admin/supervisor.
- **Detalhe que causou reteste:** a primeira correção não funcionou porque `<div id="mon-app">` não tinha `display:none` por padrão — o conteúdo aparecia na tela antes mesmo do JavaScript rodar a checagem de sessão. Corrigido para `style="display:none"` por padrão, só é revelado depois de confirmar sessão válida.

**Comportamento correto confirmado:** logado no sistema principal, o Monitor abre sem pedir senha de novo (usa o mesmo cookie) — isso é esperado, não é falha. Só pede login se não houver nenhuma sessão ativa no navegador.

---

### Falha de segurança real encontrada — aba "Configurações" sempre visível, para qualquer perfil

O item de menu "Configurações" nunca teve `data-modulo` — não era um problema exclusivo do perfil demo, **todo mundo via, sempre**, inclusive técnico, logística, etc. Corrigido: `data-modulo="configuracoes"` adicionado ao item, e só `admin`/`supervisor` têm esse módulo liberado nas listas de perfil.

---

### Nota operacional — Auto-Deploy do Render não é 100% confiável nesta conta

Ao longo desta sessão, o Auto-Deploy ("On Commit") não disparou automaticamente em pelo menos duas ocasiões, exigindo **Manual Deploy → Deploy latest commit**. Além disso, uma correção não "pegou" porque o arquivo local `monitor.html` tinha sido sobrescrito por uma versão antiga antes do commit (sem que isso fosse percebido de imediato).

**Processo de verificação que resolveu isso, útil para repetir em correções futuras antes de deploy:**
```bash
findstr "algum_trecho_da_correcao" public\arquivo.html   # confirma que o arquivo LOCAL está certo
git show origin/main:public/arquivo.html | findstr "algum_trecho"  # confirma que o GITHUB está certo
# só então: Render → Manual Deploy → Deploy latest commit
```

### Pendências em aberto (atualizado 05/07/2026)
- [ ] Renomear `orion_at` → `Orion Belt` no banco, `package.json` e textos restantes da interface (parcial: sidebar e título do Monitor já renomeados para "Portal Monitor" nesta sessão)
- [ ] Implementar multi-tenant (`tenant_id`) antes de qualquer venda a terceiros
- [ ] Mover controle de acesso do Orion Client do Gestão para o Agente/Monitor (mudança de modelo de dados)
- [ ] Migrar Cloudinary → Cloudflare R2 (custo)
- [ ] PWA (manifest + service worker) em `index.html` e `portal.html`
- [ ] Certificado OV de code signing para o `.exe` do agente + submissão de reputação ao SmartScreen
- [ ] Suporte multi-fabricante via Printer-MIB padrão (RFC 3805) no agente
- [ ] Faturamento automático contador→NF via Focus NFe ou PlugNotas
- [ ] LGPD/auditoria — coleção `audit_log` + política de retenção
- [ ] Calibrar os limiares de detecção automática de troca de toner com impressora real
- [ ] Separação física em monorepo — só depois do multi-tenant estar pronto
- [ ] **Revisar se existem outras rotas de API sem `requireAuth` por descuido** (o caso do Monitor mostrou que isso já aconteceu uma vez — vale um levantamento geral, não só reagir caso a caso)

---

## Sessão 11 — 05/07/2026 — Cluster MongoDB dedicado para o Orion (isolamento de infraestrutura)

### Falha de isolamento encontrada — Orion, LUA e Lunna compartilhavam o mesmo cluster

Os três projetos (Orion, LUA, Lunna) rodavam no mesmo cluster gratuito do MongoDB Atlas (`Cluster0`, projeto "Project 0"). Pior do que isso: os usuários do banco de cada projeto (`clairton_db_user`, `luna_cloud_db_user`) estavam configurados com papel **`atlasAdmin@admin`** e recurso **"All Resources"** — ou seja, a credencial de qualquer um dos projetos tinha acesso de administrador a **todos os bancos do cluster**, não só ao próprio. Se a credencial de um projeto fosse exposta, o atacante teria acesso de leitura/escrita/exclusão aos dados dos outros dois projetos também.

### Decisão: cluster próprio para o Orion

Em vez de só corrigir a permissão (que resolveria o vazamento entre projetos, mas manteria os 512MB do M0 divididos entre os três), optou-se por criar um **projeto e cluster M0 gratuito dedicados** só para o Orion:
- Atlas permite 1 cluster gratuito **por projeto** (não por organização) — criar um projeto novo ("Projeto Orion") dá direito a outro M0 gratuito, sem custo.
- Resultado: 512MB inteiros só para o Orion, isolamento real entre os três sistemas (clusters diferentes, não só permissão diferente).

### Migração — decidido começar com banco zerado, não migrar dado nenhum

Como os dados existentes no Orion eram só teste (4 empresas fictícias, 5 equipamentos, sem cliente real ainda), não valia o esforço de migrar. O Atlas M0 não oferece migração de um clique entre clusters (isso é recurso de M10+, pago) — as alternativas gratuitas seriam exportar/importar coleção por coleção pela tela, ou usar `mongodump`/`mongorestore` via linha de comando. Optou-se por **não migrar nada**: trocar direto a `MONGO_URI` no Render para o cluster novo (vazio) e deixar o sistema recriar o necessário.

**Confirmado no código que isso funciona sem passo manual:** o nome do banco é fixo no código (`db = client.db('orion_at')`, não depende do que vem na string de conexão), e existe bootstrap automático — se a coleção `users` estiver vazia, o sistema cria o usuário `admin` sozinho na primeira conexão, usando a variável `ADMIN_PASSWORD` já configurada no Render. Resultado: trocar a `MONGO_URI` e fazer redeploy foi suficiente, sem seed manual.

### Pendência gerada por esta sessão
- [ ] O usuário `orion_db_user` do cluster novo também foi criado com privilégio amplo (o assistente do Atlas oferece `atlasAdmin` por padrão ao criar o primeiro usuário de um projeto). Como agora está isolado num cluster só do Orion, o risco de vazar para outros projetos não existe mais — mas por boa prática, ainda vale restringir esse usuário para `readWrite` apenas no banco `orion_at`, em vez de admin do projeto inteiro.
- [ ] As 4 empresas fictícias de teste precisam ser recriadas manualmente no banco novo (dado de teste, não é perda real).

### Pendências em aberto (atualizado 05/07/2026, sessão 11)
- [ ] Restringir permissão do usuário `orion_db_user` (novo cluster) para `readWrite` só no banco `orion_at`, em vez de `atlasAdmin`/projeto inteiro
- [ ] Renomear `orion_at` → `Orion Belt` no banco, `package.json` e textos restantes da interface
- [ ] Implementar multi-tenant (`tenant_id`) antes de qualquer venda a terceiros — **próximo item da fila**
- [ ] Mover controle de acesso do Orion Client do Gestão para o Agente/Monitor (mudança de modelo de dados)
- [ ] Migrar Cloudinary → Cloudflare R2 (custo)
- [ ] Certificado OV de code signing para o `.exe` do agente + submissão de reputação ao SmartScreen
- [ ] Suporte multi-fabricante via Printer-MIB padrão (RFC 3805) no agente
- [ ] Faturamento automático contador→NF via Focus NFe ou PlugNotas
- [ ] LGPD/auditoria — coleção `audit_log` + política de retenção
- [ ] Calibrar os limiares de detecção automática de troca de toner com impressora real
- [ ] Separação física em monorepo — só depois do multi-tenant estar pronto
