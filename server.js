const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { Pool } = require('pg');

const app = express();
const SECRET_KEY = 'rpg-secret-key-2024';

// Прямое подключение к PostgreSQL
const pool = new Pool({
    host: 'db.ujoacgyobabcslptdmpq.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'rpg_user',
    password: 'RpgPass123',
    ssl: { rejectUnauthorized: false }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) return cb(null, true);
        cb(new Error('Только изображения!'));
    }
});

// Создание таблиц при запуске
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'player',
                player_characters INTEGER[] DEFAULT '{}'
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS characters (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                system TEXT DEFAULT 'DnD 5e',
                class TEXT DEFAULT 'Не указан',
                race TEXT DEFAULT 'Не указана',
                level INTEGER DEFAULT 1,
                exp INTEGER DEFAULT 0,
                dt INTEGER DEFAULT 0,
                info TEXT DEFAULT '',
                equipment TEXT DEFAULT '',
                avatar TEXT DEFAULT NULL
            )
        `);
        
        // Создаём админа
        const adminExists = await pool.query("SELECT id FROM users WHERE username = 'admin'");
        if (adminExists.rows.length === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await pool.query("INSERT INTO users (username, password, role) VALUES ($1, $2, $3)", 
                ['admin', hashedPassword, 'admin']);
            console.log('✅ Админ создан: admin / admin123');
        }
        console.log('✅ База данных готова');
    } catch (error) {
        console.error('Ошибка инициализации БД:', error.message);
    }
}
initDB();

// РЕГИСТРАЦИЯ
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.json({ success: false, message: 'Заполните все поля' });
        if (password.length < 4) return res.json({ success: false, message: 'Пароль минимум 4 символа' });

        const exists = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
        if (exists.rows.length > 0) return res.json({ success: false, message: 'Пользователь уже существует' });

        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query("INSERT INTO users (username, password, role) VALUES ($1, $2, $3)", 
            [username, hashedPassword, 'player']);

        res.json({ success: true, message: 'Регистрация успешна!' });
    } catch (error) {
        console.error('Ошибка регистрации:', error.message);
        res.json({ success: false, message: 'Ошибка регистрации' });
    }
});

// ВХОД
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
        
        if (result.rows.length === 0) return res.json({ success: false, message: 'Неверный логин или пароль' });
        
        const user = result.rows[0];
        if (!bcrypt.compareSync(password, user.password)) return res.json({ success: false, message: 'Неверный логин или пароль' });
        
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '30d' });
        res.json({ success: true, token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (error) {
        console.error('Ошибка входа:', error.message);
        res.json({ success: false, message: 'Ошибка входа' });
    }
});

// Проверка токена
function checkToken(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ message: 'Требуется авторизация' });
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ message: 'Сессия истекла' });
        req.user = user;
        next();
    });
}

function checkAdmin(req, res, next) {
    if (req.user.role !== 'admin') return res.json({ success: false, message: 'Только для администратора' });
    next();
}

function checkMaster(req, res, next) {
    if (req.user.role !== 'master' && req.user.role !== 'admin') return res.json({ success: false, message: 'Только для мастера' });
    next();
}

// Авто-вход
app.get('/api/me', checkToken, async (req, res) => {
    try {
        const result = await pool.query("SELECT id, username, role FROM users WHERE id = $1", [req.user.id]);
        if (result.rows.length === 0) return res.json({ success: false, message: 'Пользователь не найден' });
        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        res.json({ success: false, message: 'Ошибка' });
    }
});

// Все пользователи
app.get('/api/users', checkToken, checkAdmin, async (req, res) => {
    try {
        const result = await pool.query("SELECT id, username, role FROM users");
        res.json({ success: true, users: result.rows });
    } catch (error) {
        res.json({ success: false, message: 'Ошибка' });
    }
});

// Сделать мастером
app.post('/api/make-master', checkToken, checkAdmin, async (req, res) => {
    try {
        await pool.query("UPDATE users SET role = 'master' WHERE id = $1", [req.body.userId]);
        res.json({ success: true, message: 'Назначен мастером!' });
    } catch (error) {
        res.json({ success: false, message: 'Ошибка' });
    }
});

// Создать персонажа
app.post('/api/characters', checkToken, async (req, res) => {
    try {
        const { name, characterClass, race, system, info, equipment } = req.body;
        if (!name) return res.json({ success: false, message: 'Введите имя' });
        
        const count = await pool.query("SELECT COUNT(*) FROM characters WHERE user_id = $1", [req.user.id]);
        if (parseInt(count.rows[0].count) >= 10) return res.json({ success: false, message: 'Максимум 10 персонажей' });

        const result = await pool.query(
            "INSERT INTO characters (user_id, name, system, class, race, level, exp, dt, info, equipment) VALUES ($1, $2, $3, $4, $5, 1, 0, 0, $6, $7) RETURNING *",
            [req.user.id, name, system || 'DnD 5e', characterClass || 'Не указан', race || 'Не указана', info || '', equipment || '']
        );

        res.json({ success: true, message: 'Персонаж создан!', character: result.rows[0] });
    } catch (error) {
        console.error('Ошибка создания персонажа:', error.message);
        res.json({ success: false, message: 'Ошибка создания' });
    }
});

// Мои персонажи
app.get('/api/characters', checkToken, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM characters WHERE user_id = $1", [req.user.id]);
        res.json({ success: true, characters: result.rows });
    } catch (error) {
        res.json({ success: false, characters: [] });
    }
});

// Обновить персонажа
app.put('/api/characters/:id', checkToken, async (req, res) => {
    try {
        const charId = parseInt(req.params.id);
        const char = await pool.query("SELECT * FROM characters WHERE id = $1", [charId]);
        if (char.rows.length === 0) return res.json({ success: false, message: 'Не найден' });
        if (char.rows[0].user_id !== req.user.id) return res.json({ success: false, message: 'Не ваш персонаж' });

        const { name, characterClass, race, system, info, equipment } = req.body;
        await pool.query(
            "UPDATE characters SET name = $1, system = $2, class = $3, race = $4, info = $5, equipment = $6 WHERE id = $7",
            [name || char.rows[0].name, system || char.rows[0].system, characterClass || char.rows[0].class, 
             race || char.rows[0].race, info !== undefined ? info : char.rows[0].info, 
             equipment !== undefined ? equipment : char.rows[0].equipment, charId]
        );
        res.json({ success: true, message: 'Обновлено!' });
    } catch (error) {
        res.json({ success: false, message: 'Ошибка' });
    }
});

// Удалить персонажа
app.delete('/api/characters/:id', checkToken, async (req, res) => {
    try {
        const charId = parseInt(req.params.id);
        const char = await pool.query("SELECT * FROM characters WHERE id = $1", [charId]);
        if (char.rows.length === 0) return res.json({ success: false, message: 'Не найден' });
        if (req.user.role === 'player' && char.rows[0].user_id !== req.user.id) 
            return res.json({ success: false, message: 'Не ваш персонаж' });

        await pool.query("DELETE FROM characters WHERE id = $1", [charId]);
        res.json({ success: true, message: 'Удалён!' });
    } catch (error) {
        res.json({ success: false, message: 'Ошибка' });
    }
});

// Количество персонажей
app.get('/api/character-count', checkToken, async (req, res) => {
    try {
        const count = await pool.query("SELECT COUNT(*) FROM characters WHERE user_id = $1", [req.user.id]);
        res.json({ success: true, count: parseInt(count.rows[0].count), max: 10 });
    } catch (error) {
        res.json({ success: true, count: 0, max: 10 });
    }
});

// Мастер: свои персонажи
app.get('/api/master-characters', checkToken, checkMaster, async (req, res) => {
    try {
        const user = await pool.query("SELECT player_characters FROM users WHERE id = $1", [req.user.id]);
        if (!user.rows[0].player_characters || user.rows[0].player_characters.length === 0) 
            return res.json({ success: true, characters: [] });
        
        const chars = await pool.query("SELECT * FROM characters WHERE id = ANY($1)", [user.rows[0].player_characters]);
        res.json({ success: true, characters: chars.rows });
    } catch (error) {
        res.json({ success: true, characters: [] });
    }
});

// Мастер: все персонажи
app.get('/api/all-characters', checkToken, checkMaster, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM characters");
        res.json({ success: true, characters: result.rows });
    } catch (error) {
        res.json({ success: true, characters: [] });
    }
});

// Мастер: добавить персонажа
app.post('/api/add-character-to-master', checkToken, checkMaster, async (req, res) => {
    try {
        const user = await pool.query("SELECT player_characters FROM users WHERE id = $1", [req.user.id]);
        let chars = user.rows[0].player_characters || [];
        if (chars.includes(req.body.characterId)) return res.json({ success: false, message: 'Уже добавлен' });
        chars.push(req.body.characterId);
        await pool.query("UPDATE users SET player_characters = $1 WHERE id = $2", [chars, req.user.id]);
        res.json({ success: true, message: 'Добавлен!' });
    } catch (error) {
        res.json({ success: false, message: 'Ошибка' });
    }
});

// Мастер: обновить статы
app.post('/api/update-character-stats', checkToken, checkMaster, async (req, res) => {
    try {
        const { characterId, level, exp, dt } = req.body;
        if (level !== undefined && level !== null) 
            await pool.query("UPDATE characters SET level = $1 WHERE id = $2", [level, characterId]);
        if (exp !== undefined && exp !== null) 
            await pool.query("UPDATE characters SET exp = $1 WHERE id = $2", [exp, characterId]);
        if (dt !== undefined && dt !== null) 
            await pool.query("UPDATE characters SET dt = $1 WHERE id = $2", [dt, characterId]);
        res.json({ success: true, message: 'Обновлено!' });
    } catch (error) {
        res.json({ success: false, message: 'Ошибка' });
    }
});

// Загрузка фото
app.post('/api/upload-avatar/:id', checkToken, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) return res.json({ success: false, message: 'Файл не загружен' });
        const avatar = '/uploads/' + req.file.filename;
        await pool.query("UPDATE characters SET avatar = $1 WHERE id = $2", [avatar, parseInt(req.params.id)]);
        res.json({ success: true, avatar, message: 'Фото обновлено!' });
    } catch (error) {
        res.json({ success: false, message: 'Ошибка' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('🎮 RPG Manager запущен!');
    console.log('🔑 Админ: admin / admin123');
});