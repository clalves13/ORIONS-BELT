const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://clairton_db_user:Ita722018@cluster0.uy61dew.mongodb.net/theikos_at?appName=Cluster0';
const JWT_SECRET = process.env.JWT_SECRET || 'theikos_secret_2026';
const MASTER_HASH = bcrypt.hashSync('churrasquinho@26', 10);

let db;

async function connectDB() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db('theikos_at');
    console.log('✅ MongoDB conectado');
    
    // Criar admin se não existir
    const adminExists = await db.collection('users').findOne({ login: 'admin' });
    if (!adminExists) {
        await db.collection('users').insertOne({
            login: 'admin',
            nome: 'Administrador',
            senha_hash: bcrypt.hashSync('admin123', 10),
            role: 'admin',
            ativo: 1
        });
        console.log('✅ Admin criado');
    }
    
    // Garantir coleções existem
    const collections = ['tecnicos', 'clientes', 'equipamentos', 'atendimentos', 'ordens', 'laboratorio', 'historico', 'estoque', 'supr_cli', 'supr_movs'];
    for (const coll of collections) {
        const exists = await db.listCollections({ name: coll }).hasNext();
        if (!exists) await db.createCollection(coll);
    }
    
    await db.collection('counter').updateOne({ _id: 'os' }, { $setOnInsert: { valor: 0 } }, { upsert: true });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Middleware JWT
function auth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        res.status(401).json({ error: 'Token inválido' });
    }
}

// LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const { login, senha } = req.body;
        
        // Master
        if (login === 'master' && bcrypt.compareSync(senha, MASTER_HASH)) {
            const token = jwt.sign({ id: 'master', login: 'master', nome: 'Master', role: 'admin' }, JWT_SECRET, { expiresIn: '30d' });
            return res.json({ token, user: { id: 'master', login: 'master', nome: 'Master', role: 'admin' } });
        }
        
        // Admin
        if (login === 'admin' && senha === 'admin123') {
            const token = jwt.sign({ id: 'admin', login: 'admin', nome: 'Administrador', role: 'admin' }, JWT_SECRET, { expiresIn: '30d' });
            return res.json({ token, user: { id: 'admin', login: 'admin', nome: 'Administrador', role: 'admin' } });
        }
        
        // Outros usuários
        const user = await db.collection('users').findOne({ login, ativo: 1 });
        if (!user || !bcrypt.compareSync(senha, user.senha_hash)) {
            return res.status(401).json({ error: 'Usuário ou senha incorretos' });
        }
        
        const token = jwt.sign({ id: user._id.toString(), login: user.login, nome: user.nome, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, user: { id: user._id.toString(), login: user.login, nome: user.nome, role: user.role } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/me', auth, (req, res) => {
    res.json(req.user);
});

