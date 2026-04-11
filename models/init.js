const db = require('../config/database');

const initializeDatabase = () => {
    db.serialize(() => {
        // Tiendas
        db.run(`CREATE TABLE IF NOT EXISTS tiendas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            efectivo_actual REAL DEFAULT 0.00
        )`);

        // Bancos
        db.run(`CREATE TABLE IF NOT EXISTS bancos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            color TEXT,
            estado TEXT DEFAULT 'Activo'
        )`);
        
        // Saldos Bancarios (Virtual Balance)
        db.run(`CREATE TABLE IF NOT EXISTS saldos_bancarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            banco_id INTEGER,
            saldo REAL DEFAULT 0.00,
            actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (banco_id) REFERENCES bancos(id)
        )`);

        // Comisiones (Settings)
        db.run(`CREATE TABLE IF NOT EXISTS comisiones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo_transaccion TEXT NOT NULL,
            banco_id INTEGER,
            valor_efectivo REAL DEFAULT 0.00,
            valor_virtual REAL DEFAULT 0.00,
            FOREIGN KEY (banco_id) REFERENCES bancos(id)
        )`);

        // Usuarios
        db.run(`CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            rol TEXT CHECK(rol IN ('Admin', 'Contador', 'Cajero')) NOT NULL,
            tienda_id INTEGER,
            FOREIGN KEY (tienda_id) REFERENCES tiendas(id)
        )`);

        // Categorías de Gastos
        db.run(`CREATE TABLE IF NOT EXISTS categorias_gasto (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL
        )`);

        // Transacciones (Advanced)
        db.run(`CREATE TABLE IF NOT EXISTS transacciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
            tienda_id INTEGER,
            banco_id INTEGER,
            usuario_id INTEGER,
            tipo TEXT NOT NULL,
            monto_efectivo REAL NOT NULL,
            monto_banco REAL NOT NULL,
            comision_efectivo REAL DEFAULT 0.00,
            comision_banco REAL DEFAULT 0.00,
            referencia TEXT,
            FOREIGN KEY (tienda_id) REFERENCES tiendas(id),
            FOREIGN KEY (banco_id) REFERENCES bancos(id),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )`);

        // Cierres de caja
        db.run(`CREATE TABLE IF NOT EXISTS cierres_caja (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tienda_id INTEGER,
            usuario_id INTEGER,
            fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
            saldo_teorico REAL,
            saldo_real REAL,
            diferencia REAL,
            desglose_bancos TEXT, 
            observaciones TEXT,
            FOREIGN KEY (tienda_id) REFERENCES tiendas(id),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )`);

        console.log("Estructura de tablas avanzada inicializada correctamente.");
        
        // Semillas
        db.get("SELECT COUNT(*) AS count FROM tiendas", (err, row) => {
            if (row && row.count === 0) {
                // Tiendas
                const stmt = db.prepare("INSERT INTO tiendas (nombre, efectivo_actual) VALUES (?, ?)");
                for (let i = 1; i <= 7; i++) {
                    stmt.run(`Solucels #${i}`, 0);
                }
                stmt.finalize();

                // Bancos & Saldos Centrales
                const banksStmt = db.prepare("INSERT INTO bancos (nombre, color) VALUES (?, ?)");
                [
                    ['Atlántida', '#003B70'],
                    ['BAC', '#E3000F'],
                    ['Tigo Money', '#00377B'],
                    ['Tengo', '#F68D2E']
                ].forEach(bank => {
                    banksStmt.run(bank[0], bank[1], function(err) {
                        if (!err) {
                            db.run("INSERT INTO saldos_bancarios (banco_id, saldo) VALUES (?, 0.00)", [this.lastID]);
                            // Default Comisiones
                            db.run("INSERT INTO comisiones (tipo_transaccion, banco_id, valor_efectivo, valor_virtual) VALUES ('Retiro', ?, 0, 10)", [this.lastID]);
                            db.run("INSERT INTO comisiones (tipo_transaccion, banco_id, valor_efectivo, valor_virtual) VALUES ('Pago Servicio', ?, 8, -8)", [this.lastID]);
                        }
                    });
                });
                banksStmt.finalize();

                // Usuarios
                const usersStmt = db.prepare("INSERT INTO usuarios (username, password, rol, tienda_id) VALUES (?, ?, ?, ?)");
                usersStmt.run('admin', 'admin123', 'Admin', null);
                usersStmt.run('conta', 'conta123', 'Contador', null);
                usersStmt.run('cajero1', '1234', 'Cajero', 1);
                usersStmt.finalize();

                console.log("Datos semilla avanzados insertados correctamente.");
            }
        });
    });
};

initializeDatabase();
