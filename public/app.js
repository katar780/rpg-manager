let token = localStorage.getItem('rpg_token') || '';
let currentUser = null;

function goToAuth() {
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'block';
}

// Автоматический вход при загрузке страницы
window.onload = async function() {
    if (token) {
        try {
            const response = await fetch('/api/me', {
                headers: { 'Authorization': token }
            });
            
            const data = await response.json();
            
            if (data.success) {
                currentUser = data.user;
                showScreen();
            } else {
                localStorage.removeItem('rpg_token');
                token = '';
            }
        } catch (error) {
            console.error('Ошибка авто-входа:', error);
            localStorage.removeItem('rpg_token');
            token = '';
        }
    }
};

// Показать вкладку
function showTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    document.getElementById('login-form').style.display = tabName === 'login' ? 'block' : 'none';
    document.getElementById('register-form').style.display = tabName === 'register' ? 'block' : 'none';
}

// Показать сообщение
function showMessage(elementId, text, type) {
    const el = document.getElementById(elementId);
    el.textContent = text;
    el.className = 'message ' + type;
    setTimeout(() => {
        el.textContent = '';
        el.className = 'message';
    }, 5000);
}

// Регистрация
async function register() {
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    
    if (!username || !password) {
        showMessage('reg-message', 'Заполните все поля', 'error');
        return;
    }
    
    if (password.length < 4) {
        showMessage('reg-message', 'Пароль должен быть минимум 4 символа', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('reg-message', data.message, 'success');
            setTimeout(() => {
                document.getElementById('reg-username').value = '';
                document.getElementById('reg-password').value = '';
                document.querySelectorAll('.tab')[0].click();
                showTab('login');
            }, 1500);
        } else {
            showMessage('reg-message', data.message, 'error');
        }
    } catch (error) {
        showMessage('reg-message', 'Ошибка соединения', 'error');
    }
}

// Вход
async function login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!username || !password) {
        showMessage('login-message', 'Заполните все поля', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            token = data.token;
            currentUser = data.user;
            localStorage.setItem('rpg_token', token);
            showScreen();
        } else {
            showMessage('login-message', data.message, 'error');
        }
    } catch (error) {
        showMessage('login-message', 'Ошибка соединения', 'error');
    }
}

// Показать нужный экран
function showScreen() {
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('player-screen').style.display = 'none';
    document.getElementById('master-screen').style.display = 'none';
    document.getElementById('admin-screen').style.display = 'none';
    
    if (currentUser.role === 'admin') {
        document.getElementById('admin-screen').style.display = 'block';
        document.getElementById('admin-name').textContent = currentUser.username;
        loadUsers();
        loadAllCharactersAdmin();
        loadCharacterSelectAdmin();
    } else if (currentUser.role === 'master') {
        document.getElementById('master-screen').style.display = 'block';
        document.getElementById('master-name').textContent = currentUser.username;
        loadMasterCharacters();
        loadAllCharactersMaster();
        loadCharacterSelectMaster();
    } else {
        document.getElementById('player-screen').style.display = 'block';
        document.getElementById('player-name').textContent = currentUser.username;
        loadMyCharacters();
    }
}

