const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const SECRET_KEY = 'rpg-secret-key-2024';
const DATA_DIR = './data';

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json');

function loadData(filePath, defaultValue = []) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (error) {}
    return defaultValue;
}

function saveData(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

let users = loadData(USERS_FILE);
let characters = loadData(CHARACTERS_FILE);

const adminExists = users.find(u => u.username === 'admin');
if (!adminExists) {
    users.push({ id: 1, username: 'admin', password: bcrypt.hashSync('admin123', 10), role: 'admin', playerCharacters: [] });
    saveData(USERS_FILE, users);
}

let nextUserId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
let nextCharId = characters.length > 0 ? Math.max(...characters.map(c => c.id)) + 1 : 1;

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, message: 'Заполните все поля' });
    if (password.length < 4) return res.json({ success: false, message: 'Пароль минимум 4 символа' });
    if (users.find(u => u.username === username)) return res.json({ success: false, message: 'Пользователь уже существует' });
    
    users.push({ id: nextUserId++, username, password: await bcrypt.hash(password, 10), role: 'player', playerCharacters: [] });
    saveData(USERS_FILE, users);
    res.json({ success: true, message: 'Регистрация успешна!' });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);
    if (!user || !bcrypt.compareSync(password, user.password)) return res.json({ success: false, message: 'Неверный логин или пароль' });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role } });
});

function checkToken(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ message: 'Требуется авторизация' });
    jwt.verify(token, SECRET_KEY, (err, user) => { if (err) return res.status(403).json({ message: 'Сессия истекла' }); req.user = user; next(); });
}

app.get('/api/me', checkToken, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
});

app.get('/api/users', checkToken, (req, res) => {
    if (req.user.role !== 'admin') return res.json({ success: false });
    res.json({ success: true, users: users.map(u => ({ id: u.id, username: u.username, role: u.role })) });
});

app.post('/api/make-master', checkToken, (req, res) => {
    if (req.user.role !== 'admin') return res.json({ success: false });
    const user = users.find(u => u.id === req.body.userId);
    if (user) { user.role = 'master'; saveData(USERS_FILE, users); }
    res.json({ success: true });
});

app.get('/api/characters', checkToken, (req, res) => {
    res.json({ success: true, characters: characters.filter(c => c.user_id === req.user.id) });
});

app.post('/api/characters', checkToken, (req, res) => {
    const { name, characterClass, race, system, info, equipment } = req.body;
    if (!name) return res.json({ success: false, message: 'Введите имя' });
    if (characters.filter(c => c.user_id === req.user.id).length >= 10) return res.json({ success: false, message: 'Максимум 10 персонажей' });
    
    const char = { id: nextCharId++, user_id: req.user.id, name, system: system || 'DnD 5e', class: characterClass || 'Не указан', race: race || 'Не указана', level: 1, exp: 0, dt: 0, info: info || '', equipment: equipment || '', avatar: null };
    characters.push(char);
    saveData(CHARACTERS_FILE, characters);
    res.json({ success: true, message: 'Персонаж создан!', character: char });
});

app.put('/api/characters/:id', checkToken, (req, res) => {
    const char = characters.find(c => c.id === parseInt(req.params.id));
    if (!char || char.user_id !== req.user.id) return res.json({ success: false, message: 'Не ваш персонаж' });
    const { name, characterClass, race, system, info, equipment } = req.body;
    if (name) char.name = name;
    if (system) char.system = system;
    if (characterClass) char.class = characterClass;
    if (race) char.race = race;
    if (info !== undefined) char.info = info;
    if (equipment !== undefined) char.equipment = equipment;
    saveData(CHARACTERS_FILE, characters);
    res.json({ success: true });
});

app.delete('/api/characters/:id', checkToken, (req, res) => {
    const char = characters.find(c => c.id === parseInt(req.params.id));
    if (!char) return res.json({ success: false });
    if (req.user.role === 'player' && char.user_id !== req.user.id) return res.json({ success: false });
    characters = characters.filter(c => c.id !== parseInt(req.params.id));
    saveData(CHARACTERS_FILE, characters);
    res.json({ success: true });
});

app.get('/api/master-characters', checkToken, (req, res) => {
    if (req.user.role !== 'master' && req.user.role !== 'admin') return res.json({ success: true, characters: [] });
    const user = users.find(u => u.id === req.user.id);
    const chars = characters.filter(c => user.playerCharacters && user.playerCharacters.includes(c.id));
    res.json({ success: true, characters: chars });
});

app.get('/api/all-characters', checkToken, (req, res) => {
    if (req.user.role !== 'master' && req.user.role !== 'admin') return res.json({ success: false });
    res.json({ success: true, characters });
});

app.post('/api/add-character-to-master', checkToken, (req, res) => {
    if (req.user.role !== 'master' && req.user.role !== 'admin') return res.json({ success: false });
    const user = users.find(u => u.id === req.user.id);
    if (!user.playerCharacters) user.playerCharacters = [];
    if (user.playerCharacters.includes(req.body.characterId)) return res.json({ success: false, message: 'Уже добавлен' });
    user.playerCharacters.push(req.body.characterId);
    saveData(USERS_FILE, users);
    res.json({ success: true });
});

app.post('/api/update-character-stats', checkToken, (req, res) => {
    if (req.user.role !== 'master' && req.user.role !== 'admin') return res.json({ success: false });
    const char = characters.find(c => c.id === req.body.characterId);
    if (char) {
        if (req.body.level !== undefined) char.level = req.body.level;
        if (req.body.exp !== undefined) char.exp = req.body.exp;
        if (req.body.dt !== undefined) char.dt = req.body.dt;
        saveData(CHARACTERS_FILE, characters);
    }
    res.json({ success: true });
});

app.post('/api/upload-avatar/:id', checkToken, upload.single('avatar'), (req, res) => {
    if (!req.file) return res.json({ success: false });
    const char = characters.find(c => c.id === parseInt(req.params.id));
    if (char) { char.avatar = '/uploads/' + req.file.filename; saveData(CHARACTERS_FILE, characters); }
    res.json({ success: true, avatar: char.avatar });
});

app.get('/api/character-count', checkToken, (req, res) => {
    res.json({ success: true, count: characters.filter(c => c.user_id === req.user.id).length, max: 10 });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log('🎮 RPG Manager запущен!'));