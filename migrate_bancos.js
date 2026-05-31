const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./Solucels.db');

db.serialize(() => {
    // 1. Alter table
    db.run("ALTER TABLE bancos ADD COLUMN tienda_id INTEGER DEFAULT NULL", (err) => {
        if (err) {
            console.log("Columna tienda_id ya existe o error: ", err.message);
        } else {
            console.log("Columna tienda_id añadida.");
        }
    });

    // 2. Insert Tengo Tienda 7
    const insertBanco = db.prepare("INSERT INTO bancos (nombre, color, tienda_id) VALUES (?, ?, ?)");
    
    db.run("INSERT INTO bancos (nombre, color, tienda_id) VALUES ('Tengo (Tienda 7)', '#F68D2E', 7)", function(err) {
        if (err) console.log("Error insertando T7: ", err.message);
        else {
            let bancoId = this.lastID;
            console.log("Insertado Tengo (Tienda 7) con ID", bancoId);
            db.run("INSERT INTO saldos_bancarios (banco_id, saldo) VALUES (?, 0.00)", [bancoId]);
            db.run("INSERT INTO comisiones (tipo_transaccion, banco_id, valor_efectivo, valor_virtual) VALUES ('Retiro', ?, 0, 10)", [bancoId]);
            db.run("INSERT INTO comisiones (tipo_transaccion, banco_id, valor_efectivo, valor_virtual) VALUES ('Pago Servicio', ?, 8, -8)", [bancoId]);
        }
    });

    db.run("INSERT INTO bancos (nombre, color, tienda_id) VALUES ('Tengo (Tienda 4)', '#F68D2E', 4)", function(err) {
        if (err) console.log("Error insertando T4: ", err.message);
        else {
            let bancoId = this.lastID;
            console.log("Insertado Tengo (Tienda 4) con ID", bancoId);
            db.run("INSERT INTO saldos_bancarios (banco_id, saldo) VALUES (?, 0.00)", [bancoId]);
            db.run("INSERT INTO comisiones (tipo_transaccion, banco_id, valor_efectivo, valor_virtual) VALUES ('Retiro', ?, 0, 10)", [bancoId]);
            db.run("INSERT INTO comisiones (tipo_transaccion, banco_id, valor_efectivo, valor_virtual) VALUES ('Pago Servicio', ?, 8, -8)", [bancoId]);
        }
    });
});

setTimeout(() => {
    db.close();
    console.log("Migración completada.");
}, 2000);