// Выйти
function logout() {
    token = '';
    currentUser = null;
    localStorage.removeItem('rpg_token');
    
    document.getElementById('player-screen').style.display = 'none';
    document.getElementById('master-screen').style.display = 'none';
    document.getElementById('admin-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'block';
    
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
}

// Создать персонажа
async function createCharacter() {
    try {
        const countResponse = await fetch('/api/character-count', {
            headers: { 'Authorization': token }
        });
        const countData = await countResponse.json();
        
        if (countData.count >= countData.max) {
            alert(`Достигнут лимит персонажей (${countData.max}). Удалите ненужных чтобы создать новых.`);
            return;
        }
    } catch (error) {
        console.error('Ошибка проверки лимита:', error);
    }
    
    const name = document.getElementById('char-name').value.trim();
    const system = document.getElementById('char-system').value;
    const characterClass = document.getElementById('char-class').value.trim();
    const race = document.getElementById('char-race').value.trim();
    const info = document.getElementById('char-info').value.trim();
    const equipment = document.getElementById('char-equipment').value.trim();
    
    if (!name) {
        alert('Введите имя персонажа!');
        return;
    }
    
    try {
        const response = await fetch('/api/characters', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({ 
                name, characterClass, race, system, info, equipment
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('char-name').value = '';
            document.getElementById('char-class').value = '';
            document.getElementById('char-race').value = '';
            document.getElementById('char-info').value = '';
            document.getElementById('char-equipment').value = '';
            loadMyCharacters();
            alert(data.message || 'Персонаж создан!');
        } else {
            alert(data.message || 'Ошибка создания персонажа');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка соединения с сервером');
    }
}

// Показать модальное окно редактирования
function showEditModal(char) {
    const oldModal = document.querySelector('.edit-modal');
    if (oldModal) oldModal.remove();
    
    const modal = document.createElement('div');
    modal.className = 'edit-modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>✏️ Редактировать персонажа</h3>
            <label>Имя:</label>
            <input type="text" id="edit-name" value="${char.name || ''}">
            
            <label>Система:</label>
            <select id="edit-system">
                <option value="DnD 5e" ${char.system === 'DnD 5e' ? 'selected' : ''}>D&D 5e</option>
                <option value="Pathfinder 2e" ${char.system === 'Pathfinder 2e' ? 'selected' : ''}>Pathfinder 2e</option>
                <option value="Pathfinder 1e" ${char.system === 'Pathfinder 1e' ? 'selected' : ''}>Pathfinder 1e</option>
            </select>
            
            <label>Класс:</label>
            <input type="text" id="edit-class" value="${char.class || ''}">
            
            <label>Раса:</label>
            <input type="text" id="edit-race" value="${char.race || ''}">
            
            <label>Информация:</label>
            <textarea id="edit-info" rows="3">${char.info || ''}</textarea>
            
            <label>Снаряжение:</label>
            <textarea id="edit-equipment" rows="3">${char.equipment || ''}</textarea>
            
            <button onclick="saveCharacter(${char.id})">💾 Сохранить</button>
            <button onclick="closeModal()" style="background:#95a5a6;margin-top:5px;">Отмена</button>
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeModal();
    });
}

function closeModal() {
    const modal = document.querySelector('.edit-modal');
    if (modal) modal.remove();
}

// Сохранить изменения персонажа
async function saveCharacter(id) {
    const name = document.getElementById('edit-name').value.trim();
    const system = document.getElementById('edit-system').value;
    const characterClass = document.getElementById('edit-class').value.trim();
    const race = document.getElementById('edit-race').value.trim();
    const info = document.getElementById('edit-info').value.trim();
    const equipment = document.getElementById('edit-equipment').value.trim();
    
    if (!name) {
        alert('Введите имя персонажа!');
        return;
    }
    
    try {
        const response = await fetch(`/api/characters/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({ name, characterClass, race, system, info, equipment })
        });
        
        const data = await response.json();
        
        if (data.success) {
            closeModal();
            loadMyCharacters();
            alert('Изменения сохранены!');
        } else {
            alert(data.message || 'Ошибка сохранения');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка сохранения');
    }
}

// Загрузить фото персонажа
async function uploadAvatar(charId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const formData = new FormData();
        formData.append('avatar', file);
        
        try {
            const response = await fetch(`/api/upload-avatar/${charId}`, {
                method: 'POST',
                headers: {
                    'Authorization': token
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                alert('Фото обновлено!');
                if (currentUser.role === 'player') {
                    loadMyCharacters();
                } else if (currentUser.role === 'master') {
                    loadMasterCharacters();
                    loadAllCharactersMaster();
                } else if (currentUser.role === 'admin') {
                    loadAllCharactersAdmin();
                }
            } else {
                alert(data.message);
            }
        } catch (error) {
            alert('Ошибка загрузки фото');
        }
    };
    
    input.click();
}

// Удалить персонажа
async function deleteCharacter(id, name) {
    if (!confirm(`Вы уверены, что хотите удалить персонажа "${name}"?\nЭто действие нельзя отменить!`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/characters/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': token }
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(data.message);
            if (currentUser.role === 'player') {
                loadMyCharacters();
            } else if (currentUser.role === 'master') {
                loadMasterCharacters();
                loadAllCharactersMaster();
                loadCharacterSelectMaster();
            } else if (currentUser.role === 'admin') {
                loadAllCharactersAdmin();
                loadCharacterSelectAdmin();
            }
        } else {
            alert(data.message);
        }
    } catch (error) {
        alert('Ошибка удаления');
    }
}

// Создать HTML карточки персонажа
function createCharacterCard(char, showEdit = false, isMaster = false) {
    const systemNames = {
        'DnD 5e': 'D&D 5e',
        'Pathfinder 2e': 'Pathfinder 2e',
        'Pathfinder 1e': 'Pathfinder 1e'
    };
    
    const avatarHtml = char.avatar 
        ? `<img src="${char.avatar}" class="character-avatar" onclick="uploadAvatar(${char.id})" title="Нажмите чтобы изменить фото">`
        : `<div class="character-avatar" onclick="uploadAvatar(${char.id})" title="Нажмите чтобы добавить фото">🎭</div>`;
    
    let actionsHtml = '';
    if (showEdit) {
        actionsHtml = `
            <div class="character-actions">
                <button class="edit-btn" onclick="editCharacter('${encodeURIComponent(JSON.stringify(char))}')">✏️ Редактировать</button>
                <button class="upload-btn" onclick="uploadAvatar(${char.id})">📷 Фото</button>
                <button class="delete-btn" onclick="deleteCharacter(${char.id}, '${char.name.replace(/'/g, "\\'")}')">🗑️ Удалить</button>
            </div>
        `;
    }
    
    return `
        <div class="character-card">
            <div class="character-header">
                ${avatarHtml}
                <div class="character-info">
                    <h4>${char.name} <span style="color:#999;font-size:0.7em;">ID: ${char.id}</span></h4>
                    <span class="system-badge">📘 ${systemNames[char.system] || char.system}</span>
                    <p class="meta">${char.class || 'Класс не указан'} | ${char.race || 'Раса не указана'}</p>
                    ${char.username ? `<p class="meta">👤 Игрок: ${char.username}</p>` : ''}
                    ${char.info ? `<p class="info-text">📝 ${char.info}</p>` : ''}
                    ${char.equipment ? `<p class="equipment-text">🎒 Снаряжение: ${char.equipment}</p>` : ''}
                </div>
            </div>
            <div class="stats">
                <div class="stat">
                    <div class="stat-label">Уровень</div>
                    <div class="stat-value">${char.level}</div>
                </div>
                <div class="stat">
                    <div class="stat-label">Опыт</div>
                    <div class="stat-value">${char.exp}</div>
                </div>
                <div class="stat">
                    <div class="stat-label">ДТ</div>
                    <div class="stat-value">${char.dt}</div>
                </div>
            </div>
            ${actionsHtml}
            ${isMaster ? `
                <div class="character-actions" style="margin-top:10px;">
                    <button class="edit-btn" onclick="showEditStatsModal('${encodeURIComponent(JSON.stringify(char))}')">📊 Изменить хар-ки</button>
                    <button class="delete-btn" onclick="deleteCharacter(${char.id}, '${char.name.replace(/'/g, "\\'")}')">🗑️ Удалить</button>
                </div>
            ` : ''}
        </div>
    `;
}

// Редактировать персонажа
function editCharacter(charData) {
    const char = JSON.parse(decodeURIComponent(charData));
    showEditModal(char);
}

// Модальное окно изменения характеристик (для мастера)
function showEditStatsModal(charData) {
    const char = JSON.parse(decodeURIComponent(charData));
    const oldModal = document.querySelector('.edit-modal');
    if (oldModal) oldModal.remove();
    
    const modal = document.createElement('div');
    modal.className = 'edit-modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>📊 Изменить характеристики: ${char.name}</h3>
            <label>Уровень:</label>
            <input type="number" id="edit-level" value="${char.level}" min="1">
            
            <label>Опыт:</label>
            <input type="number" id="edit-exp" value="${char.exp}" min="0">
            
            <label>ДТ:</label>
            <input type="number" id="edit-dt" value="${char.dt}" min="0">
            
            <button onclick="updateStats(${char.id})">💾 Сохранить</button>
            <button onclick="closeModal()" style="background:#95a5a6;margin-top:5px;">Отмена</button>
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeModal();
    });
}

// Обновить характеристики
async function updateStats(charId) {
    const level = parseInt(document.getElementById('edit-level').value) || 1;
    const exp = parseInt(document.getElementById('edit-exp').value) || 0;
    const dt = parseInt(document.getElementById('edit-dt').value) || 0;
    
    try {
        const response = await fetch('/api/update-character-stats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({ characterId: charId, level, exp, dt })
        });
        
        const data = await response.json();
        
        if (data.success) {
            closeModal();
            loadMasterCharacters();
            loadAllCharactersMaster();
            alert(data.message);
        } else {
            alert(data.message);
        }
    } catch (error) {
        alert('Ошибка обновления');
    }
}

// Загрузить моих персонажей
async function loadMyCharacters() {
    try {
        const response = await fetch('/api/characters', {
            headers: { 'Authorization': token }
        });
        
        const data = await response.json();
        const container = document.getElementById('my-characters');
        
        if (!data.characters || data.characters.length === 0) {
            container.innerHTML = '<p style="color:#666;text-align:center;">У вас пока нет персонажей</p>';
            return;
        }
        
        container.innerHTML = data.characters.map(char => createCharacterCard(char, true)).join('');
    } catch (error) {
        console.error('Ошибка загрузки:', error);
    }
}

// Загрузить персонажей мастера
async function loadMasterCharacters() {
    try {
        const response = await fetch('/api/master-characters', {
            headers: { 'Authorization': token }
        });
        
        const data = await response.json();
        const container = document.getElementById('master-my-characters');
        
        if (!data.characters || data.characters.length === 0) {
            container.innerHTML = '<p style="color:#666;text-align:center;">Вы ещё не добавили персонажей</p>';
            return;
        }
        
        container.innerHTML = data.characters.map(char => createCharacterCard(char, false, true)).join('');
    } catch (error) {
        console.error('Ошибка загрузки:', error);
    }
}

// Загрузить всех персонажей (мастер)
async function loadAllCharactersMaster() {
    try {
        const response = await fetch('/api/all-characters', {
            headers: { 'Authorization': token }
        });
        
        const data = await response.json();
        const container = document.getElementById('all-characters');
        
        if (!data.characters || data.characters.length === 0) {
            container.innerHTML = '<p style="color:#666;text-align:center;">Нет созданных персонажей</p>';
            return;
        }
        
        container.innerHTML = `
            <div style="margin-bottom: 15px;">
                <h4 style="margin-bottom: 10px;">Добавить персонажа по ID:</h4>
                <div class="add-by-id">
                    <input type="number" id="add-char-id" placeholder="Введите ID персонажа" style="margin-bottom:0;">
                    <button onclick="addCharacterById()" style="width:auto; margin-top:0;">➕ Добавить</button>
                </div>
                <div class="message" id="add-char-message"></div>
            </div>
        ` + data.characters.map(char => createCharacterCard(char, false, true)).join('');
    } catch (error) {
        console.error('Ошибка загрузки:', error);
    }
}

// Добавить персонажа по ID
async function addCharacterById() {
    const charId = document.getElementById('add-char-id').value;
    
    if (!charId) {
        showMessage('add-char-message', 'Введите ID персонажа', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/add-character-to-master', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({ characterId: parseInt(charId) })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('add-char-message', data.message, 'success');
            document.getElementById('add-char-id').value = '';
            loadMasterCharacters();
            loadAllCharactersMaster();
            loadCharacterSelectMaster();
        } else {
            showMessage('add-char-message', data.message, 'error');
        }
    } catch (error) {
        showMessage('add-char-message', 'Ошибка', 'error');
    }
}

// Загрузить всех персонажей (админ)
async function loadAllCharactersAdmin() {
    try {
        const response = await fetch('/api/all-characters', {
            headers: { 'Authorization': token }
        });
        
        const data = await response.json();
        const container = document.getElementById('admin-all-characters');
        
        if (!data.characters || data.characters.length === 0) {
            container.innerHTML = '<p style="color:#666;text-align:center;">Нет созданных персонажей</p>';
            return;
        }
        
        container.innerHTML = data.characters.map(char => createCharacterCard(char, false, true)).join('');
    } catch (error) {
        console.error('Ошибка загрузки:', error);
    }
}

// Загрузить список персонажей для выдачи опыта (мастер)
async function loadCharacterSelectMaster() {
    try {
        const response = await fetch('/api/master-characters', {
            headers: { 'Authorization': token }
        });
        
        const data = await response.json();
        const select = document.getElementById('char-select');
        
        select.innerHTML = '<option value="">Выберите персонажа</option>' + 
            data.characters.map(char => 
                `<option value="${char.id}">[ID:${char.id}] ${char.name} (${char.system || 'DnD 5e'}) - Ур.${char.level}</option>`
            ).join('');
    } catch (error) {
        console.error('Ошибка загрузки списка:', error);
    }
}

// Загрузить список персонажей для выдачи опыта (админ)
async function loadCharacterSelectAdmin() {
    try {
        const response = await fetch('/api/all-characters', {
            headers: { 'Authorization': token }
        });
        
        const data = await response.json();
        const select = document.getElementById('admin-char-select');
        
        select.innerHTML = '<option value="">Выберите персонажа</option>' + 
            data.characters.map(char => 
                `<option value="${char.id}">[ID:${char.id}] ${char.name} (${char.system || 'DnD 5e'}) - Ур.${char.level}</option>`
            ).join('');
    } catch (error) {
        console.error('Ошибка загрузки списка:', error);
    }
}

// Выдать опыт и ДТ (мастер)
async function giveExp() {
    const characterId = document.getElementById('char-select').value;
    const level = parseInt(document.getElementById('level-give').value) || null;
    const exp = parseInt(document.getElementById('exp-give').value) || null;
    const dt = parseInt(document.getElementById('dt-give').value) || null;
    
    if (!characterId) {
        showMessage('master-message', 'Выберите персонажа', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/update-character-stats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({ characterId, level, exp, dt })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('master-message', data.message, 'success');
            document.getElementById('level-give').value = '';
            document.getElementById('exp-give').value = '';
            document.getElementById('dt-give').value = '';
            loadMasterCharacters();
            loadAllCharactersMaster();
            loadCharacterSelectMaster();
        } else {
            showMessage('master-message', data.message, 'error');
        }
    } catch (error) {
        showMessage('master-message', 'Ошибка', 'error');
    }
}

// Выдать опыт и ДТ (админ)
async function adminGiveExp() {
    const characterId = document.getElementById('admin-char-select').value;
    const level = parseInt(document.getElementById('admin-level-give').value) || null;
    const exp = parseInt(document.getElementById('admin-exp-give').value) || null;
    const dt = parseInt(document.getElementById('admin-dt-give').value) || null;
    
    if (!characterId) {
        showMessage('admin-message', 'Выберите персонажа', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/update-character-stats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({ characterId, level, exp, dt })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('admin-message', data.message, 'success');
            document.getElementById('admin-level-give').value = '';
            document.getElementById('admin-exp-give').value = '';
            document.getElementById('admin-dt-give').value = '';
            loadAllCharactersAdmin();
            loadCharacterSelectAdmin();
        } else {
            showMessage('admin-message', data.message, 'error');
        }
    } catch (error) {
        showMessage('admin-message', 'Ошибка', 'error');
    }
}

// Загрузить пользователей (админ)
async function loadUsers() {
    try {
        const response = await fetch('/api/users', {
            headers: { 'Authorization': token }
        });
        
        const data = await response.json();
        const container = document.getElementById('users-list');
        
        if (!data.users || data.users.length === 0) {
            container.innerHTML = '<p>Нет пользователей</p>';
            return;
        }
        
        container.innerHTML = data.users.map(user => `
            <div class="user-card">
                <div class="user-info">
                    <strong>${user.username}</strong>
                    <span class="user-role role-${user.role}">${
                        user.role === 'admin' ? 'Админ' : 
                        user.role === 'master' ? 'Мастер' : 'Игрок'
                    }</span>
                </div>
                ${user.role === 'player' ? 
                    `<button class="make-master-btn" onclick="makeMaster(${user.id})">👑 Сделать мастером</button>` : 
                    ''}
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
    }
}

// Сделать пользователя мастером
async function makeMaster(userId) {
    if (!confirm('Вы уверены, что хотите сделать этого пользователя мастером?')) return;
    
    try {
        const response = await fetch('/api/make-master', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({ userId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            loadUsers();
            alert(data.message);
        } else {
            alert(data.message);
        }
    } catch (error) {
        alert('Ошибка');
    }
}