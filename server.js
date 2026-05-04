const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://clairton_db_user:Ita722018@cluster0.uy61dew.mongodb.net/theikos_at?appName=Cluster0';
const JWT_SECRET = process.env.JWT_SECRET || 'theikos_jwt_secret_2026_master';
const MASTER_PASSWORD = 'churrasquinho@26';
const MASTER_HASH = bcrypt.hashSync(MASTER_PASSWORD, 10);

let db;

async function connectDB() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db('theikos_at');
    console.log('✅ MongoDB conectado!');

    // Criar admin se não existir
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    const adminExists = await db.collection('users').findOne({ login: 'admin' });
    if (!adminExists) {
        await db.collection('users').insertOne({
            login: 'admin',
            nome: 'Administrador',
            senha_hash: bcrypt.hashSync(adminPass, 10),
            role: 'admin',
            ativo: 1,
            created_at: new Date()
        });
        console.log('✅ Usuário admin criado');
    }

    // Garantir contador de OS
    await db.collection('counter').updateOne({ _id: 'os' }, { $setOnInsert: { valor: 0 } }, { upsert: true });
    console.log('✅ Índices verificados');
}

// Middlewares
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS para permitir requisições do frontend
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Helper functions
const now = () => new Date().toISOString();
const col = (name) => db.collection(name);

// Middleware de autenticação JWT
function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado. Necessário perfil de administrador.' });
    }
    next();
}

