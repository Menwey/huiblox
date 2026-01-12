const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const USERS_FILE = './users.json';
let webUsers = { "admin": "admin123" };

// Загрузка пользователей из файла
if (fs.existsSync(USERS_FILE)) {
    try {
        webUsers = JSON.parse(fs.readFileSync(USERS_FILE));
    } catch (e) { console.log("Ошибка чтения базы пользователей"); }
}

io.on('connection', (socket) => {
    let bot = null;

    // Вход на сайт
    socket.on('web-login', (data) => {
        if (webUsers[data.user] && webUsers[data.user] === data.pass) {
            socket.emit('auth-success', 'login');
        } else {
            socket.emit('auth-error', 'Неверный логин или пароль');
        }
    });

    // Регистрация на сайте
    socket.on('web-reg', (data) => {
        if (!data.user || !data.pass) return socket.emit('auth-error', 'Заполните поля');
        if (webUsers[data.user]) return socket.emit('auth-error', 'Пользователь уже существует');
        
        webUsers[data.user] = data.pass;
        fs.writeFileSync(USERS_FILE, JSON.stringify(webUsers, null, 2));
        socket.emit('auth-success', 'reg');
    });

    // Логика Minecraft бота
    socket.on('join-mc', (data) => {
        if (bot) bot.quit();
        
        bot = mineflayer.createBot({
            host: data.host,
            port: parseInt(data.port) || 25565,
            username: data.username
        });

        bot.on('spawn', () => {
            socket.emit('status', '✅ Бот в игре!');
            updateData();
        });

        bot.on('message', (jsonMsg) => {
            const msg = jsonMsg.toString();
            socket.emit('chat', msg);
            if (msg.includes('/register')) bot.chat(`/register ${data.password} ${data.password}`);
            if (msg.includes('/login')) bot.chat(`/login ${data.password}`);
        });

        bot.on('health', () => socket.emit('stats', { hp: Math.round(bot.health), food: Math.round(bot.food) }));
        bot.on('playerJoined', updateData);
        bot.on('playerLeft', updateData);
        
        bot.on('end', () => socket.emit('status', '🔌 Отключен'));

        function updateData() {
            if (!bot) return;
            socket.emit('update-data', {
                players: Object.keys(bot.players),
                items: bot.inventory.items().map(i => ({ name: i.name, count: i.count }))
            });
        }
    });

    socket.on('move', (c) => { if(bot) bot.setControlState(c.type, c.state); });
    socket.on('send-chat', (m) => { if(bot) bot.chat(m); });
    socket.on('attack', () => {
        const entity = bot.nearestEntity();
        if (entity) bot.attack(entity);
    });

    socket.on('disconnect', () => { if(bot) bot.quit(); });
});

server.listen(process.env.PORT || 3000, () => console.log('HUIBLOX RUNNING'));
