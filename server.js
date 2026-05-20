const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const SECRET_KEY = 'rpg-secret-key-2024';
const DATA_DIR = './data';

// Сохраняем копии данных в переменных
let usersBackup = [];
let charactersBackup = [];

// Создаём папку для данных если её нет
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Файлы для хранения данных
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json');

// Загружаем или создаём данные
function loadData(filePath, defaultValue = []) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(data);
            // Сохраняем в бекап
            if (filePath.includes('users')) usersBackup = parsed;
            if (filePath.includes('characters')) charactersBackup = parsed;
            return parsed;
        }
    } catch (error) {
        console.error(`Ошибка загрузки ${filePath}:`, error);
        // Если файл повреждён - восстанавливаем из бекапа
        if (filePath.includes('users') && usersBackup.length > 0) return usersBackup;
        if (filePath.includes('characters') && charactersBackup.length > 0) return charactersBackup;
    }
    return defaultValue;
}

function saveData(filePath, data) {
    try {
        // Сохраняем в бекап
        if (filePath.includes('users')) usersBackup = data;
        if (filePath.includes('characters')) charactersBackup = data;
        
        // Создаём папку если её нет
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error(`Ошибка сохранения ${filePath}:`, error);
    }
}

// Загружаем данные
let users = loadData(USERS_FILE);
let characters = loadData(CHARACTERS_FILE);

// Создаём админа если его нет
const adminExists = users.find(u => u.username === 'admin');
if (!adminExists) {
    const adminPassword = bcrypt.hashSync('admin123', 10);
    users.push({
        id: 1,
        username: 'admin',
        password: adminPassword,
        role: 'admin'
    });
    saveData(USERS_FILE, users);
    console.log('✅ Админ создан: admin / admin123');
}

// ID для новых записей
let nextUserId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
let nextCharId = characters.length > 0 ? Math.max(...characters.map(c => c.id)) + 1 : 1;

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Создаём папку для загрузок
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Загрузка изображений
const multer = require('multer');
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
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// РЕГИСТРАЦИЯ
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.json({ success: false, message: 'Заполните все поля' });
    }

    if (password.length < 4) {
        return res.json({ success: false, message: 'Пароль должен быть минимум 4 символа' });
    }

    if (users.find(u => u.username === username)) {
        return res.json({ success: false, message: 'Такой пользователь уже существует' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        id: nextUserId++,
        username,
        password: hashedPassword,
        role: 'player',
        playerCharacters: [] // персонажи, которые мастер добавил к себе
    };
    
    users.push(newUser);
    saveData(USERS_FILE, users);
    res.json({ success: true, message: 'Регистрация успешна! Теперь войдите в систему.' });
});

// ВХОД
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    const user = users.find(u => u.username === username);
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
        if (err) return res.status(403).json({ message: 'Сессия истекла, войдите заново' });
        req.user = user;
        next();
    });
}

// Проверка прав админа
function checkAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.json({ success: false, message: 'Только администратор может это делать' });
    }
    next();
}

// Проверка прав мастера или админа
function checkMaster(req, res, next) {
    if (req.user.role !== 'master' && req.user.role !== 'admin') {
        return res.json({ success: false, message: 'Только мастер может это делать' });
    }
    next();
}

// Автоматический вход
app.get('/api/me', checkToken, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (!user) {
        return res.json({ success: false, message: 'Пользователь не найден' });
    }
    res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
});

// Сделать пользователя мастером (только админ)
app.post('/api/make-master', checkToken, checkAdmin, (req, res) => {
    const { userId } = req.body;
    
    const user = users.find(u => u.id === userId);
    if (!user) {
        return res.json({ success: false, message: 'Пользователь не найден' });
    }
    
    user.role = 'master';
    saveData(USERS_FILE, users);
    res.json({ success: true, message: 'Пользователь назначен мастером!' });
});

// Получить всех пользователей (для админа)
app.get('/api/users', checkToken, checkAdmin, (req, res) => {
    const usersList = users.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role
    }));
    res.json({ success: true, users: usersList });
});

// Загрузка фото персонажа
app.post('/api/upload-avatar/:id', checkToken, upload.single('avatar'), (req, res) => {
    const charId = parseInt(req.params.id);
    const character = characters.find(c => c.id === charId);
    
    if (!character) {
        return res.json({ success: false, message: 'Персонаж не найден' });
    }
    
    if (character.user_id !== req.user.id && req.user.role !== 'master' && req.user.role !== 'admin') {
        return res.json({ success: false, message: 'Нет доступа' });
    }
    
    if (!req.file) {
        return res.json({ success: false, message: 'Файл не загружен' });
    }
    
    character.avatar = '/uploads/' + req.file.filename;
    saveData(CHARACTERS_FILE, characters);
    res.json({ success: true, avatar: character.avatar, message: 'Фото обновлено!' });
});

// Создать персонажа
app.post('/api/characters', checkToken, (req, res) => {
    const { name, characterClass, race, system, info, equipment } = req.body;
    
    // Проверка лимита
    const userCharCount = characters.filter(c => c.user_id === req.user.id).length;
    if (userCharCount >= 10) {
        return res.json({ success: false, message: 'Достигнут лимит: максимум 10 персонажей' });
    }
    
    if (!name) {
        return res.json({ success: false, message: 'Введите имя персонажа' });
    }
    
    const newCharacter = {
        id: nextCharId++,
        user_id: req.user.id,
        name,
        system: system || 'DnD 5e',
        class: characterClass || 'Не указан',
        race: race || 'Не указана',
        level: 1,
        exp: 0,
        dt: 0,
        info: info || '',
        equipment: equipment || '',
        avatar: null
    };
    
    characters.push(newCharacter);
    saveData(CHARACTERS_FILE, characters);
    res.json({ success: true, message: 'Персонаж создан!', character: newCharacter });
});

