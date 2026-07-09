/**
 * Orion AT — Agente de Monitoramento de Impressoras
 * Versão 1.0.0
 *
 * Coleta dados via SNMP (rede LAN) de impressoras HP, Kyocera, Ricoh,
 * Canon, Xerox e similares. Envia para o servidor Orion AT a cada
 * intervalo configurável. Roda como serviço Windows em background.
 */

'use strict';

const snmp    = require('net-snmp');
const axios   = require('axios');
const os      = require('os');
const fs      = require('fs');
const path    = require('path');
const { execSync } = require('child_process');

// ─── CONFIGURAÇÃO ────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'config.json');
const readline = require('readline');

async function setupConfig() {
  // Se config.json já existe e tem chave válida, usa direto
  if (fs.existsSync(CONFIG_PATH)) {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (cfg.clientKey && cfg.clientKey !== 'CHAVE_GERADA_NO_SISTEMA') {
      return cfg;
    }
  }

  // Primeira execução — pede a chave ao técnico
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║         ORION PRINT — Agente de Monitoramento      ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('\nPrimeira execução detectada. Configure o agente:\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const pergunta = (q) => new Promise(resolve => rl.question(q, resolve));

  const serverUrl = await pergunta('URL do servidor (ex: https://orion-at-production.up.railway.app): ');
  const clientKey = await pergunta('Chave do cliente (copie do sistema Orion Print → Clientes): ');
  const intervalMin = await pergunta('Intervalo de coleta em minutos (padrão: 15): ') || '15';

  rl.close();

  const cfg = {
    serverUrl: serverUrl.trim(),
    clientKey: clientKey.trim(),
    clientId: '',
    intervalMin: parseInt(intervalMin) || 15,
    subnet: '',
    snmpTimeout: 3000,
    snmpRetries: 1
  };

  // Valida a chave no servidor
  console.log('\n🔍 Validando chave no servidor...');
  try {
    const axios = require('axios');
    const r = await axios.post(`${cfg.serverUrl}/api/monitor/registrar-agente`, {
      clientKey: cfg.clientKey,
      hostname: require('os').hostname(),
      agente_ver: '1.0.0'
    }, { timeout: 10000 });
    if (r.data && r.data.clientId) {
      cfg.clientId = r.data.clientId;
      console.log(`✅ Chave válida! Cliente: ${r.data.clientNome}`);
    }
  } catch(e) {
    console.log('⚠️  Não foi possível validar a chave agora. Continuando...');
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  console.log('✅ Configuração salva em config.json\n');
  return cfg;
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return null;
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

// Inicialização assíncrona
let CFG_TEMP = loadConfig();
const SERVER_URL   = CFG_TEMP?.serverUrl   || 'https://orion-at-production.up.railway.app';
const CLIENT_KEY   = CFG_TEMP?.clientKey   || '';
const CLIENT_ID    = CFG_TEMP?.clientId    || '';
const INTERVAL_MIN  = CFG_TEMP?.intervalMin || 15; // minutos entre coletas
const SUBNET        = CFG_TEMP?.subnet      || '';  // ex: '192.168.1.' — auto-detectado se vazio
const SNMP_TIMEOUT  = CFG_TEMP?.snmpTimeout || 3000;
const SNMP_RETRIES  = CFG_TEMP?.snmpRetries || 1;
// Community configurável — se o config.json não tiver o campo, cai em 'public'
// (mesmo valor que sempre foi usado, então nada muda pra quem não mexer).
const SNMP_COMMUNITY = CFG_TEMP?.snmpCommunity || 'public';

// ─── OIDs SNMP PADRÃO (RFC 3805 / Printer MIB) ──────────────────────────────
// Estes OIDs funcionam na grande maioria das impressoras de rede.
const OIDs = {
  // Info básica
  sysDescr:        '1.3.6.1.2.1.1.1.0',      // Descrição do dispositivo
  sysName:         '1.3.6.1.2.1.1.5.0',       // Nome na rede
  hrDeviceDescr:   '1.3.6.1.2.1.25.3.2.1.3.1',

  // Contadores de páginas (Printer MIB)
  pagesTotal:      '1.3.6.1.2.1.43.10.2.1.4.1.1',   // Total de páginas
  pagesBW:         '1.3.6.1.2.1.43.10.2.1.4.1.2',   // P&B
  pagesColor:      '1.3.6.1.2.1.43.10.2.1.4.1.3',   // Coloridas

  // Status da impressora
  printerStatus:   '1.3.6.1.2.1.25.3.5.1.1.1',      // 3=idle, 4=printing, 5=warmup
  printerDetected: '1.3.6.1.2.1.25.3.5.1.2.1',      // Erros detectados

  // Suprimentos — toner preto (índice 1, 2, 3, 4 para CMYK)
  tonerBlackMax:   '1.3.6.1.2.1.43.11.1.1.8.1.1',
  tonerBlackCur:   '1.3.6.1.2.1.43.11.1.1.9.1.1',
  tonerCyanMax:    '1.3.6.1.2.1.43.11.1.1.8.1.2',
  tonerCyanCur:    '1.3.6.1.2.1.43.11.1.1.9.1.2',
  tonerMagMax:     '1.3.6.1.2.1.43.11.1.1.8.1.3',
  tonerMagCur:     '1.3.6.1.2.1.43.11.1.1.9.1.3',
  tonerYelMax:     '1.3.6.1.2.1.43.11.1.1.8.1.4',
  tonerYelCur:     '1.3.6.1.2.1.43.11.1.1.9.1.4',

  // Tambor / drum
  drumMax:         '1.3.6.1.2.1.43.11.1.1.8.1.5',
  drumCur:         '1.3.6.1.2.1.43.11.1.1.9.1.5',

  // Número de série (varia por fabricante — tentamos o padrão RFC)
  serialNumber:    '1.3.6.1.2.1.43.5.1.1.17.1',

  // Bandeja / papel
  paperTrayStatus: '1.3.6.1.2.1.43.8.2.1.10.1.1',
  paperTrayCapMax: '1.3.6.1.2.1.43.8.2.1.9.1.1',
  paperTrayCur:    '1.3.6.1.2.1.43.8.2.1.10.1.1',
};

// OIDs extras por fabricante (sobrescreve quando detectado)
const OIDs_FABRICANTE = {
  HP: {
    pagesTotal:   '1.3.6.1.4.1.11.2.3.9.4.2.1.4.1.2.5',
    serialNumber: '1.3.6.1.4.1.11.2.3.9.4.2.1.1.1.11.0',
  },
  KYOCERA: {
    pagesTotal:   '1.3.6.1.4.1.1347.42.3.1.1.1.1.1',
    serialNumber: '1.3.6.1.4.1.1347.42.2.1.1.1.6.1.1.0',
  },
  RICOH: {
    pagesTotal:   '1.3.6.1.4.1.367.3.2.1.2.19.5.1.5.1',
    serialNumber: '1.3.6.1.4.1.367.3.2.1.2.1.4.0',
  },
  XEROX: {
    pagesTotal:   '1.3.6.1.4.1.253.8.53.13.2.1.6.1.20.1',
    serialNumber: '1.3.6.1.4.1.253.8.53.3.2.1.3.1',
  },
  CANON: {
    pagesTotal:   '1.3.6.1.4.1.1602.1.11.1.3.1.4.301',
    serialNumber: '1.3.6.1.4.1.1602.1.1.1.1.0',
  },
  MINOLTA: {
    pagesTotal:    '1.3.6.1.4.1.18334.1.1.1.5.7.2.1.1.1.6.1',
    pagesBW:       '1.3.6.1.4.1.18334.1.1.1.5.7.2.1.1.1.6.2',
    pagesColor:    '1.3.6.1.4.1.18334.1.1.1.5.7.2.1.1.1.6.3',
    serialNumber:  '1.3.6.1.4.1.18334.1.1.2.1.2.1.1.4.0',
    tonerBlackMax: '1.3.6.1.4.1.18334.1.1.1.5.7.2.1.2.1.5.1',
    tonerBlackCur: '1.3.6.1.4.1.18334.1.1.1.5.7.2.1.2.1.6.1',
    tonerCyanMax:  '1.3.6.1.4.1.18334.1.1.1.5.7.2.1.2.1.5.2',
    tonerCyanCur:  '1.3.6.1.4.1.18334.1.1.1.5.7.2.1.2.1.6.2',
    tonerMagMax:   '1.3.6.1.4.1.18334.1.1.1.5.7.2.1.2.1.5.3',
    tonerMagCur:   '1.3.6.1.4.1.18334.1.1.1.5.7.2.1.2.1.6.3',
    tonerYelMax:   '1.3.6.1.4.1.18334.1.1.1.5.7.2.1.2.1.5.4',
    tonerYelCur:   '1.3.6.1.4.1.18334.1.1.1.5.7.2.1.2.1.6.4',
    drumMax:       '1.3.6.1.4.1.18334.1.1.1.5.7.2.1.2.1.5.5',
    drumCur:       '1.3.6.1.4.1.18334.1.1.1.5.7.2.1.2.1.6.5',
  },
};

// ─── DETECÇÃO DE SUBNET ──────────────────────────────────────────────────────
function detectSubnet() {
  if (SUBNET) return SUBNET;
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}.`;
      }
    }
  }
  return '192.168.1.';
}

// ─── SCAN DE IMPRESSORAS NA REDE ─────────────────────────────────────────────
async function scanRede(subnet) {
  log(`Escaneando rede ${subnet}0/24...`);
  const found = [];
  const promises = [];

  for (let i = 1; i <= 254; i++) {
    const ip = `${subnet}${i}`;
    promises.push(
      pingSnmp(ip).then(online => {
        if (online) found.push(ip);
      }).catch(() => {})
    );
  }

  await Promise.all(promises);
  log(`Impressoras encontradas na rede: ${found.length} — IPs: ${found.join(', ')}`);
  return found;
}

function pingSnmp(ip) {
  return new Promise((resolve) => {
    const session = snmp.createSession(ip, SNMP_COMMUNITY, {
      timeout: SNMP_TIMEOUT,
      retries: 0,
      version: snmp.Version2c,
    });
    session.get([OIDs.pagesTotal], (err, varbinds) => {
      session.close();
      if (err || !varbinds || varbinds[0]?.type === snmp.ObjectType.NoSuchObject) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// ─── COLETA SNMP DE UMA IMPRESSORA ──────────────────────────────────────────
function snmpGet(ip, oidMap) {
  return new Promise((resolve) => {
    const session = snmp.createSession(ip, SNMP_COMMUNITY, {
      timeout: SNMP_TIMEOUT,
      retries: SNMP_RETRIES,
      version: snmp.Version2c,
    });
    const oidList = Object.values(oidMap);
    const keys    = Object.keys(oidMap);
    const result  = {};

    session.get(oidList, (err, varbinds) => {
      session.close();
      if (err) { resolve(null); return; }
      varbinds.forEach((vb, i) => {
        if (vb.type !== snmp.ObjectType.NoSuchObject &&
            vb.type !== snmp.ObjectType.NoSuchInstance &&
            vb.type !== snmp.ObjectType.EndOfMibView) {
          result[keys[i]] = vb.value?.toString() || null;
        }
      });
      resolve(result);
    });
  });
}

function detectFabricante(descr = '') {
  const d = descr.toUpperCase();
  if (d.includes('HP') || d.includes('HEWLETT')) return 'HP';
  if (d.includes('KYOCERA') || d.includes('MITA'))  return 'KYOCERA';
  if (d.includes('RICOH'))   return 'RICOH';
  if (d.includes('XEROX'))   return 'XEROX';
  if (d.includes('CANON'))   return 'CANON';
  if (d.includes('MINOLTA') || d.includes('KONICA') || d.includes('BIZHUB')) return 'MINOLTA';
  if (d.includes('BROTHER')) return 'BROTHER';
  if (d.includes('EPSON'))   return 'EPSON';
  if (d.includes('SAMSUNG')) return 'SAMSUNG';
  return 'GENERICO';
}

function calcPct(cur, max) {
  const c = parseInt(cur), m = parseInt(max);
  if (!m || m <= 0 || isNaN(c) || isNaN(m)) return null;
  if (c < 0) return 0; // -3 = cheio em alguns fabricantes
  return Math.round((c / m) * 100);
}

function parseStatus(code) {
  const c = parseInt(code);
  const map = { 1:'other', 2:'unknown', 3:'idle', 4:'printing', 5:'warmup' };
  return map[c] || 'unknown';
}

function parseErros(code) {
  if (!code) return [];
  const erros = [];
  const c = parseInt(code);
  if (c & 1)   erros.push('sem-papel');
  if (c & 2)   erros.push('papel-preso');
  if (c & 4)   erros.push('tampa-aberta');
  if (c & 8)   erros.push('sem-toner');
  if (c & 16)  erros.push('toner-baixo');
  if (c & 32)  erros.push('erro-memoria');
  if (c & 64)  erros.push('offline');
  if (c & 128) erros.push('erro-hardware');
  return erros;
}

async function coletarImpressora(ip) {
  // Primeiro get básico para detectar fabricante
  const basicData = await snmpGet(ip, {
    sysDescr:      OIDs.sysDescr,
    sysName:       OIDs.sysName,
    printerStatus: OIDs.printerStatus,
    printerDetected: OIDs.printerDetected,
  });

  if (!basicData) return null;

  const fabricante = detectFabricante(basicData.sysDescr || '');
  // Mescla OIDs padrão com OIDs do fabricante
  const oidsFab = OIDs_FABRICANTE[fabricante] || {};
  const oidsFinais = { ...OIDs, ...oidsFab };

  const data = await snmpGet(ip, oidsFinais);
  if (!data) return null;

  const tonerBlackPct = calcPct(data.tonerBlackCur, data.tonerBlackMax);
  const tonerCyanPct  = calcPct(data.tonerCyanCur,  data.tonerCyanMax);
  const tonerMagPct   = calcPct(data.tonerMagCur,   data.tonerMagMax);
  const tonerYelPct   = calcPct(data.tonerYelCur,   data.tonerYelMax);
  const drumPct       = calcPct(data.drumCur,        data.drumMax);

  const erros = parseErros(data.printerDetected);

  return {
    ip,
    fabricante,
    descricao:      data.sysDescr  || '',
    nome_rede:      data.sysName   || '',
    serial:         data.serialNumber || '',
    status:         parseStatus(data.printerStatus),
    erros,
    online:         true,
    paginas_total:  parseInt(data.pagesTotal)  || 0,
    paginas_pb:     parseInt(data.pagesBW)     || 0,
    paginas_color:  parseInt(data.pagesColor)  || 0,
    toner: {
      preto:  tonerBlackPct,
      ciano:  tonerCyanPct,
      magenta: tonerMagPct,
      amarelo: tonerYelPct,
    },
    drum_pct:   drumPct,
    papel_nivel: calcPct(data.paperTrayCur, data.paperTrayCapMax),
    coletado_em: new Date().toISOString(),
  };
}

// ─── DETECÇÃO USB (impressoras locais) ───────────────────────────────────────
function detectarImpressorasUSB() {
  try {
    // wmic lista impressoras instaladas no Windows
    const out = execSync(
      'wmic printer get Name,PortName,PrinterStatus,WorkOffline /format:csv',
      { timeout: 5000, encoding: 'utf8' }
    );
    const linhas = out.split('\n').filter(l => l.trim() && !l.startsWith('Node'));
    return linhas.map(linha => {
      const cols = linha.split(',');
      return {
        tipo: 'usb',
        nome: (cols[2] || '').trim(),
        porta: (cols[3] || '').trim(),
        status_raw: (cols[4] || '').trim(),
        offline: (cols[5] || '').trim().toLowerCase() === 'true',
        online: (cols[5] || '').trim().toLowerCase() !== 'true',
        ip: null,
        fabricante: detectFabricante((cols[2] || '')),
        coletado_em: new Date().toISOString(),
      };
    }).filter(p => p.nome);
  } catch(e) {
    log(`USB detect error: ${e.message}`);
    return [];
  }
}

// ─── ENVIO PARA O SERVIDOR ───────────────────────────────────────────────────
async function enviarDados(impressoras) {
  if (!impressoras.length) { log('Nenhuma impressora para enviar.'); return; }
  try {
    const payload = {
      clientKey:   CLIENT_KEY,
      clientId:    CLIENT_ID,
      hostname:    os.hostname(),
      platform:    os.platform(),
      agente_ver:  '1.0.0',
      timestamp:   new Date().toISOString(),
      impressoras,
    };
    const res = await axios.post(`${SERVER_URL}/api/monitor/telemetria`, payload, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json', 'X-Theikos-Key': CLIENT_KEY },
    });
    log(`✅ Dados enviados: ${impressoras.length} impressora(s) — servidor: ${res.data?.ok ? 'OK' : 'ERRO'}`);
  } catch(e) {
    log(`❌ Erro ao enviar dados: ${e.message}`);
  }
}

// ─── CICLO PRINCIPAL ─────────────────────────────────────────────────────────
async function ciclo() {
  log('=== Iniciando ciclo de coleta ===');
  const subnet = detectSubnet();
  log(`Subnet detectada: ${subnet}0/24`);

  // Scan de rede
  const ipsRede = await scanRede(subnet);

  // Coleta dados SNMP de cada IP encontrado
  const impressorasRede = [];
  for (const ip of ipsRede) {
    log(`Coletando dados de ${ip}...`);
    const dados = await coletarImpressora(ip);
    if (dados) {
      impressorasRede.push(dados);
      log(`  → ${dados.fabricante} | ${dados.descricao.substring(0,40)} | Páginas: ${dados.paginas_total} | Toner P: ${dados.toner.preto}%`);
    }
  }

  // Impressoras USB locais
  const impressorasUSB = detectarImpressorasUSB();
  log(`Impressoras USB locais: ${impressorasUSB.length}`);

  const todas = [...impressorasRede, ...impressorasUSB];
  await enviarDados(todas);

  // Verificar alertas locais
  verificarAlertas(impressorasRede);

  log(`=== Ciclo concluído. Próximo em ${INTERVAL_MIN} minutos ===\n`);
}

function verificarAlertas(impressoras) {
  for (const imp of impressoras) {
    // Toner crítico (< 10%)
    if (imp.toner.preto !== null && imp.toner.preto < 10) {
      log(`⚠️  ALERTA: Toner PRETO crítico em ${imp.ip} — ${imp.toner.preto}%`);
    }
    // Erros
    if (imp.erros.length > 0) {
      log(`⚠️  ALERTA: Erros em ${imp.ip} — ${imp.erros.join(', ')}`);
    }
    // Status não-idle
    if (imp.status !== 'idle' && imp.status !== 'printing') {
      log(`⚠️  ALERTA: Status inesperado em ${imp.ip} — ${imp.status}`);
    }
  }
}

// ─── LOG ─────────────────────────────────────────────────────────────────────
const LOG_FILE = path.join(__dirname, 'agente.log');
function log(msg) {
  const linha = `[${new Date().toLocaleString('pt-BR')}] ${msg}`;
  console.log(linha);
  // Mantém apenas os últimos 5MB de log
  try {
    const stats = fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE) : null;
    if (stats && stats.size > 5 * 1024 * 1024) fs.truncateSync(LOG_FILE, 0);
    fs.appendFileSync(LOG_FILE, linha + '\n');
  } catch(e) {}
}

// ─── START ───────────────────────────────────────────────────────────────────
log('Orion Agente v1.0.0 iniciado');
log(`Servidor: ${SERVER_URL}`);
log(`Cliente ID: ${CLIENT_ID} | Intervalo: ${INTERVAL_MIN} min`);

// Roda imediatamente e depois em loop
ciclo();
setInterval(ciclo, INTERVAL_MIN * 60 * 1000);
