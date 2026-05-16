const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'OrionAgente',
  description: 'Orion Print — Monitoramento de Impressoras',
  script: path.join(__dirname, 'agent.js'),
  wait: 2,
  grow: 0.25,
  maxRestarts: 10,
  abortOnError: false,
});

svc.on('install', () => {
  console.log('✅ Serviço instalado!');
  svc.start();
});
svc.on('alreadyinstalled', () => console.log('⚠️ Já instalado.'));
svc.on('error', (err) => console.error('❌', err));

console.log('Instalando serviço Windows...');
svc.install();
