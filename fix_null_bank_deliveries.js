/**
 * Script de reparación: Asigna banco BAC (id=2) a entregas de efectivo
 * que quedaron sin banco asignado (banco_id = NULL).
 * 
 * Ejecutar: node fix_null_bank_deliveries.js
 */
const db = require('./config/database');

console.log('🔍 Buscando transacciones "Efectivo Entregado" sin banco asignado...');

db.all(
    "SELECT * FROM transacciones WHERE tipo = 'Efectivo Entregado' AND banco_id IS NULL",
    [],
    (err, rows) => {
        if (err) {
            console.error('❌ Error al buscar:', err.message);
            return db.close();
        }

        if (!rows || rows.length === 0) {
            console.log('✅ No se encontraron transacciones sin banco. Todo está correcto.');
            return db.close();
        }

        console.log(`⚠️  Se encontraron ${rows.length} transacción(es) sin banco asignado:`);
        rows.forEach(r => {
            console.log(`   ID: ${r.id} | Tienda: ${r.tienda_id} | Monto: L ${Math.abs(r.monto_efectivo).toFixed(2)} | Fecha: ${r.fecha_hora}`);
        });

        // Asignar BAC (id=2) a todas las entregas sin banco
        const BAC_ID = 2;
        db.run(
            "UPDATE transacciones SET banco_id = ? WHERE tipo = 'Efectivo Entregado' AND banco_id IS NULL",
            [BAC_ID],
            function(err) {
                if (err) {
                    console.error('❌ Error al actualizar:', err.message);
                    return db.close();
                }
                console.log(`✅ ${this.changes} transacción(es) actualizadas → Banco BAC (ID ${BAC_ID})`);

                // También actualizar remesas asociadas sin banco
                db.run(
                    "UPDATE remesas SET banco_id = ? WHERE banco_id IS NULL AND estado IN ('Pendiente', 'Recibido')",
                    [BAC_ID],
                    function(err) {
                        if (err) {
                            console.error('❌ Error al actualizar remesas:', err.message);
                        } else {
                            console.log(`✅ ${this.changes} remesa(s) actualizadas → Banco BAC`);
                        }
                        console.log('🏁 Reparación completada.');
                        db.close();
                    }
                );
            }
        );
    }
);
