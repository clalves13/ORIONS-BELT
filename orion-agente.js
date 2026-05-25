/**
 * Orion Agente v2.1.0 — Coletor de Impressoras via SNMP
 * Compatível com pkg (executável .exe standalone)
 * Uso normal:    node orion-agente.js
 * Como .exe:     OrionAgente.exe          (roda o agente)
 *                OrionAgente.exe --install (instala como serviço)
 *                OrionAgente.exe --uninstall (remove o serviço)
 */

const os      = require('os');
const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const dgram   = require('dgram');
const { execSync, spawn } = require('child_process');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Quando rodando como .exe compilado pelo pkg, process.execPath aponta para o
// próprio .exe. O config.json fica na mesma pasta que o .exe.
const EXE_DIR  = path.dirname(process.execPath);
const IS_PKG   = !!process.pkg; // true quando rodando como .exe compilado
const CFG_PATH = IS_PKG
  ? path.join(EXE_DIR, 'config.json')
  : path.join(__dirname, 'config.json');

if (!fs.existsSync(CFG_PATH)) {
  console.error('❌ config.json não encontrado em: ' + CFG_PATH);
  process.exit(1);
}

const CFG        = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
const SERVER_URL = CFG.serverUrl  || 'https://orion-at-production.up.railway.app';
const CLIENT_KEY = CFG.clientKey  || '';
const INTERVAL   = (CFG.intervalMin || 15) * 60 * 1000;
const SNMP_TO    = CFG.snmpTimeout || 3000;
const SUBNET_FIXO = CFG.subnet    || '';

// ─── MODO INSTALADOR / DESINSTALADOR ─────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--install')) {
  instalarServico();
  process.exit(0);
}
if (args.includes('--uninstall')) {
  desinstalarServico();
  process.exit(0);
}

function instalarServico() {
  const exePath    = process.execPath;
  const installDir = 'C:\\OrionAgente';
  const exeDest    = path.join(installDir, 'OrionAgente.exe');
  const cfgDest    = path.join(installDir, 'config.json');
  const cfgSrc     = CFG_PATH;

  console.log('\n🖨  Orion Agente — Instalador\n');

  // 1. Cria pasta de instalação
  if (!fs.existsSync(installDir)) {
    fs.mkdirSync(installDir, { recursive: true });
    console.log('📁 Pasta criada: ' + installDir);
  }

  // 2. Copia o .exe e o config.json para a pasta de instalação
  fs.copyFileSync(exePath, exeDest);
  fs.copyFileSync(cfgSrc, cfgDest);
  console.log('📋 Arquivos copiados para ' + installDir);

  // 3. Registra como serviço do Windows via sc.exe (nativo, sem dependências)
  try {
    execSync(`sc stop OrionAgente`, { stdio: 'ignore' });
    execSync(`sc delete OrionAgente`, { stdio: 'ignore' });
  } catch (_) {}

  try {
    execSync(
      `sc create OrionAgente binPath= "${exeDest}" start= auto DisplayName= "Orion Agente Monitor"`,
      { stdio: 'pipe' }
    );
    execSync(`sc description OrionAgente "Agente de monitoramento de impressoras Orion"`, { stdio: 'pipe' });
    execSync(`sc start OrionAgente`, { stdio: 'pipe' });
    console.log('✅ Serviço OrionAgente instalado e iniciado!');
    console.log('   O agente iniciará automaticamente com o Windows.');
    console.log('\n   Para verificar: sc query OrionAgente');
    console.log('   Para desinstalar: execute OrionAgente.exe --uninstall como Admin\n');
  } catch (e) {
    console.error('❌ Erro ao registrar serviço: ' + e.message);
    console.log('\n   Tente executar como Administrador.');
    process.exit(1);
  }
}

