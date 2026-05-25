const express = require('express');
const multer  = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');
const MongoStore = require('connect-mongo');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
// ── Cloudinary ──
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'diz3fpmrk',
  api_key:     process.env.CLOUDINARY_API_KEY    || '198226588682375',
  api_secret:  process.env.CLOUDINARY_API_SECRET || 'ttSsE-FuwvE8yYx7itvKwG8VsS0',
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://clairton_db_user:Ita722018@cluster0.uy61dew.mongodb.net/?appName=Cluster0';
const MASTER_HASH = bcrypt.hashSync('churrasquinho@26', 10);

let db;
async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db('orion_at');
  console.log('MongoDB conectado!');
  // Seed admin
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  await db.collection('users').updateOne(
    { login: 'admin' },
    { $set: { login:'admin', nome:'Administrador', senha_hash: bcrypt.hashSync(adminPass,10), role:'admin', ativo:1 } },
    { upsert: true }
  );
  // OS counter
  await db.collection('counter').updateOne({ _id:'os' }, { $setOnInsert:{ valor:0 } }, { upsert:true });
}

// CORS para permitir cookies
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json({ limit:'50mb' }));
app.use(express.urlencoded({ extended:true }));
app.set('trust proxy', 1);
app.use(session({
  secret: process.env.SESSION_SECRET||'orion2026',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI, dbName:'orion_at', collectionName:'sessions', ttl: 24*60*60 }),
  cookie: { maxAge: 24*60*60*1000, secure: false, sameSite: 'lax' }
}));
app.use(express.static(path.join(__dirname,'public')));

const uid = () => new ObjectId().toString();
const now = () => new Date().toISOString();
const col = (name) => db.collection(name);

function requireAuth(req,res,next){ if(req.session.user)return next(); res.status(401).json({error:'Não autenticado'}); }
function requireAdmin(req,res,next){ if(req.session.user&&(req.session.user.role==='admin'||req.session.user.isMaster))return next(); res.status(403).json({error:'Acesso negado'}); }


// PERFIS DE ACESSO
const PERFIS = {
  admin:          { label:'Administrador', modulos:['dashboard','os','lab','historico','estoque','supr-cli','clientes','tecnicos','usuarios','logistica'] },
  tecnico:        { label:'Técnico',       modulos:['dashboard','os','lab','historico','estoque','supr-cli','clientes'] },
  logistica:      { label:'Logística',     modulos:['dashboard','logistica','clientes'] },
  rh:             { label:'RH',            modulos:['dashboard','tecnicos','usuarios'] },
  financeiro:     { label:'Financeiro',    modulos:['dashboard','os','historico','logistica'] },
  comercial:      { label:'Comercial',     modulos:['dashboard','os','historico','clientes'] },
  administrativo: { label:'Administrativo',modulos:['dashboard','os','lab','historico','estoque','supr-cli','clientes','logistica'] },
};
app.get('/api/perfis', requireAuth, (req,res) => {
  res.json(Object.entries(PERFIS).map(([k,v])=>({value:k, label:v.label, modulos:v.modulos})));
});

