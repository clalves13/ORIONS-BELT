const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');
const MongoStore = require('connect-mongo');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://clairton_db_user:Ita722018@cluster0.uy61dew.mongodb.net/?appName=Cluster0';
const MASTER_HASH = bcrypt.hashSync('churrasquinho@26', 10);

let db;
async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db('theikos_at');
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
  secret: process.env.SESSION_SECRET||'theikos2026',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI, dbName:'theikos_at', collectionName:'sessions', ttl: 24*60*60 }),
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
app.post('/api/clientes', requireAuth, async (req,res) => { const b=req.body; await col('clientes').insertOne({nome:b.nome,end_logradouro:b.end||'',cidade:b.cidade||'',cep:b.cep||'',contato:b.contato||'',tel:b.tel||'',email:b.email||'',obs:b.obs||'',created_at:now()}); res.json({ok:true}); });
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
    const result=await col('ordens').insertOne({num,data_ab:b.dataAb,tecnico_id:b.tecnicoId||'',cliente_id:b.clienteId,contato:b.contato||'',tel:b.tel||'',end_logradouro:b.end||'',equip_id:b.equipId||'',modelo:b.modelo||'',nserie:b.nserie||'',contador:b.contador||'',defeito:b.defeito||'',procedimento:b.procedimento||'',pecas:b.pecas||'',obs:b.obs||'',data_chamado:b.dataChamado||'',data_atend:b.dataAtend||'',hora_chegada:b.horaChegada||'',hora_saida:b.horaSaida||'',viag:b.viag||0,alim:b.alim||0,hosp:b.hosp||0,comb:b.comb||0,ped:b.ped||0,outros:b.outros||0,total_os:total,status:'Aberta',created_at:now()});
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
    await col('ordens').updateOne({_id:new ObjectId(req.params.id)},{$set:{data_ab:b.dataAb,tecnico_id:b.tecnicoId||'',cliente_id:b.clienteId,contato:b.contato||'',tel:b.tel||'',end_logradouro:b.end||'',equip_id:b.equipId||'',modelo:b.modelo||'',nserie:b.nserie||'',contador:b.contador||'',defeito:b.defeito||'',procedimento:b.procedimento||'',pecas:b.pecas||'',obs:b.obs||'',data_chamado:b.dataChamado||'',data_atend:b.dataAtend||'',hora_chegada:b.horaChegada||'',hora_saida:b.horaSaida||'',viag:b.viag||0,alim:b.alim||0,hosp:b.hosp||0,comb:b.comb||0,ped:b.ped||0,outros:b.outros||0,total_os:total,status:b.status||'Aberta',checklist:Array.isArray(b.checklist)?b.checklist:[],sig_tec:b.sig_tec||'',sig_cli:b.sig_cli||''}});
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

// LABORATORIO
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
    const [users,tecnicos,clientes,equipamentos,ordens,laboratorio,historico,estoque,suprCli,suprMovs,estMovs,lancamentos]=await Promise.all([
      col('users').find().toArray(),col('tecnicos').find().toArray(),col('clientes').find().toArray(),
      col('equipamentos').find().toArray(),col('ordens').find().toArray(),col('laboratorio').find().toArray(),col('logistica').find().toArray(),
      col('historico').find().toArray(),col('estoque').find().toArray(),col('supr_cli').find().toArray(),col('supr_movs').find().toArray(),
      col('estoque_movs').find().toArray(), col('lancamentos').find().toArray()
    ]);
    const backup={version:'5.0',gerado_em:now(),usuarios:users.map(u=>({...u,senha_hash:undefined})),tecnicos,clientes,equipamentos,ordens,laboratorio,historico,estoque,estoque_movs:estMovs,estoque_supr:suprCli,estoque_movs_supr:suprMovs,lancamentos_manuais:lancamentos};
    res.setHeader('Content-Disposition',`attachment; filename="theikos_backup_${new Date().toISOString().slice(0,10)}.json"`);
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

