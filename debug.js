const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');
db.serialize(() => {
    db.all("SELECT * FROM tiendas", (err, tiendas) => {
        console.log("Tiendas:");
        tiendas.forEach(t => console.log(Math.abs(t.efectivo_actual), t.nombre, t.id));
    });
    db.all("SELECT * FROM aperturas_caja", (err, aps) => {
        console.log("Aperturas:", aps);
    });
});
db.close();
