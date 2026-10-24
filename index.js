const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Mengizinkan akses dari frontend mana pun (Vercel / Netlify)
        methods: ["GET", "POST"]
    }
});

// Endpoint dasar untuk cek status server
app.get('/', (req, res) => {
    res.send('Zann TikTok Live Backend is Running!');
});

// Menyimpan sesi koneksi aktif per client
const activeConnections = {};

io.on('connection', (socket) => {
    console.log('Client terhubung:', socket.id);

    // Event saat client mengirim username TikTok
    socket.on('connect-tiktok', (tiktokUsername) => {
        if (!tiktokUsername) return;

        // Putuskan koneksi sebelumnya jika ada
        if (activeConnections[socket.id]) {
            activeConnections[socket.id].disconnect();
            delete activeConnections[socket.id];
        }

        const cleanUsername = tiktokUsername.replace('@', '').trim();
        console.log(`Mencoba menghubungkan ke @${cleanUsername}...`);

        let tiktokLiveConnection = new WebcastPushConnection(cleanUsername);

        tiktokLiveConnection.connect().then(state => {
            console.log(`Berhasil terhubung ke room ID: ${state.roomId}`);
            socket.emit('status', { connected: true, message: `Terhubung ke Live @${cleanUsername}!` });
        }).catch(err => {
            console.error('Gagal terhubung:', err);
            socket.emit('status', { connected: false, message: 'Gagal terhubung. Pastikan akun sedang Live & username benar.' });
        });

        // Event: Komentar Masuk
        tiktokLiveConnection.on('chat', data => {
            socket.emit('tiktok-chat', {
                uniqueId: data.uniqueId,
                nickname: data.nickname,
                comment: data.comment,
                profilePictureUrl: data.profilePictureUrl
            });
        });

        // Event: Gift Masuk
        tiktokLiveConnection.on('gift', data => {
            socket.emit('tiktok-gift', {
                uniqueId: data.uniqueId,
                giftName: data.giftName,
                repeatCount: data.repeatCount,
                diamondCount: data.diamondCount,
                profilePictureUrl: data.profilePictureUrl
            });
        });

        // Simpan instance koneksi
        activeConnections[socket.id] = tiktokLiveConnection;
    });

    // Event saat client terputus
    socket.on('disconnect', () => {
        if (activeConnections[socket.id]) {
            activeConnections[socket.id].disconnect();
            delete activeConnections[socket.id];
        }
        console.log('Client terputus:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});
