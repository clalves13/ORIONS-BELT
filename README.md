# Orion AT — Sistema de Assistência Técnica

## Como subir no Railway (acesso de qualquer lugar)

### Passo 1 — Criar conta no GitHub
1. Acesse https://github.com e crie uma conta gratuita
2. Clique em **New repository**
3. Nome: `orion-at`
4. Deixe **Private** marcado
5. Clique **Create repository**

### Passo 2 — Enviar os arquivos
No seu computador, abra o terminal (Prompt de Comando) e execute:

```bash
cd pasta-onde-extraiu-o-zip
git init
git add .
git commit -m "Orion AT"
git remote add origin https://github.com/SEU_USUARIO/orion-at.git
git push -u origin main
```

### Passo 3 — Criar conta no Railway
1. Acesse https://railway.app
2. Clique **Login with GitHub**
3. Autorize o Railway

### Passo 4 — Criar o projeto
1. No Railway, clique **New Project**
2. Clique **Deploy from GitHub repo**
3. Selecione o repositório `orion-at`
4. O Railway detecta automaticamente o Node.js e faz o deploy

### Passo 5 — Configurar variáveis de ambiente (OBRIGATÓRIO)
1. No painel do Railway, clique no seu serviço
2. Vá em **Variables** e adicione:

| Variável | Descrição |
|---|---|
| `MONGO_URI` | String de conexão do MongoDB Atlas |
| `CLOUDINARY_CLOUD_NAME` | Nome do cloud no Cloudinary |
| `CLOUDINARY_API_KEY` | Chave de API do Cloudinary |
| `CLOUDINARY_API_SECRET` | Secret do Cloudinary |
| `MASTER_PASSWORD` | Senha do usuário master (oculto) |
| `SESSION_SECRET` | Frase longa e aleatória para segurança das sessões |

### Passo 6 — Configurar volume de dados (IMPORTANTE)
Para que os dados não se percam ao atualizar:

1. No painel do Railway, clique no seu serviço
2. Vá em **Settings** → **Volumes**
3. Clique **Add Volume**
4. Mount Path: `/app/data`
5. Clique **Add**

### Passo 7 — Acessar o sistema
1. Vá em **Settings** → **Domains**
2. Clique **Generate Domain**
3. Você receberá um link como: `orion-at.up.railway.app`
4. Esse link funciona em qualquer PC, celular ou tablet

---

## Primeiro acesso
- **Usuário:** admin
- **Senha:** admin123
- ⚠️ Troque a senha imediatamente após o primeiro login

## Usuários
- **Admin:** acessa tudo, gerencia usuários
- **Técnico:** acessa tudo exceto gerenciamento de usuários
- **Master (oculto):** acesso total, não aparece no sistema

## Estrutura do projeto
```
orion-at/
├── server.js          — Servidor Node.js + API
├── orion-agente.js    — Agente de monitoramento de impressoras (v2.1.0)
├── package.json       — Dependências
├── railway.toml       — Configuração Railway
├── Dockerfile         — Configuração Docker
└── public/
    ├── index.html     — Sistema completo (frontend)
    ├── portal.html    — Portal do cliente
    └── monitor.html   — Painel de monitoramento
```

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
6. **Estoque** — Peças e suprimentos com alertas
7. **Financeiro** — Lançamentos, KPIs e MRR
8. **Contratos** — Gestão de contratos e recorrência
9. **Agenda** — Calendário interativo
10. **Relatórios** — Geração de PDF
11. **Técnicos** — Cadastro da equipe
12. **Usuários** — Controle de acesso (só admin)
