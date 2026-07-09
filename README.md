# Orion AT — Sistema de Assistência Técnica

> ⚠️ **Nome em transição:** o sistema está sendo renomeado para **Orion Belt** (repositório já é `ORIONS-BELT` no GitHub). Nomes internos no código (banco `orion_at`, textos na interface) ainda não foram atualizados — isso é uma pendência conhecida, não um erro. Ver `PROGRESSO.md` para o plano completo.

## Como subir no Render (acesso de qualquer lugar, 100% gratuito)

> Migrado do Railway para o Render em julho/2026 — o Railway não oferece mais tier gratuito permanente (só 30 dias de trial). O Render tem free tier real, sem cartão, e permite uso comercial (o Railway free/Vercel Hobby não permitem).

### Passo 1 — Repositório no GitHub
Já existe: `https://github.com/clalves13/orion-at` (redirecionando para `ORIONS-BELT`). Se for clonar do zero:
```bash
git clone https://github.com/clalves13/orion-at.git
```

### Passo 2 — Criar conta no Render
1. Acesse https://render.com e crie conta com GitHub (sem cartão)
2. **New** → **Web Service** → selecione o repositório

### Passo 3 — Configurar o serviço
| Campo | Valor |
|---|---|
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `node server.js` |
| Instance Type | **Free** |

### Passo 4 — Variáveis de ambiente (OBRIGATÓRIO)
Em **Environment**, adicione:

| Variável | Descrição |
|---|---|
| `MONGO_URI` | String de conexão do MongoDB Atlas (tier M0 gratuito) |
| `CLOUDINARY_CLOUD_NAME` | Nome do cloud no Cloudinary (migração para Cloudflare R2 planejada — ver PROGRESSO.md) |
| `CLOUDINARY_API_KEY` | Chave de API do Cloudinary |
| `CLOUDINARY_API_SECRET` | Secret do Cloudinary |
| `MASTER_PASSWORD` | Senha do usuário master (oculto) |
| `ADMIN_PASSWORD` | Senha do primeiro usuário admin criado no primeiro start |
| `SESSION_SECRET` | Frase longa e aleatória para segurança das sessões |

### Passo 5 — Auto-Deploy
Já vem configurado como **"On Commit"** — todo `git push` na branch `main` dispara build e deploy automáticos. Acompanhe em **Events** no painel do Render.

### Passo 6 — Acessar o sistema
URL gerada automaticamente, formato `https://orions-belt-xxxx.onrender.com`.

⚠️ **Free tier do Render "dorme" após 15 min sem acesso** — a primeira requisição depois disso demora de 30s a 2min para responder. Normal, não é erro.

---

## Primeiro acesso
- **Usuário:** admin
- **Senha:** a que você definiu em `ADMIN_PASSWORD`
- ⚠️ Troque a senha imediatamente após o primeiro login

## Usuários
- **Admin:** acessa tudo, gerencia usuários
- **Técnico:** acessa tudo exceto gerenciamento de usuários
- **Master (oculto):** acesso total, não aparece no sistema

## Estrutura do projeto
```
orion-at/
├── server.js          — Servidor Node.js + API
├── orion-agente/       — Agente de monitoramento (SNMP via net-snmp), roda no Windows do cliente
│   ├── agent.js        — Código-fonte real (v1.0.0) — é o que gera o .exe distribuído
│   └── package.json    — Dependências do agente (net-snmp, axios) + script de build (pkg)
├── package.json       — Dependências
├── railway.toml       — Configuração Railway (legado — não mais usado no deploy atual)
├── Dockerfile         — Configuração Docker
└── public/
    ├── index.html     — Sistema completo (frontend)
    ├── portal.html    — Portal do cliente
    └── monitor.html   — Painel de monitoramento
```

> **Plano de arquitetura futuro:** separação em dois produtos complementares (`orion-gestao` + `orion-monitor`) com multi-tenant, documentado em `PROGRESSO.md`.

## Rodando localmente (sem internet)
```bash
npm install
npm start
```
Acesse: http://localhost:3000

## Módulos do sistema
1. **Dashboard** — Indicadores, KPIs e gráficos
2. **Ordens de Serviço** — OS numeradas com assinaturas digitais e fotos
3. **Laboratório** — Manutenção interna com checklist
4. **Logística** — Rotas, frota e checklist de veículos
5. **Clientes / Equipamentos** — Cadastro e histórico
6. **Estoque** — Peças e suprimentos com alertas (consumo real detectado automaticamente via agente SNMP — ver PROGRESSO.md)
7. **Financeiro** — Lançamentos, KPIs e MRR
8. **Contratos** — Gestão de contratos e recorrência
9. **Agenda** — Calendário interativo
10. **Relatórios** — Geração de PDF
11. **Técnicos** — Cadastro da equipe
12. **Usuários** — Controle de acesso (só admin)

## Agente de monitoramento (orion-agente/)
O `.exe` que os clientes instalam não é gerado automaticamente pelo servidor — é compilado localmente e enviado manualmente:

```bash
cd orion-agente
npm install
npm run build          # gera dist/OrionAgente.exe via pkg
```

Depois, no sistema: **Configurações → Monitor → Enviar Executável**, faça upload do `dist/OrionAgente.exe`. Ele fica hospedado no Cloudinary e é isso que a rota `/download/pacote-agente/:clienteId` empacota (junto com um `config.json` já preenchido com a chave do cliente) quando alguém baixa o pacote pela tela de Clientes.

Sempre que o `agent.js` for alterado, é preciso repetir o `npm run build` e reenviar o novo `.exe` — o upload não é automático a partir do git push.
