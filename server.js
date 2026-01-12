const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// База пользователей сайта (Логин: Пароль)
let webUsers = { "niggere": "admin123" };

io.on('connection', (socket) => {
    let bot = null;

    // Вход на сам сайт
    socket.on('web-login', (data) => {
        if (webUsers[data.user] === data.pass) {
            socket.emit('auth-success');
        } else {
            socket.emit('auth-error', 'Ошибка: Неверные данные входа в панель');
        }
    });

    // Регистрация на сайте
    socket.on('web-reg', (data) => {
        webUsers[data.user] = data.pass;
        socket.emit('auth-success', 'Аккаунт создан!');
    });

    // Запуск Minecraft бота
    socket.on('join-mc', (data) => {
        const createBot = () => {
            if (bot) bot.quit();

            bot = mineflayer.createBot({
                host: data.host,
                port: parseInt(data.port) || 25565,
                username: data.username,
                version: false // Авто-определение версии
            });

            bot.on('spawn', () => {
                socket.emit('status', '✅ Бот в игре!');
                sendUpdate();
            });

            bot.on('message', (jsonMsg) => {
                const msg = jsonMsg.toString();
                socket.emit('chat', msg);
                if (msg.includes('/register')) bot.chat(`/register ${data.password} ${data.password}`);
                if (msg.includes('/login')) bot.chat(`/login ${data.password}`);
            });

            bot.on('health', () => socket.emit('stats', { hp: bot.health, food: bot.food }));

            bot.on('playerJoined', sendUpdate);
            bot.on('playerLeft', sendUpdate);

            bot.on('end', () => {
                socket.emit('status', '⏳ Реконнект...');
                setTimeout(createBot, 5000); // Авто-реконнект
            });
        };

        const sendUpdate = () => {
            if (!bot) return;
            const players = Object.keys(bot.players);
            const items = bot.inventory.items().map(i => ({ name: i.name, count: i.count }));
            socket.emit('update-data', { players, items });
        };

        createBot();

        // Управление через сокеты
        socket.on('move', (c) => { if(bot) bot.setControlState(c.type, c.state); });
        socket.on('send-chat', (m) => { if(bot) bot.chat(m); });
        socket.on('attack', () => {
            const entity = bot.nearestEntity();
            if (entity) bot.attack(entity);
        });
    });
});

server.listen(process.env.PORT || 3000, () => console.log('HuiBlox Panel Ready'));
