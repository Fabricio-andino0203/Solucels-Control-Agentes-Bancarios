/**
 * SCRIPT DE MIGRACIÓN - Sube Solucels.db a Railway
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// =============================================
// CONFIGURACIÓN — Edita estos valores
// =============================================
const RAILWAY_URL = 'https://solucels-control-agentes-bancarios-production.up.railway.app'; 
const MIGRATION_SECRET = 'SLC_Agentes_Migrate_2026!';
const DB_FILE = path.join(__dirname, 'Solucels.db');
// =============================================

if (!fs.existsSync(DB_FILE)) {
    console.error('❌ No se encontró Solucels.db en esta carpeta.');
    process.exit(1);
}

const fileBuffer = fs.readFileSync(DB_FILE);
console.log(`📦 Base de datos lista: ${fileBuffer.length} bytes`);
console.log(`🚀 Enviando a: ${RAILWAY_URL}`);

const urlObj = new URL('/migrate-db', RAILWAY_URL);
const client = urlObj.protocol === 'https:' ? https : http;

const options = {
    hostname: urlObj.hostname,
    port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
    path: urlObj.pathname,
    method: 'POST',
    headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileBuffer.length,
        'x-migration-secret': MIGRATION_SECRET
    }
};

const req = client.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        if (res.statusCode === 200) {
            console.log('✅ ¡MIGRACIÓN EXITOSA!');
            console.log('   El servidor Railway se está reiniciando con tus usuarios y datos.');
            console.log('   Espera 15 segundos y luego inicia sesión normalmente.');
        } else {
            console.error(`❌ Error ${res.statusCode}:`, data);
        }
    });
});

req.on('error', (err) => {
    console.error('❌ Error de conexión:', err.message);
});

req.write(fileBuffer);
req.end();