function desinstalarServico() {
  console.log('\n🗑  Orion Agente — Desinstalador\n');
  try {
    execSync(`sc stop OrionAgente`,   { stdio: 'pipe' });
    console.log('⏹  Serviço parado.');
  } catch (_) {}
  try {
    execSync(`sc delete OrionAgente`, { stdio: 'pipe' });
    console.log('🗑  Serviço removido.');
  } catch (e) {
    console.error('❌ Erro ao remover serviço: ' + e.message);
  }
  const installDir = 'C:\\OrionAgente';
  if (fs.existsSync(installDir)) {
    fs.rmSync(installDir, { recursive: true, force: true });
    console.log('📁 Pasta ' + installDir + ' removida.');
  }
  console.log('\n✅ Orion Agente desinstalado com sucesso.\n');
}

// ─── SNMP ─────────────────────────────────────────────────────────────────────
const OID = {
  descricao: '1.3.6.1.2.1.1.1.0',      nome_rede: '1.3.6.1.2.1.1.5.0',
  serial:    '1.3.6.1.2.1.43.5.1.1.17.1',
  pag_total: '1.3.6.1.2.1.43.10.2.1.4.1.1',
  pag_pb:    '1.3.6.1.2.1.43.10.2.1.4.1.2',
  pag_cor:   '1.3.6.1.2.1.43.10.2.1.4.1.3',
  tn1:'1.3.6.1.2.1.43.11.1.1.9.1.1', tm1:'1.3.6.1.2.1.43.11.1.1.8.1.1',
  tn2:'1.3.6.1.2.1.43.11.1.1.9.1.2', tm2:'1.3.6.1.2.1.43.11.1.1.8.1.2',
  tn3:'1.3.6.1.2.1.43.11.1.1.9.1.3', tm3:'1.3.6.1.2.1.43.11.1.1.8.1.3',
  tn4:'1.3.6.1.2.1.43.11.1.1.9.1.4', tm4:'1.3.6.1.2.1.43.11.1.1.8.1.4',
  drum_n:'1.3.6.1.2.1.43.11.1.1.9.1.5', drum_m:'1.3.6.1.2.1.43.11.1.1.8.1.5',
  status:'1.3.6.1.2.1.25.3.5.1.1.1',   papel:'1.3.6.1.2.1.43.8.2.1.10.1.1',
};

function descobrirSubnets() {
  if (SUBNET_FIXO) return SUBNET_FIXO.split(',').map(s => s.trim()).filter(Boolean);
  const subs = new Set();
  for (const [n, addrs] of Object.entries(os.networkInterfaces() || {})) {
    if (/loopback|lo$|vmnet|vbox|docker|wsl|hyper/i.test(n)) continue;
    for (const a of (addrs || [])) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const ip = a.address;
      if (ip.startsWith('10.') || ip.startsWith('192.168.') ||
          (ip.startsWith('172.') && +ip.split('.')[1] >= 16 && +ip.split('.')[1] <= 31)) {
        subs.add(ip.split('.').slice(0, 3).join('.'));
        console.log('📡 Interface ' + n + ' (' + ip + ') → ' + ip.split('.').slice(0, 3).join('.') + '.0/24');
      }
    }
  }
  if (!subs.size) { console.warn('⚠️ Fallback: 192.168.0, 192.168.1, 10.0.0'); return ['192.168.0','192.168.1','10.0.0']; }
  return [...subs];
}

function buildPDU(oid, comm) {
  const encInt = n => n < 128 ? Buffer.from([2,1,n]) : Buffer.from([2,2,(n>>8)&255,n&255]);
  const encOID = s => { const p=s.split('.').map(Number); const e=[p[0]*40+p[1]]; for(let i=2;i<p.length;i++){let v=p[i];if(v<128){e.push(v);}else{const b=[];while(v>0){b.unshift(v&127);v>>=7;}for(let j=0;j<b.length-1;j++)b[j]|=128;e.push(...b);}} return Buffer.concat([Buffer.from([6,e.length]),Buffer.from(e)]); };
  const encStr = s => { const b=Buffer.from(s,'ascii'); return Buffer.concat([Buffer.from([4,b.length]),b]); };
  const encSeq = (t,c) => { const b=Buffer.isBuffer(c)?c:Buffer.concat(c); return Buffer.concat([Buffer.from([t,b.length]),b]); };
  const rid=encInt(Math.floor(Math.random()*65535));
  const e0=Buffer.from([2,1,0]), e1=Buffer.from([2,1,0]);
  const vb=encSeq(0x30,[encOID(oid),Buffer.from([5,0])]);
  const pdu=encSeq(0xa0,[rid,e0,e1,encSeq(0x30,[vb])]);
  return encSeq(0x30,[Buffer.from([2,1,0]),encStr(comm),pdu]);
}