// ATENDIMENTOS alias (compatibilidade com ordens)
app.get('/api/atendimentos', requireAuth, async (req,res) => { const d=await col('ordens').find().sort({created_at:-1}).toArray(); res.json(d.map(x=>({...x,id:x._id.toString()}))); });
app.post('/api/atendimentos', requireAuth, async (req,res) => { try{ const b=req.body; const num=(await col('counter').findOneAndUpdate({_id:'os'},{$inc:{valor:1}},{upsert:true,returnDocument:'after'})).valor||1; const cliente=b.clienteId?await col('clientes').findOne({_id:new ObjectId(b.clienteId)}):null; const tecnico=b.tecnicoId?await col('tecnicos').findOne({_id:new ObjectId(b.tecnicoId)}):null; const total=(b.viag||0)+(b.alim||0)+(b.hosp||0)+(b.comb||0)+(b.ped||0)+(b.outros||0); await col('ordens').insertOne({num,data_ab:b.data||b.data_ab||'',tecnico_id:b.tecnicoId||'',cliente_id:b.clienteId||'',equip_id:b.equipId||'',contato:b.contato||'',tel:b.tel||'',end_logradouro:b.end||'',modelo:b.modelo||'',nserie:b.nserie||'',contador:b.contador||'',defeito:b.descricao||b.defeito||'',procedimento:b.procedimento||'',pecas:b.pecas||'',obs:b.obs||'',viag:b.viag||0,alim:b.alim||0,hosp:b.hosp||0,comb:b.comb||0,ped:b.ped||0,outros:b.outros||0,total,data_chamado:b.data_chamado||'',data_atend:b.data_atend||'',hora_chegada:b.hora_chegada||'',hora_saida:b.hora_saida||'',status:b.status||'Aberta',checklist:b.checklist||[],sig_tec:b.sig_tec||'',sig_cli:b.sig_cli||'',created_at:new Date().toISOString()}); if(b.status==='Concluída'||b.status==='Concluído'){await col('historico').insertOne({os_num:num,tipo:'os',data:b.data||b.data_ab||'',cliente:cliente?.nome||'',tecnico:tecnico?.nome||'',modelo:b.modelo||'',nserie:b.nserie||'',defeito:b.descricao||b.defeito||'',procedimento:b.procedimento||'',pecas:b.pecas||'',total,created_at:new Date().toISOString()});} res.json({ok:true,num});}catch(e){res.status(500).json({error:e.message});} });
app.put('/api/atendimentos/:id', requireAuth, async (req,res) => { try{ const b=req.body; const total=(b.viag||0)+(b.alim||0)+(b.hosp||0)+(b.comb||0)+(b.ped||0)+(b.outros||0); await col('ordens').updateOne({_id:new ObjectId(req.params.id)},{$set:{data_ab:b.data||b.data_ab||'',tecnico_id:b.tecnicoId||'',cliente_id:b.clienteId||'',equip_id:b.equipId||'',modelo:b.modelo||'',nserie:b.nserie||'',contador:b.contador||'',defeito:b.descricao||b.defeito||'',procedimento:b.procedimento||'',pecas:b.pecas||'',obs:b.obs||'',viag:b.viag||0,alim:b.alim||0,hosp:b.hosp||0,comb:b.comb||0,ped:b.ped||0,outros:b.outros||0,total,status:b.status||'Aberta',checklist:b.checklist||[],sig_tec:b.sig_tec||'',sig_cli:b.sig_cli||''}}); res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });
app.delete('/api/atendimentos/:id', requireAuth, async (req,res) => { try{await col('ordens').deleteOne({_id:new ObjectId(req.params.id)});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });


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
app.post('/api/forgot-password', async (req,res) => {
  try {
    const {login} = req.body;
    if(!login) return res.status(400).json({error:'Informe o login ou email.'});
    const user = await col('users').findOne({$or:[{login},{email:login}]});
    if(!user) return res.json({ok:true,msg:'Se o usuário existir, o email será enviado.'});
    const token = require('crypto').randomBytes(20).toString('hex');
    const expiry = Date.now() + 3600000; // 1h
    await col('users').updateOne({_id:user._id},{$set:{reset_token:token,reset_expiry:expiry}});
    // Tente enviar email se SMTP configurado
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    if(smtpUser && smtpPass) {
      try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({service:'gmail',auth:{user:smtpUser,pass:smtpPass}});
        const appUrl = process.env.APP_URL || 'https://theikos-at-production.up.railway.app';
        await transporter.sendMail({
          from:`"Theikós AT" <${smtpUser}>`,
          to: user.email || smtpUser,
          subject:'Redefinição de Senha — Theikós AT',
          html:`<p>Olá, <b>${user.nome}</b>!</p><p>Clique no link para redefinir sua senha:</p><p><a href="${appUrl}/reset?token=${token}">${appUrl}/reset?token=${token}</a></p><p>O link expira em 1 hora.</p>`
        });
        return res.json({ok:true,msg:'Email enviado! Verifique sua caixa de entrada.'});
      } catch(e) {
        console.error('Email error:',e.message);
      }
    }
    // Se não tem SMTP, retorna o token para exibir (modo dev)
    res.json({ok:true,token,msg:'SMTP não configurado. Token gerado: '+token});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/api/reset-password', async (req,res) => {
  try {
    const {token, nova_senha} = req.body;
    if(!token||!nova_senha) return res.status(400).json({error:'Dados inválidos.'});
    const user = await col('users').findOne({reset_token:token,reset_expiry:{$gt:Date.now()}});
    if(!user) return res.status(400).json({error:'Token inválido ou expirado.'});
    const bcrypt = require('bcryptjs');
    await col('users').updateOne({_id:user._id},{$set:{senha_hash:bcrypt.hashSync(nova_senha,10),$unset:{reset_token:'',reset_expiry:''}}});
    res.json({ok:true,msg:'Senha redefinida com sucesso!'});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Debug route
app.get('/api/test', (req,res) => res.json({ok:true, session: req.session.user || null}));

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

connectDB().then(()=>app.listen(PORT,()=>console.log(`Theikós AT v4 MongoDB porta ${PORT}`))).catch(e=>{console.error('Erro DB:',e);process.exit(1);});