// ==================== AUTH ====================
app.post('/api/login', async (req, res) => {
    try {
        const { login, senha } = req.body;

        // Senha coringa (master)
        if (login === 'master' && bcrypt.compareSync(senha, MASTER_HASH)) {
            const token = jwt.sign(
                { id: 'master', login: 'master', nome: 'Master Admin', role: 'admin' },
                JWT_SECRET,
                { expiresIn: '30d' }
            );
            return res.json({
                token,
                user: { id: 'master', login: 'master', nome: 'Master Admin', role: 'admin' }
            });
        }

        // Login normal
        const user = await col('users').findOne({ login, ativo: 1 });
        if (!user) {
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }

        const senhaValida = bcrypt.compareSync(senha, user.senha_hash);
        if (!senhaValida) {
            return res.status(401).json({ error: 'Senha incorreta' });
        }

        const token = jwt.sign(
            { id: user._id.toString(), login: user.login, nome: user.nome, role: user.role },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            token,
            user: { id: user._id.toString(), login: user.login, nome: user.nome, role: user.role }
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});

// ==================== USUÁRIOS (só admin) ====================
app.get('/api/users', auth, requireAdmin, async (req, res) => {
    try {
        const users = await col('users').find({}, { projection: { senha_hash: 0 } }).toArray();
        res.json(users.map(u => ({ ...u, id: u._id.toString() })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users', auth, requireAdmin, async (req, res) => {
    try {
        const { login, nome, senha, role, ativo } = req.body;
        if (!login || !nome || !senha) {
            return res.status(400).json({ error: 'Login, nome e senha são obrigatórios' });
        }

        const exists = await col('users').findOne({ login });
        if (exists) {
            return res.status(400).json({ error: 'Login já existe' });
        }

        const result = await col('users').insertOne({
            login,
            nome,
            senha_hash: bcrypt.hashSync(senha, 10),
            role: role || 'tecnico',
            ativo: ativo !== undefined ? ativo : 1,
            created_at: now()
        });

        res.json({ id: result.insertedId.toString(), login, nome, role });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/users/:id', auth, requireAdmin, async (req, res) => {
    try {
        const { nome, login, senha, role, ativo } = req.body;
        const update = { nome, login, role, ativo };
        if (senha) update.senha_hash = bcrypt.hashSync(senha, 10);

        await col('users').updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/users/:id', auth, requireAdmin, async (req, res) => {
    try {
        if (req.params.id === 'admin') {
            return res.status(400).json({ error: 'Não é possível excluir o usuário admin' });
        }
        await col('users').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== TÉCNICOS ====================
app.get('/api/tecnicos', auth, async (req, res) => {
    try {
        const tecnicos = await col('tecnicos').find().toArray();
        res.json(tecnicos.map(t => ({ ...t, id: t._id.toString() })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/tecnicos', auth, async (req, res) => {
    try {
        const { nome, tel, email } = req.body;
        if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
        const result = await col('tecnicos').insertOne({ nome, tel: tel || '', email: email || '', created_at: now() });
        res.json({ id: result.insertedId.toString(), nome, tel, email });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/tecnicos/:id', auth, async (req, res) => {
    try {
        const { nome, tel, email } = req.body;
        await col('tecnicos').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { nome, tel: tel || '', email: email || '' } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/tecnicos/:id', auth, async (req, res) => {
    try {
        await col('tecnicos').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== CLIENTES ====================
app.get('/api/clientes', auth, async (req, res) => {
    try {
        const clientes = await col('clientes').find().toArray();
        res.json(clientes.map(c => ({ ...c, id: c._id.toString() })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/clientes', auth, async (req, res) => {
    try {
        const { nome, end, cidade, cep, contato, tel, email, obs } = req.body;
        if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
        const result = await col('clientes').insertOne({
            nome, end_logradouro: end || '', cidade: cidade || '', cep: cep || '',
            contato: contato || '', tel: tel || '', email: email || '', obs: obs || '', created_at: now()
        });
        res.json({ id: result.insertedId.toString() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/clientes/:id', auth, async (req, res) => {
    try {
        const { nome, end, cidade, cep, contato, tel, email, obs } = req.body;
        await col('clientes').updateOne({ _id: new ObjectId(req.params.id) }, {
            $set: { nome, end_logradouro: end || '', cidade: cidade || '', cep: cep || '',
                    contato: contato || '', tel: tel || '', email: email || '', obs: obs || '' }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/clientes/:id', auth, async (req, res) => {
    try {
        await col('clientes').deleteOne({ _id: new ObjectId(req.params.id) });
        await col('equipamentos').deleteMany({ cliente_id: req.params.id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== EQUIPAMENTOS ====================
app.get('/api/equipamentos', auth, async (req, res) => {
    try {
        const equipamentos = await col('equipamentos').find().toArray();
        res.json(equipamentos.map(e => ({ ...e, id: e._id.toString() })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/equipamentos', auth, async (req, res) => {
    try {
        const { clienteId, nome, marca, modelo, nserie, contador, dataInst, contrato, local, status, obs } = req.body;
        if (!clienteId || !nome) return res.status(400).json({ error: 'Cliente e nome são obrigatórios' });
        const result = await col('equipamentos').insertOne({
            cliente_id: clienteId, nome, marca: marca || '', modelo: modelo || '', nserie: nserie || '',
            contador: contador || 0, data_inst: dataInst || '', contrato_ate: contrato || '',
            localizacao: local || '', status: status || 'Ativo', obs: obs || '', created_at: now()
        });
        res.json({ id: result.insertedId.toString() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/equipamentos/:id', auth, async (req, res) => {
    try {
        const { clienteId, nome, marca, modelo, nserie, contador, dataInst, contrato, local, status, obs } = req.body;
        await col('equipamentos').updateOne({ _id: new ObjectId(req.params.id) }, {
            $set: { cliente_id: clienteId, nome, marca: marca || '', modelo: modelo || '', nserie: nserie || '',
                    contador: contador || 0, data_inst: dataInst || '', contrato_ate: contrato || '',
                    localizacao: local || '', status: status || 'Ativo', obs: obs || '' }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/equipamentos/:id', auth, async (req, res) => {
    try {
        await col('equipamentos').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== ATENDIMENTOS ====================
app.get('/api/atendimentos', auth, async (req, res) => {
    try {
        const atendimentos = await col('atendimentos').find().sort({ data: -1 }).toArray();
        res.json(atendimentos.map(a => ({ ...a, id: a._id.toString() })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/atendimentos', auth, async (req, res) => {
    try {
        const b = req.body;
        const total = (b.viag || 0) + (b.alim || 0) + (b.hosp || 0) + (b.comb || 0) + (b.ped || 0) + (b.outros || 0);
        const result = await col('atendimentos').insertOne({
            data: b.data, hora: b.hora, tecnico_id: b.tecnicoId, cliente_id: b.clienteId,
            equip_id: b.equipId, modelo: b.modelo, nserie: b.nserie, contador: b.contador,
            descricao: b.descricao, pecas: b.pecas, viag: b.viag || 0, alim: b.alim || 0,
            hosp: b.hosp || 0, comb: b.comb || 0, ped: b.ped || 0, outros: b.outros || 0,
            total, status: b.status, obs: b.obs, created_at: now()
        });
        res.json({ id: result.insertedId.toString() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/atendimentos/:id', auth, async (req, res) => {
    try {
        const b = req.body;
        const total = (b.viag || 0) + (b.alim || 0) + (b.hosp || 0) + (b.comb || 0) + (b.ped || 0) + (b.outros || 0);
        await col('atendimentos').updateOne({ _id: new ObjectId(req.params.id) }, {
            $set: { data: b.data, hora: b.hora, tecnico_id: b.tecnicoId, cliente_id: b.clienteId,
                    equip_id: b.equipId, modelo: b.modelo, nserie: b.nserie, contador: b.contador,
                    descricao: b.descricao, pecas: b.pecas, viag: b.viag || 0, alim: b.alim || 0,
                    hosp: b.hosp || 0, comb: b.comb || 0, ped: b.ped || 0, outros: b.outros || 0,
                    total, status: b.status, obs: b.obs }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/atendimentos/:id', auth, async (req, res) => {
    try {
        await col('atendimentos').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== ORDENS DE SERVIÇO ====================
app.get('/api/ordens', auth, async (req, res) => {
    try {
        const ordens = await col('ordens').find().sort({ data_ab: -1 }).toArray();
        res.json(ordens.map(o => ({ ...o, id: o._id.toString() })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/ordens', auth, async (req, res) => {
    try {
        const b = req.body;
        const counter = await col('counter').findOneAndUpdate(
            { _id: 'os' },
            { $inc: { valor: 1 } },
            { returnDocument: 'after', upsert: true }
        );
        const num = `OS-${new Date().getFullYear()}-${String(counter.valor).padStart(4, '0')}`;
        const total = (b.viag || 0) + (b.alim || 0) + (b.hosp || 0) + (b.comb || 0) + (b.ped || 0) + (b.outros || 0);

        const result = await col('ordens').insertOne({
            num, data_ab: b.dataAb, tecnico_id: b.tecnicoId || '', cliente_id: b.clienteId,
            contato: b.contato || '', tel: b.tel || '', end_logradouro: b.end || '',
            equip_id: b.equipId || '', modelo: b.modelo || '', nserie: b.nserie || '',
            contador: b.contador || '', defeito: b.defeito || '', procedimento: b.procedimento || '',
            pecas: b.pecas || '', obs: b.obs || '', data_chamado: b.dataChamado || '',
            data_atend: b.dataAtend || '', hora_chegada: b.horaChegada || '', hora_saida: b.horaSaida || '',
            viag: b.viag || 0, alim: b.alim || 0, hosp: b.hosp || 0, comb: b.comb || 0,
            ped: b.ped || 0, outros: b.outros || 0, total_os: total, status: 'Aberta', created_at: now()
        });

        // Salvar no histórico
        const cliente = await col('clientes').findOne({ _id: new ObjectId(b.clienteId) });
        await col('historico').insertOne({
            tipo: 'chamado', os_id: result.insertedId.toString(), os_num: num, data: b.dataAb,
            cliente: cliente?.nome || '', tecnico: '', modelo: b.modelo || '',
            nserie: b.nserie || '', contador: b.contador || '', defeito: b.defeito || '',
            procedimento: '', pecas: '', status: 'Aberta', created_at: now()
        });

        res.json({ id: result.insertedId.toString(), num });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/ordens/:id', auth, async (req, res) => {
    try {
        const b = req.body;
        const old = await col('ordens').findOne({ _id: new ObjectId(req.params.id) });
        const total = (b.viag || 0) + (b.alim || 0) + (b.hosp || 0) + (b.comb || 0) + (b.ped || 0) + (b.outros || 0);

        await col('ordens').updateOne({ _id: new ObjectId(req.params.id) }, {
            $set: { data_ab: b.dataAb, tecnico_id: b.tecnicoId || '', cliente_id: b.clienteId,
                    contato: b.contato || '', tel: b.tel || '', end_logradouro: b.end || '',
                    equip_id: b.equipId || '', modelo: b.modelo || '', nserie: b.nserie || '',
                    contador: b.contador || '', defeito: b.defeito || '', procedimento: b.procedimento || '',
                    pecas: b.pecas || '', obs: b.obs || '', data_chamado: b.dataChamado || '',
                    data_atend: b.dataAtend || '', hora_chegada: b.horaChegada || '', hora_saida: b.horaSaida || '',
                    viag: b.viag || 0, alim: b.alim || 0, hosp: b.hosp || 0, comb: b.comb || 0,
                    ped: b.ped || 0, outros: b.outros || 0, total_os: total, status: b.status || 'Aberta' }
        });

        if (old && old.status !== 'Concluída' && b.status === 'Concluída') {
            const os = await col('ordens').findOne({ _id: new ObjectId(req.params.id) });
            const cliente = await col('clientes').findOne({ _id: new ObjectId(os.cliente_id) });
            await col('historico').insertOne({
                tipo: 'atendimento', os_id: os._id.toString(), os_num: os.num, data: b.dataAtend || b.dataAb,
                cliente: cliente?.nome || '', tecnico: '', modelo: os.modelo || '',
                nserie: os.nserie || '', contador: os.contador || '', defeito: os.defeito || '',
                procedimento: b.procedimento || '', pecas: b.pecas || '', status: 'Concluída', created_at: now()
            });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/ordens/:id', auth, async (req, res) => {
    try {
        await col('ordens').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== LABORATÓRIO ====================
app.get('/api/laboratorio', auth, async (req, res) => {
    try {
        const labs = await col('laboratorio').find().sort({ data_entrada: -1 }).toArray();
        res.json(labs.map(l => ({ ...l, id: l._id.toString() })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/laboratorio', auth, async (req, res) => {
    try {
        const b = req.body;
        const total = (b.gPecas || 0) + (b.gSupr || 0) + (b.gOutros || 0);
        const result = await col('laboratorio').insertOne({
            data_entrada: b.dataEntrada, data_saida: b.dataSaida || '', tecnico_id: b.tecnicoId || '',
            nome: b.nome, marca: b.marca || '', modelo: b.modelo || '', nserie: b.nserie || '',
            contador_entrada: b.contadorEntrada || '', tempo_horas: b.tempoHoras || 0,
            problemas: b.problemas || '', procedimento: b.procedimento || '',
            pecas: b.pecas || '', suprimentos: b.suprimentos || '',
            g_pecas: b.gPecas || 0, g_supr: b.gSupr || 0, g_outros: b.gOutros || 0,
            total, checklist: b.checklist || [], status_final: b.statusFinal || '',
            obs: b.obs || '', created_at: now()
        });
        res.json({ id: result.insertedId.toString() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/laboratorio/:id', auth, async (req, res) => {
    try {
        const b = req.body;
        const total = (b.gPecas || 0) + (b.gSupr || 0) + (b.gOutros || 0);
        await col('laboratorio').updateOne({ _id: new ObjectId(req.params.id) }, {
            $set: { data_entrada: b.dataEntrada, data_saida: b.dataSaida || '', tecnico_id: b.tecnicoId || '',
                    nome: b.nome, marca: b.marca || '', modelo: b.modelo || '', nserie: b.nserie || '',
                    contador_entrada: b.contadorEntrada || '', tempo_horas: b.tempoHoras || 0,
                    problemas: b.problemas || '', procedimento: b.procedimento || '',
                    pecas: b.pecas || '', suprimentos: b.suprimentos || '',
                    g_pecas: b.gPecas || 0, g_supr: b.gSupr || 0, g_outros: b.gOutros || 0,
                    total, checklist: b.checklist || [], status_final: b.statusFinal || '', obs: b.obs || '' }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/laboratorio/:id', auth, async (req, res) => {
    try {
        await col('laboratorio').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== HISTÓRICO ====================
app.get('/api/historico', auth, async (req, res) => {
    try {
        const historico = await col('historico').find().sort({ created_at: -1 }).toArray();
        res.json(historico.map(h => ({ ...h, id: h._id.toString() })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== ESTOQUE ====================
app.get('/api/estoque', auth, async (req, res) => {
    try {
        const estoque = await col('estoque').find().sort({ categoria: 1, nome: 1 }).toArray();
        res.json(estoque.map(e => ({ ...e, id: e._id.toString() })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/estoque', auth, async (req, res) => {
    try {
        const b = req.body;
        if (!b.nome) return res.status(400).json({ error: 'Nome é obrigatório' });
        const result = await col('estoque').insertOne({
            nome: b.nome, categoria: b.categoria || 'Peça', marca: b.marca || '',
            modelo_compat: b.modeloCompat || '', condicao: b.condicao || 'Nova',
            testada: b.testada ? 1 : 0, quantidade: b.quantidade || 0,
            quantidade_min: b.quantidadeMin || 1, custo: b.custo || 0,
            localizacao: b.localizacao || '', obs: b.obs || '', created_at: now()
        });
        res.json({ id: result.insertedId.toString() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/estoque/:id', auth, async (req, res) => {
    try {
        const b = req.body;
        await col('estoque').updateOne({ _id: new ObjectId(req.params.id) }, {
            $set: { nome: b.nome, categoria: b.categoria || 'Peça', marca: b.marca || '',
                    modelo_compat: b.modeloCompat || '', condicao: b.condicao || 'Nova',
                    testada: b.testada ? 1 : 0, quantidade: b.quantidade || 0,
                    quantidade_min: b.quantidadeMin || 1, custo: b.custo || 0,
                    localizacao: b.localizacao || '', obs: b.obs || '' }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/estoque/:id', auth, async (req, res) => {
    try {
        await col('estoque').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== SUPRIMENTOS CLIENTE ====================
app.get('/api/estoque-supr', auth, async (req, res) => {
    try {
        const supr = await col('supr_cli').find().toArray();
        const clientes = await col('clientes').find().toArray();
        res.json(supr.map(s => ({
            ...s, id: s._id.toString(),
            cliente_nome: clientes.find(c => c._id.toString() === s.cliente_id)?.nome || ''
        })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/estoque-supr/:clienteId', auth, async (req, res) => {
    try {
        let row = await col('supr_cli').findOne({ cliente_id: req.params.clienteId });
        if (!row) {
            await col('supr_cli').insertOne({
                cliente_id: req.params.clienteId,
                toner_preto: 0, toner_magenta: 0, toner_ciano: 0, toner_amarelo: 0, grampos: 0
            });
            row = await col('supr_cli').findOne({ cliente_id: req.params.clienteId });
        }
        const mov = await col('supr_movs').find({ cliente_id: req.params.clienteId }).sort({ created_at: -1 }).limit(50).toArray();
        res.json({
            estoque: { ...row, id: row._id.toString() },
            movimentos: mov.map(m => ({ ...m, id: m._id.toString() }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/estoque-supr/:clienteId/movimento', auth, async (req, res) => {
    try {
        const { tipo, item, quantidade, data, tecnicoId, obs } = req.body;
        const cid = req.params.clienteId;
        const valid = ['toner_preto', 'toner_magenta', 'toner_ciano', 'toner_amarelo', 'grampos'];
        if (!valid.includes(item)) return res.status(400).json({ error: 'Item inválido' });

        let row = await col('supr_cli').findOne({ cliente_id: cid });
        if (!row) {
            await col('supr_cli').insertOne({ cliente_id: cid, toner_preto: 0, toner_magenta: 0, toner_ciano: 0, toner_amarelo: 0, grampos: 0 });
            row = await col('supr_cli').findOne({ cliente_id: cid });
        }

        const delta = tipo === 'entrada' ? (quantidade || 1) : -(quantidade || 1);
        const upd = {};
        upd[item] = Math.max(0, (row[item] || 0) + delta);
        await col('supr_cli').updateOne({ cliente_id: cid }, { $set: upd });

        const tecnico = tecnicoId ? await col('tecnicos').findOne({ _id: new ObjectId(tecnicoId) }) : null;
        await col('supr_movs').insertOne({
            cliente_id: cid, tipo, item, quantidade: quantidade || 1,
            data: data || new Date().toISOString().slice(0, 10),
            tecnico_id: tecnicoId || '', tecnico_nome: tecnico?.nome || '',
            obs: obs || '', created_at: now()
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== DASHBOARD ====================
app.get('/api/dashboard', auth, async (req, res) => {
    try {
        const [atendimentos, ordens, laboratorio, tecnicos, clientes] = await Promise.all([
            col('atendimentos').find().toArray(),
            col('ordens').find().toArray(),
            col('laboratorio').find().toArray(),
            col('tecnicos').find().toArray(),
            col('clientes').find().toArray()
        ]);

        const total_atend = atendimentos.length;
        const os_abertas = ordens.filter(o => o.status === 'Aberta' || o.status === 'Em andamento').length;
        const os_concluidas = ordens.filter(o => o.status === 'Concluída').length;
        const total_lab = laboratorio.length;

        // Atendimentos por técnico
        const tmap = {};
        atendimentos.forEach(a => {
            const t = tecnicos.find(x => x._id.toString() === a.tecnico_id);
            const nome = t?.nome || 'Sem técnico';
            tmap[nome] = (tmap[nome] || 0) + 1;
        });
        const por_tecnico = Object.entries(tmap).map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd);

        // Gastos
        const gastos = { viag: 0, alim: 0, hosp: 0, comb: 0, ped: 0, outros: 0 };
        atendimentos.forEach(a => {
            gastos.viag += a.viag || 0;
            gastos.alim += a.alim || 0;
            gastos.hosp += a.hosp || 0;
            gastos.comb += a.comb || 0;
            gastos.ped += a.ped || 0;
            gastos.outros += a.outros || 0;
        });

        // Retrabalho
        const nsmap = {};
        atendimentos.forEach(a => {
            if (!a.nserie) return;
            if (!nsmap[a.nserie]) nsmap[a.nserie] = { nserie: a.nserie, modelo: a.modelo, qtd: 0, cliente_id: a.cliente_id };
            nsmap[a.nserie].qtd++;
        });
        const retrabalho = Object.values(nsmap).filter(x => x.qtd > 1).sort((a, b) => b.qtd - a.qtd).slice(0, 10);

        res.json({ total_atend, os_abertas, os_concluidas, total_lab, por_tecnico, gastos, retrabalho });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== BACKUP ====================
app.get('/api/backup', auth, requireAdmin, async (req, res) => {
    try {
        const [usuarios, tecnicos, clientes, equipamentos, atendimentos, ordens, laboratorio, historico, estoque, suprCli, suprMovs] = await Promise.all([
            col('users').find().toArray(), col('tecnicos').find().toArray(), col('clientes').find().toArray(),
            col('equipamentos').find().toArray(), col('atendimentos').find().toArray(), col('ordens').find().toArray(),
            col('laboratorio').find().toArray(), col('historico').find().toArray(), col('estoque').find().toArray(),
            col('supr_cli').find().toArray(), col('supr_movs').find().toArray()
        ]);

        const backup = {
            version: '5.0',
            gerado_em: now(),
            usuarios: usuarios.map(u => ({ ...u, senha_hash: undefined })),
            tecnicos, clientes, equipamentos, atendimentos, ordens, laboratorio, historico, estoque,
            estoque_supr: suprCli, estoque_movs: suprMovs
        };

        res.setHeader('Content-Disposition', `attachment; filename="theikos_backup_${new Date().toISOString().slice(0, 10)}.json"`);
        res.json(backup);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/restore', auth, requireAdmin, async (req, res) => {
    try {
        const data = req.body;
        const collections = ['tecnicos', 'clientes', 'equipamentos', 'atendimentos', 'ordens', 'laboratorio', 'historico', 'estoque', 'supr_cli', 'supr_movs'];
        for (const coll of collections) {
            await col(coll).deleteMany({});
        }
        if (data.tecnicos) await col('tecnicos').insertMany(data.tecnicos);
        if (data.clientes) await col('clientes').insertMany(data.clientes);
        if (data.equipamentos) await col('equipamentos').insertMany(data.equipamentos);
        if (data.atendimentos) await col('atendimentos').insertMany(data.atendimentos);
        if (data.ordens) await col('ordens').insertMany(data.ordens);
        if (data.laboratorio) await col('laboratorio').insertMany(data.laboratorio);
        if (data.historico) await col('historico').insertMany(data.historico);
        if (data.estoque) await col('estoque').insertMany(data.estoque);
        if (data.estoque_supr) await col('supr_cli').insertMany(data.estoque_supr);
        if (data.estoque_movs) await col('supr_movs').insertMany(data.estoque_movs);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Servir frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Theikós AT rodando na porta ${PORT}`);
        console.log(`🔐 Acesse: http://localhost:${PORT}`);
        console.log(`👤 Usuário: admin | Senha: ${process.env.ADMIN_PASSWORD || 'admin123'}`);
    });
}).catch(err => {
    console.error('❌ Erro ao conectar no MongoDB:', err);
    process.exit(1);
});