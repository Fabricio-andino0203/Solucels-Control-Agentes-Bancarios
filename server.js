const express = require('express');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const session = require('express-session');
const db = require('./config/database');
require('./models/init');
const dbPath = db.dbPath;

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Manejadores de errores globales para capturar crashes en Railway
process.on('uncaughtException', (err) => {
    console.error('❌ CRASH DETECTADO (uncaughtException):', err.message);
    console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ ERROR ASÍNCRONO (unhandledRejection):', reason);
});

console.log(`📡 Puerto detectado: ${PORT}`);
console.log(`🏠 Host configurado: 0.0.0.0`);
console.log(`📂 DB Path: ${dbPath}`);
try {
    if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        console.log(`📊 DB File Size: ${(stats.size / 1024).toFixed(2)} KB`);
    } else {
        console.log(`⚠️ DB File NO existe todavía (se creará)`);
    }
} catch (e) {
    console.error(`❌ Error al leer stats de DB: ${e.message}`);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'solucels_secret',
    resave: false,
    saveUninitialized: false
}));


app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Ayudante para Fecha Local (Honduras America/Tegucigalpa)
function getLocalTime() {
    const now = new Date();
    // Forzamos la zona horaria de Honduras para evitar problemas con la hora del servidor (UTC)
    const options = {
        timeZone: 'America/Tegucigalpa',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    };
    
    // Usamos el locale en-CA porque devuelve YYYY-MM-DD
    const formatter = new Intl.DateTimeFormat('en-CA', options);
    const parts = formatter.formatToParts(now);
    
    const getPart = (type) => parts.find(p => p.type === type).value;
    
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const second = getPart('second');
    
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

const requireAuth = (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.session.user || req.session.user.rol !== 'Admin') return res.status(403).send("Acceso denegado");
    next();
};

const requireAdminOrContador = (req, res, next) => {
    if (!req.session.user || (req.session.user.rol !== 'Admin' && req.session.user.rol !== 'Contador')) {
        return res.status(403).send("Acceso denegado");
    }
    next();
};

app.use((req, res, next) => {
    res.locals.globalIsAdmin = (req.session && req.session.isAdmin) ? true : false;
    next();
});

const requireApertura = (req, res, next) => {
    if (req.session.user.rol !== 'Cajero') return next();
    const today = getLocalTime().split(' ')[0];
    db.get("SELECT id FROM aperturas_caja WHERE usuario_id = ? AND date(fecha_hora) = ? AND estado = 'Abierta'", 
        [req.session.user.id, today], (err, row) => {
        if (err || !row) return res.redirect('/apertura');
        next();
    });
};

// Autenticación
app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('login', { error: req.query.error });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM usuarios WHERE username = ? AND password = ?", [username, password], (err, user) => {
        if (err || !user) return res.redirect('/login?error=Credenciales%20inválidas');
        req.session.user = { id: user.id, username: user.username, rol: user.rol, tienda_id: user.tienda_id };
        if (user.rol === 'Admin') req.session.isAdmin = true;
        res.redirect('/');
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Rutas Cambio Rápido de Usuario (Exclusiva si tu login original es Admin)
app.get('/fast-switch', (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/');
    db.all("SELECT id, username, rol, tienda_id FROM usuarios", [], (err, usuarios) => {
        let html = '<div style="padding: 3rem; font-family: sans-serif; background: #111; color: #fff; min-height: 100vh;">';
        html += '<h2 style="color:var(--accent-blue); margin-bottom: 2rem;">⚡ Cambio Rápido de Sesión</h2>';
        html += '<p style="margin-bottom: 2rem; color: #aaa;">Como administrador, puedes saltar directamente a otro usuario sin contraseña.</p>';
        html += '<div style="display:flex; flex-direction:column; gap:12px; max-width:400px;">';
        const bg = { 'Admin': '#0A84FF', 'Cajero': '#34C759', 'Contador': '#FF9F0A' };
        usuarios.forEach(u => {
            const color = bg[u.rol] || '#fff';
            html += `<a href="/fast-switch/${u.id}" style="padding: 1.25rem; background: #222; color: #fff; text-decoration: none; border: 1px solid ${color}; border-left: 6px solid ${color}; border-radius:12px; font-weight: bold; transition: 0.2s;">
            Entrar como <b>${u.username}</b> <span style="float: right; font-size: 0.8rem; font-weight:normal; background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius:4px;">${u.rol}</span></a>`;
        });
        html += '<br><a href="/" style="color:#FF453A; font-weight: bold; text-decoration: none; padding: 1rem; border: 1px solid #FF453A; border-radius: 8px; text-align: center;">X Cancelar</a></div></div>';
        res.send(html);
    });
});

app.get('/fast-switch/:id', (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/');
    const id = req.params.id;
    db.get("SELECT * FROM usuarios WHERE id = ?", [id], (err, user) => {
        if (!user) return res.redirect('/');
        req.session.user = { id: user.id, username: user.username, rol: user.rol, tienda_id: user.tienda_id };
        res.redirect('/');
    });
});

