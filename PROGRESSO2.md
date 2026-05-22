# Orion AT — Registro de Progresso

**Repositório:** https://github.com/clalves13/orion-at  
**Branch:** main  
**Arquivo principal:** `index.html`  
**Última atualização:** 22/05/2026

---

## Sessão atual — 22/05/2026

### Contexto
Revisão completa do frontend `index.html` (10.277 linhas → 10.505 linhas após correções).  
Sistema de assistência técnica para impressoras — Orion Print.  
Stack: HTML/CSS/JS puro, single-file, backend via API REST.

---

## Correções aplicadas

### 1. Aba USUÁRIO sumida da sidebar
**Problema:** O item de navegação "Usuários" não aparecia mesmo para perfis admin/master.  
**Causa:** O elemento `#ni-usr` não tinha o atributo `data-modulo="usuarios"`, então a função `applyPermissoes()` não conseguia exibi-lo ao iterar sobre `[data-modulo]`.  
**Correção:** Adicionado `data-modulo="usuarios"` no elemento da sidebar e `data-modulo="usuarios"` na `#page-usuarios`.

---

### 2. Bug crítico em `loadAll` — destructuring errado
**Problema:** `G.veiculos` sempre `undefined`, causando crashes silenciosos em Logística, Manutenção e Veículos.  
**Causa:** A desestruturação do `Promise.all` listava 15 APIs mas só nomeava 14 variáveis — `veic` não existia.  
**Correção:**
```js
// Antes (errado)
const [tec, cli, eq, os, lab, hist, est, supr, log, abast, ck, manut, ped, baix] = await Promise.all([...15 APIs...]);

// Depois (correto)
const [tec, cli, eq, os, lab, hist, est, supr, log, abast, ck, manut, veic, ped, baix] = await Promise.all([...15 APIs...]);
```

---

### 3. Assinaturas não escreviam no canvas
**Problema:** Os campos de assinatura do técnico e do cliente na OS não respondiam ao mouse nem ao toque.  
**Causa:** `sigOSInit()` clonava o canvas com `cloneNode()` e depois tentava obter `offsetWidth` antes do elemento ser reinserido no DOM — resultando em `width = 0` e contexto 2D inválido.  
**Correção:** Reescrita completa de `sigOSInit()`:
- Canvas recriado como novo elemento (`document.createElement('canvas')`)
- Inserido no DOM **antes** de obter `offsetWidth`
- `ctx` criado **após** a inserção
- Event listeners aplicados diretamente no novo elemento

---

### 4. Campos de data não formatavam automaticamente
**Problema:** Inputs de data com máscara textual não formatavam enquanto o usuário digitava.  
**Correção:** Adicionada função `setupDateMasks()` com listener em `input` aplicando máscara `DD/MM/AAAA` em tempo real. Hookado no `openM()` para aplicar ao abrir qualquer modal.

---

### 5. Campos CEP com auto-complete de endereço
**Problema:** Campos CEP em Cliente, Técnico e outros cadastros não preenchiam automaticamente os campos de logradouro, cidade, estado e bairro.  
**Correção:** Adicionada função `buscarCEP(cep, prefixo)` que:
- Formata o CEP como `00000-000` enquanto digita
- Ao atingir 8 dígitos, consulta a API pública **ViaCEP** (`viacep.com.br`)
- Preenche automaticamente os campos `*-end`, `*-cidade`, `*-estado`, `*-bairro` do mesmo prefixo
- Listener global via delegação de evento em `document.body`

---

### 6. CPF e CNPJ — validação e busca de titular
**Problema:** Campos CPF/CNPJ aceitavam qualquer valor sem formatar ou validar.  
**Correção:**
- `formatCPF()` — máscara `000.000.000-00` em tempo real
- `formatCNPJ()` — máscara `00.000.000/0000-00` em tempo real
- `validarCPF()` — algoritmo completo com dígitos verificadores
- `validarCNPJ()` — algoritmo completo com dígitos verificadores
- Feedback visual: borda verde = válido, borda vermelha = inválido
- Listener global por delegação em `document.body` para campos `[id$="-cpf"]` e `[id$="-cnpj"]`

---

### 7. Cascata de cadastros — selects não atualizavam
**Problema:** Ao cadastrar um novo técnico, cliente, equipamento ou peça de estoque, os selects dependentes em outros modais não eram atualizados.  
**Correção:** Adicionada função `populateAllSelects()` que repopula todos os selects dependentes (`o-tec`, `o-cli`, `e-cli`, `fin-cli`, `cont-cli`, `lanc-tec`, `lanc-cli`, `mv-tec`, `rel-hist-equip`, etc.).  
Wraps aplicados sobre `saveTec`, `saveCli`, `saveEq` e `saveEstoque` para chamar `populateAllSelects()` após cada save com 300ms de delay.

