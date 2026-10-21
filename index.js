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

// Endpoint sederhana untuk memastikan server aktif
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

        // Inisialisasi koneksi TikTok dengan konfigurasi tambahan pencegah pemblokiran IP
        tiktokLiveConnection = new WebcastPushConnection(cleanUsername, {
            processInitialData: false,
            enableExtendedGiftInfo: true,
            enableExtendedConnecting: true,
            requestOptions: {
                timeout: 10000, // Limit waktu koneksi 10 detik
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            },
            clientParams: {
                'app_language': 'id-ID',
                'webcast_language': 'id-ID'
            }
        });

        tiktokLiveConnection.connect()
            .then(state => {
                console.log(`[BERHASIL] Terhubung ke LIVE @${cleanUsername} (Room ID: ${state.roomId})`);
                socket.emit('tiktok-connected', { status: 'success', username: cleanUsername, roomId: state.roomId });
            })
            .catch(err => {
                console.error(`[GAGAL] Tidak dapat terhubung ke @${cleanUsername}:`, err.message || err);
                socket.emit('tiktok-error', { 
                    status: 'error', 
                    message: 'Gagal terhubung. Pastikan akun sedang LIVE!' 
                });
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

        // Tangkap jika koneksi terputus tiba-tiba / LIVE selesai
        tiktokLiveConnection.on('streamEnd', () => {
            console.log(`LIVE @${cleanUsername} telah berakhir.`);
            io.emit('tiktok-disconnected', { username: cleanUsername });
        });

        // Tangkap error websocket
        tiktokLiveConnection.on('error', (err) => {
            console.error(`[WEBSOCKET ERROR] @${cleanUsername}:`, err);
        });
    });

    // Putus koneksi TikTok jika tab browser / client terputus
    socket.on('disconnect', () => {
        console.log('Client web terputus:', socket.id);
        if (tiktokLiveConnection) {
            try {
                tiktokLiveConnection.disconnect();
            } catch (e) {}
        }
    });
});

// Port dinamis untuk Railway / Termux (Default fallback: 8080)
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server ZANN berjalan di port ${PORT}`);
});