// Dashboard con Lógica de Saldos Iniciales
app.get('/', requireAuth, (req, res) => {
    const { rol, tienda_id, id: usuario_id } = req.session.user;
    const { fecha } = req.query;

    if (rol === 'Cajero') {
        const today = getLocalTime().split(' ')[0];
        db.get("SELECT * FROM aperturas_caja WHERE usuario_id = ? AND date(fecha_hora) = ? AND estado = 'Abierta'", 
            [usuario_id, today], (err, apertura) => {
            
            // Parsear saldos iniciales por banco de la apertura
            let aperturaBancos = {};
            if (apertura && apertura.saldos_bancos_json) {
                try { aperturaBancos = JSON.parse(apertura.saldos_bancos_json); } catch(e) {}
            }

            db.all("SELECT * FROM tiendas WHERE id = ?", [tienda_id], (err, tiendas) => {
                db.all("SELECT b.*, s.saldo as saldo_virtual FROM bancos b LEFT JOIN saldos_bancarios s ON b.id = s.banco_id", [], (err, bancos) => {
                    const stores = tiendas.map(r => ({ id: r.id, name: r.nombre, cash: r.efectivo_actual }));
                    res.render('dashboard', { stores, bancos, user: req.session.user, apertura, aperturaBancos, auditData: null, globalBancario: null, enTransito: 0, filterFecha: null });
                });
            });
        });
        return;
    }

    let dateFilter = fecha ? "date(fecha_hora) <= date(?)" : "1=1";
    let dateParam = fecha ? [fecha] : [];

    db.all("SELECT * FROM tiendas", [], (err, tiendas) => {
        db.all("SELECT * FROM bancos", [], (err, bancos) => {
            db.all("SELECT b.id, b.nombre, b.color, s.saldo FROM bancos b JOIN saldos_bancarios s ON b.id = s.banco_id", [], (err, saldosBancos) => {
                
                // 1. Obtener Transacciones (Flujo)
                const txQuery = `
                    SELECT tienda_id, banco_id, SUM(monto_banco) as balance_banco, SUM(monto_efectivo) as balance_efectivo
                    FROM transacciones 
                    WHERE ${dateFilter}
                    GROUP BY tienda_id, banco_id
                `;

                db.all(txQuery, dateParam, (err, txBalances) => {
                    // 2. Obtener Gastos (Egresos Bancarios)
                    db.all(`SELECT banco_id, SUM(monto) as total FROM gastos WHERE ${dateFilter} GROUP BY banco_id`, dateParam, (err, rowsGastos) => {
                        
                        // 3. Obtener Saldos Iniciales
                        db.all("SELECT * FROM saldos_iniciales_tiendas", [], (err, iniciales) => {
                            
                            const auditMatrix = tiendas.map(t => {
                                // NO usamos saldos_iniciales_tiendas státicos aquí porque inflan la tabla
                                // El efectivo inicial real viene de 'aperturas_caja' pero ese ya afecta a al flujo o se muestra en Dashboard de cajero.
                                // Para la auditoría, queremos ver flujo real HOY.
                                
                                const matchFlowEf = txBalances.filter(tx => tx.tienda_id === t.id);
                                let flujoEf = matchFlowEf.reduce((acc, curr) => acc + curr.balance_efectivo, 0);

                                let row = { 
                                    id: t.id, 
                                    name: t.nombre, 
                                    efectivo: flujoEf, // Empezamos en 0 si no hay transas
                                    bancos: {} 
                                };

                                bancos.forEach(b => {
                                    const match = txBalances.find(tx => tx.tienda_id === t.id && tx.banco_id === b.id);
                                    const flowBank = match ? match.balance_efectivo : 0; // Mostrar efectivo físico, no virtual
                                    row.bancos[b.id] = flowBank; 
                                });
                                return row;
                            });

                            db.get(`
                                SELECT 
                                    ABS(SUM(CASE WHEN tipo = 'Retiro' AND banco_id IS NULL THEN monto_efectivo ELSE 0 END)) - 
                                    SUM(CASE WHEN tipo = 'Depósito Cuenta' THEN ABS(monto_efectivo) ELSE 0 END) as transito
                                FROM transacciones WHERE ${dateFilter}
                            `, dateParam, (err, rowTransito) => {
                                
                                const enTransito = rowTransito ? (rowTransito.transito || 0) : 0;

                                const globalBancario = saldosBancos.map(b => {
                                    const totalInStores = auditMatrix.reduce((acc, curr) => acc + (curr.bancos[b.id] || 0), 0);
                                    const gMatch = (rowsGastos || []).find(g => g.banco_id === b.id);
                                    const totalGasto = gMatch ? gMatch.total : 0;
                                    
                                    b.total_gastos = totalGasto;

                                    return {
                                        nombre: b.nombre,
                                        total: totalInStores - totalGasto, // AHORA SÍ: Solo Efectivo en Tiendas - Gastos. NO sumamos saldo virtual.
                                        saldo_cuenta: b.saldo,
                                        efectivo_tiendas: totalInStores
                                    };
                                });

                                // Calcular referencia por banco por tienda (saldo_inicial_apertura + neto_transacciones)
                                const tiendaIds = tiendas.map(t => t.id);
                                const placeholders = tiendaIds.map(() => '?').join(',');

                                // Obtener ultima apertura por tienda
                                db.all(`SELECT * FROM aperturas_caja WHERE id IN (
                                    SELECT MAX(id) FROM aperturas_caja WHERE tienda_id IN (${placeholders}) GROUP BY tienda_id
                                )`, tiendaIds, (err, aperturas) => {

                                    // Obtener transacciones por banco por tienda desde su ULTIMA APERTURA
                                    // Usamos un LEFT JOIN para incluir transacciones sin banco (Suelto/Otros)
                                    const sqlTxPorTienda = `
                                        SELECT t.tienda_id, t.banco_id, b.nombre as banco_nombre, b.color as banco_color,
                                               SUM(t.monto_efectivo) as neto_txn
                                        FROM transacciones t
                                        LEFT JOIN bancos b ON t.banco_id = b.id
                                        JOIN (
                                            SELECT tienda_id, MAX(fecha_hora) as ultima_apertura
                                            FROM aperturas_caja
                                            GROUP BY tienda_id
                                        ) last_a ON t.tienda_id = last_a.tienda_id
                                        WHERE t.fecha_hora >= last_a.ultima_apertura
                                        GROUP BY t.tienda_id, t.banco_id
                                    `;

                                    db.all(sqlTxPorTienda, [], (err, txPorTiendaBanco) => {

                                        // Construir referenciasTiendas: { tienda_id: { nombre, efectivo_actual, bancos: [{banco_id, nombre, color, inicial, neto, total}] } }
                                        const referenciasTiendas = tiendas.map(t => {
                                            const apertura = (aperturas || []).find(a => a.tienda_id === t.id);
                                            let inicialPorBanco = {};
                                            if (apertura && apertura.saldos_bancos_json) {
                                                try { inicialPorBanco = JSON.parse(apertura.saldos_bancos_json); } catch(e) {}
                                            }

                                            // Bancos regulares + "Otros / Suelto"
                                            const bancosListExtended = [...bancos, { id: 'Otros', nombre: 'Otros / Suelto', color: '#888' }];

                                            const bancosRef = bancosListExtended.map(b => {
                                                const bId = b.id === 'Otros' ? null : b.id;
                                                
                                                // Calcular inicial: Para bancos según JSON, para Otros es el restante del inicial total.
                                                let finalInicial = 0;
                                                if (b.id === 'Otros') {
                                                    let sumBancos = 0;
                                                    for (let bid in inicialPorBanco) sumBancos += parseFloat(inicialPorBanco[bid] || 0);
                                                    finalInicial = Math.max(0, (apertura ? apertura.saldo_inicial_efectivo : 0) - sumBancos);
                                                } else {
                                                    finalInicial = parseFloat(inicialPorBanco[b.id] || 0);
                                                }

                                                const txRow = (txPorTiendaBanco || []).find(r => r.tienda_id === t.id && r.banco_id === bId);
                                                const neto = txRow ? (txRow.neto_txn || 0) : 0;
                                                
                                                return {
                                                    banco_id: b.id,
                                                    banco_nombre: b.nombre,
                                                    banco_color: b.color || '#555',
                                                    inicial: finalInicial,
                                                    neto,
                                                    total_esperado: Math.max(0, finalInicial + neto)
                                                };
                                            });

                                            const totalEsperado = bancosRef.reduce((acc, r) => acc + r.total_esperado, 0);
                                            return {
                                                tienda_id: t.id,
                                                tienda_nombre: t.nombre,
                                                efectivo_actual: t.efectivo_actual,
                                                bancos: bancosRef,
                                                totalEsperado
                                            };
                                        });

                                        res.render('dashboard', { 
                                            stores: tiendas.map(t => ({ id: t.id, name: t.nombre, cash: t.efectivo_actual })), 
                                            bancos: saldosBancos, 
                                            user: req.session.user,
                                            auditData: auditMatrix,
                                            globalBancario,
                                            enTransito,
                                            filterFecha: fecha || null,
                                            referenciasTiendas
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// Configuración Saldos Iniciales
app.get('/config/iniciales', requireAdmin, (req, res) => {
    db.all("SELECT * FROM tiendas", [], (err, tiendas) => {
        db.all("SELECT * FROM bancos", [], (err, bancos) => {
            // Obtener las aperturas actualmente Abiertas
            db.all("SELECT * FROM aperturas_caja WHERE estado = 'Abierta'", [], (err, aperturas) => {
                const saldosMap = {};
                tiendas.forEach(t => {
                    saldosMap[t.id] = {};
                    const apertura = aperturas.find(a => a.tienda_id === t.id);
                    let bancosJSON = {};
                    if (apertura && apertura.saldos_bancos_json) {
                        try { bancosJSON = JSON.parse(apertura.saldos_bancos_json); } catch(e){}
                    }
                    
                    saldosMap[t.id]['efectivo'] = apertura ? apertura.saldo_inicial_efectivo : 0;
                    bancos.forEach(b => {
                        saldosMap[t.id][b.id] = bancosJSON[b.id] || 0;
                    });
                });
                res.render('config-iniciales', { tiendas, bancos, saldosMap, user: req.session.user });
            });
        });
    });
});

app.post('/config/iniciales', requireAdmin, (req, res) => {
    const data = req.body;
    
    // Convertir el payload de req.body a la estructura requerida
    const storeUpdates = {}; // { tienda_id: { bancosData: {banco_id: monto}, totalNuevo: 0 } }
    
    for (let key in data) {
        if (key.startsWith('monto_efectivo_')) {
            const tiendaId = key.replace('monto_efectivo_', '');
            if (!storeUpdates[tiendaId]) storeUpdates[tiendaId] = { bancosData: {}, totalNuevo: 0 };
            
            const monto = parseFloat((data[key] || "0").toString().replace(/[^0-9.-]+/g, "")) || 0;
            storeUpdates[tiendaId].totalNuevo = monto;
        } else if (key.startsWith('monto_banco_')) {
            const parts = key.replace('monto_banco_', '').split('_');
            const tiendaId = parts[0];
            const bancoId = parts[1];
            if (!storeUpdates[tiendaId]) storeUpdates[tiendaId] = { bancosData: {}, totalNuevo: 0 };
            
            const monto = parseFloat((data[key] || "0").toString().replace(/[^0-9.-]+/g, "")) || 0;
            storeUpdates[tiendaId].bancosData[bancoId] = monto;
        }
    }
    
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        db.all("SELECT * FROM aperturas_caja WHERE estado = 'Abierta'", [], (err, aperturas) => {
            let pending = Object.keys(storeUpdates).length;
            if (pending === 0) {
                return db.run('COMMIT', () => res.redirect('/configuracion?msg=iniciales_ok'));
            }
            
            for (let tiendaId in storeUpdates) {
                const update = storeUpdates[tiendaId];
                const newTotal = update.totalNuevo;
                const newBancosJSON = JSON.stringify(update.bancosData);
                
                const apertura = aperturas.find(a => a.tienda_id == tiendaId);
                if (apertura) {
                    const oldTotal = apertura.saldo_inicial_efectivo || 0;
                    const diff = newTotal - oldTotal;
                    
                    // Actualizar la apertura activa
                    db.run("UPDATE aperturas_caja SET saldo_inicial_efectivo = ?, saldos_bancos_json = ? WHERE id = ?", [newTotal, newBancosJSON, apertura.id]);
                    
                    // Ajustar el efectivo de la tienda segun la diferencia del inicial modificado
                    if (diff !== 0) {
                        db.run("UPDATE tiendas SET efectivo_actual = efectivo_actual + ? WHERE id = ?", [diff, tiendaId]);
                    }
                }
                
                pending--;
                if (pending === 0) {
                    db.run('COMMIT', () => {
                        res.redirect('/configuracion?msg=iniciales_ok');
                    });
                }
            }
        });
    });
});

// Rutas de Gastos Bancarios migradas a Tesorería

// NUEVO MÓDULO DE TESORERÍA CENTRALIZADA
app.get('/tesoreria', requireAdminOrContador, (req, res) => {
    db.all("SELECT * FROM tiendas", [], (err, tiendas) => {
        db.all("SELECT d.*, b.nombre as banco_nombre FROM depositos_adelantados d JOIN bancos b ON d.banco_id = b.id WHERE d.estado = 'Pendiente'", [], (err, deudas) => {
            const sqlRemesas = `
                SELECT r.*, t.nombre as tienda_nombre 
                FROM remesas r 
                JOIN tiendas t ON r.tienda_id = t.id 
                WHERE r.estado = 'Pendiente'
                ORDER BY r.fecha_envio DESC
            `;
            db.all(sqlRemesas, [], (err, remesasPendientes) => {
                const sqlHistorial = `
                    SELECT 'Efectivo Entregado' as tipo_trans, r.monto, r.fecha_recepcion as fecha, t.nombre as origen, 'Efectivo' as via, r.observaciones as ref
                    FROM remesas r JOIN tiendas t ON r.tienda_id = t.id WHERE r.estado = 'Recibido'
                    UNION ALL
                    SELECT tl.tipo as tipo_trans, tl.monto, tl.fecha_hora as fecha, 
                           COALESCE(b1.nombre, 'Otros/Suelto') || CASE WHEN tl.banco_destino_id IS NOT NULL THEN ' ➔ ' || b2.nombre ELSE '' END as origen, 
                           'Banco' as via, tl.referencia as ref
                    FROM tesoreria_log tl 
                    LEFT JOIN bancos b1 ON tl.banco_id = b1.id
                    LEFT JOIN bancos b2 ON tl.banco_destino_id = b2.id
                    ORDER BY fecha DESC LIMIT 50
                `;
                db.all(sqlHistorial, [], (err, historial) => {
                    db.all("SELECT * FROM bancos", [], (err, bancos) => {
                        const sqlSaldos = `
                             SELECT b.id, b.nombre, b.color,
                                    (SELECT COALESCE(SUM(monto), 0) FROM remesas WHERE estado = 'Recibido' AND banco_id = b.id) +
                                    (SELECT COALESCE(SUM(monto), 0) FROM tesoreria_log WHERE tipo = 'Traslado (Efectivo)' AND banco_id = b.id) -
                                    (SELECT COALESCE(SUM(monto), 0) FROM tesoreria_log WHERE tipo IN ('Depósito a Banco', 'Envío a Tienda', 'Entrega Dueño', 'Pago Depósito Adelantado') AND banco_id = b.id) as saldo
                             FROM bancos b
                        `;
                        db.all(sqlSaldos, [], (err, saldos) => {
                            db.get(`
                                SELECT 
                                   (SELECT COALESCE(SUM(monto), 0) FROM remesas WHERE estado = 'Recibido' AND banco_id IS NULL) +
                                   (SELECT COALESCE(SUM(monto), 0) FROM tesoreria_log WHERE tipo = 'Traslado (Efectivo)' AND banco_id IS NULL) -
                                   (SELECT COALESCE(SUM(monto), 0) FROM tesoreria_log WHERE tipo IN ('Depósito a Banco', 'Envío a Tienda', 'Entrega Dueño', 'Pago Depósito Adelantado') AND banco_id IS NULL) as saldo
                            `, [], (err, rowOtros) => {
                                const otrosSaldo = rowOtros ? (rowOtros.saldo || 0) : 0;
                                const saldosPorBanco = saldos || [];
                                if (otrosSaldo !== 0) {
                                    saldosPorBanco.push({ id: null, nombre: 'Otros', color: '#888', saldo: otrosSaldo });
                                }

                                const saldoTesoreriaTotal = saldosPorBanco.reduce((acc, s) => acc + s.saldo, 0);
                                const enTransitoVal = (remesasPendientes || []).reduce((acc, curr) => acc + curr.monto, 0);
                                const deudasList = (deudas && Array.isArray(deudas)) ? deudas : [];

                                console.log("Cargando Tesorería - Deudas encontradas:", deudasList.length);

                                res.render('tesoreria', { 
                                    remesasPendientes: remesasPendientes || [], 
                                    saldosPorBanco: saldosPorBanco || [], 
                                    saldoTesoreriaTotal: saldoTesoreriaTotal || 0, 
                                    enTransito: enTransitoVal,
                                    enTránsito: enTransitoVal, // Para compatibilidad
                                    historial: historial || [], 
                                    bancos: bancos || [],
                                    tiendas: tiendas || [],
                                    deudas: deudasList,
                                    user: req.session.user 
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

app.post('/tesoreria/recibir/:id', requireAdminOrContador, (req, res) => {
    const id = req.params.id;
    const now = getLocalTime();
    db.run("UPDATE remesas SET estado = 'Recibido', fecha_recepcion = ?, usuario_recibe_id = ? WHERE id = ?", 
           [now, req.session.user.id, id], (err) => res.redirect('/tesoreria'));
});

app.post('/tesoreria/gasto', requireAdminOrContador, (req, res) => {
    const { monto, banco_id, categoria, descripcion } = req.body;
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) return res.status(400).send("Monto inválido");
    const now = getLocalTime();
    
    // Combinar categoría y descripción visible
    const descFinal = descripcion ? `${categoria} - ${descripcion}` : categoria;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run("INSERT INTO tesoreria_log (tipo, monto, referencia, fecha_hora, banco_id) VALUES ('Gasto Bancario', ?, ?, ?, ?)", 
               [montoNum, descFinal, now, banco_id || null]);
        if (banco_id) {
            db.run("UPDATE saldos_bancarios SET saldo = saldo - ?, actualizado_en = ? WHERE banco_id = ?", [montoNum, now, banco_id]);
        }
        db.run('COMMIT', () => res.redirect('/tesoreria'));
    });
});

app.post('/tesoreria/deposito-propietario', requireAdminOrContador, (req, res) => {
    const { monto, referencia, banco_id } = req.body;
    const montoNum = parseFloat((monto || '0').replace(/,/g, '')) || 0;
    const now = getLocalTime();
    const bId = banco_id && banco_id !== "" ? banco_id : null;
    
    db.run("INSERT INTO tesoreria_log (tipo, monto, referencia, fecha_hora, banco_id) VALUES ('Entrega Dueño', ?, ?, ?, ?)", 
           [montoNum, referencia || 'Retiro Capital', now, bId], (err) => res.redirect('/tesoreria'));
});

app.post('/tesoreria/deposito-banco', requireAdminOrContador, (req, res) => {
    const { monto, banco_origen, banco_destino, referencia, adelantado } = req.body;
    const montoNum = parseFloat((monto || '0').replace(/,/g, '')) || 0;
    if (montoNum <= 0) return res.status(400).send("Monto inválido");
    
    const bOrigenId = banco_origen && banco_origen !== "" ? banco_origen : null;
    const now = getLocalTime();
    
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        if (adelantado === 'on' || adelantado === 'true') {
            // Depósito adelantado: Incrementa banco virtual, crea deuda, NO sale de tesorería aún.
            db.run("INSERT INTO depositos_adelantados (banco_id, monto, referencia, fecha_hora, estado) VALUES (?, ?, ?, ?, 'Pendiente')",
                [banco_destino, montoNum, referencia || 'Depósito Adelantado', now]);
        } else {
            // Depósito normal: Incrementa banco virtual y sale de tesorería central.
            db.run("INSERT INTO tesoreria_log (tipo, monto, referencia, fecha_hora, banco_id, banco_destino_id) VALUES ('Depósito a Banco', ?, ?, ?, ?, ?)", 
                   [montoNum, referencia || 'Depósito desde Tesorería', now, bOrigenId, banco_destino]);
        }
        
        db.run("UPDATE saldos_bancarios SET saldo = saldo + ?, actualizado_en = ? WHERE banco_id = ?", [montoNum, now, banco_destino]);
        db.run('COMMIT', () => res.redirect('/tesoreria'));
    });
});

app.post('/tesoreria/enviar-tienda', requireAdminOrContador, (req, res) => {
    const { monto, tienda_id, banco_origen, referencia } = req.body;
    const montoNum = parseFloat((monto || '0').replace(/,/g, '')) || 0;
    if (montoNum <= 0 || !tienda_id) return res.status(400).send("Datos inválidos");
    
    const bOrigenId = banco_origen && banco_origen !== "" ? banco_origen : null;
    const now = getLocalTime();
    
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        // 1. Salida de Tesorería Central
        db.run("INSERT INTO tesoreria_log (tipo, monto, referencia, fecha_hora, banco_id) VALUES ('Envío a Tienda', ?, ?, ?, ?)", 
               [montoNum, referencia || 'Envío de Efectivo', now, bOrigenId]);
        
        // 2. Registro de Transacción para la Tienda (Audit trail y balance)
        // Se registra como ingreso de efectivo físico.
        db.run(`INSERT INTO transacciones (tienda_id, banco_id, usuario_id, tipo, monto_efectivo, monto_banco, referencia, fecha_hora) 
                VALUES (?, ?, ?, 'Resurtido Tesorería', ?, 0, ?, ?)`, 
                [tienda_id, bOrigenId, req.session.user.id, montoNum, referencia || 'Recibido de Tesorería', now]);

        // 3. Entrada en Tienda
        db.run("UPDATE tiendas SET efectivo_actual = efectivo_actual + ? WHERE id = ?", [montoNum, tienda_id]);
        
        db.run('COMMIT', (err) => {
            if (err) console.error("Error al enviar a tienda:", err);
            res.redirect('/tesoreria');
        });
    });
});

app.post('/tesoreria/pagar-adelantado/:id', requireAdminOrContador, (req, res) => {
    const id = req.params.id;
    const now = getLocalTime();
    
    db.get("SELECT * FROM depositos_adelantados WHERE id = ?", [id], (err, dep) => {
        if (!dep || dep.estado !== 'Pendiente') return res.redirect('/tesoreria');
        
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            // 1. Salida física de tesorería
            db.run("INSERT INTO tesoreria_log (tipo, monto, referencia, fecha_hora, banco_id) VALUES ('Pago Depósito Adelantado', ?, ?, ?, ?)", 
                   [dep.monto, dep.referencia || 'Pago de Depósito Pendiente', now, dep.banco_id]);
            // 2. Marcar deuda como pagada
            db.run("UPDATE depositos_adelantados SET estado = 'Pagado', fecha_pago = ? WHERE id = ?", [now, id]);
            db.run('COMMIT', () => res.redirect('/tesoreria'));
        });
    });
});

app.post('/tesoreria/traslado', requireAdminOrContador, (req, res) => {
    const { monto, banco_id, referencia, tipo_traslado } = req.body;
    const montoNum = parseFloat((monto || '0').replace(/,/g, '')) || 0;
    if (montoNum <= 0 || !banco_id) return res.status(400).send("Datos inválidos");
    
    const now = getLocalTime();
    // Determinamos si afecta el efectivo físico para el cálculo de saldos en tesorería
    const afectaEfectivo = (tipo_traslado === 'saldo_y_efectivo' || tipo_traslado === 'solo_efectivo');
    const tipoLog = afectaEfectivo ? 'Traslado (Efectivo)' : 'Traslado (Solo Saldo)';
    
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // 1. Solo incrementa el saldo virtual si NO es "Solo Efectivo"
        if (tipo_traslado !== 'solo_efectivo') {
            db.run("UPDATE saldos_bancarios SET saldo = saldo + ?, actualizado_en = ? WHERE banco_id = ?", [montoNum, now, banco_id]);
        }
        
        // 2. Registrar en el log de tesorería
        db.run("INSERT INTO tesoreria_log (tipo, monto, referencia, fecha_hora, banco_id) VALUES (?, ?, ?, ?, ?)", 
               [tipoLog, montoNum, referencia || 'Traslado de Fondos', now, banco_id]);
               
        db.run('COMMIT', () => res.redirect('/tesoreria'));
    });
});

// Transacciones Listado
app.get('/transacciones', requireAuth, (req, res) => {
    let query = `
        SELECT t.*, ti.nombre as tienda_nombre, b.nombre as banco_nombre, u.username 
        FROM transacciones t 
        LEFT JOIN tiendas ti ON t.tienda_id = ti.id 
        LEFT JOIN bancos b ON t.banco_id = b.id 
        LEFT JOIN usuarios u ON t.usuario_id = u.id
        WHERE 1=1
    `;
    let params = [];
    if (req.session.user.rol === 'Cajero') {
        query += " AND t.tienda_id = ?";
        params.push(req.session.user.tienda_id);
    }
    query += " ORDER BY t.fecha_hora DESC";

    db.all(query, params, (err, transacciones) => {
        if (err) return res.status(500).send("Error");
        db.all("SELECT * FROM tiendas", [], (err, tiendas) => {
            db.all("SELECT * FROM bancos", [], (err, bancos) => {
                res.render('transacciones', { transacciones, tiendas, bancos });
            });
        });
    });
});

// Operar View
// Usuarios View
app.get('/usuarios', requireAdminOrContador, (req, res) => {
    db.all("SELECT u.*, t.nombre as tienda_nombre FROM usuarios u LEFT JOIN tiendas t ON u.tienda_id = t.id", [], (err, usuarios) => {
        db.all("SELECT * FROM tiendas", [], (err, tiendas) => {
            res.render('usuarios', { usuarios, tiendas, user: req.session.user });
        });
    });
});

app.post('/usuarios/nuevo', requireAdmin, (req, res) => {
    const { username, password, rol, tienda_id } = req.body;
    const finalTienda = rol === 'Cajero' ? tienda_id : null;
    db.run("INSERT INTO usuarios (username, password, rol, tienda_id) VALUES (?, ?, ?, ?)", [username, password, rol, finalTienda], (err) => {
        res.redirect('/usuarios');
    });
});

// Deposito a Cuenta Global
app.get('/operar/deposito', requireAuth, (req, res) => {
    if(req.session.user.rol !== 'Admin' && req.session.user.rol !== 'Contador') return res.status(403).send("No autorizado");
    db.all("SELECT * FROM tiendas", [], (err, tiendas) => {
        db.all("SELECT * FROM bancos", [], (err, bancos) => {
            res.render('deposito', { tiendas, bancos, user: req.session.user });
        });
    });
});

app.post('/transaccion/deposito', requireAuth, (req, res) => {
    if(req.session.user.rol !== 'Admin' && req.session.user.rol !== 'Contador') return res.status(403).send("No autorizado");
    
    const { tienda_id, banco_id, monto, referencia } = req.body;
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) return res.status(400).send("Monto inválido");

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Efectivo -= monto, Banco += monto
        db.run(`INSERT INTO transacciones (tienda_id, banco_id, usuario_id, tipo, monto_efectivo, monto_banco, referencia) 
                VALUES (?, ?, ?, 'Depósito Cuenta', ?, ?, ?)`, 
                [tienda_id, banco_id, req.session.user.id, -montoNum, montoNum, referencia]);
                
        db.run(`UPDATE tiendas SET efectivo_actual = efectivo_actual - ? WHERE id = ?`, [montoNum, tienda_id]);
        db.run(`UPDATE saldos_bancarios SET saldo = saldo + ?, actualizado_en = CURRENT_TIMESTAMP WHERE banco_id = ?`, [montoNum, banco_id]);
        
        db.run('COMMIT', (err) => {
            res.redirect('/');
        });
    });
});

// Rutas de Apertura
app.get('/apertura', requireAuth, (req, res) => {
    if (req.session.user.rol !== 'Cajero') return res.redirect('/');
    db.all("SELECT * FROM bancos", [], (err, bancos) => {
        res.render('apertura', { user: req.session.user, bancos });
    });
});

app.post('/apertura/nueva', requireAuth, (req, res) => {
    const { monto_efectivo, ...saldos_bancos } = req.body;
    const montoEfNum = parseFloat(monto_efectivo.replace(/,/g, ""));
    const { id: usuario_id, tienda_id } = req.session.user;
    const now = getLocalTime();

    // Procesar saldos de bancos a JSON
    let bancosData = {};
    for (let key in saldos_bancos) {
        if (key.startsWith('banco_')) {
            let bancoId = key.replace('banco_', '');
            bancosData[bancoId] = parseFloat(saldos_bancos[key].replace(/,/g, "")) || 0;
        }
    }
    const bancosJson = JSON.stringify(bancosData);

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run("INSERT INTO aperturas_caja (tienda_id, usuario_id, saldo_inicial_efectivo, saldos_bancos_json, fecha_hora) VALUES (?, ?, ?, ?, ?)", 
            [tienda_id, usuario_id, montoEfNum, bancosJson, now]);
        
        // Sincronizamos el efectivo de la tienda con la apertura
        db.run("UPDATE tiendas SET efectivo_actual = ? WHERE id = ?", [montoEfNum, tienda_id]);
        db.run('COMMIT', (err) => res.redirect('/operar/' + tienda_id));
    });
});

app.get('/operar/:tienda_id', requireAuth, requireApertura, (req, res) => {
    // Solo Admin y Cajero pueden operar. Contador es solo lectura.
    if (req.session.user.rol === 'Contador') {
        return res.status(403).send("Acceso denegado: El rol Contador es solo lectura.");
    }
    // Validar acceso si es cajero
    if (req.session.user.rol === 'Cajero' && req.session.user.tienda_id != req.params.tienda_id) {
        return res.status(403).send("Acceso denegado a esta tienda.");
    }

    const tiendaId = req.params.tienda_id;
    const bancoId = req.query.banco_id || null;
    
    db.get("SELECT * FROM tiendas WHERE id = ?", [tiendaId], (err, tienda) => {
        if (err || !tienda) return res.status(404).send("Tienda no encontrada.");
        
        db.all("SELECT b.*, s.saldo as saldo_virtual FROM bancos b LEFT JOIN saldos_bancarios s ON b.id = s.banco_id", [], (err, bancos) => {
            
            // Calcular efectivo físico disponible por banco
            db.get("SELECT * FROM aperturas_caja WHERE tienda_id = ? ORDER BY fecha_hora DESC LIMIT 1", [tiendaId], (err, apertura) => {
                let inicialPorBanco = {};
                if (apertura && apertura.saldos_bancos_json) {
                    try { inicialPorBanco = JSON.parse(apertura.saldos_bancos_json); } catch(e){}
                }

                const fechaApertura = apertura ? apertura.fecha_hora : null;

                db.all(`
                    SELECT banco_id, SUM(monto_efectivo) as neto_txn 
                    FROM transacciones 
                    WHERE tienda_id = ? AND fecha_hora >= COALESCE(?, '2000-01-01')
                    GROUP BY banco_id
                `, [tiendaId, fechaApertura], (err, txns) => {
                    
                    const fisicoPorBanco = {};
                    bancos.forEach(b => {
                        const inicial = parseFloat(inicialPorBanco[b.id] || 0);
                        const txRow = (txns || []).find(t => t.banco_id === b.id);
                        const neto = txRow ? (txRow.neto_txn || 0) : 0;
                        fisicoPorBanco[b.id] = Math.max(0, inicial + neto);
                    });
                    
                    res.render('operar', { tienda, bancos, selectedBancoId: bancoId, fisicoPorBanco });
                });
            });
        });
    });
});

app.post('/transaccion', requireAuth, (req, res) => {
    if (req.session.user.rol === 'Contador') {
        return res.status(403).send("Acceso denegado: El rol Contador es solo lectura.");
    }
    const { tienda_id, banco_id, tipo, monto, referencia } = req.body;
    const montoNum = parseFloat(monto);
    
    if (isNaN(montoNum) || montoNum <= 0) {
        return res.status(400).send("Monto inválido");
    }

    db.get("SELECT * FROM comisiones WHERE banco_id = ? AND tipo_transaccion = ?", [banco_id, tipo], (err, comision) => {
        if (err) {
            console.error("Error buscando comisiones:", err);
            return res.status(500).send("Error al procesar comisiones");
        }

        let comEf = comision ? comision.valor_efectivo : 0;
        let comVi = comision ? comision.valor_virtual : 0;
        let resEf = 0, resVi = 0;

        if (tipo === 'Depósito') {
            resEf = montoNum + comEf; resVi = -montoNum + comVi;
        } else if (tipo === 'Retiro') {
            resEf = -montoNum + comEf; resVi = montoNum + comVi;
        } else if (tipo === 'Pago Servicio') {
            resEf = montoNum + comEf; resVi = -montoNum + comVi;
        } else if (tipo === 'Pago Caja Empresarial') {
            resEf = montoNum + comEf; resVi = -montoNum + comVi;
        } else if (tipo === 'Depósito Cuenta') {
            resEf = -montoNum + comEf; resVi = montoNum + comVi;
        } else if (tipo === 'Efectivo Entregado') {
            resEf = -montoNum; resVi = 0;
        }

        const now = getLocalTime();
        
        // Iniciamos transacción manual para mayor control
        db.run('BEGIN TRANSACTION', (err) => {
            if (err) return res.status(500).send("No se pudo iniciar la transacción");

            const insertSql = `INSERT INTO transacciones (tienda_id, banco_id, usuario_id, tipo, monto_efectivo, monto_banco, comision_efectivo, comision_banco, referencia, fecha_hora) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            const insertParams = [tienda_id, banco_id || null, req.session.user.id, tipo, resEf, resVi, comEf, comVi, referencia, now];

            db.run(insertSql, insertParams, function(err) {
                if (err) {
                    console.error("Error en INSERT:", err);
                    return db.run('ROLLBACK', () => res.status(500).send("Error al registrar transación: " + err.message));
                }

                db.run(`UPDATE tiendas SET efectivo_actual = efectivo_actual + ? WHERE id = ?`, [resEf, tienda_id], (err) => {
                    if (err) {
                        console.error("Error en UPDATE Tienda:", err);
                        return db.run('ROLLBACK', () => res.status(500).send("Error al actualizar caja: " + err.message));
                    }

                    const finishTransaction = () => {
                        if (tipo === 'Efectivo Entregado') {
                            db.run(`INSERT INTO remesas (tienda_id, monto, fecha_envio, estado) VALUES (?, ?, ?, 'Pendiente')`, 
                                [tienda_id, montoNum, now], (err) => {
                                    if (err) {
                                        console.error("Error al crear remesa:", err);
                                        return db.run('ROLLBACK', () => res.status(500).send("Error al registrar entrega: " + err.message));
                                    }
                                    db.run('COMMIT', (err) => res.redirect('/operar/' + tienda_id));
                                });
                        } else {
                            db.run('COMMIT', (err) => res.redirect('/operar/' + tienda_id));
                        }
                    };

                    if (banco_id && resVi !== 0) {
                        db.run(`UPDATE saldos_bancarios SET saldo = saldo + ?, actualizado_en = ? WHERE banco_id = ?`, [resVi, now, banco_id], (err) => {
                            if (err) {
                                console.error("Error en UPDATE Banco:", err);
                                return db.run('ROLLBACK', () => res.status(500).send("Error al actualizar banco: " + err.message));
                            }
                            finishTransaction();
                        });
                    } else {
                        finishTransaction();
                    }
                });
            });
        });
    });
});

// Configuración View
app.get('/configuracion', requireAdminOrContador, (req, res) => {
    db.all("SELECT b.*, s.saldo, s.saldo_inicial FROM bancos b LEFT JOIN saldos_bancarios s ON b.id = s.banco_id", [], (err, saldos) => {
        db.all("SELECT c.*, b.nombre as banco_nombre, b.color as banco_color FROM comisiones c JOIN bancos b ON c.banco_id = b.id", [], (err, comisiones) => {
            res.render('configuracion', { saldos, comisiones, user: req.session.user });
        });
    });
});

app.post('/config/saldos', requireAdminOrContador, (req, res) => {
    const { banco_id, saldo_inicial } = req.body;
    db.get("SELECT saldo_inicial, saldo FROM saldos_bancarios WHERE banco_id = ?", [banco_id], (err, row) => {
        // Limpiamos TODO lo que no sea número, punto decimal o signo menos
        const limpio = (saldo_inicial || "0").toString().replace(/[^0-9.-]+/g, "");
        let nuevo_inicial = parseFloat(limpio) || 0;
        let viejo_inicial = row ? (row.saldo_inicial || 0) : 0;
        let diff = nuevo_inicial - viejo_inicial;
        
        db.run("UPDATE saldos_bancarios SET saldo_inicial = ?, saldo = saldo + ?, actualizado_en = CURRENT_TIMESTAMP WHERE banco_id = ?", 
            [nuevo_inicial, diff, banco_id], (err) => {
            res.redirect('/configuracion');
        });
    });
});

app.post('/config/comisiones', requireAdminOrContador, (req, res) => {
    const { comision_id, valor_efectivo, valor_virtual } = req.body;
    db.run("UPDATE comisiones SET valor_efectivo = ?, valor_virtual = ? WHERE id = ?", [parseFloat(valor_efectivo), parseFloat(valor_virtual), comision_id], (err) => {
        res.redirect('/configuracion');
    });
});

app.post('/config/reset', requireAdmin, (req, res) => {
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        // Borrar todo el historial operativo
        db.run('DELETE FROM transacciones');
        db.run('DELETE FROM cierres_caja');
        db.run('DELETE FROM remesas');
        db.run('DELETE FROM tesoreria_log');
        db.run('DELETE FROM aperturas_caja');
        db.run('DELETE FROM gastos');
        db.run('DELETE FROM saldos_iniciales_tiendas');
        
        // Resetear todos los contadores a cero
        db.run('UPDATE tiendas SET efectivo_actual = 0');
        db.run('UPDATE saldos_bancarios SET saldo = 0, saldo_inicial = 0');
        
        db.run('COMMIT', (err) => {
            if (err) return res.status(500).send("Error al reiniciar base de datos");
            res.redirect('/configuracion?reset=success');
        });
    });
});

// Cierres de Caja
app.get('/cierres', requireAuth, (req, res) => {
    let query = `
        SELECT c.*, t.nombre as tienda_nombre, u.username 
        FROM cierres_caja c 
        JOIN tiendas t ON c.tienda_id = t.id 
        JOIN usuarios u ON c.usuario_id = u.id
    `;
    let params = [];
    if (req.session.user.rol === 'Cajero') {
        query += " WHERE c.tienda_id = ?";
        params.push(req.session.user.tienda_id);
    }
    query += " ORDER BY c.fecha DESC";

    db.all(query, params, (err, cierres) => {
        db.all("SELECT * FROM bancos", [], (err, bancos) => {
            if (cierres.length === 0) {
                return res.render('cierres', { cierres: [], bancos, user: req.session.user });
            }
            const cierresEnriquecidos = [];
            let pending = cierres.length;

            cierres.forEach((cierre) => {
                db.get(`
                    SELECT fecha_hora, saldo_inicial_efectivo, saldos_bancos_json 
                    FROM aperturas_caja 
                    WHERE tienda_id = ? AND fecha_hora <= ?
                    ORDER BY fecha_hora DESC LIMIT 1
                `, [cierre.tienda_id, cierre.fecha], (err, apertura) => {
                    const fechaDesde = apertura ? apertura.fecha_hora : '2000-01-01';
                    const saldoInicialEf = apertura ? (apertura.saldo_inicial_efectivo || 0) : 0;

                    db.all(`
                        SELECT tipo,
                               SUM(CASE WHEN monto_efectivo > 0 THEN monto_efectivo ELSE 0 END) as entrada_ef,
                               SUM(CASE WHEN monto_efectivo < 0 THEN ABS(monto_efectivo) ELSE 0 END) as salida_ef,
                               COUNT(*) as cantidad
                        FROM transacciones
                        WHERE tienda_id = ? AND fecha_hora >= ? AND fecha_hora <= ?
                        GROUP BY tipo
                    `, [cierre.tienda_id, fechaDesde, cierre.fecha], (err, txTipos) => {

                        db.all(`
                            SELECT t.banco_id, b.nombre as banco_nombre, b.color as banco_color,
                                   SUM(CASE WHEN t.monto_efectivo > 0 THEN t.monto_efectivo ELSE 0 END) as entrada_ef,
                                   SUM(CASE WHEN t.monto_efectivo < 0 THEN ABS(t.monto_efectivo) ELSE 0 END) as salida_ef,
                                   SUM(t.monto_efectivo) as neto_ef,
                                   COUNT(*) as ops
                            FROM transacciones t
                            JOIN bancos b ON t.banco_id = b.id
                            WHERE t.tienda_id = ? AND t.fecha_hora >= ? AND t.fecha_hora <= ?
                            GROUP BY t.banco_id
                        `, [cierre.tienda_id, fechaDesde, cierre.fecha], (err, txBancos) => {

                            const resumen = { depositos: 0, retiros: 0, pagos_servicio: 0, caja_empresarial: 0, efectivo_entregado: 0, deposito_cuenta: 0, total_ops: 0 };
                            (txTipos || []).forEach(t => {
                                resumen.total_ops += t.cantidad;
                                if (t.tipo === 'Depósito') resumen.depositos = t.entrada_ef;
                                else if (t.tipo === 'Retiro') resumen.retiros = t.salida_ef;
                                else if (t.tipo === 'Pago Servicio') resumen.pagos_servicio = t.entrada_ef;
                                else if (t.tipo === 'Pago Caja Empresarial') resumen.caja_empresarial = t.entrada_ef;
                                else if (t.tipo === 'Efectivo Entregado') resumen.efectivo_entregado = t.salida_ef;
                                else if (t.tipo === 'Depósito Cuenta') resumen.deposito_cuenta = t.salida_ef;
                            });
                            const totalMovido = resumen.depositos + resumen.pagos_servicio + resumen.caja_empresarial;
                            cierre.resumen = resumen;
                            cierre.txBancos = txBancos || [];
                            cierre.saldoInicialEf = saldoInicialEf;
                            cierre.totalMovido = totalMovido;

                            // Parsear desglose_bancos guardado en texto
                            let declaradoPorBanco = {};
                            let entregaPorBanco = {};
                            if (cierre.desglose_bancos) {
                                const partes = cierre.desglose_bancos.split('||');
                                const decParte = partes[0] || '';
                                const entParte = partes[1] || '';
                                decParte.split('|').forEach(s => {
                                    const m = s.trim().match(/^(.+?):\s*L\s*([\d.,]+)$/);
                                    if (m) declaradoPorBanco[m[1].trim()] = parseFloat(m[2].replace(/,/g,'')) || 0;
                                });
                                if (entParte.includes('ENTREGA:')) {
                                    entParte.replace('ENTREGA:', '').split('/').forEach(s => {
                                        const m = s.trim().match(/^(.+?):\s*L\s*([\d.,]+)$/);
                                        if (m) entregaPorBanco[m[1].trim()] = parseFloat(m[2].replace(/,/g,'')) || 0;
                                    });
                                }
                            }
                            cierre.declaradoPorBanco = declaradoPorBanco;
                            cierre.entregaPorBanco = entregaPorBanco;
                            cierre.totalEntregado = Object.values(entregaPorBanco).reduce((a,b) => a+b, 0);

                            cierresEnriquecidos.push(cierre);
                            pending--;
                            if (pending === 0) {
                                cierresEnriquecidos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                                res.render('cierres', { cierres: cierresEnriquecidos, bancos, user: req.session.user });
                            }
                        });
                    });
                });
            });
        });
    });
});


app.post('/cierres/nuevo', requireAuth, (req, res) => {
    if(req.session.user.rol !== 'Cajero') return res.status(403).send("Solo cajeros pueden realizar cierres");

    const { observaciones, ...resto } = req.body;

    let saldoReals = 0;
    let totalEntrega = 0;
    let desgloseArr = [];
    let entregaArr = [];

    // Separar campos de declarado y campos de entrega
    const declarados = {};
    const entregas = {};

    for (let key in resto) {
        const raw = (resto[key] || '0').replace(/,/g, '');
        const val = parseFloat(raw) || 0;
        if (key.startsWith('entrega_banco_')) {
            const nombre = key.replace('entrega_banco_', '');
            entregas[nombre] = val;
            totalEntrega += val;
            if (val > 0) entregaArr.push(`${nombre}: L ${val.toFixed(2)}`);
        } else if (key.startsWith('banco_')) {
            const nombre = key.replace('banco_', '');
            declarados[nombre] = val;
            saldoReals += val;
            desgloseArr.push(`${nombre}: L ${val.toFixed(2)}`);
        }
    }

    const saldoFinal = Math.max(0, saldoReals - totalEntrega);
    let desgloseText = desgloseArr.join(' | ');
    if (entregaArr.length > 0) {
        desgloseText += ` || ENTREGA: ${entregaArr.join(' / ')}`;
    }

    db.get("SELECT efectivo_actual FROM tiendas WHERE id = ?", [req.session.user.tienda_id], (err, tienda) => {
        if(!tienda) return res.status(400).send("Tienda no encontrada");
        const saldoTeorico = tienda.efectivo_actual;
        const diferencia = saldoReals - saldoTeorico;
        const now = getLocalTime();

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            db.run(`INSERT INTO cierres_caja (tienda_id, usuario_id, saldo_teorico, saldo_real, diferencia, desglose_bancos, observaciones) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [req.session.user.tienda_id, req.session.user.id, saldoTeorico, saldoReals, diferencia, desgloseText, observaciones]);

            // Cerrar apertura actual
            db.run("UPDATE aperturas_caja SET estado = 'Cerrada' WHERE usuario_id = ? AND estado = 'Abierta'", [req.session.user.id]);

            // Saldo que queda en tienda para mañana
            db.run("UPDATE tiendas SET efectivo_actual = ? WHERE id = ?", [saldoFinal, req.session.user.tienda_id]);

            // Si hay entrega al contador, crear remesas por banco
            for (let bankIdOrName in entregas) {
                const monto = entregas[bankIdOrName];
                if (monto > 0) {
                    // Si bankIdOrName es un ID numérico (de bancos reales) o "Otros"
                    const bId = parseInt(bankIdOrName) || null; 
                    const obsEnvio = bId ? `Entrega de banco` : `Entrega Otros`;
                    db.run(`INSERT INTO remesas (tienda_id, monto, fecha_envio, estado, observaciones, banco_id) VALUES (?, ?, ?, 'Pendiente', ?, ?)`,
                        [req.session.user.tienda_id, monto, now, obsEnvio, bId]);
                }
            }

            db.run('COMMIT', (err) => {
                if (err) return res.status(500).send("Error al procesar cierre");
                res.redirect('/cierres');
            });
        });
    });
});

app.post('/cierres/eliminar/:id', requireAdminOrContador, (req, res) => {
    db.get("SELECT * FROM cierres_caja WHERE id = ?", [req.params.id], (err, cierre) => {
        if (!cierre) return res.redirect('/cierres');
        
        const today = getLocalTime().split(' ')[0]; // YYYY-MM-DD
        
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            // 1. Restaurar efectivo de la tienda a lo que tenía antes del cierre
            db.run("UPDATE tiendas SET efectivo_actual = ? WHERE id = ?", [cierre.saldo_teorico, cierre.tienda_id]);
            
            // 2. Reabrir la última apertura que haya sido cerrada
            db.get("SELECT id FROM aperturas_caja WHERE tienda_id = ? AND estado = 'Cerrada' ORDER BY id DESC LIMIT 1", [cierre.tienda_id], (err, ap) => {
                if (ap) {
                    db.run("UPDATE aperturas_caja SET estado = 'Abierta' WHERE id = ?", [ap.id]);
                }
                
                // 3. Eliminar el registro del cierre histórico
                db.run("DELETE FROM cierres_caja WHERE id = ?", [cierre.id]);
                
                // 4. Eliminar remesas enviadas a Tesorería que queden 'Pendientes' vinculadas al día de hoy para esta tienda
                db.run("DELETE FROM remesas WHERE tienda_id = ? AND estado = 'Pendiente' AND fecha_envio LIKE ?", [cierre.tienda_id, today + '%']);

                db.run('COMMIT', () => res.redirect('/cierres'));
            });
        });
    });
});

app.post('/usuarios/editar', requireAdmin, (req, res) => {
    const { id, username, password, rol, tienda_id } = req.body;
    const finalTienda = rol === 'Cajero' ? tienda_id : null;
    db.run("UPDATE usuarios SET username = ?, password = ?, rol = ?, tienda_id = ? WHERE id = ?", [username, password, rol, finalTienda, id], (err) => {
        res.redirect('/usuarios');
    });
});

app.post('/usuarios/eliminar', requireAdmin, (req, res) => {
    const { id } = req.body;
    db.run("DELETE FROM usuarios WHERE id = ? AND username != 'admin'", [id], (err) => {
        res.redirect('/usuarios');
    });
});

// GESTIÓN DE TRANSACCIONES (EDITAR / ELIMINAR)
app.post('/transacciones/eliminar/:id', requireAdminOrContador, (req, res) => {
    const id = req.params.id;
    db.get("SELECT * FROM transacciones WHERE id = ?", [id], (err, tx) => {
        if (!tx || err) return res.status(404).send("Transacción no encontrada");

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            // REVERTIR SALDOS
            if (tx.tienda_id) {
                db.run("UPDATE tiendas SET efectivo_actual = efectivo_actual - ? WHERE id = ?", [tx.monto_efectivo || 0, tx.tienda_id]);
            }
            if (tx.banco_id) {
                db.run("UPDATE saldos_bancarios SET saldo = saldo - ? WHERE banco_id = ?", [tx.monto_banco || 0, tx.banco_id]);
            }
            db.run("DELETE FROM transacciones WHERE id = ?", [id]);
            db.run('COMMIT', (err) => {
                if (err) return res.status(500).send("Error en la base de datos");
                res.redirect('/transacciones');
            });
        });
    });
});

app.post('/transacciones/editar/:id', requireAdminOrContador, (req, res) => {
    const id = req.params.id;
    const { monto, referencia } = req.body;
    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum < 0) return res.status(400).send("Monto inválido");

    db.get("SELECT * FROM transacciones WHERE id = ?", [id], (err, oldTx) => {
        if (!oldTx || err) return res.status(404).send("Transacción no encontrada");

        db.get("SELECT * FROM comisiones WHERE banco_id = ? AND tipo_transaccion = ?", [oldTx.banco_id, oldTx.tipo], (err, comision) => {
            let comEf = comision ? comision.valor_efectivo : 0;
            let comVi = comision ? comision.valor_virtual : 0;
            let resEf = 0, resVi = 0;

            if (oldTx.tipo === 'Depósito' || oldTx.tipo === 'Pago Caja Empresarial') {
                resEf = montoNum + comEf; resVi = -montoNum + comVi;
            } else if (oldTx.tipo === 'Retiro') {
                resEf = -montoNum + comEf; resVi = montoNum + comVi;
            } else if (oldTx.tipo === 'Pago Servicio') {
                resEf = montoNum + comEf; resVi = -montoNum + comVi;
            } else if (oldTx.tipo === 'Depósito Cuenta') {
                resEf = -montoNum + comEf; resVi = montoNum + comVi;
            } else if (oldTx.tipo === 'Gasto') {
                resEf = 0; resVi = -montoNum;
            }

            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                const now = getLocalTime();
                // 1. REVERTIR VIEJO
                if (oldTx.tienda_id) {
                    db.run("UPDATE tiendas SET efectivo_actual = efectivo_actual - ? WHERE id = ?", [oldTx.monto_efectivo || 0, oldTx.tienda_id]);
                }
                if (oldTx.banco_id) {
                    db.run("UPDATE saldos_bancarios SET saldo = saldo - ? WHERE banco_id = ?", [oldTx.monto_banco || 0, oldTx.banco_id]);
                }

                // 2. APLICAR NUEVO
                if (oldTx.tienda_id) {
                    db.run("UPDATE tiendas SET efectivo_actual = efectivo_actual + ? WHERE id = ?", [resEf, oldTx.tienda_id]);
                }
                if (oldTx.banco_id) {
                    db.run("UPDATE saldos_bancarios SET saldo = saldo + ? WHERE banco_id = ?", [resVi, oldTx.banco_id]);
                }

                db.run(`UPDATE transacciones SET monto_efectivo = ?, monto_banco = ?, comision_efectivo = ?, comision_banco = ?, referencia = ?, fecha_hora = ? WHERE id = ?`, 
                        [resEf, resVi, comEf, comVi, referencia, now, id]);

                db.run('COMMIT', () => res.redirect('/transacciones'));
            });
        });
    });
});

// GESTIÓN DE GASTOS OPERATIVOS (EDITAR / ELIMINAR)
app.post('/gastos/eliminar/:id', requireAdminOrContador, (req, res) => {
    const id = req.params.id;
    db.get("SELECT * FROM gastos WHERE id = ?", [id], (err, gasto) => {
        if (!gasto || err) return res.status(404).send("Gasto no encontrado");
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            db.run("UPDATE saldos_bancarios SET saldo = saldo + ? WHERE banco_id = ?", [gasto.monto, gasto.banco_id]);
            db.run("DELETE FROM gastos WHERE id = ?", [id]);
            db.run('COMMIT', () => res.redirect('/gastos'));
        });
    });
});

app.post('/gastos/editar/:id', requireAdminOrContador, (req, res) => {
    const id = req.params.id;
    const { monto, descripcion, categoria } = req.body;
    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum < 0) return res.status(400).send("Monto inválido");

    db.get("SELECT * FROM gastos WHERE id = ?", [id], (err, oldGasto) => {
        if (!oldGasto || err) return res.status(404).send("Gasto no encontrado");
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            // Revertir viejo, aplicar nuevo
            db.run("UPDATE saldos_bancarios SET saldo = saldo + ? WHERE banco_id = ?", [oldGasto.monto, oldGasto.banco_id]);
            db.run("UPDATE saldos_bancarios SET saldo = saldo - ? WHERE banco_id = ?", [montoNum, oldGasto.banco_id]);
            db.run("UPDATE gastos SET monto = ?, descripcion = ?, categoria = ? WHERE id = ?", [montoNum, descripcion, categoria, id]);
            db.run('COMMIT', () => res.redirect('/gastos'));
        });
    });
});

// Reportes (Separado de Cierres para Admin)
app.get('/reportes', requireAuth, (req, res) => {
    if(req.session.user.rol === 'Cajero') return res.redirect('/cierres'); // Cajeros van a su cierre

    let query = `
        SELECT c.*, t.nombre as tienda_nombre, u.username 
        FROM cierres_caja c 
        JOIN tiendas t ON c.tienda_id = t.id 
        JOIN usuarios u ON c.usuario_id = u.id
        ORDER BY c.fecha DESC
    `;
    db.all(query, [], (err, cierres) => {
        res.render('reportes', { cierres, user: req.session.user });
    });
});

// Endpoint para verificación de estado del servidor (Health Check)
// Ruta de diagnóstico pura (SIN base de datos)
app.get('/test-online', (req, res) => {
    res.send(`<h1>✅ Servidor Agentes ONLINE</h1><p>Versión: 1.0.1</p><p>Puerto: ${PORT}</p><p>Hora: ${getLocalTime()}</p>`);
});

app.get('/api/status', (req, res) => {
    db.get('SELECT 1 FROM usuarios LIMIT 1', [], (err, row) => {
        if (err) {
            return res.status(500).json({ status: 'error', db: 'disconnected' });
        }
        res.json({ status: 'ok', db: 'connected' });
    });
});



// ==========================================
// MIGRACIÓN TEMPORAL DE BASE DE DATOS
// ==========================================
app.post('/migrate-db',
    express.raw({ type: 'application/octet-stream', limit: '100mb' }),
    (req, res) => {
        const secret = req.headers['x-migration-secret'];
        const expectedSecret = process.env.MIGRATION_SECRET;
        if (!expectedSecret || secret !== expectedSecret) {
            return res.status(403).json({ error: 'No autorizado.' });
        }
        if (!req.body || req.body.length === 0) {
            return res.status(400).json({ error: 'Archivo vacío recibido.' });
        }
        try {
            db.close(() => {
                const fs = require('fs');
                fs.writeFileSync(dbPath, req.body);
                console.log(`✅ Base de datos migrada: ${req.body.length} bytes escritos en ${dbPath}`);
                res.json({ success: true, bytes: req.body.length, message: 'Migración exitosa. Reiniciando...' });
                setTimeout(() => process.exit(0), 500);
            });
        } catch (err) {
            console.error('❌ Error en migración:', err.message);
            res.status(500).json({ error: err.message });
        }
    }
);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor de Solucels Control corriendo en el puerto ${PORT}`);
});
