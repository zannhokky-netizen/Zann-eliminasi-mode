const express = require('express');
const { WebcastPushConnection } = require('tiktok-live-connector');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { 
        origin: "*",
        methods: ["GET", "POST"]
    } 
});

// Endpoint sederhana untuk memastikan server Railway aktif
app.get('/', (req, res) => {
    res.send('Server TikTok LIVE Connector ZANN Online!');
});

io.on('connection', (socket) => {
    console.log('Client web terhubung:', socket.id);
    let tiktokLiveConnection = null;

    socket.on('set-username', (tiktokUsername) => {
        // Hapus koneksi lama jika pengguna mencoba menghubungkan ulang
        if (tiktokLiveConnection) {
            try {
                tiktokLiveConnection.disconnect();
            } catch (e) {
                console.log('Memutus koneksi lama...');
            }
        }

        // Bersihkan tanda '@' jika pengguna tidak sengaja mengetiknya
        const cleanUsername = tiktokUsername.replace('@', '').trim();
        console.log(`Mencoba menghubungkan ke TikTok LIVE: @${cleanUsername}`);

        tiktokLiveConnection = new WebcastPushConnection(cleanUsername, {
            processInitialData: false,
            enableExtendedGiftInfo: true
        });

        tiktokLiveConnection.connect()
            .then(state => {
                console.log(`[BERHASIL] Terhubung ke LIVE @${cleanUsername} (Room ID: ${state.roomId})`);
                socket.emit('tiktok-connected', { status: 'success', username: cleanUsername });
            })
            .catch(err => {
                console.error(`[GAGAL] Tidak dapat terhubung ke @${cleanUsername}:`, err.message || err);
                socket.emit('tiktok-error', { status: 'error', message: 'Gagal terhubung. Pastikan akun sedang LIVE!' });
            });

        // Event Chat TikTok
        tiktokLiveConnection.on('chat', (data) => {
            io.emit('tiktok-chat', { 
                username: data.uniqueId, 
                comment: data.comment 
            });
        });

        // Event Gift TikTok
        tiktokLiveConnection.on('gift', (data) => {
            if (data.giftType === 1 || !data.repeatEnd) {
                io.emit('tiktok-gift', {
                    username: data.uniqueId,
                    giftName: data.giftName,
                    diamondCount: (data.diamondCount || 1) * (data.repeatCount || 1)
                });
            }
        });

        // Tangkap jika koneksi terputus tiba-tiba
        tiktokLiveConnection.on('streamEnd', () => {
            console.log(`LIVE @${cleanUsername} telah berakhir.`);
            io.emit('tiktok-disconnected', { username: cleanUsername });
        });
    });

    // Putus koneksi TikTok jika tab browser ditutup
    socket.on('disconnect', () => {
        console.log('Client web terputus:', socket.id);
        if (tiktokLiveConnection) {
            try {
                tiktokLiveConnection.disconnect();
            } catch (e) {}
        }
    });
});

// Port dinamis untuk Railway (Default fallback: 8080)
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server berjalan di port ${PORT}`);
});
