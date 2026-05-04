# Theikós AT — Sistema de Assistência Técnica

## Como subir no Railway (acesso de qualquer lugar)

### Passo 1 — Criar conta no GitHub
1. Acesse https://github.com e crie uma conta gratuita
2. Clique em **New repository**
3. Nome: `theikos-at`
4. Deixe **Private** marcado
5. Clique **Create repository**

### Passo 2 — Enviar os arquivos
No seu computador, abra o terminal (Prompt de Comando) e execute:

```bash
cd pasta-onde-extraiu-o-zip
git init
git add .
git commit -m "Sistema Theikós AT"
git remote add origin https://github.com/SEU_USUARIO/theikos-at.git
git push -u origin main
```

### Passo 3 — Criar conta no Railway
1. Acesse https://railway.app
2. Clique **Login with GitHub**
3. Autorize o Railway

### Passo 4 — Criar o projeto
1. No Railway, clique **New Project**
2. Clique **Deploy from GitHub repo**
3. Selecione o repositório `theikos-at`
4. O Railway detecta automaticamente o Node.js e faz o deploy

### Passo 5 — Configurar volume de dados (IMPORTANTE)
Para que os dados não se percam ao atualizar:

1. No painel do Railway, clique no seu serviço
2. Vá em **Settings** → **Volumes**
3. Clique **Add Volume**
4. Mount Path: `/app/data`
5. Clique **Add**

### Passo 6 — Acessar o sistema
1. Vá em **Settings** → **Domains**
2. Clique **Generate Domain**
3. Você receberá um link como: `theikos-at.up.railway.app`
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
theikos-at/
├── server.js          — Servidor Node.js + API
├── package.json       — Dependências
├── railway.toml       — Configuração Railway
├── public/
│   └── index.html     — Sistema completo (frontend)
└── data/
    └── theikos.db     — Banco de dados SQLite (gerado automaticamente)
```

## Rodando localmente (sem internet)
```bash
npm install
npm start
```
Acesse: http://localhost:3000

## Módulos do sistema
1. **Dashboard** — Indicadores, retrabalho, gastos por técnico
2. **Atendimentos** — Registro de serviços em campo com gastos
3. **Ordens de Serviço** — OS numeradas, impressão profissional
4. **Laboratório** — Manutenção interna com checklist de 18 itens
5. **Histórico** — Chamados e atendimentos em linha do tempo
6. **Estoque** — Peças e suprimentos (novo/usado/testado)
7. **Suprimentos Cliente** — Toners e grampos por cliente com movimentos
8. **Clientes/Equipamentos** — 1 cliente → N equipamentos
9. **Técnicos** — Cadastro da equipe
10. **Usuários** — Controle de acesso (só admin)