// AUTH
app.post('/api/login', async (req,res) => {
  try {
    const {login,senha} = req.body;
    if (login==='master' && bcrypt.compareSync(senha||'', MASTER_HASH)) {
      req.session.user = {id:'master',login:'master',nome:'Master Admin',role:'admin',perfil:'admin',isMaster:true};
      return res.json({ok:true,user:req.session.user});
    }
    if (login==='admin') {
      const adminPass = process.env.ADMIN_PASSWORD||'admin123';
      if (senha===adminPass) {
        req.session.user = {id:'admin',login:'admin',nome:'Administrador',role:'admin',perfil:'admin'};
        return res.json({ok:true,user:req.session.user});
      }
      return res.status(401).json({error:'Usuário ou senha incorretos'});
    }
    const user = await col('users').findOne({login, ativo:1});
    if (!user||!bcrypt.compareSync(senha||'',user.senha_hash)) return res.status(401).json({error:'Usuário ou senha incorretos'});
    await col('users').updateOne({_id:user._id},{$set:{ultimo_acesso:now()}});
    req.session.user = {id:user._id.toString(),login:user.login,nome:user.nome,role:user.role,perfil:user.perfil||user.role};
    res.json({ok:true,user:req.session.user});
  } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/logout',(req,res)=>{req.session.destroy();res.json({ok:true});});
app.get('/api/me',(req,res)=>{ if(!req.session.user)return res.status(401).json({error:'Não autenticado'}); res.json(req.session.user); });

// USERS
app.get('/api/users', requireAuth, requireAdmin, async (req,res) => {
  const u = await col('users').find().toArray();
  // Nunca expõe usuários coringas (dev/master) nem hash de senha
  res.json(u
    .filter(x=>x.login!=='dev'&&x.login!=='master')
    .map(x=>({id:x._id.toString(),login:x.login,nome:x.nome,role:x.role,perfil:x.perfil||x.role,ativo:x.ativo,email:x.email||'',wpp:x.wpp||'',ultimo_acesso:x.ultimo_acesso||''})));
});
app.post('/api/users', requireAuth, requireAdmin, async (req,res) => {
  try {
    const b=req.body;
    if(!b.nome||!b.login||!b.senha) return res.status(400).json({error:'Campos obrigatórios'});
    if(await col('users').findOne({login:b.login})) return res.status(400).json({error:'Login já existe'});
    await col('users').insertOne({
      login:b.login,nome:b.nome,senha_hash:bcrypt.hashSync(b.senha,10),
      role:b.role||'tecnico',perfil:b.perfil||b.role||'tecnico',
      ativo:b.ativo??1,email:b.email||'',wpp:b.wpp||'',created_at:now()
    });
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.put('/api/users/:id', requireAuth, async (req,res) => {
  // Permite que o próprio usuário atualize senha_temp (recovery), admin atualiza tudo
  try {
    const b=req.body;
    const upd={};
    if(b.nome!==undefined) upd.nome=b.nome;
    if(b.login!==undefined) upd.login=b.login;
    if(b.role!==undefined) upd.role=b.role;
    if(b.perfil!==undefined) upd.perfil=b.perfil;
    if(b.ativo!==undefined) upd.ativo=b.ativo;
    if(b.email!==undefined) upd.email=b.email;
    if(b.wpp!==undefined) upd.wpp=b.wpp;
    if(b.senha) upd.senha_hash=bcrypt.hashSync(b.senha,10);
    if(b.senha_temp) upd.senha_hash=bcrypt.hashSync(b.senha_temp,10); // recovery
    await col('users').updateOne({_id:new ObjectId(req.params.id)},{$set:upd});
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/users/:id', requireAuth, requireAdmin, async (req,res) => {
  try {
    await col('users').deleteOne({_id:new ObjectId(req.params.id)});
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});

// TECNICOS
app.get('/api/tecnicos', requireAuth, async (req,res) => { const d=await col('tecnicos').find().sort({nome:1}).toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });
app.post('/api/tecnicos', requireAuth, async (req,res) => {
  try {
    const b=req.body;
    await col('tecnicos').insertOne({
      nome:b.nome,tel:b.tel||'',email:b.email||'',cpf:b.cpf||'',admissao:b.admissao||'',
      nivel:b.nivel||'Téc. Júnior',funcao:b.funcao||'Técnico de Campo',
      status:b.status||'Ativo',salario:+(b.salario||0),
      end:b.end||'',cidade:b.cidade||'',cep:b.cep||'',estado:b.estado||'',bairro:b.bairro||'',
      obs:b.obs||'',foto:b.foto||'',created_at:now()
    });
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.put('/api/tecnicos/:id', requireAuth, async (req,res) => {
  try {
    const b=req.body;
    await col('tecnicos').updateOne({_id:new ObjectId(req.params.id)},{$set:{
      nome:b.nome,tel:b.tel||'',email:b.email||'',cpf:b.cpf||'',admissao:b.admissao||'',
      nivel:b.nivel||'Téc. Júnior',funcao:b.funcao||'Técnico de Campo',
      status:b.status||'Ativo',salario:+(b.salario||0),
      end:b.end||'',cidade:b.cidade||'',cep:b.cep||'',estado:b.estado||'',bairro:b.bairro||'',
      obs:b.obs||'',foto:b.foto||''
    }});
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/tecnicos/:id', requireAuth, async (req,res) => { try{await col('tecnicos').deleteOne({_id:new ObjectId(req.params.id)}); res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });

// CLIENTES
app.get('/api/clientes', requireAuth, async (req,res) => { const d=await col('clientes').find().toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });
app.post('/api/clientes', requireAuth, async (req,res) => { const b=req.body; const monitor_key = crypto.randomBytes(24).toString('hex'); await col('clientes').insertOne({nome:b.nome,end_logradouro:b.end||'',cidade:b.cidade||'',cep:b.cep||'',contato:b.contato||'',tel:b.tel||'',email:b.email||'',obs:b.obs||'',monitor_key,monitor_ativo:true,monitor_key_criada:now(),created_at:now()}); res.json({ok:true}); });
app.put('/api/clientes/:id', requireAuth, async (req,res) => { try{const b=req.body; await col('clientes').updateOne({_id:new ObjectId(req.params.id)},{$set:{nome:b.nome,end_logradouro:b.end||'',cidade:b.cidade||'',cep:b.cep||'',contato:b.contato||'',tel:b.tel||'',email:b.email||'',obs:b.obs||''}}); res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });
app.delete('/api/clientes/:id', requireAuth, async (req,res) => { try{await col('clientes').deleteOne({_id:new ObjectId(req.params.id)}); await col('equipamentos').deleteMany({cliente_id:req.params.id}); res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });

// EQUIPAMENTOS
app.get('/api/equipamentos', requireAuth, async (req,res) => { const d=await col('equipamentos').find().toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });
app.get('/api/equipamentos/cliente/:cid', requireAuth, async (req,res) => { const d=await col('equipamentos').find({cliente_id:req.params.cid}).toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });
app.post('/api/equipamentos', requireAuth, async (req,res) => { const b=req.body; await col('equipamentos').insertOne({cliente_id:b.clienteId,nome:b.nome,marca:b.marca||'',modelo:b.modelo||'',nserie:b.nserie||'',contador:b.contador||0,data_inst:b.dataInst||'',contrato_ate:b.contrato||'',localizacao:b.local||'',status:b.status||'Ativo',obs:b.obs||'',created_at:now()}); res.json({ok:true}); });
app.put('/api/equipamentos/:id', requireAuth, async (req,res) => { try{const b=req.body; await col('equipamentos').updateOne({_id:new ObjectId(req.params.id)},{$set:{cliente_id:b.clienteId,nome:b.nome,marca:b.marca||'',modelo:b.modelo||'',nserie:b.nserie||'',contador:b.contador||0,data_inst:b.dataInst||'',contrato_ate:b.contrato||'',localizacao:b.local||'',status:b.status||'Ativo',obs:b.obs||''}}); res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });
app.delete('/api/equipamentos/:id', requireAuth, async (req,res) => { try{await col('equipamentos').deleteOne({_id:new ObjectId(req.params.id)}); res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });

// ORDENS DE SERVICO (unifica atendimento)
app.get('/api/ordens', requireAuth, async (req,res) => { const d=await col('ordens').find().sort({data_ab:-1}).toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });
app.post('/api/ordens', requireAuth, async (req,res) => {
  try {
    const b=req.body;
    const ctr=await col('counter').findOneAndUpdate({_id:'os'},{$inc:{valor:1}},{returnDocument:'after',upsert:true});
    const num=`OS-${new Date().getFullYear()}-${String(ctr.valor).padStart(4,'0')}`;
    const total=(b.viag||0)+(b.alim||0)+(b.hosp||0)+(b.comb||0)+(b.ped||0)+(b.outros||0);
    const result=await col('ordens').insertOne({num,data_ab:b.dataAb,tecnico_id:b.tecnicoId||'',cliente_id:b.clienteId,contato:b.contato||'',tel:b.tel||'',end_logradouro:b.end||'',equip_id:b.equipId||'',modelo:b.modelo||'',nserie:b.nserie||'',contador:b.contador||'',defeito:b.defeito||'',procedimento:b.procedimento||'',pecas:b.pecas||'',obs:b.obs||'',data_chamado:b.dataChamado||'',data_atend:b.dataAtend||'',hora_chegada:b.horaChegada||'',hora_saida:b.horaSaida||'',viag:b.viag||0,alim:b.alim||0,hosp:b.hosp||0,comb:b.comb||0,ped:b.ped||0,outros:b.outros||0,total_os:total,status:'Aberta',tipo:b.tipo||'',sla_prazo:b.sla_prazo||'',sla_deadline:b.sla_deadline||null,origem:b.origem||'sistema',created_at:now()});
    const id=result.insertedId.toString();
    const cli=await col('clientes').findOne({_id:new ObjectId(b.clienteId)});
    const tec=b.tecnicoId?await col('tecnicos').findOne({_id:new ObjectId(b.tecnicoId)}):null;
    await col('historico').insertOne({tipo:'chamado',os_id:id,os_num:num,data:b.dataAb,cliente:cli?.nome||'',tecnico:tec?.nome||'',modelo:b.modelo||'',nserie:b.nserie||'',contador:b.contador||'',defeito:b.defeito||'',procedimento:'',pecas:'',status:'Aberta',created_at:now()});
    res.json({ok:true,num,id});
  }catch(e){res.status(500).json({error:e.message});}
});
app.put('/api/ordens/:id', requireAuth, async (req,res) => {
  try {
    const b=req.body;
    const old=await col('ordens').findOne({_id:new ObjectId(req.params.id)});
    const total=(b.viag||0)+(b.alim||0)+(b.hosp||0)+(b.comb||0)+(b.ped||0)+(b.outros||0);
    await col('ordens').updateOne({_id:new ObjectId(req.params.id)},{$set:{data_ab:b.dataAb,tecnico_id:b.tecnicoId||'',cliente_id:b.clienteId,contato:b.contato||'',tel:b.tel||'',end_logradouro:b.end||'',equip_id:b.equipId||'',modelo:b.modelo||'',nserie:b.nserie||'',contador:b.contador||'',defeito:b.defeito||'',procedimento:b.procedimento||'',pecas:b.pecas||'',obs:b.obs||'',data_chamado:b.dataChamado||'',data_atend:b.dataAtend||'',hora_chegada:b.horaChegada||'',hora_saida:b.horaSaida||'',viag:b.viag||0,alim:b.alim||0,hosp:b.hosp||0,comb:b.comb||0,ped:b.ped||0,outros:b.outros||0,total_os:total,status:b.status||'Aberta',checklist:Array.isArray(b.checklist)?b.checklist:[],sig_tec:b.sig_tec||'',sig_cli:b.sig_cli||'',tipo:b.tipo||'',sla_prazo:b.sla_prazo||'',sla_deadline:b.sla_deadline||null,origem:b.origem||'sistema'}});
    if(old&&old.status!=='Concluída'&&b.status==='Concluída'){
      const os=await col('ordens').findOne({_id:new ObjectId(req.params.id)});
      const cli=await col('clientes').findOne({_id:new ObjectId(os.cliente_id)});
      const tec=os.tecnico_id?await col('tecnicos').findOne({_id:new ObjectId(os.tecnico_id)}):null;
      await col('historico').insertOne({tipo:'atendimento',os_id:os._id.toString(),os_num:os.num,data:b.dataAtend||b.dataAb,cliente:cli?.nome||'',tecnico:tec?.nome||'',modelo:os.modelo||'',nserie:os.nserie||'',contador:os.contador||'',defeito:os.defeito||'',procedimento:b.procedimento||'',pecas:b.pecas||'',status:'Concluída',created_at:now()});
    }
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/ordens/:id', requireAuth, async (req,res) => { try{await col('ordens').deleteOne({_id:new ObjectId(req.params.id)}); res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });

// Histórico técnico de um equipamento (por nserie ou equip_id)
app.get('/api/historico-tecnico', requireAuth, async (req,res) => {
  try {
    const { nserie, equip_id, cliente_id } = req.query;
    let filter = {};
    if (nserie) filter.nserie = { $regex: nserie, $options: 'i' };
    else if (equip_id) filter.equip_id = equip_id;
    else if (cliente_id) filter.cliente_id = cliente_id;
    else return res.json([]);
    const ordens = await col('ordens').find(filter).sort({ data_ab: -1 }).toArray();
    const tecnicos = await col('tecnicos').find().toArray();
    res.json(ordens.map(o => ({
      id: o._id.toString(), num: o.num,
      data_ab: o.data_ab, data_atend: o.data_atend||'',
      status: o.status, tipo: o.tipo||'',
      defeito: o.defeito||'', procedimento: o.procedimento||'',
      pecas: o.pecas||'', obs: o.obs||'',
      tecnico_nome: tecnicos.find(t=>t._id.toString()===o.tecnico_id)?.nome||'—',
      contador: o.contador||'', total_os: o.total_os||0,
      sla_prazo: o.sla_prazo||'', sla_deadline: o.sla_deadline||null,
    })));
  } catch(e) { res.status(500).json({error:e.message}); }
});


// LABORATÓRIO — BANCADA
app.get('/api/laboratorio', requireAuth, async (req,res) => { const d=await col('laboratorio').find().sort({data_entrada:-1}).toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });
app.post('/api/laboratorio', requireAuth, async (req,res) => {
  try {
    const b=req.body; const total=(b.gPecas||0)+(b.gSupr||0)+(b.gOutros||0);
    const r=await col('laboratorio').insertOne({data_entrada:b.dataEntrada,data_saida:b.dataSaida||'',tecnico_id:b.tecnicoId||'',os_id:b.osId||'',origem:b.origem||'campo',nome:b.nome,marca:b.marca||'',modelo:b.modelo||'',nserie:b.nserie||'',contador_entrada:b.contadorEntrada||'',contador_saida:b.contadorSaida||'',tipo_manutencao:b.tipoManutencao||'Corretiva',tempo_horas:b.tempoHoras||0,problemas:b.problemas||'',procedimento:b.procedimento||'',pecas_retiradas:b.pecasRetiradas||'',obs_retiradas:b.obsRetiradas||'',escopo:b.escopo||[],g_pecas:b.gPecas||0,g_supr:b.gSupr||0,g_outros:b.gOutros||0,total,checklist:b.checklist||[],status:b.status||'Em análise',status_final:b.statusFinal||'',obs:b.obs||'',created_at:now()});
    res.json({ok:true,id:r.insertedId.toString()});
  }catch(e){res.status(500).json({error:e.message});}
});
app.put('/api/laboratorio/:id', requireAuth, async (req,res) => {
  try {
    const b=req.body; const total=(b.gPecas||0)+(b.gSupr||0)+(b.gOutros||0);
    await col('laboratorio').updateOne({_id:new ObjectId(req.params.id)},{$set:{data_entrada:b.dataEntrada,data_saida:b.dataSaida||'',tecnico_id:b.tecnicoId||'',os_id:b.osId||'',origem:b.origem||'campo',nome:b.nome,marca:b.marca||'',modelo:b.modelo||'',nserie:b.nserie||'',contador_entrada:b.contadorEntrada||'',contador_saida:b.contadorSaida||'',tipo_manutencao:b.tipoManutencao||'Corretiva',tempo_horas:b.tempoHoras||0,problemas:b.problemas||'',procedimento:b.procedimento||'',pecas_retiradas:b.pecasRetiradas||'',obs_retiradas:b.obsRetiradas||'',escopo:b.escopo||[],g_pecas:b.gPecas||0,g_supr:b.gSupr||0,g_outros:b.gOutros||0,total,checklist:b.checklist||[],status:b.status||'Em análise',status_final:b.statusFinal||'',obs:b.obs||''}});
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/laboratorio/:id', requireAuth, async (req,res) => { try{await col('laboratorio').deleteOne({_id:new ObjectId(req.params.id)}); res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });

// LABORATÓRIO — PEDIDOS DE PEÇAS
app.get('/api/pedidos-pecas', requireAuth, async (req,res) => { const d=await col('pedidos_pecas').find().sort({created_at:-1}).toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });
app.post('/api/pedidos-pecas', requireAuth, async (req,res) => {
  try {
    const b=req.body;
    const r=await col('pedidos_pecas').insertOne({lab_id:b.labId||'',os_id:b.osId||'',tecnico_id:b.tecnicoId||'',estoque_id:b.estoqueId||'',nome_peca:b.nomePeca||'',quantidade:+(b.quantidade||1),status:'Solicitado',obs:b.obs||'',created_at:now()});
    res.json({ok:true,id:r.insertedId.toString()});
  }catch(e){res.status(500).json({error:e.message});}
});
app.put('/api/pedidos-pecas/:id', requireAuth, async (req,res) => {
  try {
    const b=req.body; const pid=req.params.id;
    // Se confirmando uso → dar baixa no estoque
    if(b.status==='Utilizado' && b.estoqueId) {
      const item=await col('estoque').findOne({_id:new ObjectId(b.estoqueId)});
      if(item) {
        const novaQtd=Math.max(0,(item.quantidade||0)-(b.quantidade||1));
        await col('estoque').updateOne({_id:new ObjectId(b.estoqueId)},{$set:{quantidade:novaQtd}});
        await col('estoque_movs').insertOne({estoque_id:b.estoqueId,tipo:'saida',quantidade:b.quantidade||1,motivo:`Pedido #${pid} — ${b.osId?'OS':'Lab'}`,data:now(),created_at:now()});
      }
    }
    await col('pedidos_pecas').updateOne({_id:new ObjectId(pid)},{$set:{status:b.status||'Solicitado',obs:b.obs||'',data_uso:b.status==='Utilizado'?now():''}});
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/pedidos-pecas/:id', requireAuth, async (req,res) => { try{await col('pedidos_pecas').deleteOne({_id:new ObjectId(req.params.id)});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });

// LABORATÓRIO — EQUIPAMENTOS BAIXADOS
app.get('/api/eq-baixados', requireAuth, async (req,res) => { const d=await col('eq_baixados').find().sort({data:-1}).toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });
app.post('/api/eq-baixados', requireAuth, async (req,res) => {
  try {
    const b=req.body;
    const r=await col('eq_baixados').insertOne({data:b.data||'',nome:b.nome||'',marca:b.marca||'',modelo:b.modelo||'',nserie:b.nserie||'',contador_final:b.contadorFinal||'',motivo:b.motivo||'',destino:b.destino||'Descarte',os_id:b.osId||'',lab_id:b.labId||'',pecas_aproveitadas:b.pecasAproveitadas||'',obs:b.obs||'',created_at:now()});
    res.json({ok:true,id:r.insertedId.toString()});
  }catch(e){res.status(500).json({error:e.message});}
});
app.put('/api/eq-baixados/:id', requireAuth, async (req,res) => {
  try {
    const b=req.body;
    await col('eq_baixados').updateOne({_id:new ObjectId(req.params.id)},{$set:{data:b.data||'',nome:b.nome||'',marca:b.marca||'',modelo:b.modelo||'',nserie:b.nserie||'',contador_final:b.contadorFinal||'',motivo:b.motivo||'',destino:b.destino||'Descarte',os_id:b.osId||'',lab_id:b.labId||'',pecas_aproveitadas:b.pecasAproveitadas||'',obs:b.obs||''}});
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/eq-baixados/:id', requireAuth, async (req,res) => { try{await col('eq_baixados').deleteOne({_id:new ObjectId(req.params.id)});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });

// HISTORICO
app.get('/api/historico', requireAuth, async (req,res) => { const d=await col('historico').find().sort({created_at:-1}).toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });

// ESTOQUE
app.get('/api/estoque', requireAuth, async (req,res) => { const d=await col('estoque').find().sort({categoria:1,nome:1}).toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });
app.post('/api/estoque', requireAuth, async (req,res) => {
  try {
    const b=req.body;
    const r=await col('estoque').insertOne({nome:b.nome,categoria:b.categoria||'Peça',marca:b.marca||'',modelo_compat:b.modeloCompat||'',condicao:b.condicao||'Nova',testada:b.testada?1:0,quantidade:+(b.quantidade||0),quantidade_min:+(b.quantidadeMin||1),custo:+(b.custo||0),localizacao:b.localizacao||'',obs:b.obs||'',created_at:now()});
    const eid=r.insertedId.toString();
    if(+(b.quantidade||0)>0){
      await col('estoque_movs').insertOne({estoque_id:eid,nome_item:b.nome,tipo:'entrada',quantidade:+(b.quantidade||0),motivo:'Cadastro inicial',usuario:req.session.user?.nome||'',data:now().slice(0,10),obs:b.obs||'',created_at:now()});
    }
    res.json({ok:true,id:eid});
  }catch(e){res.status(500).json({error:e.message});}
});
app.put('/api/estoque/:id', requireAuth, async (req,res) => {
  try {
    const b=req.body;
    const old=await col('estoque').findOne({_id:new ObjectId(req.params.id)});
    await col('estoque').updateOne({_id:new ObjectId(req.params.id)},{$set:{nome:b.nome,categoria:b.categoria||'Peça',marca:b.marca||'',modelo_compat:b.modeloCompat||'',condicao:b.condicao||'Nova',testada:b.testada?1:0,quantidade:+(b.quantidade||0),quantidade_min:+(b.quantidadeMin||1),custo:+(b.custo||0),localizacao:b.localizacao||'',obs:b.obs||''}});
    // Registrar movimentação se quantidade mudou
    if(old && +(b.quantidade||0) !== +(old.quantidade||0)) {
      const diff = +(b.quantidade||0) - +(old.quantidade||0);
      await col('estoque_movs').insertOne({estoque_id:req.params.id,nome_item:b.nome,tipo:diff>0?'entrada':'saida',quantidade:Math.abs(diff),motivo:b.motivo_mov||'Ajuste manual',usuario:req.session.user?.nome||'',data:now().slice(0,10),obs:b.obs_mov||'',created_at:now()});
    }
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/estoque/:id', requireAuth, async (req,res) => { try{await col('estoque').deleteOne({_id:new ObjectId(req.params.id)}); res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });

// ESTOQUE — MOVIMENTAÇÕES
app.get('/api/estoque-movs', requireAuth, async (req,res) => {
  try {
    const {estoque_id, limit=200} = req.query;
    const filter = estoque_id ? {estoque_id} : {};
    const d=await col('estoque_movs').find(filter).sort({created_at:-1}).limit(+limit).toArray();
    res.json(d.map(x=>({...x,id:x._id.toString()})));
  }catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/estoque-movs', requireAuth, async (req,res) => {
  try {
    const b=req.body;
    const item=await col('estoque').findOne({_id:new ObjectId(b.estoqueId)});
    if(!item) return res.status(404).json({error:'Item não encontrado'});
    const qtd=+(b.quantidade||1);
    const tipo=b.tipo||'entrada';
    const delta = tipo==='entrada' ? qtd : -qtd;
    const novaQtd = Math.max(0, (item.quantidade||0)+delta);
    await col('estoque').updateOne({_id:new ObjectId(b.estoqueId)},{$set:{quantidade:novaQtd}});
    const r=await col('estoque_movs').insertOne({estoque_id:b.estoqueId,nome_item:item.nome,tipo,quantidade:qtd,motivo:b.motivo||'',usuario:req.session.user?.nome||'',data:b.data||now().slice(0,10),obs:b.obs||'',created_at:now()});
    res.json({ok:true,id:r.insertedId.toString(),nova_quantidade:novaQtd});
  }catch(e){res.status(500).json({error:e.message});}
});

// SUPRIMENTOS CLIENTE
app.get('/api/estoque-supr', requireAuth, async (req,res) => {
  const all=await col('supr_cli').find().toArray();
  const clientes=await col('clientes').find().toArray();
  res.json(all.map(s=>({...s,id:s._id.toString(),cliente_nome:clientes.find(c=>c._id.toString()===s.cliente_id)?.nome||''})));
});
app.get('/api/estoque-supr/:clienteId', requireAuth, async (req,res) => {
  let row=await col('supr_cli').findOne({cliente_id:req.params.clienteId});
  if(!row){await col('supr_cli').insertOne({cliente_id:req.params.clienteId,toner_preto:0,toner_magenta:0,toner_ciano:0,toner_amarelo:0,grampos:0}); row=await col('supr_cli').findOne({cliente_id:req.params.clienteId});}
  const mov=await col('supr_movs').find({cliente_id:req.params.clienteId}).sort({created_at:-1}).limit(50).toArray();
  res.json({estoque:{...row,id:row._id.toString()},movimentos:mov.map(x=>({...x,id:x._id.toString()}))});
});
app.post('/api/estoque-supr/:clienteId/movimento', requireAuth, async (req,res) => {
  try {
    const {tipo,item,quantidade,data,tecnicoId,obs}=req.body;
    const cid=req.params.clienteId;
    const valid=['toner_preto','toner_magenta','toner_ciano','toner_amarelo','grampos'];
    if(!valid.includes(item))return res.status(400).json({error:'Item inválido'});
    let row=await col('supr_cli').findOne({cliente_id:cid});
    if(!row){await col('supr_cli').insertOne({cliente_id:cid,toner_preto:0,toner_magenta:0,toner_ciano:0,toner_amarelo:0,grampos:0}); row=await col('supr_cli').findOne({cliente_id:cid});}
    const delta=tipo==='entrada'?+(quantidade||1):-(quantidade||1);
    const upd={};upd[item]=Math.max(0,(row[item]||0)+delta);
    await col('supr_cli').updateOne({cliente_id:cid},{$set:upd});
    const tec=tecnicoId?await col('tecnicos').findOne({_id:new ObjectId(tecnicoId)}):null;
    await col('supr_movs').insertOne({cliente_id:cid,tipo,item,quantidade:quantidade||1,data:data||new Date().toISOString().slice(0,10),tecnico_id:tecnicoId||'',tecnico_nome:tec?.nome||'',obs:obs||'',created_at:now()});
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});

// DASHBOARD
app.get('/api/dashboard', requireAuth, async (req,res) => {
  try {
    const [atends,ordens,labs,tecnicos,clientes,suprCli,suprMovs]=await Promise.all([
      col('ordens').find().toArray(),
      col('ordens').find().toArray(),
      col('laboratorio').find().toArray(),
      col('tecnicos').find().toArray(),
      col('clientes').find().toArray(),
      col('supr_cli').find().toArray(),
      col('supr_movs').find().sort({created_at:-1}).toArray()
    ]);
    const total_os=ordens.length;
    const os_abertas=ordens.filter(o=>o.status==='Aberta'||o.status==='Em andamento').length;
    const os_concluidas=ordens.filter(o=>o.status==='Concluída').length;
    const total_lab=labs.length;
    // Por tecnico
    const tmap={};
    ordens.forEach(o=>{const t=tecnicos.find(x=>x._id.toString()===o.tecnico_id);const n=t?.nome||'Sem técnico';tmap[n]=(tmap[n]||0)+1;});
    const por_tecnico=Object.entries(tmap).map(([nome,qtd])=>({nome,qtd})).sort((a,b)=>b.qtd-a.qtd);
    // Gastos por tecnico
    const gmap={};
    ordens.forEach(o=>{const t=tecnicos.find(x=>x._id.toString()===o.tecnico_id);const n=t?.nome||'Sem técnico';if(!gmap[n])gmap[n]=0;gmap[n]+=(o.viag||0)+(o.alim||0)+(o.hosp||0)+(o.comb||0)+(o.ped||0)+(o.outros||0);});
    const gastos_tecnico=Object.entries(gmap).map(([nome,total])=>({nome,total})).sort((a,b)=>b.total-a.total);
    // Gastos categorias
    const gastos={viag:0,alim:0,hosp:0,comb:0,ped:0,outros:0};
    ordens.forEach(o=>{gastos.viag+=o.viag||0;gastos.alim+=o.alim||0;gastos.hosp+=o.hosp||0;gastos.comb+=o.comb||0;gastos.ped+=o.ped||0;gastos.outros+=o.outros||0;});
    // Consumo toner por cliente
    const tonerMap={};
    suprMovs.filter(m=>m.tipo==='saida').forEach(m=>{
      const c=clientes.find(x=>x._id.toString()===m.cliente_id);
      const nome=c?.nome||'Desconhecido';
      if(!tonerMap[nome])tonerMap[nome]={preto:0,magenta:0,ciano:0,amarelo:0,grampos:0};
      if(m.item==='toner_preto')tonerMap[nome].preto+=m.quantidade||1;
      if(m.item==='toner_magenta')tonerMap[nome].magenta+=m.quantidade||1;
      if(m.item==='toner_ciano')tonerMap[nome].ciano+=m.quantidade||1;
      if(m.item==='toner_amarelo')tonerMap[nome].amarelo+=m.quantidade||1;
      if(m.item==='grampos')tonerMap[nome].grampos+=m.quantidade||1;
    });
    const consumo_toner=Object.entries(tonerMap).map(([cliente,v])=>({cliente,...v}));
    // Retrabalho
    const nsmap={};
    ordens.forEach(os=>{if(!os.nserie)return;if(!nsmap[os.nserie])nsmap[os.nserie]={nserie:os.nserie,modelo:os.modelo,qtd:0,ultimo:os.data_ab,cliente_id:os.cliente_id};nsmap[os.nserie].qtd++;if(os.data_ab>nsmap[os.nserie].ultimo)nsmap[os.nserie].ultimo=os.data_ab;});
    const retrabalho=Object.values(nsmap).filter(x=>x.qtd>1).sort((a,b)=>b.qtd-a.qtd).slice(0,10);
    // Gastos mensais (ultimos 6 meses)
    const meses={};
    ordens.forEach(o=>{
      if(!o.data_ab)return;
      const mes=o.data_ab.slice(0,7);
      if(!meses[mes])meses[mes]=0;
      meses[mes]+=(o.viag||0)+(o.alim||0)+(o.hosp||0)+(o.comb||0)+(o.ped||0)+(o.outros||0);
    });
    const gastos_mensais=Object.entries(meses).sort((a,b)=>a[0].localeCompare(b[0])).slice(-6).map(([mes,total])=>({mes,total}));
    res.json({total_os,total_atend:total_os,os_abertas,os_concluidas,total_lab,por_tecnico,gastos_tecnico,gastos,consumo_toner,retrabalho,gastos_mensais});
  }catch(e){res.status(500).json({error:e.message});}
});

// BACKUP
app.get('/api/backup', requireAuth, requireAdmin, async (req,res) => {
  try {
    const [users,tecnicos,clientes,equipamentos,ordens,laboratorio,historico,estoque,suprCli,suprMovs,estMovs,lancamentos,contratos,financeiro]=await Promise.all([
      col('users').find().toArray(),col('tecnicos').find().toArray(),col('clientes').find().toArray(),
      col('equipamentos').find().toArray(),col('ordens').find().toArray(),col('laboratorio').find().toArray(),col('logistica').find().toArray(),
      col('historico').find().toArray(),col('estoque').find().toArray(),col('supr_cli').find().toArray(),col('supr_movs').find().toArray(),
      col('estoque_movs').find().toArray(),col('lancamentos').find().toArray(),
      col('contratos').find().toArray(),col('financeiro').find().toArray()
    ]);
    const backup={version:'5.1',gerado_em:now(),usuarios:users.map(u=>({...u,senha_hash:undefined})),tecnicos,clientes,equipamentos,ordens,laboratorio,historico,estoque,estoque_movs:estMovs,estoque_supr:suprCli,estoque_movs_supr:suprMovs,lancamentos_manuais:lancamentos,contratos,financeiro};
    res.setHeader('Content-Disposition',`attachment; filename="orion_backup_${new Date().toISOString().slice(0,10)}.json"`);
    res.json(backup);
  }catch(e){res.status(500).json({error:e.message});}
});


// LOGISTICA — ROTAS
app.get('/api/logistica', requireAuth, async (req,res) => { const d=await col('logistica').find().sort({data_saida:-1}).toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });
app.post('/api/logistica', requireAuth, async (req,res) => { try{ const b=req.body; const r=await col('logistica').insertOne({data_saida:b.data_saida||'',hora_saida:b.hora_saida||'',data_retorno:b.data_retorno||'',hora_retorno:b.hora_retorno||'',motorista:b.motorista||'',veiculo:b.veiculo||'',placa:b.placa||'',km_inicial:+(b.km_inicial||0),km_final:+(b.km_final||0),rota:b.rota||'',os_ids:b.os_ids||[],pedagio:+(b.pedagio||0),combustivel:+(b.combustivel||0),alimentacao:+(b.alimentacao||0),hospedagem:+(b.hospedagem||0),outros:+(b.outros||0),valor_total:+(b.valor_total||0),litros:+(b.litros||0),tipo_combustivel:b.tipo_combustivel||'',obs:b.obs||'',assinatura:b.assinatura||'',created_at:now()}); res.json({ok:true,id:r.insertedId.toString()});}catch(e){res.status(500).json({error:e.message});} });
app.put('/api/logistica/:id', requireAuth, async (req,res) => { try{ const b=req.body; await col('logistica').updateOne({_id:new ObjectId(req.params.id)},{$set:{data_saida:b.data_saida||'',hora_saida:b.hora_saida||'',data_retorno:b.data_retorno||'',hora_retorno:b.hora_retorno||'',motorista:b.motorista||'',veiculo:b.veiculo||'',placa:b.placa||'',km_inicial:+(b.km_inicial||0),km_final:+(b.km_final||0),rota:b.rota||'',os_ids:b.os_ids||[],pedagio:+(b.pedagio||0),combustivel:+(b.combustivel||0),alimentacao:+(b.alimentacao||0),hospedagem:+(b.hospedagem||0),outros:+(b.outros||0),valor_total:+(b.valor_total||0),litros:+(b.litros||0),tipo_combustivel:b.tipo_combustivel||'',obs:b.obs||'',assinatura:b.assinatura||''}}); res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });
app.delete('/api/logistica/:id', requireAuth, async (req,res) => { try{await col('logistica').deleteOne({_id:new ObjectId(req.params.id)});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });

// LOGISTICA — ABASTECIMENTO
app.get('/api/abastecimento', requireAuth, async (req,res) => { const d=await col('abastecimento').find().sort({data:-1}).toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });
app.post('/api/abastecimento', requireAuth, async (req,res) => { try{ const b=req.body; const r=await col('abastecimento').insertOne({data:b.data||'',hora:b.hora||'',motorista:b.motorista||'',veiculo:b.veiculo||'',placa:b.placa||'',posto:b.posto||'',tipo:b.tipo||'Gasolina',litros:+(b.litros||0),valor_litro:+(b.valor_litro||0),valor_total:+(b.valor_total||0),odometro:+(b.odometro||0),obs:b.obs||'',created_at:now()}); res.json({ok:true,id:r.insertedId.toString()});}catch(e){res.status(500).json({error:e.message});} });
app.put('/api/abastecimento/:id', requireAuth, async (req,res) => { try{ const b=req.body; await col('abastecimento').updateOne({_id:new ObjectId(req.params.id)},{$set:{data:b.data||'',hora:b.hora||'',motorista:b.motorista||'',veiculo:b.veiculo||'',placa:b.placa||'',posto:b.posto||'',tipo:b.tipo||'Gasolina',litros:+(b.litros||0),valor_litro:+(b.valor_litro||0),valor_total:+(b.valor_total||0),odometro:+(b.odometro||0),obs:b.obs||''}}); res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });
app.delete('/api/abastecimento/:id', requireAuth, async (req,res) => { try{await col('abastecimento').deleteOne({_id:new ObjectId(req.params.id)});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });

// LOGISTICA — CHECKLIST
app.get('/api/checklist', requireAuth, async (req,res) => { const d=await col('checklist').find().sort({data:-1}).toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });
app.post('/api/checklist', requireAuth, async (req,res) => { try{ const b=req.body; const r=await col('checklist').insertOne({data:b.data||'',motorista:b.motorista||'',veiculo:b.veiculo||'',placa:b.placa||'',rota_id:b.rota_id||'',itens_saida:b.itens_saida||[],itens_retorno:b.itens_retorno||[],obs_saida:b.obs_saida||'',obs_retorno:b.obs_retorno||'',created_at:now()}); res.json({ok:true,id:r.insertedId.toString()});}catch(e){res.status(500).json({error:e.message});} });
app.put('/api/checklist/:id', requireAuth, async (req,res) => { try{ const b=req.body; await col('checklist').updateOne({_id:new ObjectId(req.params.id)},{$set:{data:b.data||'',motorista:b.motorista||'',veiculo:b.veiculo||'',placa:b.placa||'',rota_id:b.rota_id||'',itens_saida:b.itens_saida||[],itens_retorno:b.itens_retorno||[],obs_saida:b.obs_saida||'',obs_retorno:b.obs_retorno||''}}); res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });
app.delete('/api/checklist/:id', requireAuth, async (req,res) => { try{await col('checklist').deleteOne({_id:new ObjectId(req.params.id)});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });

// LOGISTICA — MANUTENÇÃO
app.get('/api/manutencao', requireAuth, async (req,res) => { const d=await col('manutencao').find().sort({data:-1}).toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });
app.post('/api/manutencao', requireAuth, async (req,res) => { try{ const b=req.body; const r=await col('manutencao').insertOne({data:b.data||'',veiculo:b.veiculo||'',placa:b.placa||'',tipo:b.tipo||'',descricao:b.descricao||'',km_atual:+(b.km_atual||0),km_proxima:+(b.km_proxima||0),data_proxima:b.data_proxima||'',valor:+(b.valor||0),oficina:b.oficina||'',obs:b.obs||'',created_at:now()}); res.json({ok:true,id:r.insertedId.toString()});}catch(e){res.status(500).json({error:e.message});} });
app.put('/api/manutencao/:id', requireAuth, async (req,res) => { try{ const b=req.body; await col('manutencao').updateOne({_id:new ObjectId(req.params.id)},{$set:{data:b.data||'',veiculo:b.veiculo||'',placa:b.placa||'',tipo:b.tipo||'',descricao:b.descricao||'',km_atual:+(b.km_atual||0),km_proxima:+(b.km_proxima||0),data_proxima:b.data_proxima||'',valor:+(b.valor||0),oficina:b.oficina||'',obs:b.obs||''}}); res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });
app.delete('/api/manutencao/:id', requireAuth, async (req,res) => { try{await col('manutencao').deleteOne({_id:new ObjectId(req.params.id)});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });

// ─── VEÍCULOS ────────────────────────────────────────────────────────────────
app.get('/api/veiculos', requireAuth, async (req,res) => { const d=await col('veiculos').find().sort({placa:1}).toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });
app.post('/api/veiculos', requireAuth, async (req,res) => { try{ const b=req.body; await col('veiculos').insertOne({placa:b.placa||'',tipo:b.tipo||'Carro',marca:b.marca||'',modelo:b.modelo||'',ano:b.ano||'',cor:b.cor||'',km:+(b.km||0),resp:b.resp||'',renavam:b.renavam||'',crlv_venc:b.crlv_venc||'',crlv_alerta:+(b.crlv_alerta||30),seg_empresa:b.seg_empresa||'',seg_apolice:b.seg_apolice||'',seg_valor:+(b.seg_valor||0),seg_inicio:b.seg_inicio||'',seg_venc:b.seg_venc||'',seg_alerta:+(b.seg_alerta||30),obs:b.obs||'',created_at:now()}); res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });
app.put('/api/veiculos/:id', requireAuth, async (req,res) => { try{ const b=req.body; await col('veiculos').updateOne({_id:new ObjectId(req.params.id)},{$set:{placa:b.placa||'',tipo:b.tipo||'Carro',marca:b.marca||'',modelo:b.modelo||'',ano:b.ano||'',cor:b.cor||'',km:+(b.km||0),resp:b.resp||'',renavam:b.renavam||'',crlv_venc:b.crlv_venc||'',crlv_alerta:+(b.crlv_alerta||30),seg_empresa:b.seg_empresa||'',seg_apolice:b.seg_apolice||'',seg_valor:+(b.seg_valor||0),seg_inicio:b.seg_inicio||'',seg_venc:b.seg_venc||'',seg_alerta:+(b.seg_alerta||30),obs:b.obs||''}}); res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });
app.delete('/api/veiculos/:id', requireAuth, async (req,res) => { try{await col('veiculos').deleteOne({_id:new ObjectId(req.params.id)});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });

// ATENDIMENTOS alias (compatibilidade com ordens)
app.get('/api/atendimentos', requireAuth, async (req,res) => { const d=await col('ordens').find().sort({created_at:-1}).toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });
app.post('/api/atendimentos', requireAuth, async (req,res) => { try{ const b=req.body; const num=(await col('counter').findOneAndUpdate({_id:'os'},{$inc:{valor:1}},{upsert:true,returnDocument:'after'})).valor||1; const cliente=b.clienteId?await col('clientes').findOne({_id:new ObjectId(b.clienteId)}):null; const tecnico=b.tecnicoId?await col('tecnicos').findOne({_id:new ObjectId(b.tecnicoId)}):null; const total=(b.viag||0)+(b.alim||0)+(b.hosp||0)+(b.comb||0)+(b.ped||0)+(b.outros||0); await col('ordens').insertOne({num,data_ab:b.data||b.data_ab||'',tecnico_id:b.tecnicoId||'',cliente_id:b.clienteId||'',equip_id:b.equipId||'',contato:b.contato||'',tel:b.tel||'',end_logradouro:b.end||'',modelo:b.modelo||'',nserie:b.nserie||'',contador:b.contador||'',defeito:b.descricao||b.defeito||'',procedimento:b.procedimento||'',pecas:b.pecas||'',obs:b.obs||'',viag:b.viag||0,alim:b.alim||0,hosp:b.hosp||0,comb:b.comb||0,ped:b.ped||0,outros:b.outros||0,total,data_chamado:b.data_chamado||'',data_atend:b.data_atend||'',hora_chegada:b.hora_chegada||'',hora_saida:b.hora_saida||'',status:b.status||'Aberta',checklist:b.checklist||[],sig_tec:b.sig_tec||'',sig_cli:b.sig_cli||'',tipo:b.tipo||'',sla_prazo:b.sla_prazo||'',sla_deadline:b.sla_deadline||null,created_at:new Date().toISOString()}); if(b.status==='Concluída'||b.status==='Concluído'){await col('historico').insertOne({os_num:num,tipo:'os',data:b.data||b.data_ab||'',cliente:cliente?.nome||'',tecnico:tecnico?.nome||'',modelo:b.modelo||'',nserie:b.nserie||'',defeito:b.descricao||b.defeito||'',procedimento:b.procedimento||'',pecas:b.pecas||'',total,created_at:new Date().toISOString()});} res.json({ok:true,num});}catch(e){res.status(500).json({error:e.message});} });
app.put('/api/atendimentos/:id', requireAuth, async (req,res) => { try{ const b=req.body; const total=(b.viag||0)+(b.alim||0)+(b.hosp||0)+(b.comb||0)+(b.ped||0)+(b.outros||0); await col('ordens').updateOne({_id:new ObjectId(req.params.id)},{$set:{data_ab:b.data||b.data_ab||'',tecnico_id:b.tecnicoId||'',cliente_id:b.clienteId||'',equip_id:b.equipId||'',modelo:b.modelo||'',nserie:b.nserie||'',contador:b.contador||'',defeito:b.descricao||b.defeito||'',procedimento:b.procedimento||'',pecas:b.pecas||'',obs:b.obs||'',viag:b.viag||0,alim:b.alim||0,hosp:b.hosp||0,comb:b.comb||0,ped:b.ped||0,outros:b.outros||0,total,status:b.status||'Aberta',checklist:b.checklist||[],sig_tec:b.sig_tec||'',sig_cli:b.sig_cli||'',tipo:b.tipo||'',sla_prazo:b.sla_prazo||'',sla_deadline:b.sla_deadline||null}}); res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });
app.delete('/api/atendimentos/:id', requireAuth, async (req,res) => { try{await col('ordens').deleteOne({_id:new ObjectId(req.params.id)});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });


// CONTRATOS
app.get('/api/contratos', requireAuth, async (req,res) => { const d=await col('contratos').find().sort({vencimento:1}).toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });
app.post('/api/contratos', requireAuth, async (req,res) => {
  try{const b=req.body;
    const r=await col('contratos').insertOne({cliente_id:b.cliente_id,tipo:b.tipo||'Fixo Mensal',equipamentos:b.equipamentos||'',valor_mensal:+(b.valor_mensal||0),franq_pb:+(b.franq_pb||0),exc_pb:+(b.exc_pb||0),franq_cor:+(b.franq_cor||0),exc_cor:+(b.exc_cor||0),inicio:b.inicio||'',vencimento:b.vencimento||'',periodicidade:b.periodicidade||'Mensal',status:b.status||'Ativo',obs:b.obs||'',created_at:now()});
    res.json({ok:true,id:r.insertedId.toString()});
  }catch(e){res.status(500).json({error:e.message});}
});
app.put('/api/contratos/:id', requireAuth, async (req,res) => {
  try{const b=req.body;
    await col('contratos').updateOne({_id:new ObjectId(req.params.id)},{$set:{cliente_id:b.cliente_id,tipo:b.tipo,equipamentos:b.equipamentos||'',valor_mensal:+(b.valor_mensal||0),franq_pb:+(b.franq_pb||0),exc_pb:+(b.exc_pb||0),franq_cor:+(b.franq_cor||0),exc_cor:+(b.exc_cor||0),inicio:b.inicio||'',vencimento:b.vencimento||'',periodicidade:b.periodicidade,status:b.status,obs:b.obs||''}});
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/contratos/:id', requireAuth, async (req,res) => { try{await col('contratos').deleteOne({_id:new ObjectId(req.params.id)});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });

// FINANCEIRO
app.get('/api/financeiro', requireAuth, async (req,res) => { const d=await col('financeiro').find().sort({data:-1}).toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });
app.post('/api/financeiro', requireAuth, async (req,res) => {
  try{const b=req.body;
    const r=await col('financeiro').insertOne({tipo:b.tipo||'receita',data:b.data||'',categoria:b.categoria||'Outros',descricao:b.descricao||'',valor:+(b.valor||0),cliente_id:b.cliente_id||'',ref:b.ref||'',forma:b.forma||'',obs:b.obs||'',created_at:now()});
    res.json({ok:true,id:r.insertedId.toString()});
  }catch(e){res.status(500).json({error:e.message});}
});
app.put('/api/financeiro/:id', requireAuth, async (req,res) => {
  try{const b=req.body;
    await col('financeiro').updateOne({_id:new ObjectId(req.params.id)},{$set:{tipo:b.tipo,data:b.data||'',categoria:b.categoria,descricao:b.descricao,valor:+(b.valor||0),cliente_id:b.cliente_id||'',ref:b.ref||'',forma:b.forma||'',obs:b.obs||''}});
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/financeiro/:id', requireAuth, async (req,res) => { try{await col('financeiro').deleteOne({_id:new ObjectId(req.params.id)});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });

// LANÇAMENTOS MANUAIS (histórico sem OS)
app.get('/api/lancamentos', requireAuth, async (req,res) => {
  const d=await col('lancamentos').find().sort({data:-1}).toArray();
  res.json(d.map(x=>({...x,id:x._id.toString()})));
});
app.post('/api/lancamentos', requireAuth, async (req,res) => {
  try {
    const b=req.body;
    const r=await col('lancamentos').insertOne({
      data:b.data||'', tipo:b.tipo||'Visita Técnica',
      cliente_id:b.cliente_id||'', cliente_nome:b.cliente_nome||'',
      tecnico_id:b.tecnico_id||'', tecnico_nome:b.tecnico_nome||'',
      equipamento:b.equipamento||'', nserie:b.nserie||'',
      descricao:b.descricao||'', procedimento:b.procedimento||'',
      custo:+(b.custo||0), status:b.status||'Concluído',
      obs:b.obs||'', created_at:now()
    });
    res.json({ok:true,id:r.insertedId.toString()});
  }catch(e){res.status(500).json({error:e.message});}
});
app.put('/api/lancamentos/:id', requireAuth, async (req,res) => {
  try {
    const b=req.body;
    await col('lancamentos').updateOne({_id:new ObjectId(req.params.id)},{$set:{
      data:b.data||'', tipo:b.tipo||'Visita Técnica',
      cliente_id:b.cliente_id||'', cliente_nome:b.cliente_nome||'',
      tecnico_id:b.tecnico_id||'', tecnico_nome:b.tecnico_nome||'',
      equipamento:b.equipamento||'', nserie:b.nserie||'',
      descricao:b.descricao||'', procedimento:b.procedimento||'',
      custo:+(b.custo||0), status:b.status||'Concluído', obs:b.obs||''
    }});
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/lancamentos/:id', requireAuth, async (req,res) => {
  try{await col('lancamentos').deleteOne({_id:new ObjectId(req.params.id)});res.json({ok:true});}
  catch(e){res.status(500).json({error:e.message});}
});

// RESET DE SENHA
// ─── RECUPERAÇÃO DE SENHA ────────────────────────────────────────────────────
// Gera código de 6 dígitos numéricos (mais amigável que token hex)
function gerarCodigo() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Envia email via Yahoo SMTP
async function enviarEmail(destinatario, nome, codigo) {
  const nodemailer = require('nodemailer');
  const smtpUser = process.env.SMTP_USER || 'clairtonalves@yahoo.com.br';
  const smtpPass = process.env.SMTP_PASS; // Senha de app Yahoo em variável de ambiente
  if (!smtpPass) throw new Error('SMTP_PASS não configurado nas variáveis de ambiente.');
  const transporter = nodemailer.createTransport({
    host: 'smtp.mail.yahoo.com',
    port: 587,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
    tls: { rejectUnauthorized: false }
  });
  await transporter.sendMail({
    from: `"Orion Print" <${smtpUser}>`,
    to: destinatario,
    subject: '🔐 Código de Recuperação — Orion Print',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #ddd;border-radius:10px">
        <div style="text-align:center;margin-bottom:20px">
          <div style="background:#0d1f3c;display:inline-block;padding:10px 20px;border-radius:8px">
            <span style="color:#e07818;font-size:20px;font-weight:800;letter-spacing:2px">ORION PRINT</span>
          </div>
        </div>
        <p style="color:#333;font-size:15px">Olá, <b>${nome}</b>!</p>
        <p style="color:#555;font-size:14px">Recebemos uma solicitação para redefinir sua senha. Use o código abaixo:</p>
        <div style="background:#f4f6fb;border:2px dashed #1e4080;border-radius:10px;text-align:center;padding:24px;margin:20px 0">
          <span style="font-size:40px;font-weight:900;letter-spacing:10px;color:#0d1f3c">${codigo}</span>
        </div>
        <p style="color:#888;font-size:12px">⏱ Este código expira em <b>15 minutos</b>.</p>
        <p style="color:#888;font-size:12px">Se você não solicitou isso, ignore este email.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="color:#aaa;font-size:11px;text-align:center">Orion Soluções — Sistema de Assistência Técnica</p>
      </div>
    `
  });
}

// Envia mensagem via Telegram Bot API
// Setup: criar bot via @BotFather → obter TOKEN → usuário inicia conversa com o bot → obter CHAT_ID via /api/telegram-updates
async function enviarTelegram(chatId, nome, codigo) {
  const https = require('https');
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN não configurado. Crie um bot via @BotFather no Telegram e adicione o token nas variáveis de ambiente do Railway.');
  if (!chatId) throw new Error('Chat ID do Telegram não cadastrado para este usuário.');
  const text = encodeURIComponent(
    `🔐 Orion Print — Recuperação de Senha\n\nOlá, ${nome}!\n\nSeu código de verificação é:\n\n${codigo}\n\n⏱ Expira em 15 minutos.\n\nSe não foi você, ignore esta mensagem.`
  );
  const url = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text=${text}`;
  return new Promise((resolve, reject) => {
    https.get(url, (r) => {
      let data = '';
      r.on('data', d => data += d);
      r.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ok) resolve(json);
          else reject(new Error(`Telegram API: ${json.description || 'Erro desconhecido'}`));
        } catch(e) { reject(new Error('Resposta inválida do Telegram: ' + data)); }
      });
    }).on('error', reject);
  });
}

// Endpoint auxiliar: lista os últimos contatos do bot (para obter chat_id dos usuários)
app.get('/api/telegram-updates', requireAuth, requireAdmin, async (req, res) => {
  const https = require('https');
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN não configurado.' });
  const url = `https://api.telegram.org/bot${token}/getUpdates?limit=20`;
  https.get(url, (r) => {
    let data = '';
    r.on('data', d => data += d);
    r.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (!json.ok) return res.status(500).json({ error: json.description });
        const updates = (json.result || []).map(u => ({
          chat_id: u.message?.chat?.id,
          username: u.message?.chat?.username || '',
          nome: (u.message?.chat?.first_name || '') + ' ' + (u.message?.chat?.last_name || ''),
          texto: u.message?.text || '',
          data: u.message?.date ? new Date(u.message.date * 1000).toLocaleString('pt-BR') : ''
        })).filter(u => u.chat_id);
        res.json(updates);
      } catch(e) { res.status(500).json({ error: 'Resposta inválida do Telegram.' }); }
    });
  }).on('error', e => res.status(500).json({ error: e.message }));
});

app.post('/api/forgot-password', async (req, res) => {
  try {
    const { login, canal } = req.body; // canal: 'email' | 'whatsapp'
    if (!login) return res.status(400).json({ error: 'Informe o login ou email.' });
    const user = await col('users').findOne({ $or: [{ login }, { email: login }] });
    // Segurança: não revelar se usuário existe
    if (!user) return res.json({ ok: true, msg: 'Se o cadastro for encontrado, o código será enviado.' });

    const codigo = gerarCodigo();
    const expiry = Date.now() + 15 * 60 * 1000; // 15 min
    await col('users').updateOne(
      { _id: user._id },
      { $set: { reset_codigo: codigo, reset_expiry: expiry, reset_tentativas: 0 } }
    );

    if (canal === 'telegram') {
      const chatId = user.telegram_chat_id || '';
      if (!chatId) return res.status(400).json({ error: 'Este usuário não tem Telegram cadastrado no sistema. Tente pelo email.' });
      try {
        await enviarTelegram(chatId, user.nome, codigo);
        const chatMask = String(chatId).slice(-4);
        return res.json({ ok: true, msg: `Código enviado via Telegram (conta com final ...${chatMask}). Verifique o app!` });
      } catch(e) {
        console.error('Telegram error:', e.message);
        return res.status(500).json({ error: 'Erro ao enviar via Telegram: ' + e.message });
      }
    } else {
      // Canal email (padrão)
      const emailDest = user.email || '';
      if (!emailDest) return res.status(400).json({ error: 'Este usuário não tem email cadastrado. Tente pelo WhatsApp.' });
      try {
        await enviarEmail(emailDest, user.nome, codigo);
        // Mascarar email: c***@yahoo.com.br
        const [eu, ed] = emailDest.split('@');
        const emailMask = eu[0] + '***@' + ed;
        return res.json({ ok: true, msg: `Código enviado para ${emailMask}. Verifique sua caixa de entrada!` });
      } catch(e) {
        console.error('Email error:', e.message);
        return res.status(500).json({ error: 'Erro ao enviar email: ' + e.message });
      }
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reset-password', async (req, res) => {
  try {
    const { login, codigo, nova_senha } = req.body;
    if (!login || !codigo || !nova_senha) return res.status(400).json({ error: 'Dados incompletos.' });
    if (nova_senha.length < 4) return res.status(400).json({ error: 'A senha deve ter ao menos 4 caracteres.' });
    const user = await col('users').findOne({ $or: [{ login }, { email: login }] });
    if (!user) return res.status(400).json({ error: 'Usuário não encontrado.' });
    // Verificar expiração
    if (!user.reset_codigo || !user.reset_expiry || Date.now() > user.reset_expiry) {
      return res.status(400).json({ error: 'Código expirado. Solicite um novo.' });
    }
    // Limitar tentativas (máx 5)
    const tentativas = (user.reset_tentativas || 0) + 1;
    if (tentativas > 5) {
      await col('users').updateOne({ _id: user._id }, { $unset: { reset_codigo: '', reset_expiry: '', reset_tentativas: '' } });
      return res.status(400).json({ error: 'Muitas tentativas. Solicite um novo código.' });
    }
    if (user.reset_codigo !== String(codigo).trim()) {
      await col('users').updateOne({ _id: user._id }, { $set: { reset_tentativas: tentativas } });
      return res.status(400).json({ error: `Código incorreto. Tentativa ${tentativas}/5.` });
    }
    // Código correto — atualiza senha e limpa campos de reset
    await col('users').updateOne(
      { _id: user._id },
      {
        $set: { senha_hash: bcrypt.hashSync(nova_senha, 10) },
        $unset: { reset_codigo: '', reset_expiry: '', reset_tentativas: '' }
      }
    );
    res.json({ ok: true, msg: 'Senha redefinida com sucesso! Você já pode fazer login.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Debug route
app.get('/api/test', (req,res) => res.json({ok:true, session: req.session.user || null}));

// Teste de envio Telegram
app.post('/api/test-telegram', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { chat_id } = req.body;
    if (!chat_id) return res.status(400).json({ error: 'Informe o Chat ID.' });
    await enviarTelegram(String(chat_id), 'Administrador', '123456');
    res.json({ ok: true, msg: `Mensagem de teste enviada para o chat ${chat_id}!` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── AGENDA / CALENDÁRIO ────────────────────────────────────────────────────
app.get('/api/agenda', requireAuth, async (req,res) => {
  try {
    const { mes, ano } = req.query;
    let filter = {};
    if (mes && ano) {
      // Filtra pelo mês/ano
      const prefixo = `${ano}-${String(mes).padStart(2,'0')}`;
      filter = { $or: [
        { data_inicio: { $regex: '^' + prefixo } },
        { data_fim: { $regex: '^' + prefixo } }
      ]};
    }
    const d = await col('agenda').find(filter).sort({ data_inicio: 1, hora_inicio: 1 }).toArray();
    res.json(d.map(x => ({ ...x, id: x._id.toString() })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/agenda', requireAuth, async (req,res) => {
  try {
    const b = req.body;
    const r = await col('agenda').insertOne({
      titulo: b.titulo || '',
      tipo: b.tipo || 'Visita', // Visita, OS, Preventiva, Reunião, Outros
      data_inicio: b.data_inicio || '',
      hora_inicio: b.hora_inicio || '',
      data_fim: b.data_fim || b.data_inicio || '',
      hora_fim: b.hora_fim || '',
      tecnico_id: b.tecnico_id || '',
      tecnico_nome: b.tecnico_nome || '',
      cliente_id: b.cliente_id || '',
      cliente_nome: b.cliente_nome || '',
      os_id: b.os_id || '',
      os_num: b.os_num || '',
      descricao: b.descricao || '',
      local: b.local || '',
      status: b.status || 'Agendado', // Agendado, Confirmado, Concluído, Cancelado
      cor: b.cor || '',
      criado_por: req.session.user?.nome || '',
      created_at: now()
    });
    res.json({ ok: true, id: r.insertedId.toString() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/agenda/:id', requireAuth, async (req,res) => {
  try {
    const b = req.body;
    await col('agenda').updateOne({ _id: new ObjectId(req.params.id) }, { $set: {
      titulo: b.titulo || '',
      tipo: b.tipo || 'Visita',
      data_inicio: b.data_inicio || '',
      hora_inicio: b.hora_inicio || '',
      data_fim: b.data_fim || b.data_inicio || '',
      hora_fim: b.hora_fim || '',
      tecnico_id: b.tecnico_id || '',
      tecnico_nome: b.tecnico_nome || '',
      cliente_id: b.cliente_id || '',
      cliente_nome: b.cliente_nome || '',
      os_id: b.os_id || '',
      os_num: b.os_num || '',
      descricao: b.descricao || '',
      local: b.local || '',
      status: b.status || 'Agendado',
      cor: b.cor || ''
    }});
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/agenda/:id', requireAuth, async (req,res) => {
  try { await col('agenda').deleteOne({ _id: new ObjectId(req.params.id) }); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── RESET DO SISTEMA ────────────────────────────────────────────────────────
// Apaga TODOS os dados, preservando APENAS o usuário master (coringa)
app.post('/api/reset-system', requireAuth, async (req, res) => {
  try {
    const u = req.session.user;
    if (!u?.isMaster && u?.login !== 'master') {
      return res.status(403).json({ error: 'Acesso negado. Apenas o usuário master pode executar esta operação.' });
    }
    const { confirmacao } = req.body;
    if (confirmacao !== 'APAGAR TUDO') {
      return res.status(400).json({ error: 'Confirmação inválida. Digite exatamente: APAGAR TUDO' });
    }
    const colecoes = [
      'users','tecnicos','clientes','equipamentos',
      'ordens','laboratorio','historico',
      'estoque','estoque_movs',
      'supr_cli','supr_movs',
      'logistica','abastecimento','checklist','manutencao',
      'pedidos_pecas','eq_baixados',
      'lancamentos','contratos','financeiro',
      'counter','sessions','notificacoes','configuracoes','agenda'
    ];
    const db = client.db();
    const resultados = {};
    for (const nome of colecoes) {
      try {
        const r = await db.collection(nome).deleteMany({});
        resultados[nome] = r.deletedCount;
      } catch(e) { resultados[nome] = `erro: ${e.message}`; }
    }
    req.session.destroy(() => {});
    res.json({ ok: true, msg: 'Sistema zerado. Todos os dados foram apagados. Faça login novamente.', resultados });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── PORTAL DO CLIENTE ──────────────────────────────────────────────────────

function requirePortal(req,res,next){
  if(req.session.portal_cliente) return next();
  res.status(401).json({error:'Não autenticado no portal'});
}

// Servir portal.html em /portal e /portal/*
app.get('/portal', (req,res) => res.sendFile(path.join(__dirname,'public','portal.html')));
app.get('/portal/*', (req,res) => res.sendFile(path.join(__dirname,'public','portal.html')));

// Login do portal (cliente)
app.post('/api/portal/login', async (req,res) => {
  try {
    const { login, senha } = req.body;
    if (!login || !senha) return res.status(400).json({error:'Informe login e senha.'});
    const cliente = await col('clientes').findOne({ portal_login: login });
    if (!cliente) return res.status(401).json({error:'Usuário ou senha inválidos.'});
    if (!cliente.portal_ativo) return res.status(403).json({error:'Acesso ao portal desativado. Contate o suporte.'});
    const ok = await bcrypt.compare(senha, cliente.portal_senha_hash||'');
    if (!ok) return res.status(401).json({error:'Usuário ou senha inválidos.'});
    await col('clientes').updateOne({_id:cliente._id},{$set:{portal_ultimo_acesso:now()}});
    req.session.portal_cliente = { id: cliente._id.toString(), nome: cliente.nome, email: cliente.email||'' };
    res.json({ ok:true, nome: cliente.nome });
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Logout do portal
app.post('/api/portal/logout', (req,res) => {
  req.session.portal_cliente = null;
  res.json({ok:true});
});

// Sessão atual do portal
app.get('/api/portal/me', (req,res) => {
  if (!req.session.portal_cliente) return res.status(401).json({error:'Não autenticado'});
  res.json(req.session.portal_cliente);
});

// OS do cliente logado
app.get('/api/portal/ordens', requirePortal, async (req,res) => {
  try {
    const cid = req.session.portal_cliente.id;
    const ordens = await col('ordens').find({cliente_id: cid}).sort({data_ab:-1}).toArray();
    const tecnicos = await col('tecnicos').find().toArray();
    res.json(ordens.map(o => ({
      id: o._id.toString(),
      num: o.num,
      data_ab: o.data_ab,
      data_atend: o.data_atend||'',
      modelo: o.modelo||'',
      nserie: o.nserie||'',
      defeito: o.defeito||'',
      status: o.status,
      sla_deadline: o.sla_deadline||null,
      tecnico_nome: tecnicos.find(t=>t._id.toString()===o.tecnico_id)?.nome||'Em definição',
      tipo: o.tipo||'',
      procedimento: o.procedimento||'',
      pecas: o.pecas||'',
      obs: o.obs||'',
      total: o.total||0,
    })));
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Abrir chamado pelo portal
app.post('/api/portal/chamado', requirePortal, async (req,res) => {
  try {
    const cid = req.session.portal_cliente.id;
    const b = req.body;
    const cliente = await col('clientes').findOne({_id: new ObjectId(cid)});
    if (!cliente) return res.status(404).json({error:'Cliente não encontrado.'});
    const num = (await col('counter').findOneAndUpdate({_id:'os'},{$inc:{valor:1}},{upsert:true,returnDocument:'after'})).valor||1;
    await col('ordens').insertOne({
      num, data_ab: now().slice(0,10),
      tecnico_id:'', cliente_id: cid,
      contato: b.contato||cliente.contato||'',
      tel: b.tel||cliente.tel||'',
      end_logradouro: cliente.end_logradouro||'',
      modelo: b.modelo||'', nserie: b.nserie||'',
      contador: b.contador||'',
      defeito: b.defeito||'', procedimento:'', pecas:'', obs: b.obs||'',
      viag:0, alim:0, hosp:0, comb:0, ped:0, outros:0, total:0,
      data_chamado: now().slice(0,10), data_atend:'',
      hora_chegada:'', hora_saida:'',
      status:'Aberta', checklist:[], sig_tec:'', sig_cli:'',
      tipo: b.tipo||'Corretiva',
      sla_prazo: b.sla_prazo||'24h',
      sla_deadline: null,
      origem: 'portal',
      created_at: now()
    });
    res.json({ok:true, num});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Equipamentos do cliente
app.get('/api/portal/equipamentos', requirePortal, async (req,res) => {
  try {
    const cid = req.session.portal_cliente.id;
    const eqs = await col('equipamentos').find({cliente_id: cid}).toArray();
    res.json(eqs.map(e=>({id:e._id.toString(), nome:e.nome, marca:e.marca||'', modelo:e.modelo||'', nserie:e.nserie||'', status:e.status||'Ativo'})));
  } catch(e) { res.status(500).json({error:e.message}); }
});

// PDF de uma OS específica (somente do cliente logado)
app.get('/api/portal/ordens/:id/pdf', requirePortal, async (req,res) => {
  try {
    const cid = req.session.portal_cliente.id;
    const ordem = await col('ordens').findOne({_id: new ObjectId(req.params.id), cliente_id: cid});
    if (!ordem) return res.status(404).json({error:'OS não encontrada.'});
    const cliente = await col('clientes').findOne({_id: new ObjectId(cid)});
    const tecnico = ordem.tecnico_id ? await col('tecnicos').findOne({_id: new ObjectId(ordem.tecnico_id)}) : null;
    const cfg = await col('configuracoes').findOne({}) || {};
    // Retorna dados para o frontend gerar o PDF (via print)
    res.json({
      ordem: {...ordem, id:ordem._id.toString()},
      cliente: {...cliente, id:cliente._id.toString()},
      tecnico: tecnico ? {...tecnico, id:tecnico._id.toString()} : null,
      empresa: { nome: cfg.nome||'Orion Soluções', cnpj: cfg.cnpj||'', tel: cfg.tel||'', email: cfg.email_empresa||'' }
    });
  } catch(e) { res.status(500).json({error:e.message}); }
});

// ─── ADMIN: Gerenciar acesso portal dos clientes ────────────────────────────
// Criar/atualizar credenciais do portal para um cliente
app.post('/api/clientes/:id/portal-acesso', requireAuth, requireAdmin, async (req,res) => {
  try {
    const { login, senha, ativo } = req.body;
    if (!login || !senha) return res.status(400).json({error:'Login e senha são obrigatórios.'});
    // Verifica se login já existe em outro cliente
    const existe = await col('clientes').findOne({portal_login: login, _id:{$ne: new ObjectId(req.params.id)}});
    if (existe) return res.status(400).json({error:'Este login já está em uso por outro cliente.'});
    const hash = await bcrypt.hash(senha, 10);
    await col('clientes').updateOne({_id: new ObjectId(req.params.id)},{$set:{
      portal_login: login,
      portal_senha_hash: hash,
      portal_ativo: ativo !== false,
      portal_criado_em: now()
    }});
    res.json({ok:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Enviar link/credenciais por email
app.post('/api/clientes/:id/portal-enviar-email', requireAuth, requireAdmin, async (req,res) => {
  try {
    const cliente = await col('clientes').findOne({_id: new ObjectId(req.params.id)});
    if (!cliente) return res.status(404).json({error:'Cliente não encontrado.'});
    if (!cliente.email) return res.status(400).json({error:'Cliente não tem email cadastrado.'});
    if (!cliente.portal_login) return res.status(400).json({error:'Cliente não tem acesso ao portal configurado.'});
    const cfg = await col('configuracoes').findOne({}) || {};
    const empresa = cfg.nome || 'Orion Soluções';
    const url = req.body.url || `${req.protocol}://${req.get('host')}/portal`;
    await enviarEmailPortal(cliente.email, cliente.nome, cliente.portal_login, req.body.senha_temp||'', url, empresa);
    res.json({ok:true, msg:`Email enviado para ${cliente.email}`});
  } catch(e) { res.status(500).json({error:e.message}); }
});

async function enviarEmailPortal(dest, nome, login, senha, url, empresa) {
  const nodemailer = require('nodemailer');
  const smtpUser = process.env.SMTP_USER || 'clairtonalves@yahoo.com.br';
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpPass) throw new Error('SMTP_PASS não configurado.');
  const transporter = nodemailer.createTransport({
    host:'smtp.mail.yahoo.com', port:587, secure:false,
    auth:{ user:smtpUser, pass:smtpPass },
    tls:{ rejectUnauthorized:false }
  });
  await transporter.sendMail({
    from:`"${empresa}" <${smtpUser}>`,
    to: dest,
    subject:`🔑 Seu acesso ao Portal do Cliente — ${empresa}`,
    html:`
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #ddd;border-radius:10px">
        <div style="text-align:center;margin-bottom:24px">
          <div style="background:#0d1f3c;display:inline-block;padding:10px 24px;border-radius:8px">
            <span style="color:#e07818;font-size:20px;font-weight:800;letter-spacing:2px">${empresa.toUpperCase()}</span>
          </div>
        </div>
        <p style="color:#333;font-size:15px">Olá, <b>${nome}</b>!</p>
        <p style="color:#555;font-size:14px">Seu acesso ao <b>Portal do Cliente</b> foi criado. Use as credenciais abaixo para acompanhar seus chamados:</p>
        <div style="background:#f4f6fb;border:1.5px solid #d0d8ee;border-radius:10px;padding:20px;margin:20px 0">
          <table style="width:100%;font-size:14px;color:#333">
            <tr><td style="padding:6px 0;color:#666">🔗 Link de acesso:</td><td><a href="${url}" style="color:#1e4080;font-weight:700">${url}</a></td></tr>
            <tr><td style="padding:6px 0;color:#666">👤 Usuário:</td><td><b style="font-family:monospace;font-size:15px">${login}</b></td></tr>
            ${senha?`<tr><td style="padding:6px 0;color:#666">🔐 Senha:</td><td><b style="font-family:monospace;font-size:15px">${senha}</b></td></tr>`:''}
          </table>
        </div>
        <p style="color:#888;font-size:12px">Recomendamos que você altere sua senha após o primeiro acesso.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="color:#aaa;font-size:11px;text-align:center">${empresa} — Portal do Cliente</p>
      </div>`
  });
}

// Listar clientes com info de acesso ao portal (para tela de admin)
app.get('/api/portal/clientes-acesso', requireAuth, requireAdmin, async (req,res) => {
  try {
    const clientes = await col('clientes').find().sort({nome:1}).toArray();
    res.json(clientes.map(c=>({
      id: c._id.toString(), nome: c.nome, email: c.email||'',
      portal_login: c.portal_login||'',
      portal_ativo: c.portal_ativo||false,
      portal_criado_em: c.portal_criado_em||'',
      portal_ultimo_acesso: c.portal_ultimo_acesso||''
    })));
  } catch(e) { res.status(500).json({error:e.message}); }
});

// ─── DOWNLOAD DO AGENTE ─────────────────────────────────────────────────────

// ─── DOWNLOAD PACOTE AGENTE (agente + config personalizado em ZIP) ────────────

// Gerador de ZIP mínimo sem dependência externa
function gerarZip(arquivos) {
  // arquivos = [{ nome, conteudo: Buffer }]
  const partes = [];
  const centralDir = [];
  let offset = 0;

  const crc32 = (buf) => {
    let crc = 0xffffffff;
    const table = [];
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c;
    }
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };

  const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };

  for (const { nome, conteudo } of arquivos) {
    const nBuf  = Buffer.from(nome, 'utf8');
    const crc   = crc32(conteudo);
    const local = Buffer.concat([
      Buffer.from([0x50,0x4b,0x03,0x04]), // signature
      u16(20), u16(0), u16(0),            // version, flags, compression (store)
      u16(0), u16(0),                     // mod time, mod date
      u32(crc), u32(conteudo.length), u32(conteudo.length),
      u16(nBuf.length), u16(0),           // name len, extra len
      nBuf, conteudo,
    ]);
    partes.push(local);
    centralDir.push(Buffer.concat([
      Buffer.from([0x50,0x4b,0x01,0x02]), // central dir signature
      u16(20), u16(20), u16(0), u16(0),  // ver_made, ver_needed, flags, compression
      u16(0), u16(0),                    // mod time, mod date
      u32(crc), u32(conteudo.length), u32(conteudo.length),
      u16(nBuf.length), u16(0), u16(0),  // name, extra, comment len
      u16(0), u16(0), u32(0),            // disk, attrs
      u32(offset),                        // local header offset
      nBuf,
    ]));
    offset += local.length;
  }

  const cdBuf  = Buffer.concat(centralDir);
  const eocd   = Buffer.concat([
    Buffer.from([0x50,0x4b,0x05,0x06]),  // end of central dir
    u16(0), u16(0),                       // disk numbers
    u16(arquivos.length), u16(arquivos.length),
    u32(cdBuf.length), u32(offset),
    u16(0),                               // comment len
  ]);

  return Buffer.concat([...partes, cdBuf, eocd]);
}

// Conteúdo do orion-agente.js embutido diretamente no servidor
const AGENTE_JS = `
/**
 * Orion Agente v2.0.0 — Coletor de Impressoras via SNMP
 * Descoberta automática de subnets RFC 1918
 * Uso: node orion-agente.js
 */
const os=require('os'),fs=require('fs'),path=require('path'),https=require('https'),dgram=require('dgram');
const CFG_PATH=path.join(__dirname,'config.json');
if(!fs.existsSync(CFG_PATH)){console.error('\\u274c config.json não encontrado.');process.exit(1);}
const CFG=JSON.parse(fs.readFileSync(CFG_PATH,'utf8'));
const SERVER_URL=CFG.serverUrl||'https://orion-at-production.up.railway.app';
const CLIENT_KEY=CFG.clientKey||'';
const INTERVAL=(CFG.intervalMin||15)*60*1000;
const SNMP_TO=CFG.snmpTimeout||3000;
const SUBNET_FIXO=CFG.subnet||'';

const OID={
  descricao:'1.3.6.1.2.1.1.1.0',nome_rede:'1.3.6.1.2.1.1.5.0',
  serial:'1.3.6.1.2.1.43.5.1.1.17.1',
  pag_total:'1.3.6.1.2.1.43.10.2.1.4.1.1',pag_pb:'1.3.6.1.2.1.43.10.2.1.4.1.2',pag_cor:'1.3.6.1.2.1.43.10.2.1.4.1.3',
  tn1:'1.3.6.1.2.1.43.11.1.1.9.1.1',tm1:'1.3.6.1.2.1.43.11.1.1.8.1.1',
  tn2:'1.3.6.1.2.1.43.11.1.1.9.1.2',tm2:'1.3.6.1.2.1.43.11.1.1.8.1.2',
  tn3:'1.3.6.1.2.1.43.11.1.1.9.1.3',tm3:'1.3.6.1.2.1.43.11.1.1.8.1.3',
  tn4:'1.3.6.1.2.1.43.11.1.1.9.1.4',tm4:'1.3.6.1.2.1.43.11.1.1.8.1.4',
  drum_n:'1.3.6.1.2.1.43.11.1.1.9.1.5',drum_m:'1.3.6.1.2.1.43.11.1.1.8.1.5',
  status:'1.3.6.1.2.1.25.3.5.1.1.1',papel:'1.3.6.1.2.1.43.8.2.1.10.1.1',
};

function descobrirSubnets(){
  if(SUBNET_FIXO) return SUBNET_FIXO.split(',').map(s=>s.trim()).filter(Boolean);
  const subs=new Set();
  for(const[n,addrs]of Object.entries(os.networkInterfaces()||{})){
    if(/loopback|lo$|vmnet|vbox|docker|wsl|hyper/i.test(n))continue;
    for(const a of(addrs||[])){
      if(a.family!=='IPv4'||a.internal)continue;
      const ip=a.address;
      if(ip.startsWith('10.')||ip.startsWith('192.168.')||(ip.startsWith('172.')&&+ip.split('.')[1]>=16&&+ip.split('.')[1]<=31)){
        subs.add(ip.split('.').slice(0,3).join('.'));
        console.log('\\u{1F4E1} Interface '+n+' ('+ip+') → '+ip.split('.').slice(0,3).join('.')+'.0/24');
      }
    }
  }
  if(!subs.size){console.warn('\\u26a0\\ufe0f Fallback: 192.168.0, 192.168.1, 10.0.0');return['192.168.0','192.168.1','10.0.0'];}
  return[...subs];
}

function buildPDU(oid,comm){
  const encInt=n=>n<128?Buffer.from([2,1,n]):Buffer.from([2,2,(n>>8)&255,n&255]);
  const encOID=s=>{const p=s.split('.').map(Number);const e=[p[0]*40+p[1]];for(let i=2;i<p.length;i++){let v=p[i];if(v<128){e.push(v);}else{const b=[];while(v>0){b.unshift(v&127);v>>=7;}for(let j=0;j<b.length-1;j++)b[j]|=128;e.push(...b);}}return Buffer.concat([Buffer.from([6,e.length]),Buffer.from(e)]);};
  const encStr=s=>{const b=Buffer.from(s,'ascii');return Buffer.concat([Buffer.from([4,b.length]),b]);};
  const encSeq=(t,c)=>{const b=Buffer.isBuffer(c)?c:Buffer.concat(c);return Buffer.concat([Buffer.from([t,b.length]),b]);};
  const rid=encInt(Math.floor(Math.random()*65535));
  const e0=Buffer.from([2,1,0]),e1=Buffer.from([2,1,0]);
  const vb=encSeq(0x30,[encOID(oid),Buffer.from([5,0])]);
  const pdu=encSeq(0xa0,[rid,e0,e1,encSeq(0x30,[vb])]);
  return encSeq(0x30,[Buffer.from([2,1,0]),encStr(comm),pdu]);
}

function parseResp(buf){
  let i=0;
  const rLen=()=>{const l=buf[i++];if(l<128)return l;const nb=l&127;let r=0;for(let j=0;j<nb;j++)r=(r<<8)|buf[i++];return r;};
  const find=(end)=>{while(i<end){const t=buf[i++],l=rLen(),s=i;if(t===0x30||t===0xa2||t===0xa0){const v=find(i+l);if(v!==null)return v;}else if(t===4){return buf.slice(i,i+l).toString('utf8').replace(/\0/g,'').trim();}else if(t===2){let v=buf[i]&128?-1:0;for(let j=0;j<l;j++)v=(v<<8)|buf[i+j];return v;}else if(t===0x43||t===0x41){let v=0;for(let j=0;j<l;j++)v=v*256+buf[i+j];return v;}i=s+l;}return null;};
  try{return find(buf.length);}catch{return null;}
}

function snmpGet(ip,oid){
  return new Promise(r=>{
    const pdu=buildPDU(oid,'public'),sock=dgram.createSocket('udp4');
    let done=false;
    const t=setTimeout(()=>{if(!done){done=true;try{sock.close();}catch{}r(null);}},SNMP_TO);
    sock.on('message',m=>{if(!done){done=true;clearTimeout(t);try{sock.close();}catch{}r(parseResp(m));}});
    sock.on('error',()=>{if(!done){done=true;clearTimeout(t);r(null);}});
    sock.send(pdu,161,ip,e=>{if(e&&!done){done=true;clearTimeout(t);try{sock.close();}catch{}r(null);}});
  });
}

const fab=d=>{const u=(d||'').toUpperCase();if(u.includes('HP')||u.includes('HEWLETT'))return'HP';if(u.includes('KYOCERA'))return'KYOCERA';if(u.includes('RICOH'))return'RICOH';if(u.includes('XEROX'))return'XEROX';if(u.includes('CANON'))return'CANON';if(u.includes('KONICA')||u.includes('MINOLTA'))return'MINOLTA';if(u.includes('BROTHER'))return'BROTHER';if(u.includes('EPSON'))return'EPSON';return'OUTRO';};
const pct=(n,m)=>n===null||m===null||m<=0?null:n<0?0:Math.round(n/m*100);
const stTxt=v=>({1:'other',2:'unknown',3:'idle',4:'printing',5:'warmup'}[v]||'unknown');

async function coletarImp(ip){
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
  return{ip,descricao:desc,nome_rede:nr||'',fabricante:fab(desc),serial:ser||'',status:stTxt(sv),online:true,
    paginas_total:pt||0,paginas_pb:ppb||0,paginas_color:pc||0,
    toner:{preto,ciano,magenta,amarelo},drum_pct:drum,papel_nivel:pap,erros};
}

async function varrer(){
  const subs=descobrirSubnets();
  const ips=subs.flatMap(b=>{const r=[];for(let i=1;i<=254;i++)r.push(b+'.'+i);return r;});
  console.log('\\u{1F50D} Varrendo '+ips.length+' IPs em '+subs.length+' subnet(s)...');
  const LOTE=30,imps=[];
  for(let i=0;i<ips.length;i+=LOTE){
    const res=await Promise.all(ips.slice(i,i+LOTE).map(coletarImp));
    res.forEach(r=>{if(r){imps.push(r);console.log('  \\u2705 '+r.ip+' — '+r.fabricante+' '+r.descricao.slice(0,40));}});
    await new Promise(r=>setTimeout(r,100));
  }
  console.log('\\u{1F4CB} '+imps.length+' impressora(s) encontrada(s).');
  return imps;
}

function enviar(imps){
  return new Promise((res,rej)=>{
    const body=JSON.stringify({clientKey:CLIENT_KEY,hostname:os.hostname(),platform:os.platform()+' '+os.release(),agente_ver:'2.0.0',timestamp:new Date().toISOString(),impressoras:imps});
    const u=new URL(SERVER_URL+'/api/monitor/telemetria');
    const req=https.request({hostname:u.hostname,port:443,path:u.pathname,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d));}catch{res({ok:false});}});});
    req.on('error',rej);req.write(body);req.end();
  });
}

async function registrar(){
  return new Promise(res=>{
    const body=JSON.stringify({clientKey:CLIENT_KEY,hostname:os.hostname(),agente_ver:'2.0.0'});
    const u=new URL(SERVER_URL+'/api/monitor/registrar-agente');
    const req=https.request({hostname:u.hostname,port:443,path:u.pathname,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d));}catch{res({});}}); });
    req.on('error',()=>res({}));req.write(body);req.end();
  });
}

async function ciclo(){
  console.log('\\n['+new Date().toLocaleString('pt-BR')+'] — Iniciando coleta...');
  try{
    const imps=await varrer();
    const r=await enviar(imps);
    console.log('\\u{1F4E4} Enviado: '+(r.recebido??imps.length)+' impressora(s)');
  }catch(e){console.error('\\u274c Erro:',e.message);}
  console.log('\\u23f1 Próxima coleta em '+(CFG.intervalMin||15)+' min.');
}

(async()=>{
  console.log('\\u{1F5A8}  Orion Agente v2.0.0');
  console.log('   Servidor : '+SERVER_URL);
  console.log('   Cliente  : '+(CFG.clientNome||'—'));
  console.log('   Intervalo: '+(CFG.intervalMin||15)+' min');
  console.log('   Subnet   : '+(SUBNET_FIXO||'Auto RFC 1918'));
  const reg=await registrar();
  if(reg.ok)console.log('\\u2705 Registrado: '+reg.clientNome);
  await ciclo();
  setInterval(ciclo,INTERVAL);
})();
`.trim();

// ─── UPLOAD DO OrionAgente.exe (admin faz uma vez após compilar) ──────────────
// POST /api/monitor/upload-exe  (multipart, campo "exe")
// Sobe o .exe para o Cloudinary e salva a URL nas configurações do sistema.
app.post('/api/monitor/upload-exe', requireAuth, requireAdmin, upload.single('exe'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    if (!req.file.originalname.endsWith('.exe')) return res.status(400).json({ error: 'Envie um arquivo .exe.' });

    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'orion/agente', resource_type: 'raw', public_id: 'OrionAgente', overwrite: true },
        (err, result) => err ? reject(err) : resolve(result)
      );
      streamifier.createReadStream(req.file.buffer).pipe(stream);
    });

    await col('configuracoes').updateOne(
      { chave: 'agente_exe_url' },
      { $set: { chave: 'agente_exe_url', valor: uploadResult.secure_url, atualizado_em: now() } },
      { upsert: true }
    );

    res.json({ ok: true, url: uploadResult.secure_url, tamanho_mb: (req.file.size / 1024 / 1024).toFixed(1) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/monitor/exe-info — retorna URL e data do .exe atual
app.get('/api/monitor/exe-info', requireAuth, async (req, res) => {
  const cfg = await col('configuracoes').findOne({ chave: 'agente_exe_url' });
  res.json(cfg ? { url: cfg.valor, atualizado_em: cfg.atualizado_em } : { url: null });
});

// ─── DOWNLOAD DO PACOTE (ZIP com .exe + config.json personalizado) ────────────
// Rota principal: ZIP com agente + config personalizado do cliente
app.get('/download/pacote-agente/:clienteId', requireAuth, async (req, res) => {
  try {
    const cliente = await col('clientes').findOne({ _id: new ObjectId(req.params.clienteId) });
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
    if (!cliente.monitor_key) return res.status(400).json({ error: 'Este cliente não possui chave de monitoramento. Gere a chave primeiro.' });

    // Busca URL do .exe no Cloudinary
    const exeCfg = await col('configuracoes').findOne({ chave: 'agente_exe_url' });
    if (!exeCfg?.valor) {
      return res.status(400).json({
        error: 'O executável OrionAgente.exe ainda não foi enviado ao servidor. ' +
               'Compile o agente e faça o upload em: Configurações → Monitor → Enviar Executável.'
      });
    }

    const nomeSeguro = (cliente.nome || 'cliente').toLowerCase().replace(/[^a-z0-9]/g, '_');

    const config = {
      serverUrl:   'https://orion-at-production.up.railway.app',
      clientKey:   cliente.monitor_key,
      clientId:    cliente._id.toString(),
      clientNome:  cliente.nome,
      intervalMin: 15,
      subnet:      '',
      snmpTimeout: 3000,
      snmpRetries: 1,
    };

    // Baixa o .exe do Cloudinary (em memória)
    const exeBuffer = await new Promise((resolve, reject) => {
      https.get(exeCfg.valor, (r) => {
        const chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve(Buffer.concat(chunks)));
        r.on('error', reject);
      }).on('error', reject);
    });

    const LEIA_ME =
`Orion Agente — Pacote de Instalação
Cliente: ${cliente.nome}
Gerado em: ${new Date().toLocaleString('pt-BR')}

INSTALAÇÃO (apenas 2 passos):
  1. Extraia esta pasta para qualquer lugar do PC
  2. Clique com o botão direito em "OrionAgente.exe"
     → Executar como administrador → clique em "Mais informações" → "Executar assim mesmo"

  O instalador fará automaticamente:
    • Copia os arquivos para C:\\OrionAgente
    • Registra o agente como Serviço do Windows (sc.exe nativo)
    • Inicia o agente imediatamente
    • Configura inicialização automática com o Windows

COMANDOS ÚTEIS (após instalação):
  sc query OrionAgente          — verifica se o serviço está rodando
  sc stop  OrionAgente          — para o serviço
  sc start OrionAgente          — inicia o serviço

DESINSTALAÇÃO:
  OrionAgente.exe --uninstall   (como Administrador)

SUBNET (opcional):
  Edite C:\\OrionAgente\\config.json e preencha "subnet",
  ex: "192.168.5". Deixe vazio para descoberta automática.

Suporte: Orion Soluções — https://orion-at-production.up.railway.app
`;

    const arquivos = [
      { nome: 'OrionAgente.exe', conteudo: exeBuffer },
      { nome: 'config.json',     conteudo: Buffer.from(JSON.stringify(config, null, 2), 'utf8') },
      { nome: 'LEIA-ME.txt',     conteudo: Buffer.from(LEIA_ME, 'utf8') },
    ];

    const zip = gerarZip(arquivos);

    res.setHeader('Content-Disposition', `attachment; filename="orion-agente-${nomeSeguro}.zip"`);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', zip.length);
    res.send(zip);

  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ──────────────────────────────────────────────────────────────────────────────
// ROTA LEGADA — mantida apenas para não quebrar links antigos
// Substitui o antigo zip com .bat pelo novo zip com .exe
// (código abaixo pode ser removido após migração completa)
// Rota legada — ZIP com .bat (mantida temporariamente, use /download/pacote-agente)
app.get('/download/pacote-agente-legacy/:clienteId', requireAuth, async (req, res) => {
  try {
    const cliente = await col('clientes').findOne({ _id: new ObjectId(req.params.clienteId) });
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
    if (!cliente.monitor_key) return res.status(400).json({ error: 'Este cliente não possui chave de monitoramento. Gere a chave primeiro.' });

    const nomeSeguro = (cliente.nome || 'cliente').toLowerCase().replace(/[^a-z0-9]/g, '_');

    const config = {
      serverUrl:    'https://orion-at-production.up.railway.app',
      clientKey:    cliente.monitor_key,
      clientId:     cliente._id.toString(),
      clientNome:   cliente.nome,
      intervalMin:  15,
      subnet:       '',
      snmpTimeout:  3000,
      snmpRetries:  1,
    };

    const INSTALAR_BAT = `@echo off
chcp 65001 > nul
title Orion Agente — Instalador
color 0A

echo.
echo  ============================================
echo   ORION AGENTE — Instalador
echo   Cliente: ${cliente.nome}
echo  ============================================
echo.

:: Verifica se está rodando como Administrador
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo  [ERRO] Execute este arquivo como Administrador!
    echo  Clique com o botao direito ^> "Executar como administrador"
    echo.
    pause
    exit /b 1
)

:: Verifica se Node.js está instalado
echo  [1/4] Verificando Node.js...
where node >nul 2>&1
if %errorLevel% NEQ 0 (
    echo.
    echo  Node.js nao encontrado. Baixando instalador...
    echo  Aguarde, isso pode levar alguns minutos.
    echo.
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi' -OutFile '%TEMP%\\node_setup.msi'"
    if %errorLevel% NEQ 0 (
        echo  [ERRO] Falha ao baixar Node.js. Verifique sua conexao com a internet.
        pause
        exit /b 1
    )
    echo  Instalando Node.js...
    msiexec /i "%TEMP%\\node_setup.msi" /quiet /norestart
    del "%TEMP%\\node_setup.msi" >nul 2>&1
    :: Atualiza PATH da sessão atual
    set "PATH=%PATH%;C:\\Program Files\\nodejs"
    echo  Node.js instalado com sucesso!
) else (
    for /f "tokens=*" %%v in ('node --version') do echo  Node.js encontrado: %%v
)
echo.

:: Define pasta de instalação
set "INSTALL_DIR=C:\\OrionAgente"
echo  [2/4] Copiando arquivos para %INSTALL_DIR%...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
copy /Y "%~dp0orion-agente.js" "%INSTALL_DIR%\\" >nul
copy /Y "%~dp0config.json"     "%INSTALL_DIR%\\" >nul
echo  Arquivos copiados.
echo.

:: Instala pm2 globalmente
echo  [3/4] Instalando gerenciador de servico (pm2)...
where pm2 >nul 2>&1
if %errorLevel% NEQ 0 (
    call npm install -g pm2 --silent
    if %errorLevel% NEQ 0 (
        echo  [ERRO] Falha ao instalar pm2. Verifique sua conexao com a internet.
        pause
        exit /b 1
    )
)
echo  pm2 OK.
echo.

:: Inicia o agente e configura para iniciar com o Windows
echo  [4/4] Iniciando o agente e configurando inicializacao automatica...
cd /d "%INSTALL_DIR%"
call pm2 delete orion-agente >nul 2>&1
call pm2 start orion-agente.js --name orion-agente
call pm2 save

:: Registra pm2 como serviço do Windows via startup
call pm2 startup windows -u "%USERNAME%" --hp "%USERPROFILE%" >nul 2>&1

echo.
echo  ============================================
echo   INSTALACAO CONCLUIDA COM SUCESSO!
echo.
echo   O agente Orion esta rodando em segundo
echo   plano e iniciara automaticamente com
echo   o Windows.
echo.
echo   Para verificar o status:  pm2 status
echo   Para ver os logs:         pm2 logs orion-agente
echo   Para desinstalar:         execute desinstalar.bat
echo  ============================================
echo.
pause
`;

    const DESINSTALAR_BAT = `@echo off
chcp 65001 > nul
title Orion Agente — Desinstalador
color 0C

echo.
echo  ============================================
echo   ORION AGENTE — Desinstalador
echo   Cliente: ${cliente.nome}
echo  ============================================
echo.

net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo  [ERRO] Execute este arquivo como Administrador!
    pause
    exit /b 1
)

echo  Parando e removendo o agente...
call pm2 delete orion-agente >nul 2>&1
call pm2 save >nul 2>&1

echo  Removendo arquivos...
set "INSTALL_DIR=C:\\OrionAgente"
if exist "%INSTALL_DIR%" (
    rmdir /s /q "%INSTALL_DIR%"
    echo  Pasta %INSTALL_DIR% removida.
)

echo.
echo  ============================================
echo   Orion Agente removido com sucesso.
echo  ============================================
echo.
pause
`;

    const arquivos = [
      { nome: 'orion-agente.js',  conteudo: Buffer.from(AGENTE_JS, 'utf8') },
      { nome: 'config.json',      conteudo: Buffer.from(JSON.stringify(config, null, 2), 'utf8') },
      { nome: 'instalar.bat',     conteudo: Buffer.from(INSTALAR_BAT, 'utf8') },
      { nome: 'desinstalar.bat',  conteudo: Buffer.from(DESINSTALAR_BAT, 'utf8') },
      { nome: 'LEIA-ME.txt',      conteudo: Buffer.from(`Orion Agente (legado) — ${cliente.nome}\nUse o pacote .exe para instalação mais fácil.\n`, 'utf8') },
    ];

    const zip = gerarZip(arquivos);

    res.setHeader('Content-Disposition', `attachment; filename="orion-agente-bat-${nomeSeguro}.zip"`);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', zip.length);
    res.send(zip);

  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Rota legada mantida por compatibilidade (redireciona para explicação)
app.get('/download/agente/:clienteId?', requireAuth, async (req, res) => {
  try {

    const clienteId = req.params.clienteId || req.query.clienteId;

    if (!clienteId) {
      return res.status(400).json({
        error: 'Cliente ID obrigatório.'
      });
    }

    return res.redirect(`/download/pacote-agente/${clienteId}`);

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MONITORAMENTO DE IMPRESSORAS ───────────────────────────────────────────

app.post('/api/monitor/registrar-agente', async (req,res) => {
  try {
    const { clientKey, hostname, agente_ver } = req.body;
    if (!clientKey) return res.status(400).json({ error: 'Chave obrigatória' });
    const cliente = await col('clientes').findOne({ monitor_key: clientKey });
    if (!cliente) return res.status(403).json({ error: 'Chave inválida' });
    await col('clientes').updateOne({ _id: cliente._id }, { $set: { monitor_ativo: true, monitor_hostname: hostname||'', monitor_agente_ver: agente_ver||'', monitor_ultimo_registro: now() } });
    res.json({ ok: true, clientId: cliente._id.toString(), clientNome: cliente.nome });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/monitor/ping', (req,res) => {
  const key = req.headers['x-orion-key'] || req.query.key;
  res.json({ status: 'ok', timestamp: now(), key_recebida: !!key });
});

app.post('/api/monitor/telemetria', async (req,res) => {
  try {
    const { clientKey, clientId, hostname, platform, agente_ver, timestamp, impressoras } = req.body;
    if (!clientKey) return res.status(401).json({ error: 'Chave ausente.' });
    const cliente = await col('clientes').findOne({ monitor_key: clientKey });
    if (!cliente) return res.status(403).json({ error: 'Chave inválida.' });
    const cid = cliente._id.toString();
    await col('monitor_telemetria').insertOne({ cliente_id:cid, cliente_nome:cliente.nome, hostname:hostname||'', platform:platform||'', agente_ver:agente_ver||'', timestamp:timestamp||now(), impressoras:impressoras||[], created_at:now() });
    for (const imp of (impressoras||[])) {
      const filtro = { cliente_id:cid, ip: imp.ip||imp.nome||'' };
      await col('monitor_impressoras').updateOne(filtro, { $set:{ ...imp, cliente_id:cid, cliente_nome:cliente.nome, ultimo_contato:now(), online:true }}, { upsert:true });
      if (imp.toner?.preto !== null && imp.toner?.preto < 10) {
        await col('notificacoes').insertOne({ tipo:'critico', modulo:'monitor', titulo:`Toner crítico — ${cliente.nome}`, msg:`Impressora ${imp.ip||imp.nome} com toner preto em ${imp.toner.preto}%`, cliente_id:cid, lida:false, created_at:now() });
      }
      if (imp.erros?.length > 0) {
        await col('notificacoes').insertOne({ tipo:'aviso', modulo:'monitor', titulo:`Erro na impressora — ${cliente.nome}`, msg:`${imp.ip||imp.nome}: ${imp.erros.join(', ')}`, cliente_id:cid, lida:false, created_at:now() });
      }
    }
    const limite = new Date(Date.now() - 30*60*1000).toISOString();
    await col('monitor_impressoras').updateMany({ cliente_id:cid, ultimo_contato:{ $lt:limite } }, { $set:{ online:false } });
    res.json({ ok:true, recebido:(impressoras||[]).length });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/clientes/:id/monitor-key', requireAuth, requireAdmin, async (req,res) => {
  try {
    const key = require('crypto').randomBytes(24).toString('hex');
    await col('clientes').updateOne({ _id:new ObjectId(req.params.id) }, { $set:{ monitor_key:key, monitor_ativo:true, monitor_key_criada:now() } });
    res.json({ ok:true, key });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/monitor/impressoras', async (req,res) => {
  try {
    const { cliente_id } = req.query;
    const filtro = cliente_id ? { cliente_id } : {};
    const imps = await col('monitor_impressoras').find(filtro).sort({ ultimo_contato:-1 }).toArray();
    res.json(imps.map(i => ({ ...i, id:i._id.toString() })));
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/monitor/historico', async (req,res) => {
  try {
    const { cliente_id, ip, limit=30 } = req.query;
    const filtro = { cliente_id };
    if (ip) filtro['impressoras.ip'] = ip;
    const hist = await col('monitor_telemetria').find(filtro).sort({ created_at:-1 }).limit(parseInt(limit)).toArray();
    res.json(hist.map(h => ({ ...h, id:h._id.toString() })));
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/monitor/dashboard', async (req,res) => {
  try {
    const total     = await col('monitor_impressoras').countDocuments();
    const online    = await col('monitor_impressoras').countDocuments({ online:true });
    const offline   = await col('monitor_impressoras').countDocuments({ online:false });
    const tonerCrit = await col('monitor_impressoras').countDocuments({ 'toner.preto':{ $lt:10, $ne:null } });
    const comErro   = await col('monitor_impressoras').countDocuments({ erros:{ $exists:true, $not:{ $size:0 } } });
    const clientes  = await col('monitor_impressoras').distinct('cliente_id');
    res.json({ total, online, offline, toner_critico:tonerCrit, com_erro:comErro, clientes_monitorados:clientes.length });
  } catch(e) { res.status(500).json({ error:e.message }); }
});


// ─── SIMULADOR DE IMPRESSORAS ────────────────────────────────────────────────
app.post('/api/monitor/simular', async (req,res) => {
  try {
    const simuladas = [
      { ip:'192.168.1.10', fabricante:'HP',      descricao:'HP LaserJet Pro M404dn',          nome_rede:'HP-LASER-01',  serial:'VNB3Q12345', status:'idle',     online:true,  paginas_total:42850, paginas_pb:42100, paginas_color:750,   toner:{ preto:72, ciano:null, magenta:null, amarelo:null }, drum_pct:65, papel_nivel:80, erros:[] },
      { ip:'192.168.1.11', fabricante:'KYOCERA',  descricao:'Kyocera ECOSYS M2135dn',          nome_rede:'KYOCERA-02',   serial:'VCB9234567', status:'idle',     online:true,  paginas_total:98340, paginas_pb:97800, paginas_color:540,   toner:{ preto:8,  ciano:null, magenta:null, amarelo:null }, drum_pct:22, papel_nivel:40, erros:['toner-baixo'] },
      { ip:'192.168.1.12', fabricante:'MINOLTA',  descricao:'Konica Minolta bizhub C258',      nome_rede:'BIZHUB-03',    serial:'A6WM012345', status:'printing', online:true,  paginas_total:187650,paginas_pb:120000,paginas_color:67650, toner:{ preto:45, ciano:31,   magenta:28,  amarelo:55 },  drum_pct:58, papel_nivel:60, erros:[] },
      { ip:'192.168.1.13', fabricante:'RICOH',    descricao:'Ricoh MP 2014AD',                 nome_rede:'RICOH-04',     serial:'E194AB1234', status:'idle',     online:true,  paginas_total:23400, paginas_pb:23400, paginas_color:0,     toner:{ preto:91, ciano:null, magenta:null, amarelo:null }, drum_pct:88, papel_nivel:90, erros:[] },
      { ip:'192.168.1.14', fabricante:'XEROX',    descricao:'Xerox WorkCentre 3335',           nome_rede:'XEROX-05',     serial:'XRX3335001', status:'idle',     online:false, paginas_total:61200, paginas_pb:61200, paginas_color:0,     toner:{ preto:5,  ciano:null, magenta:null, amarelo:null }, drum_pct:12, papel_nivel:0,  erros:['offline','sem-papel','toner-baixo'] },
      { ip:'192.168.1.15', fabricante:'CANON',    descricao:'Canon imageRUNNER ADVANCE C3520', nome_rede:'CANON-06',     serial:'JPT0012345', status:'idle',     online:true,  paginas_total:54320, paginas_pb:38000, paginas_color:16320, toner:{ preto:62, ciano:47,   magenta:53,  amarelo:41 },  drum_pct:71, papel_nivel:55, erros:[] },
      { ip:'192.168.1.16', fabricante:'HP',       descricao:'HP Color LaserJet Pro M479fdw',   nome_rede:'HP-COLOR-07',  serial:'VNB9X54321', status:'idle',     online:true,  paginas_total:18750, paginas_pb:12000, paginas_color:6750,  toner:{ preto:33, ciano:19,   magenta:22,  amarelo:67 },  drum_pct:44, papel_nivel:70, erros:['toner-baixo'] },
      { ip:'192.168.1.17', fabricante:'KYOCERA',  descricao:'Kyocera TASKalfa 2553ci',         nome_rede:'KYOCERA-08',   serial:'VCA1234567', status:'warmup',   online:true,  paginas_total:231800,paginas_pb:198000,paginas_color:33800, toner:{ preto:58, ciano:44,   magenta:39,  amarelo:61 },  drum_pct:35, papel_nivel:85, erros:[] },
    ];
    const clientesFic = ['Empresa Alpha Ltda','Comércio Beta SA','Escritório Gamma','Indústria Delta'];
    for (let i=0; i < simuladas.length; i++) {
      const imp = simuladas[i];
      const cliNome = clientesFic[i % clientesFic.length];
      const cliId = `sim-${i % clientesFic.length}`;
      const filtro = { ip: imp.ip, cliente_id: cliId };
      await col('monitor_impressoras').updateOne(filtro, { $set:{ ...imp, cliente_id:cliId, cliente_nome:cliNome, ultimo_contato:now() }}, { upsert:true });
      for (let h=0; h<8; h++) {
        const ts = new Date(Date.now() - h*15*60*1000).toISOString();
        await col('monitor_telemetria').insertOne({ cliente_id:cliId, cliente_nome:cliNome, timestamp:ts, created_at:ts, impressoras:[{ ...imp, paginas_total: imp.paginas_total - h*15 }] });
      }
    }
    res.json({ ok:true, msg:`${simuladas.length} impressoras simuladas inseridas!` });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.delete('/api/monitor/simular', async (req,res) => {
  try {
    await col('monitor_impressoras').deleteMany({ cliente_id:{ $regex:'^sim-' } });
    await col('monitor_telemetria').deleteMany({ cliente_id:{ $regex:'^sim-' } });
    res.json({ ok:true, msg:'Dados simulados removidos.' });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/monitor', (req,res) => res.sendFile(path.join(__dirname,'public','monitor.html')));
app.get('/monitor/*', (req,res) => res.sendFile(path.join(__dirname,'public','monitor.html')));

// ─── ANEXOS DE OS (Cloudinary) ───────────────────────────────────────────────

// Upload de foto/documento para uma OS
app.post('/api/ordens/:id/anexos', requireAuth, upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const osId = req.params.id;
    const os = await col('ordens').findOne({ _id: new ObjectId(osId) });
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });

    // Comprime imagem se for foto (reduz para max 1200px, qualidade 80)
    const isImage = req.file.mimetype.startsWith('image/');
    const folder  = `orion/os/${os.num || osId}`;

    const uploadResult = await new Promise((resolve, reject) => {
      const opts = {
        folder,
        resource_type: isImage ? 'image' : 'raw',
        public_id: `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.]/g,'_')}`,
      };
      if (isImage) {
        opts.transformation = [{ width: 1200, crop: 'limit', quality: 80 }];
      }
      const stream = cloudinary.uploader.upload_stream(opts, (err, result) => {
        if (err) reject(err); else resolve(result);
      });
      streamifier.createReadStream(req.file.buffer).pipe(stream);
    });

    const anexo = {
      url:           uploadResult.secure_url,
      public_id:     uploadResult.public_id,
      nome:          req.file.originalname,
      tipo:          req.file.mimetype,
      tamanho:       req.file.size,
      resource_type: uploadResult.resource_type,
      criado_em:     now(),
      criado_por:    req.session.user?.nome || 'Sistema',
    };

    await col('ordens').updateOne(
      { _id: new ObjectId(osId) },
      { $push: { anexos: anexo } }
    );

    res.json({ ok: true, anexo });
  } catch (e) {
    console.error('Erro upload anexo:', e);
    res.status(500).json({ error: e.message });
  }
});

// Listar anexos de uma OS
app.get('/api/ordens/:id/anexos', requireAuth, async (req, res) => {
  try {
    const os = await col('ordens').findOne({ _id: new ObjectId(req.params.id) }, { projection: { anexos: 1, num: 1 } });
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });
    res.json(os.anexos || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Deletar um anexo
app.delete('/api/ordens/:id/anexos/:public_id', requireAuth, async (req, res) => {
  try {
    const publicId = decodeURIComponent(req.params.public_id);
    // Remove do Cloudinary
    try { await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' }); } catch (_) {}
    try { await cloudinary.uploader.destroy(publicId, { resource_type: 'image' }); } catch (_) {}
    // Remove do MongoDB
    await col('ordens').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $pull: { anexos: { public_id: publicId } } }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Buscar OS por número com anexos
app.get('/api/ordens/buscar/:num', requireAuth, async (req, res) => {
  try {
    const os = await col('ordens').findOne({ num: req.params.num.toUpperCase() });
    if (!os) return res.status(404).json({ error: 'OS não encontrada' });
    res.json({ ...os, id: os._id.toString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ROTAS FINAIS ────────────────────────────────────────────────────────────
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

connectDB().then(()=>app.listen(PORT,()=>console.log(`Orion Print v4 MongoDB porta ${PORT}`))).catch(e=>{console.error('Erro DB:',e);process.exit(1);});
