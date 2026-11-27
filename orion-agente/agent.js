/**
 * Orion AT — Agente de Monitoramento de Impressoras
 * Versão 1.0.3
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
const { execFileSync } = require('child_process');

// ─── CONFIGURAÇÃO ────────────────────────────────────────────────────────────
const AGENT_VERSION = '1.0.3';
const URL_PADRAO = 'https://orions-belt-bcpq.onrender.com';
// Dentro do .exe gerado pelo pkg, __dirname aponta para um sistema de arquivos virtual
// interno (C:\snapshot\...), e não para a pasta onde o .exe está. Por isso o config.json
// e o log ficavam fora do alcance e o agente subia com a configuração padrão (sem chave).
// process.execPath é o caminho real do .exe.
const BASE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
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

  const serverUrl = await pergunta('URL do servidor (ex: https://orions-belt-bcpq.onrender.com): ');
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
      agente_ver: AGENT_VERSION
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
const SERVER_URL   = CFG_TEMP?.serverUrl   || URL_PADRAO;
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
  printerDetected: '1.3.6.1.2.1.25.3.5.1.2.1',      // Erros detectados (OCTET STRING com bits)
  deviceStatus:    '1.3.6.1.2.1.25.3.2.1.5.1',      // hrDeviceStatus: 2=running, 3=warning, 4=testing, 5=down

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
    // Contadores de cobrança da Xerox (XEROX-HOST-RESOURCES-EXT-MIB): 34 = Total Black Impressions, 33 = Total Color Impressions
    pagesBW:      '1.3.6.1.4.1.253.8.53.13.2.1.6.1.20.34',
    pagesColor:   '1.3.6.1.4.1.253.8.53.13.2.1.6.1.20.33',
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
          // hrPrinterDetectedErrorState é um campo de bits (OCTET STRING): converter para
          // texto destrói os bits, então guardamos em hexadecimal.
          if (keys[i] === 'printerDetected' && Buffer.isBuffer(vb.value)) {
            result[keys[i]] = vb.value.toString('hex') || null;
          } else {
            result[keys[i]] = vb.value?.toString() || null;
          }
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

function parseStatus(printerCode, deviceCode) {
  // hrPrinterStatus (RFC 2790): 3=idle, 4=printing, 5=warmup
  const p = parseInt(printerCode);
  const mapPrinter = { 3:'idle', 4:'printing', 5:'warmup' };
  if (mapPrinter[p]) return mapPrinter[p];
  // Algumas impressoras (ex.: Xerox VersaLink) respondem 'other'(1)/'unknown'(2) em
  // hrPrinterStatus. Nesse caso usa hrDeviceStatus: running = equipamento operacional.
  const d = parseInt(deviceCode);
  const mapDevice = { 2:'idle', 3:'warning', 4:'testing', 5:'down' };
  if (mapDevice[d]) return mapDevice[d];
  return p === 1 ? 'other' : 'unknown';
}

// hrPrinterDetectedErrorState (RFC 2790): OCTET STRING em que o bit 0 é o bit mais
// significativo do primeiro byte. Recebe o valor em hexadecimal.
function parseErros(hex) {
  if (!hex) return [];
  const b = Buffer.from(hex, 'hex');
  const b0 = b[0] || 0, b1 = b[1] || 0;
  const erros = [];
  if (b0 & 0x80) erros.push('papel-baixo');
  if (b0 & 0x40) erros.push('sem-papel');
  if (b0 & 0x20) erros.push('toner-baixo');
  if (b0 & 0x10) erros.push('sem-toner');
  if (b0 & 0x08) erros.push('tampa-aberta');
  if (b0 & 0x04) erros.push('papel-preso');
  if (b0 & 0x02) erros.push('offline');
  if (b0 & 0x01) erros.push('manutencao');
  if (b1 & 0x80) erros.push('bandeja-ausente');
  if (b1 & 0x40) erros.push('saida-ausente');
  if (b1 & 0x20) erros.push('suprimento-ausente');
  if (b1 & 0x10) erros.push('saida-quase-cheia');
  if (b1 & 0x08) erros.push('saida-cheia');
  if (b1 & 0x04) erros.push('bandeja-vazia');
  if (b1 & 0x02) erros.push('manutencao-vencida');
  return erros;
}

// ─── LEITURA EM ÁRVORE (walk) ───────────────────────────────────────────────
function snmpWalk(ip, baseOid, maxItens = 400) {
  return new Promise((resolve) => {
    const out = []; let fechado = false; let t = null;
    const session = snmp.createSession(ip, SNMP_COMMUNITY, { timeout: SNMP_TIMEOUT, retries: SNMP_RETRIES, version: snmp.Version2c });
    const fim = () => { if (fechado) return; fechado = true; clearTimeout(t); try { session.close(); } catch(e) {} resolve(out); };
    t = setTimeout(fim, 25000);
    try {
      session.subtree(baseOid, 20, (vbs) => {
        for (const vb of vbs) {
          if (snmp.isVarbindError(vb)) continue;
          if (out.length < maxItens) out.push({ oid: vb.oid, value: vb.value });
        }
      }, () => fim());
    } catch(e) { fim(); }
  });
}

function valorLegivel(v) {
  if (Buffer.isBuffer(v)) {
    const s = v.toString('utf8');
    return /^[\x20-\x7e\u00a0-\uffff]*$/.test(s) ? s : '0x' + v.toString('hex');
  }
  return String(v);
}

const _numOuNulo = v => { const n = parseInt(v); return Number.isFinite(n) ? n : null; };

// Contadores P&B e Color pela tabela de marcadores da Printer MIB (RFC 3805).
// Só devolve números quando a impressora separa os marcadores; caso contrário devolve null
// (o painel mostra "—" em vez de inventar um valor).
async function lerContadoresPorMarcador(ip) {
  const itens = await snmpWalk(ip, '1.3.6.1.2.1.43.10.2.1', 200);
  const linhas = {};
  for (const it of itens) {
    const m = it.oid.match(/^1\.3\.6\.1\.2\.1\.43\.10\.2\.1\.(\d+)\.(\d+)\.(\d+)$/);
    if (!m) continue;
    const coluna = +m[1], idx = m[2] + '.' + m[3];
    (linhas[idx] = linhas[idx] || {})[coluna] = it.value;
  }
  let pb = null, cor = null;
  for (const l of Object.values(linhas)) {
    const unidade = parseInt(l[3]), vida = parseInt(l[4]), corantes = parseInt(l[6]);
    if (!Number.isFinite(vida) || !Number.isFinite(corantes)) continue;
    if (unidade !== 7 && unidade !== 8) continue; // 7 = impressões, 8 = folhas
    if (corantes <= 1) pb = (pb || 0) + vida; else cor = (cor || 0) + vida;
  }
  if (pb !== null && cor !== null) return { pb, cor };
  if (pb !== null && cor === null) return { pb, cor: 0 }; // equipamento monocromático
  return null;
}

// Amostra SNMP bruta, enviada UMA vez por impressora a cada início do agente, para diagnóstico
// de contadores que cada fabricante expõe em OIDs próprios.
const _dumpFeito = new Set();
const SUBARVORE_FAB = {
  XEROX:   '1.3.6.1.4.1.253.8.53.13.2.1',
  HP:      '1.3.6.1.4.1.11.2.3.9.4.2',
  KYOCERA: '1.3.6.1.4.1.1347.42',
  RICOH:   '1.3.6.1.4.1.367.3.2.1.2.19',
  CANON:   '1.3.6.1.4.1.1602.1.11.1.3',
  MINOLTA: '1.3.6.1.4.1.18334.1.1.1.5.7.2',
};
async function montarAmostraMib(ip, fabricante) {
  const partes = [`Amostra SNMP de ${ip} (${fabricante}) em ${new Date().toISOString()}`];
  const bases = ['1.3.6.1.2.1.43.10.2.1'];
  if (SUBARVORE_FAB[fabricante]) bases.push(SUBARVORE_FAB[fabricante]);
  for (const base of bases) {
    const itens = await snmpWalk(ip, base, 500);
    partes.push(`# ${base} (${itens.length} itens)`);
    itens.forEach(it => partes.push(`${it.oid} = ${valorLegivel(it.value).slice(0, 80)}`));
  }
  return partes.join('\n').slice(0, 40000);
}

// Decide de onde vêm os contadores P&B/Color e diz a origem, para o painel nunca mostrar número
// inventado como se fosse leitura: origem 'inferido-mono' = equipamento monocromático (P&B = total).
function resolverContadores(fabricante, data, marc, ehColor) {
  const total = _numOuNulo(data.pagesTotal);
  const pbV = _numOuNulo(data.pagesBW), corV = _numOuNulo(data.pagesColor);
  if (fabricante === 'XEROX' || fabricante === 'MINOLTA') {
    if (pbV !== null && corV !== null) return { pb: pbV, cor: corV, origem: 'fabricante' };
    if (pbV !== null && corV === null && !ehColor) return { pb: pbV, cor: 0, origem: 'fabricante-mono' };
    if (pbV === null && corV === null && !ehColor && total !== null) return { pb: total, cor: 0, origem: 'inferido-mono' };
  }
  if (marc) return { pb: marc.pb, cor: marc.cor, origem: 'marcadores' };
  if (fabricante !== 'XEROX' && (pbV !== null || corV !== null)) return { pb: pbV, cor: corV, origem: 'generico' };
  return { pb: null, cor: null, origem: null };
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

  const marc = await lerContadoresPorMarcador(ip).catch(() => null);
  const ehColor = [tonerCyanPct, tonerMagPct, tonerYelPct].some(v => v !== null);
  const cont = resolverContadores(fabricante, data, marc, ehColor);

  const dados = {
    ip,
    fabricante,
    descricao:      data.sysDescr  || '',
    nome_rede:      data.sysName   || '',
    serial:         data.serialNumber || '',
    status:         parseStatus(data.printerStatus, data.deviceStatus),
    status_snmp:    `hrPrinterStatus=${data.printerStatus ?? '-'} hrDeviceStatus=${data.deviceStatus ?? '-'}`,
    erros,
    online:         true,
    paginas_total:  parseInt(data.pagesTotal)  || 0,
    // null = a impressora não informa essa separação (o painel mostra "—", e não zero)
    paginas_pb:     cont.pb,
    paginas_color:  cont.cor,
    contadores_origem: cont.origem,
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

  if (dados.paginas_pb !== null && dados.paginas_color !== null && dados.paginas_total > 0) {
    const soma = dados.paginas_pb + dados.paginas_color;
    if (Math.abs(soma - dados.paginas_total) > Math.max(10, dados.paginas_total * 0.01)) {
      dados.contadores_divergentes = true;
      log(`⚠️  ${ip}: P&B + Color (${soma}) difere do total (${dados.paginas_total}) — conferir o contador`);
    }
  }
  if (!_dumpFeito.has(ip)) {
    _dumpFeito.add(ip);
    try { dados.mib_amostra = await montarAmostraMib(ip, fabricante); } catch(e) { log(`Amostra SNMP de ${ip} falhou: ${e.message}`); }
  }
  return dados;
}

// ─── DETECÇÃO USB (impressoras locais) ───────────────────────────────────────
// O WMIC foi removido das versões recentes do Windows; a consulta agora usa PowerShell.
// Só entram impressoras em porta USB (ignora PDF, XPS, OneNote e impressoras de rede,
// que já são coletadas via SNMP).
function detectarImpressorasUSB() {
  if (os.platform() !== 'win32') return [];
  try {
    const comando =
      "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; " +
      "Get-CimInstance Win32_Printer | Where-Object { $_.PortName -like 'USB*' } | " +
      "Select-Object Name,PortName,PrinterStatus,WorkOffline | ConvertTo-Json -Compress";
    const out = execFileSync('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', comando],
      { timeout: 20000, encoding: 'utf8', windowsHide: true });
    const txt = (out || '').trim();
    if (!txt) return [];
    let lista = JSON.parse(txt);
    if (!Array.isArray(lista)) lista = [lista]; // PowerShell devolve objeto único sem array
    return lista.map(p => {
      const offline = p.WorkOffline === true;
      return {
        tipo: 'usb',
        nome: String(p.Name || '').trim(),
        porta: String(p.PortName || '').trim(),
        status_raw: String(p.PrinterStatus ?? ''),
        offline,
        online: !offline,
        ip: null,
        fabricante: detectFabricante(p.Name || ''),
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
  if (!CLIENT_KEY) {
    log(`⛔ Chave do cliente ausente — nada foi enviado. Verifique se o config.json está na mesma pasta do .exe (${BASE_DIR}) com "clientKey" preenchido. Baixe o pacote do cliente no Orion.`);
    return;
  }
  try {
    const payload = {
      clientKey:   CLIENT_KEY,
      clientId:    CLIENT_ID,
      hostname:    os.hostname(),
      platform:    os.platform(),
      agente_ver:  AGENT_VERSION,
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
      log(`  → ${dados.fabricante} | ${dados.descricao.substring(0,40)} | Páginas: ${dados.paginas_total} (P&B ${dados.paginas_pb ?? 'n/d'} / Color ${dados.paginas_color ?? 'n/d'}) | Toner P: ${dados.toner.preto}% | Status: ${dados.status} (${dados.status_snmp})`);
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
const LOG_FILE = path.join(BASE_DIR, 'agente.log');
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
log(`Orion Agente v${AGENT_VERSION} iniciado`);
log(`Servidor: ${SERVER_URL}`);
log(`Cliente ID: ${CLIENT_ID} | Intervalo: ${INTERVAL_MIN} min`);

// Roda imediatamente e depois em loop
ciclo();
setInterval(ciclo, INTERVAL_MIN * 60 * 1000);