// Обновить персонажа
app.put('/api/characters/:id', checkToken, (req, res) => {
    const charId = parseInt(req.params.id);
    const character = characters.find(c => c.id === charId);
    
    if (!character) {
        return res.json({ success: false, message: 'Персонаж не найден' });
    }
    
    if (character.user_id !== req.user.id) {
        return res.json({ success: false, message: 'Это не ваш персонаж' });
    }
    
    const { name, characterClass, race, system, info, equipment } = req.body;
    
    if (name) character.name = name;
    if (system) character.system = system;
    if (characterClass) character.class = characterClass;
    if (race) character.race = race;
    if (info !== undefined) character.info = info;
    if (equipment !== undefined) character.equipment = equipment;
    
    saveData(CHARACTERS_FILE, characters);
    res.json({ success: true, message: 'Персонаж обновлён!', character });
});

// Получить своих персонажей
app.get('/api/characters', checkToken, (req, res) => {
    const myCharacters = characters.filter(c => c.user_id === req.user.id);
    res.json({ success: true, characters: myCharacters });
});

// Получить персонажей, которых мастер добавил к себе
app.get('/api/master-characters', checkToken, checkMaster, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.json({ success: false, characters: [] });
    
    const masterChars = characters.filter(c => user.playerCharacters && user.playerCharacters.includes(c.id));
    res.json({ success: true, characters: masterChars });
});

// Получить всех персонажей (для мастера и админа)
app.get('/api/all-characters', checkToken, checkMaster, (req, res) => {
    const allChars = characters.map(c => {
        const owner = users.find(u => u.id === c.user_id);
        return {
            ...c,
            username: owner ? owner.username : 'Неизвестный'
        };
    });
    res.json({ success: true, characters: allChars });
});
// Удалить персонажа
app.delete('/api/characters/:id', checkToken, (req, res) => {
    const charId = parseInt(req.params.id);
    const character = characters.find(c => c.id === charId);
    
    if (!character) {
        return res.json({ success: false, message: 'Персонаж не найден' });
    }
    
    // Игрок может удалить только своего, мастер и админ могут удалить любого
    if (req.user.role === 'player' && character.user_id !== req.user.id) {
        return res.json({ success: false, message: 'Это не ваш персонаж' });
    }
    
    // Удаляем аватар если есть
    if (character.avatar) {
        const avatarPath = path.join(__dirname, 'public', character.avatar);
        if (fs.existsSync(avatarPath)) {
            fs.unlinkSync(avatarPath);
        }
    }
    
    characters = characters.filter(c => c.id !== charId);
    saveData(CHARACTERS_FILE, characters);
    
    // Убираем персонажа из списков мастера
    users.forEach(user => {
        if (user.playerCharacters) {
            user.playerCharacters = user.playerCharacters.filter(id => id !== charId);
        }
    });
    saveData(USERS_FILE, users);
    
    res.json({ success: true, message: 'Персонаж удалён!' });
});

// Получить количество персонажей пользователя
app.get('/api/character-count', checkToken, (req, res) => {
    const count = characters.filter(c => c.user_id === req.user.id).length;
    res.json({ success: true, count, max: 10 });
});

// Мастер добавляет персонажа к себе по ID
app.post('/api/add-character-to-master', checkToken, checkMaster, (req, res) => {
    const { characterId } = req.body;
    const charId = parseInt(characterId);
    
    const character = characters.find(c => c.id === charId);
    if (!character) {
        return res.json({ success: false, message: 'Персонаж не найден' });
    }
    
    const user = users.find(u => u.id === req.user.id);
    if (!user.playerCharacters) {
        user.playerCharacters = [];
    }
    
    if (user.playerCharacters.includes(charId)) {
        return res.json({ success: false, message: 'Этот персонаж уже добавлен' });
    }
    
    user.playerCharacters.push(charId);
    saveData(USERS_FILE, users);
    res.json({ success: true, message: `Персонаж "${character.name}" добавлен к вам!` });
});

// Мастер убирает персонажа из своего списка
app.post('/api/remove-character-from-master', checkToken, checkMaster, (req, res) => {
    const { characterId } = req.body;
    const charId = parseInt(characterId);
    
    const user = users.find(u => u.id === req.user.id);
    if (!user || !user.playerCharacters) {
        return res.json({ success: false, message: 'Список пуст' });
    }
    
    user.playerCharacters = user.playerCharacters.filter(id => id !== charId);
    saveData(USERS_FILE, users);
    res.json({ success: true, message: 'Персонаж убран из списка' });
});

// Мастер обновляет уровень, опыт и ДТ
app.post('/api/update-character-stats', checkToken, checkMaster, (req, res) => {
    const { characterId, level, exp, dt } = req.body;
    const charId = parseInt(characterId);
    
    const character = characters.find(c => c.id === charId);
    if (!character) {
        return res.json({ success: false, message: 'Персонаж не найден' });
    }
    
    if (level !== undefined && level !== null) character.level = parseInt(level);
    if (exp !== undefined && exp !== null) character.exp = parseInt(exp);
    if (dt !== undefined && dt !== null) character.dt = parseInt(dt);
    
    saveData(CHARACTERS_FILE, characters);
    res.json({ 
        success: true, 
        message: 'Характеристики обновлены!',
        character
    });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log('🎮 RPG Manager запущен!');
    console.log(`📱 Локально: http://localhost:${PORT}`);
    console.log('🔑 Админ: admin / admin123');
    console.log('='.repeat(50));
});