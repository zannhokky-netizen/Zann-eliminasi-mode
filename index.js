const express = require('express');
const { WebcastPushConnection } = require('tiktok-live-connector');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on('connection', (socket) => {
    socket.on('set-username', (tiktokUsername) => {
        const tiktokLiveConnection = new WebcastPushConnection(tiktokUsername);
        tiktokLiveConnection.connect().then(() => {
            console.log(`Terhubung ke @${tiktokUsername}`);
        }).catch(err => console.log(err));

        tiktokLiveConnection.on('chat', (data) => {
            io.emit('tiktok-chat', { username: data.uniqueId, comment: data.comment });
        });

        tiktokLiveConnection.on('gift', (data) => {
            if (data.giftType === 1 || !data.repeatEnd) {
                io.emit('tiktok-gift', {
                    username: data.uniqueId,
                    giftName: data.giftName,
                    diamondCount: data.diamondCount * data.repeatCount
                });
            }
        });
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});
