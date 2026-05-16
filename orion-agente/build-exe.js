const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Iniciando build do Orion Agente...');

// Instala o pkg globalmente se não tiver
try {
  execSync('pkg --version', { stdio: 'ignore' });
} catch {
  console.log('📦 Instalando pkg...');
  execSync('npm install -g pkg', { stdio: 'inherit' });
}

// Cria pasta dist se não existir
const dist = path.join(__dirname, 'dist');
if (!fs.existsSync(dist)) fs.mkdirSync(dist);

// Gera o .exe
console.log('⚙️  Gerando .exe...');
execSync('pkg agent.js --targets node18-win-x64 --output dist/orion-agente-win.exe', {
  cwd: __dirname,
  stdio: 'inherit'
});

// Cria config.json de exemplo na dist
const config = {
  serverUrl: "https://theikos-at-production.up.railway.app",
  clientKey: "CHAVE_GERADA_NO_SISTEMA",
  clientId: "ID_DO_CLIENTE_NO_MONGODB",
  intervalMin: 15,
  subnet: "",
  snmpTimeout: 3000,
  snmpRetries: 1
};
fs.writeFileSync(path.join(dist, 'config.json'), JSON.stringify(config, null, 2));

// Cria install.bat
fs.writeFileSync(path.join(dist, 'install.bat'),
`@echo off
echo Instalando Orion Agente...
sc create OrionAgente binPath= "%~dp0orion-agente-win.exe" start= auto
sc description OrionAgente "Orion Print - Monitoramento de Impressoras"
sc start OrionAgente
echo Servico instalado e iniciado!
pause`);

// Cria uninstall.bat
fs.writeFileSync(path.join(dist, 'uninstall.bat'),
`@echo off
echo Removendo Orion Agente...
sc stop OrionAgente
sc delete OrionAgente
echo Servico removido!
pause`);

// Cria README.txt
fs.writeFileSync(path.join(dist, 'README.txt'),
`ORION AGENTE - Monitoramento de Impressoras
===========================================
1. Baixe o config.json no sistema (Clientes -> Monitor -> Baixar config.json)
2. Cole o config.json nesta pasta
3. Execute install.bat como Administrador
4. O servico OrionAgente aparecera no services.msc rodando em background
`);

console.log('✅ Build concluído! Arquivos gerados em orion-agente/dist/');