---

### 8. Equipamento com série e contadores — preenchimento automático
**Problema:** Ao selecionar um equipamento no formulário de OS, os campos de modelo, número de série e contador não eram preenchidos automaticamente.  
**Correção:** Melhorada a função `fillEq(pfx)`:
- Preenche `modelo`, `nserie` **e** `contador` automaticamente
- Para prefixo `o` (OS de atendimento): verifica se já existe OS aberta para o mesmo número de série e alerta o usuário

---

### 9. Equipamento em laboratório — não deve aparecer disponível para OS
**Problema:** Equipamentos que estavam fisicamente em laboratório (status ≠ Concluído/Baixado) apareciam no select de equipamentos ao criar uma nova OS de atendimento.  
**Correção:** Modificada a função `loadEqs(pfx)`:
```js
if (pfx === 'o') {
  const emLab = new Set(G.laboratorio
    .filter(l => l.status !== 'Concluído' && l.status !== 'Baixado')
    .map(l => l.nserie).filter(Boolean));
  eqs = eqs.filter(e => !e.nserie || !emLab.has(e.nserie));
}
```

---

### 10. Cards do Dashboard saindo do quadro
**Problema:** Os cards KPI principais e secundários ultrapassavam os limites do container ao receber dados com valores grandes.  
**Causa:** Grid sem `min-width: 0`, permitindo que filhos empurrassem a coluna além do container.  
**Correção:**
- Adicionado `overflow: hidden` e `min-width: 0` no container principal `#dash-inner`
- Adicionado `overflow: hidden; min-width: 0` nos itens `.dkpi-card`
- Adicionado `overflow: hidden; text-overflow: ellipsis` no `.dkpi-val`
- Adicionado `min-width: 0; overflow: hidden` no grid de KPIs principais

---

### 11. Coluna de OS saindo do foco ao receber dados
**Problema:** A tabela de OS "pulava" ou perdia o scroll ao ser atualizada com novos dados.  
**Correção:**
- Adicionado `overflow-x: auto !important` no `.twrap` da página de OS
- Adicionado `overflow: hidden` no `.card` que envolve a tabela

---

### 12. Card de contrato — valor mensal incorreto para contratos anuais
**Problema:** Contratos com periodicidade Anual, Semestral ou Trimestral exibiam o valor total do período como se fosse mensal, inflacionando o MRR.  
**Correção:** Lógica de normalização adicionada em `renderContKpis()` e nos cards de `renderContratos()`:
```js
if (per === 'Anual')      return s + (v / 12);
if (per === 'Semestral')  return s + (v / 6);
if (per === 'Trimestral') return s + (v / 3);
return s + v; // Mensal — passa direto
```
O card agora exibe o label correto, ex: `"Mensal (Anual/12x)"`.

---

### 13. Card financeiro — MRR de contratos não aparecia
**Problema:** O painel financeiro não exibia o MRR (Receita Recorrente Mensal) gerado pelos contratos ativos.  
**Correção:** Adicionado novo card em `renderFinKpis()`:
- Calcula MRR real de todos os contratos ativos com a mesma normalização por periodicidade
- Exibe como card `📋 MRR Contratos` no painel de KPIs financeiros

---

## Arquivos alterados

| Arquivo | Tipo | Descrição |
|---|---|---|
| `index.html` | Modificado | Todas as 13 correções acima |

---

## Como fazer o deploy

```bash
# 1. Gerar token em: github.com/settings/tokens/new  (escopo: repo)

TOKEN="SEU_TOKEN_AQUI"

# 2. Clonar ou atualizar o repo
git clone https://${TOKEN}@github.com/clalves13/orion-at.git
cd orion-at

# 3. Copiar o arquivo corrigido
cp /caminho/do/index.html ./index.html

# 4. Commit e push
git add index.html
git commit -m "fix: correcoes UI — usuarios, assinaturas, CEP, CPF/CNPJ, dashboard"
git push https://${TOKEN}@github.com/clalves13/orion-at.git main
```

---

## Pendências / próximos passos sugeridos

- [ ] Testar CEP auto-complete em produção (depende de acesso externo ao viacep.com.br)
- [ ] Validar se o backend retorna `veiculos` corretamente na API `/api/veiculos`
- [ ] Testar assinaturas em dispositivo móvel (touch) após a correção
- [ ] Confirmar que contratos com periodicidade `Trimestral` e `Semestral` estão sendo salvos corretamente no banco
- [ ] Adicionar campo `estado` no modal de cliente (atualmente só existe `cidade`)
- [ ] Revisar fluxo de equipamento em trânsito para laboratório — considerar campo `status` no cadastro de equipamento (`Em manutenção` / `Em laboratório`)