function parseResp(buf) {
  let i=0;
  const rLen=()=>{const l=buf[i++];if(l<128)return l;const nb=l&127;let r=0;for(let j=0;j<nb;j++)r=(r<<8)|buf[i++];return r;};
  const find=(end)=>{while(i<end){const t=buf[i++],l=rLen(),s=i;if(t===0x30||t===0xa2||t===0xa0){const v=find(i+l);if(v!==null)return v;}else if(t===4){return buf.slice(i,i+l).toString('utf8').replace(/\0/g,'').trim();}else if(t===2){let v=buf[i]&128?-1:0;for(let j=0;j<l;j++)v=(v<<8)|buf[i+j];return v;}else if(t===0x43||t===0x41){let v=0;for(let j=0;j<l;j++)v=v*256+buf[i+j];return v;}i=s+l;}return null;};
  try{return find(buf.length);}catch{return null;}
}

function snmpGet(ip, oid) {
  return new Promise(r => {
    const pdu=buildPDU(oid,'public'), sock=dgram.createSocket('udp4');
    let done=false;
    const t=setTimeout(()=>{if(!done){done=true;try{sock.close();}catch{}r(null);}},SNMP_TO);
    sock.on('message',m=>{if(!done){done=true;clearTimeout(t);try{sock.close();}catch{}r(parseResp(m));}});
    sock.on('error',()=>{if(!done){done=true;clearTimeout(t);r(null);}});
    sock.send(pdu,161,ip,e=>{if(e&&!done){done=true;clearTimeout(t);try{sock.close();}catch{}r(null);}});
  });
}

const fab  = d => { const u=(d||'').toUpperCase(); if(u.includes('HP')||u.includes('HEWLETT'))return'HP'; if(u.includes('KYOCERA'))return'KYOCERA'; if(u.includes('RICOH'))return'RICOH'; if(u.includes('XEROX'))return'XEROX'; if(u.includes('CANON'))return'CANON'; if(u.includes('KONICA')||u.includes('MINOLTA'))return'MINOLTA'; if(u.includes('BROTHER'))return'BROTHER'; if(u.includes('EPSON'))return'EPSON'; return'OUTRO'; };
const pct  = (n,m) => n===null||m===null||m<=0 ? null : n<0 ? 0 : Math.round(n/m*100);
const stTxt = v => ({1:'other',2:'unknown',3:'idle',4:'printing',5:'warmup'}[v]||'unknown');

