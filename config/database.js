const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Soporte para volumen persistente de Railway (/data)
let dbPath = process.env.DB_PATH;
if (!dbPath) {
    if (fs.existsSync('/data')) {
        dbPath = '/data/Solucels.db';
    } else {
        dbPath = path.resolve(__dirname, '../Solucels.db');
    }
}

// Asegurar que el directorio de la base de datos exista
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

console.log(`✅ Base de datos: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error conectando a la base de datos SQLite:', err.message);
    } else {
        console.log('Conexión a SQLite establecida de forma exitosa.');
    }
});

// Adjuntar dbPath al objeto db para que esté disponible donde se necesite
db.dbPath = dbPath;

module.exports = db;
