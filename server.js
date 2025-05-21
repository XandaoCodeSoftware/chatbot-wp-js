// server.js
const express = require('express');
const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

let users = fs.existsSync('users.json') ? JSON.parse(fs.readFileSync('users.json')) : {};

const saveUsers = () => fs.writeFileSync('users.json', JSON.stringify(users, null, 2));

app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (users[username]) return res.status(400).json({ error: 'Usuário já existe' });

    const id = Date.now().toString();
    users[username] = { id, password, session: null, api_token: null, last_login: null };
    saveUsers();
    res.json({ message: 'Registrado com sucesso' });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users[username];
    if (!user || user.password !== password) return res.status(401).json({ error: 'Credenciais inválidas' });
    user.last_login = new Date().toISOString();
    saveUsers();
    res.json({ message: 'Login ok', id: user.id, username });
});

const clients = {};
const qrCodes = {};

app.get('/get-qr/:username', async (req, res) => {
    const username = req.params.username;
    if (!users[username]) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (qrCodes[username]) return res.json({ qr: qrCodes[username] });
    if (clients[username]) return res.json({ qr: qrCodes[username] });

    const client = new Client({ authStrategy: new LocalAuth({ clientId: username }) });
    clients[username] = client;

    let sent = false;
    client.on('qr', async qr => {
        if (sent) return;
        const qrImg = await qrcode.toDataURL(qr);
        qrCodes[username] = qrImg;
        res.json({ qr: qrImg });
        sent = true;
    });

    client.on('ready', () => {
        delete qrCodes[username];
        const API_TK = Math.random().toString(36).substring(2, 10);
        const API_USR = Buffer.from(users[username].id).toString('base64');
        users[username].session = true;
        users[username].api_token = API_TK;
        users[username].api_user = API_USR;
        users[username].last_login = new Date().toISOString();
        saveUsers();
        clients[API_USR] = client;
        console.log(`${username} logado com sucesso.`);
    });

    client.initialize();
});

app.get('/isready/:username', (req, res) => {
    const username = req.params.username;
    const user = users[username];
    res.json({ ready: user?.session ? true : false });
});

app.get('/api/:api_user/:phone/:api_token/:msg', (req, res) => {
    const { api_user, phone, api_token, msg } = req.params;
    const client = clients[api_user];

    if (!client) return res.status(403).json({ error: 'Sessão não encontrada' });
    const user = Object.values(users).find(u => u.api_user === api_user && u.api_token === api_token);
    if (!user) return res.status(401).json({ error: 'Token inválido' });

    client.sendMessage(`${phone}@c.us`, decodeURIComponent(msg))
        .then(() => res.json({ status: 'enviado' }))
        .catch(e => res.status(500).json({ error: 'Erro ao enviar', detail: e }));
});

app.get('/dashboard/:username', (req, res) => {
    const username = req.params.username;
    const user = users[username];
    if (!user || !user.api_user) return res.send('Usuário não logado ainda.');
    res.json({
        username,
        last_login: user.last_login,
        api_user: user.api_user,
        api_token: user.api_token,
        example: `/api/${user.api_user}/5511999999999/${user.api_token}/Sua%20mensagem`
    });
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