async function coletarImp(ip) {
  const desc=await snmpGet(ip,OID.descricao);
  if(!desc)return null;
  const[nr,ser,pt,ppb,pc,tn1,tm1,tn2,tm2,tn3,tm3,tn4,tm4,dn,dm,sv,pap]=await Promise.all([
    snmpGet(ip,OID.nome_rede),snmpGet(ip,OID.serial),
    snmpGet(ip,OID.pag_total),snmpGet(ip,OID.pag_pb),snmpGet(ip,OID.pag_cor),
    snmpGet(ip,OID.tn1),snmpGet(ip,OID.tm1),snmpGet(ip,OID.tn2),snmpGet(ip,OID.tm2),
    snmpGet(ip,OID.tn3),snmpGet(ip,OID.tm3),snmpGet(ip,OID.tn4),snmpGet(ip,OID.tm4),
    snmpGet(ip,OID.drum_n),snmpGet(ip,OID.drum_m),snmpGet(ip,OID.status),snmpGet(ip,OID.papel),
  ]);
  const preto=pct(tn1,tm1),ciano=pct(tn2,tm2),magenta=pct(tn3,tm3),amarelo=pct(tn4,tm4),drum=pct(dn,dm);
  const erros=[];
  if(preto!==null&&preto<10)erros.push('toner-baixo');
  if(ciano!==null&&ciano<10)erros.push('ciano-baixo');
  if(magenta!==null&&magenta<10)erros.push('magenta-baixo');
  if(amarelo!==null&&amarelo<10)erros.push('amarelo-baixo');
  if(drum!==null&&drum<10)erros.push('drum-baixo');
  if(pap===0)erros.push('sem-papel');
  return { ip, descricao:desc, nome_rede:nr||'', fabricante:fab(desc), serial:ser||'',
    status:stTxt(sv), online:true, paginas_total:pt||0, paginas_pb:ppb||0, paginas_color:pc||0,
    toner:{preto,ciano,magenta,amarelo}, drum_pct:drum, papel_nivel:pap, erros };
}

async function varrer() {
  const subs=descobrirSubnets();
  const ips=subs.flatMap(b=>{const r=[];for(let i=1;i<=254;i++)r.push(b+'.'+i);return r;});
  console.log('🔍 Varrendo '+ips.length+' IPs em '+subs.length+' subnet(s)...');
  const LOTE=30, imps=[];
  for(let i=0;i<ips.length;i+=LOTE){
    const res=await Promise.all(ips.slice(i,i+LOTE).map(coletarImp));
    res.forEach(r=>{if(r){imps.push(r);console.log('  ✅ '+r.ip+' — '+r.fabricante+' '+r.descricao.slice(0,40));}});
    await new Promise(r=>setTimeout(r,100));
  }
  console.log('📋 '+imps.length+' impressora(s) encontrada(s).');
  return imps;
}

function enviar(imps) {
  return new Promise((res,rej)=>{
    const body=JSON.stringify({clientKey:CLIENT_KEY,hostname:os.hostname(),platform:os.platform()+' '+os.release(),agente_ver:'2.1.0',timestamp:new Date().toISOString(),impressoras:imps});
    const u=new URL(SERVER_URL+'/api/monitor/telemetria');
    const req=https.request({hostname:u.hostname,port:443,path:u.pathname,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d));}catch{res({ok:false});}});});
    req.on('error',rej); req.write(body); req.end();
  });
}

async function registrar() {
  return new Promise(res=>{
    const body=JSON.stringify({clientKey:CLIENT_KEY,hostname:os.hostname(),agente_ver:'2.1.0'});
    const u=new URL(SERVER_URL+'/api/monitor/registrar-agente');
    const req=https.request({hostname:u.hostname,port:443,path:u.pathname,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d));}catch{res({});}}); });
    req.on('error',()=>res({})); req.write(body); req.end();
  });
}

async function ciclo() {
  console.log('\n['+new Date().toLocaleString('pt-BR')+'] — Iniciando coleta...');
  try {
    const imps=await varrer();
    const r=await enviar(imps);
    console.log('📤 Enviado: '+(r.recebido??imps.length)+' impressora(s)');
  } catch(e) { console.error('❌ Erro:', e.message); }
  console.log('⏱ Próxima coleta em '+(CFG.intervalMin||15)+' min.');
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('🖨  Orion Agente v2.1.0');
  console.log('   Servidor : ' + SERVER_URL);
  console.log('   Cliente  : ' + (CFG.clientNome || '—'));
  console.log('   Intervalo: ' + (CFG.intervalMin || 15) + ' min');
  console.log('   Subnet   : ' + (SUBNET_FIXO || 'Auto RFC 1918'));
  const reg=await registrar();
  if(reg.ok) console.log('✅ Registrado: ' + reg.clientNome);
  await ciclo();
  setInterval(ciclo, INTERVAL);
})();
