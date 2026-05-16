const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'OrionAgente',
  script: path.join(__dirname, 'agent.js')
});

svc.on('uninstall', () => console.log('✅ Serviço removido!'));
svc.on('error', (err) => console.error('❌', err));

svc.uninstall();