// ========== TÉCNICOS ==========
app.get('/api/tecnicos', auth, async (req, res) => {
    try {
        const tecnicos = await db.collection('tecnicos').find().toArray();
        res.json(tecnicos.map(t => ({ ...t, id: t._id.toString() })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tecnicos', auth, async (req, res) => {
    try {
        console.log('Recebendo POST /tecnicos:', req.body);
        const { nome, tel, email } = req.body;
        
        if (!nome || nome.trim() === '') {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }
        
        const result = await db.collection('tecnicos').insertOne({
            nome: nome.trim(),
            tel: tel || '',
            email: email || '',
            created_at: new Date()
        });
        
        res.json({ id: result.insertedId.toString(), nome, tel, email });
    } catch (err) {
        console.error('Erro ao salvar técnico:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tecnicos/:id', auth, async (req, res) => {
    try {
        const { nome, tel, email } = req.body;
        await db.collection('tecnicos').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { nome, tel: tel || '', email: email || '' } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tecnicos/:id', auth, async (req, res) => {
    try {
        await db.collection('tecnicos').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== CLIENTES ==========
app.get('/api/clientes', auth, async (req, res) => {
    try {
        const clientes = await db.collection('clientes').find().toArray();
        res.json(clientes.map(c => ({ ...c, id: c._id.toString() })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/clientes', auth, async (req, res) => {
    try {
        const { nome, end, cidade, cep, contato, tel, email, obs } = req.body;
        if (!nome || nome.trim() === '') {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }
        const result = await db.collection('clientes').insertOne({
            nome: nome.trim(),
            end_logradouro: end || '',
            cidade: cidade || '',
            cep: cep || '',
            contato: contato || '',
            tel: tel || '',
            email: email || '',
            obs: obs || '',
            created_at: new Date()
        });
        res.json({ id: result.insertedId.toString() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/clientes/:id', auth, async (req, res) => {
    try {
        const { nome, end, cidade, cep, contato, tel, email, obs } = req.body;
        await db.collection('clientes').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { nome, end_logradouro: end || '', cidade: cidade || '', cep: cep || '', contato: contato || '', tel: tel || '', email: email || '', obs: obs || '' } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/clientes/:id', auth, async (req, res) => {
    try {
        await db.collection('clientes').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== EQUIPAMENTOS ==========
app.get('/api/equipamentos', auth, async (req, res) => {
    try {
        const equipamentos = await db.collection('equipamentos').find().toArray();
        res.json(equipamentos.map(e => ({ ...e, id: e._id.toString() })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/equipamentos', auth, async (req, res) => {
    try {
        const { clienteId, nome, marca, modelo, nserie, contador, dataInst, contrato, local, status, obs } = req.body;
        if (!clienteId || !nome) {
            return res.status(400).json({ error: 'Cliente e nome são obrigatórios' });
        }
        const result = await db.collection('equipamentos').insertOne({
            cliente_id: clienteId,
            nome: nome.trim(),
            marca: marca || '',
            modelo: modelo || '',
            nserie: nserie || '',
            contador: contador || 0,
            data_inst: dataInst || '',
            contrato_ate: contrato || '',
            localizacao: local || '',
            status: status || 'Ativo',
            obs: obs || '',
            created_at: new Date()
        });
        res.json({ id: result.insertedId.toString() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/equipamentos/:id', auth, async (req, res) => {
    try {
        const { clienteId, nome, marca, modelo, nserie, contador, dataInst, contrato, local, status, obs } = req.body;
        await db.collection('equipamentos').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { cliente_id: clienteId, nome, marca: marca || '', modelo: modelo || '', nserie: nserie || '', contador: contador || 0, data_inst: dataInst || '', contrato_ate: contrato || '', localizacao: local || '', status: status || 'Ativo', obs: obs || '' } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/equipamentos/:id', auth, async (req, res) => {
    try {
        await db.collection('equipamentos').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== ATENDIMENTOS ==========
app.get('/api/atendimentos', auth, async (req, res) => {
    try {
        const atendimentos = await db.collection('atendimentos').find().toArray();
        res.json(atendimentos.map(a => ({ ...a, id: a._id.toString() })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/atendimentos', auth, async (req, res) => {
    try {
        const b = req.body;
        const total = (b.viag || 0) + (b.alim || 0) + (b.hosp || 0) + (b.comb || 0) + (b.ped || 0) + (b.outros || 0);
        const result = await db.collection('atendimentos').insertOne({
            ...b,
            total,
            created_at: new Date()
        });
        res.json({ id: result.insertedId.toString() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/atendimentos/:id', auth, async (req, res) => {
    try {
        const b = req.body;
        const total = (b.viag || 0) + (b.alim || 0) + (b.hosp || 0) + (b.comb || 0) + (b.ped || 0) + (b.outros || 0);
        await db.collection('atendimentos').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { ...b, total } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/atendimentos/:id', auth, async (req, res) => {
    try {
        await db.collection('atendimentos').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== ORDENS DE SERVIÇO ==========
app.get('/api/ordens', auth, async (req, res) => {
    try {
        const ordens = await db.collection('ordens').find().toArray();
        res.json(ordens.map(o => ({ ...o, id: o._id.toString() })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ordens', auth, async (req, res) => {
    try {
        const b = req.body;
        const counter = await db.collection('counter').findOneAndUpdate(
            { _id: 'os' },
            { $inc: { valor: 1 } },
            { returnDocument: 'after', upsert: true }
        );
        const num = `OS-${new Date().getFullYear()}-${String(counter.valor).padStart(4, '0')}`;
        const total = (b.viag || 0) + (b.alim || 0) + (b.hosp || 0) + (b.comb || 0) + (b.ped || 0) + (b.outros || 0);
        
        const result = await db.collection('ordens').insertOne({
            ...b,
            num,
            total_os: total,
            status: 'Aberta',
            created_at: new Date()
        });
        
        res.json({ id: result.insertedId.toString(), num });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/ordens/:id', auth, async (req, res) => {
    try {
        const b = req.body;
        const total = (b.viag || 0) + (b.alim || 0) + (b.hosp || 0) + (b.comb || 0) + (b.ped || 0) + (b.outros || 0);
        await db.collection('ordens').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { ...b, total_os: total } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/ordens/:id', auth, async (req, res) => {
    try {
        await db.collection('ordens').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== LABORATÓRIO ==========
app.get('/api/laboratorio', auth, async (req, res) => {
    try {
        const labs = await db.collection('laboratorio').find().toArray();
        res.json(labs.map(l => ({ ...l, id: l._id.toString() })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/laboratorio', auth, async (req, res) => {
    try {
        const result = await db.collection('laboratorio').insertOne({
            ...req.body,
            created_at: new Date()
        });
        res.json({ id: result.insertedId.toString() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/laboratorio/:id', auth, async (req, res) => {
    try {
        await db.collection('laboratorio').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: req.body }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/laboratorio/:id', auth, async (req, res) => {
    try {
        await db.collection('laboratorio').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== HISTÓRICO ==========
app.get('/api/historico', auth, async (req, res) => {
    try {
        const historico = await db.collection('historico').find().toArray();
        res.json(historico.map(h => ({ ...h, id: h._id.toString() })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== DASHBOARD ==========
app.get('/api/dashboard', auth, async (req, res) => {
    try {
        const [atendimentos, ordens, laboratorio] = await Promise.all([
            db.collection('atendimentos').find().toArray(),
            db.collection('ordens').find().toArray(),
            db.collection('laboratorio').find().toArray()
        ]);
        
        res.json({
            total_atend: atendimentos.length,
            os_abertas: ordens.filter(o => o.status === 'Aberta' || o.status === 'Em andamento').length,
            os_concluidas: ordens.filter(o => o.status === 'Concluída').length,
            total_lab: laboratorio.length,
            por_tecnico: [],
            gastos: { viag: 0, alim: 0, hosp: 0, comb: 0, ped: 0, outros: 0 },
            retrabalho: []
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Servir frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Servidor rodando na porta ${PORT}`);
        console.log(`📝 Acesse: http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Erro ao conectar MongoDB:', err);
    process.exit(1);
});