# Orion Print — Dockerfile para Google Cloud Run
FROM node:20-alpine

# Diretório de trabalho
WORKDIR /app

# Copia dependências primeiro (cache layer)
COPY package*.json ./

# Instala dependências
RUN npm install --production

# Copia todo o projeto
COPY . .

# Cloud Run usa a variável PORT automaticamente
ENV PORT=8080

# Expõe a porta
EXPOSE 8080

# Inicia o servidor
CMD ["node", "server.js"]
