const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const SECRET_KEY = 'rpg-secret-key-2024';

// Supabase настройки
const SUPABASE_URL = 'https://ujoacgyobabcslptdmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqb2FjZ3lvYmFiY3NscHRkbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyODY5NTYsImV4cCI6MjA5NDg2Mjk1Nn0.oL8hjnH6y_84Bc2Nw06Ixnny0LmU-4PR2aM4VS1c4jI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Загрузка фото
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Только изображения!'));
    }
});

// РЕГИСТРАЦИЯ
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.json({ success: false, message: 'Заполните все поля' });
    }

    if (password.length < 4) {
        return res.json({ success: false, message: 'Пароль минимум 4 символа' });
    }

    // Проверяем существует ли пользователь
    const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .single();

    if (existing) {
        return res.json({ success: false, message: 'Пользователь уже существует' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const { error } = await supabase
        .from('users')
        .insert({
            username,
            password: hashedPassword,
            role: 'player'
        });

    if (error) {
        return res.json({ success: false, message: 'Ошибка регистрации' });
    }

    res.json({ success: true, message: 'Регистрация успешна!' });
});

// ВХОД
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

    if (!user) {
        return res.json({ success: false, message: 'Неверный логин или пароль' });
    }
    
    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
        return res.json({ success: false, message: 'Неверный логин или пароль' });
    }
    
    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role }, 
        SECRET_KEY,
        { expiresIn: '30d' }
    );
    
    res.json({ 
        success: true, 
        token, 
        user: { id: user.id, username: user.username, role: user.role } 
    });
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
    if (req.user.role !== 'admin') {
        return res.json({ success: false, message: 'Только для администратора' });
    }
    next();
}

function checkMaster(req, res, next) {
    if (req.user.role !== 'master' && req.user.role !== 'admin') {
        return res.json({ success: false, message: 'Только для мастера' });
    }
    next();
}

// Авто-вход
app.get('/api/me', checkToken, async (req, res) => {
    const { data: user } = await supabase
        .from('users')
        .select('id, username, role')
        .eq('id', req.user.id)
        .single();

    if (!user) {
        return res.json({ success: false, message: 'Пользователь не найден' });
    }
    res.json({ success: true, user });
});

// Сделать мастером
app.post('/api/make-master', checkToken, checkAdmin, async (req, res) => {
    const { userId } = req.body;
    
    const { error } = await supabase
        .from('users')
        .update({ role: 'master' })
        .eq('id', userId);

    if (error) {
        return res.json({ success: false, message: 'Ошибка' });
    }
    res.json({ success: true, message: 'Пользователь назначен мастером!' });
});

// Все пользователи
app.get('/api/users', checkToken, checkAdmin, async (req, res) => {
    const { data: users } = await supabase
        .from('users')
        .select('id, username, role');

    res.json({ success: true, users });
});

// Загрузка фото
app.post('/api/upload-avatar/:id', checkToken, upload.single('avatar'), async (req, res) => {
    const charId = parseInt(req.params.id);
    
    const { data: character } = await supabase
        .from('characters')
        .select('*')
        .eq('id', charId)
        .single();

    if (!character) {
        return res.json({ success: false, message: 'Персонаж не найден' });
    }

    if (!req.file) {
        return res.json({ success: false, message: 'Файл не загружен' });
    }

    const avatar = '/uploads/' + req.file.filename;
    
    await supabase
        .from('characters')
        .update({ avatar })
        .eq('id', charId);

    res.json({ success: true, avatar, message: 'Фото обновлено!' });
});

// Создать персонажа
app.post('/api/characters', checkToken, async (req, res) => {
    const { name, characterClass, race, system, info, equipment } = req.body;

    // Проверка лимита
    const { count } = await supabase
        .from('characters')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.id);

    if (count >= 10) {
        return res.json({ success: false, message: 'Максимум 10 персонажей' });
    }

    if (!name) {
        return res.json({ success: false, message: 'Введите имя персонажа' });
    }

    const { data, error } = await supabase
        .from('characters')
        .insert({
            user_id: req.user.id,
            name,
            system: system || 'DnD 5e',
            class: characterClass || 'Не указан',
            race: race || 'Не указана',
            level: 1,
            exp: 0,
            dt: 0,
            info: info || '',
            equipment: equipment || ''
        })
        .select()
        .single();

    if (error) {
        return res.json({ success: false, message: 'Ошибка создания' });
    }

    res.json({ success: true, message: 'Персонаж создан!', character: data });
});

