const bedrock = require('bedrock-protocol');
const config = require('./config.json');

let client;
let reconnectTimeout;
let watchdogTimeout;

// Konstanta Waktu
const WATCHDOG_INTERVAL = 30000; // 30 detik tanpa respon = timeout
const RECONNECT_DELAY = 10000;   // 10 detik sebelum reconnect

function createBot() {
    console.log(`[Connecting] Menghubungkan ke ${config.host}:${config.port} sebagai ${config.username}...`);

    client = bedrock.createClient({
        host: config.host,
        port: config.port,
        version: config.version,     // Target 1.21.10
        username: config.username,
        offline: config.offline,     // Mode Cracked
        skipPing: true               // Opsional: kadang membantu koneksi Aternos
    });

    // --- EVENT LISTENERS ---

    // 1. Event Utama: Bot berhasil bergabung
    client.on('spawn', () => {
        console.log('✅ [Success] Bot telah Spawn di dalam server!');
        resetWatchdog();
    });

    // 2. Event Log: Chat & Pesan Server
    client.on('text', (packet) => {
        // Filter pesan tipe chat saja
        if (packet.type === 'chat' || packet.type === 'translation') {
            console.log(`[Chat] ${packet.message}`);
        }
    });

    // 3. HANDLER PENTING: Mencegah Kick/Crash karena Resource & Behavior Packs
    // Kita "berbohong" ke server bahwa kita menerima semua pack.

    client.on('resource_packs_info', (packet) => {
        console.log('[Pack] Server menawarkan Resource Packs. Menerima...');
        client.write('resource_pack_client_response', {
            response_status: 'completed',
            resourcepackids: []
        });
    });

    client.on('resource_pack_stack', (packet) => {
        console.log('[Pack] Resource Pack Stack diterima.');
        client.write('resource_pack_client_response', {
            response_status: 'completed',
            resourcepackids: []
        });
    });

    // INI YANG SEBELUMNYA MENYEBABKAN CRASH DI ATERNOS
    // Server mengirim Addons, bot harus merespon.
    client.on('behavior_pack_stack', (packet) => {
        console.log('[Pack] Behavior Pack (Addons) Stack diterima. Menerima...');
        client.write('behavior_pack_client_response', {
            response_status: 'completed',
            behaviorpackids: []
        });
    });

    // 4. Manajemen Koneksi & Watchdog
    // Menjaga koneksi tetap hidup
    client.on('join', () => {
        console.log('[Info] Join packet received.');
        // Loop interval untuk mengirim 'tick' agar tidak idle timeout
        setInterval(() => {
            if(client.status === 0) return; // Jika tidak connect, jangan kirim
            // Kirim paket tick sync kosong (opsional, tapi bagus untuk server ketat)
            // client.queue('tick_sync', { request_time: BigInt(Date.now()), response_time: 0n });
        }, 10000);
    });

    // Reset watchdog setiap kali ada paket 'keep_alive' dari server
    // Catatan: bedrock-protocol mungkin menamakan eventnya berbeda tergantung versi, 
    // tapi biasanya library menangani keep-alive secara internal. 
    // Kita pantau error saja.

    // 5. Error & Disconnect Handling
    client.on('disconnect', (packet) => {
        console.log(`⛔ [Disconnected] Pesan: ${packet.reason || 'Unknown'}`);
        cleanUpAndReconnect();
    });

    client.on('error', (err) => {
        console.error(`⚠️ [Error] ${err.message}`);
        // Jangan langsung reconnect di sini, biarkan event 'close' atau 'disconnect' yang memicu
    });

    client.on('close', () => {
        console.log('⚠️ [Close] Koneksi ditutup.');
        cleanUpAndReconnect();
    });
}

function resetWatchdog() {
    if (watchdogTimeout) clearTimeout(watchdogTimeout);
    watchdogTimeout = setTimeout(() => {
        console.log('⚠️ [Watchdog] Tidak ada respon server. Memaksa reconnect...');
        if (client) client.close();
    }, WATCHDOG_INTERVAL);
}

function cleanUpAndReconnect() {
    if (watchdogTimeout) clearTimeout(watchdogTimeout);
    
    // Cegah multiple reconnect timers
    if (reconnectTimeout) return;

    console.log(`⏳ [Reconnect] Mencoba lagi dalam ${RECONNECT_DELAY/1000} detik...`);
    reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        createBot();
    }, RECONNECT_DELAY);
}

// Mulai Bot
createBot();