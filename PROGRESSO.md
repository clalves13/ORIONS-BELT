# Orion AT — Registro de Progresso Unificado

**Repositório:** https://github.com/clalves13/orion-at  
**Branch:** main  
**Arquivo principal:** `index.html`  
**Última atualização:** 23/05/2026

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