// Обновить персонажа
app.put('/api/characters/:id', checkToken, async (req, res) => {
    const charId = parseInt(req.params.id);
    
    const { data: character } = await supabase
        .from('characters')
        .select('*')
        .eq('id', charId)
        .single();

    if (!character) {
        return res.json({ success: false, message: 'Персонаж не найден' });
    }

    if (character.user_id !== req.user.id) {
        return res.json({ success: false, message: 'Это не ваш персонаж' });
    }

    const { name, characterClass, race, system, info, equipment } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (system) updates.system = system;
    if (characterClass) updates.class = characterClass;
    if (race) updates.race = race;
    if (info !== undefined) updates.info = info;
    if (equipment !== undefined) updates.equipment = equipment;

    await supabase
        .from('characters')
        .update(updates)
        .eq('id', charId);

    res.json({ success: true, message: 'Обновлено!' });
});

// Мои персонажи
app.get('/api/characters', checkToken, async (req, res) => {
    const { data: characters } = await supabase
        .from('characters')
        .select('*')
        .eq('user_id', req.user.id);

    res.json({ success: true, characters });
});

// Персонажи мастера
app.get('/api/master-characters', checkToken, checkMaster, async (req, res) => {
    const { data: user } = await supabase
        .from('users')
        .select('player_characters')
        .eq('id', req.user.id)
        .single();

    if (!user || !user.player_characters || user.player_characters.length === 0) {
        return res.json({ success: true, characters: [] });
    }

    const { data: characters } = await supabase
        .from('characters')
        .select('*')
        .in('id', user.player_characters);

    res.json({ success: true, characters });
});

// Все персонажи
app.get('/api/all-characters', checkToken, checkMaster, async (req, res) => {
    const { data: characters } = await supabase
        .from('characters')
        .select('*');

    res.json({ success: true, characters });
});

// Удалить персонажа
app.delete('/api/characters/:id', checkToken, async (req, res) => {
    const charId = parseInt(req.params.id);
    
    const { data: character } = await supabase
        .from('characters')
        .select('*')
        .eq('id', charId)
        .single();

    if (!character) {
        return res.json({ success: false, message: 'Персонаж не найден' });
    }

    if (req.user.role === 'player' && character.user_id !== req.user.id) {
        return res.json({ success: false, message: 'Это не ваш персонаж' });
    }

    const { error } = await supabase
        .from('characters')
        .delete()
        .eq('id', charId);

    if (error) {
        return res.json({ success: false, message: 'Ошибка удаления' });
    }

    res.json({ success: true, message: 'Персонаж удалён!' });
});

// Количество персонажей
app.get('/api/character-count', checkToken, async (req, res) => {
    const { count } = await supabase
        .from('characters')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.id);

    res.json({ success: true, count, max: 10 });
});

// Добавить персонажа мастеру
app.post('/api/add-character-to-master', checkToken, checkMaster, async (req, res) => {
    const { characterId } = req.body;
    
    const { data: user } = await supabase
        .from('users')
        .select('player_characters')
        .eq('id', req.user.id)
        .single();

    let chars = user.player_characters || [];
    if (chars.includes(characterId)) {
        return res.json({ success: false, message: 'Уже добавлен' });
    }

    chars.push(characterId);
    
    await supabase
        .from('users')
        .update({ player_characters: chars })
        .eq('id', req.user.id);

    res.json({ success: true, message: 'Персонаж добавлен!' });
});

// Обновить статы
app.post('/api/update-character-stats', checkToken, checkMaster, async (req, res) => {
    const { characterId, level, exp, dt } = req.body;

    const updates = {};
    if (level !== undefined && level !== null) updates.level = level;
    if (exp !== undefined && exp !== null) updates.exp = exp;
    if (dt !== undefined && dt !== null) updates.dt = dt;

    await supabase
        .from('characters')
        .update(updates)
        .eq('id', characterId);

    res.json({ success: true, message: 'Характеристики обновлены!' });
});

// Создаём админа при первом запуске
(async () => {
    const { data: admin } = await supabase
        .from('users')
        .select('id')
        .eq('username', 'admin')
        .single();

    if (!admin) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await supabase
            .from('users')
            .insert({
                username: 'admin',
                password: hashedPassword,
                role: 'admin'
            });
        console.log('✅ Админ создан: admin / admin123');
    }
})();

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('🎮 RPG Manager запущен!');
    console.log('🔑 Админ: admin / admin123');
});