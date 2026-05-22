# Orion Print — Progresso do Projeto

**Sistema:** Gestão de Assistência Técnica (OS, Logística, Financeiro, Estoque…)
**Arquivo principal:** `public/index.html` — ~9.850 linhas, 318 funções, 2 blocos `<script>`
**Backend:** API REST com Cloudinary para anexos/fotos

---

## Estado atual do arquivo

O `index.html` está funcional e corrigido. Sempre envie o arquivo atualizado no início de cada novo chat.

---

## Módulos do sistema

| Módulo | Status |
|---|---|
| Dashboard | ✅ KPIs + gráficos |
| Ordens de Serviço | ✅ CRUD + assinaturas digitais + fotos (câmera/arquivo) |
| Logística | ✅ Rotas + frota + checklist + manutenção |
| Laboratório | ✅ Bancada + pedidos de peças + escopo + baixados |
| Clientes / Equipamentos | ✅ Cadastro + histórico |
| Técnicos | ✅ Cadastro + perfis |
| Estoque | ✅ Controle + movimentos + alertas |
| Financeiro | ✅ Lançamentos + KPIs |
| Contratos | ✅ Gestão |
| Relatórios | ✅ PDF + impressão |
| Agenda | ✅ Calendário interativo |
| Notificações / SLA | ✅ Alertas em tempo real |
| Portal do Cliente | ✅ Acesso externo via /portal |
| Configurações | ✅ Sistema + usuários + permissões |

---

## Histórico de correções e melhorias

### Sessão 1 (chat anterior ao atual)
- **feat:** Câmera na Nova OS — seção "Fotos e Anexos" com `📷 Tirar Foto` (câmera traseira) e `📁 Escolher Arquivo`, preview em grid com botão remover. Nova OS: fotos ficam pendentes e são enviadas ao Cloudinary após salvar. OS existente: fotos já salvas no grid, novas enviadas imediatamente.
- **feat:** Assinaturas com quadro identificado — Técnico (cabeçalho azul escuro) e Cliente (cabeçalho verde escuro), impossível confundir.

### Sessão 2 (esta sessão)

#### Bugs corrigidos

**Bug 1 — `osFormRenderGrid` inexistente (nome errado)**
- Arquivo: linha ~9797 (`osFormSetOsId`)
- Problema: `else osFormRenderGrid([])` — função não existe
- Correção: `else osFormRenderPending()`

**Bug 2 — `setTimeout` duplicado apagava assinaturas ao editar OS**
- Arquivo: linha ~4177
- Problema: `setTimeout(()=>{sigOSInit();sigOSClear('tec');sigOSClear('cli');},80)` fora do `if/else`, executava sempre — inclusive ao editar OS, sobrescrevendo assinaturas já carregadas
- Correção: linha removida

**Bug 3 — Erro de sintaxe JS quebrava botão Nova OS (raiz do problema)**
- Arquivo: bloco 2 do `<script>` (função `osFormRenderCard`), linha ~9745
- Problema: `window.open(a.url,'_blank')` e `deletarAnexo(''+encodeURIComponent(...))` — aspas simples não escapadas dentro de string JS com delimitador de aspas simples
- Correção: `window.open(\\''+a.url+'\\',\\'_blank\\')` e `deletarAnexo(\\''+encodeURIComponent(...)+'\\',this)`
- **Causa raiz:** Esse erro de sintaxe derrubava o segundo bloco `<script>` inteiro, tornando todos os `onclick` da página inoperantes (incluindo Nova OS). Versões diferentes do arquivo tinham variações desse mesmo bug (`''` em vez de aspas escapadas, ou `a.url` sem aspas).

**Bug 4 — 3 blocos `<style id="dark-polish">` vazando CSS dark mode para a página**
- Problema: Blocos CSS inseridos dentro de template literals de `w.document.write()` para janelas de impressão. Por terem quebras de linha, o parser HTML os interpretava como `<style>` reais da página principal, aplicando cores claras (`color: #e2e8f8 !important`) sobre todos os filtros e selects — mesmo no modo claro.
- Correção: Todos os 3 blocos removidos (linhas 4608–4749, 8602–8743, 9954–10095)

**Bug 5 — Texto de filtros e selects invisível**
- Consequência direta do Bug 4
- Correção adicional: `.filter-row select, .filter-row input, .filter-row button { color: var(--tx) !important; opacity: 1 !important }`

#### Feature adicionada

**feat: Layout responsivo para tablet e celular**
- Tablet (≤1024px): sidebar recolhe automaticamente, grids de 4→2 colunas, calendário empilha
- Celular (≤768px):
  - Sidebar vira overlay deslizante com overlay escuro
  - Top bar mobile com botão hamburguer ☰ + título da página atual (atualiza ao navegar)
  - Modais como bottom sheet (sobem da parte de baixo)
  - Grids todos em 1 coluna, tabelas com scroll horizontal, assinaturas empilhadas
  - Sidebar fecha automaticamente ao navegar
- JS adicionado: `openMobileSidebar()`, `closeMobileSidebar()`, patch no `nav()` para atualizar título e fechar sidebar

---

## Arquitetura do index.html

```
<head>
  <style> ... </style>       ← CSS principal (~730 linhas)
</head>
<body>
  #login-screen              ← Tela de login
  #sb-overlay                ← Overlay mobile (adicionado)
  #mobile-topbar             ← Top bar mobile (adicionado)
  #sidebar                   ← Menu lateral fixo
  #main                      ← Conteúdo principal
    #page-dashboard
    #page-os
    #page-logistica
    ... (1 div.page por módulo)
  .mov (modais)              ← Todos os modais flutuantes
  <script> bloco 1 </script> ← JS principal (~408k chars) — SEM erros de sintaxe
  <script> bloco 2 </script> ← JS auxiliar (~14k chars) — SEM erros de sintaxe
</body>
```

---

## Pontos de atenção para próximos chats

1. **Sempre verificar sintaxe JS antes de entregar** — rodar `node --check` nos dois blocos `<script>` extraídos
2. **Aspas em strings HTML geradas por JS:** usar `\\'` para aspas simples dentro de strings delimitadas por `'`, nunca `''` (duas aspas consecutivas) nem aspas sem escape
3. **CSS dentro de `w.document.write()`:** deve ficar em linha única ou ser passado como variável JS — nunca multilinha com tags `<style>` visíveis ao parser HTML
4. **Dois blocos `<script>` independentes:** erro em um não afeta o outro, mas o bloco 2 contém o renderizador de cards de anexos (`osFormRenderCard`) — erros lá travam toda a interatividade
5. **Responsivo:** testado em código, validar no celular real após deploy

---

## Commits desta sessão

```bash
git add public/index.html
git commit -m "fix: osFormRenderGrid → osFormRenderPending + remove setTimeout duplicado"
git commit -m "fix: corrige sintaxe window.open no anx-card — botão Nova OS volta a funcionar"
git commit -m "fix: remove 3 blocos dark-polish vazando CSS para página principal"
git commit -m "feat: layout responsivo para tablet e celular"
git push
```
