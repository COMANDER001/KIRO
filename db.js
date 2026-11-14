const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, 'data.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS registros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  semana TEXT NOT NULL,            -- lunes de la semana (YYYY-MM-DD)
  nombre TEXT NOT NULL,
  local TEXT NOT NULL,             -- número de bodega/local
  giro TEXT NOT NULL,              -- tipo de producto
  telefono TEXT,
  kg_ingreso REAL NOT NULL,        -- cuánto llevará a vender
  kg_desecho REAL NOT NULL,        -- cuánto estima que quedará como desecho
  horarios TEXT NOT NULL,          -- días y horas de venta
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (semana, local)
);
`);

const upsert = db.prepare(`
INSERT INTO registros (semana, nombre, local, giro, telefono, kg_ingreso, kg_desecho, horarios)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (semana, local) DO UPDATE SET
  nombre=excluded.nombre, giro=excluded.giro, telefono=excluded.telefono,
  kg_ingreso=excluded.kg_ingreso, kg_desecho=excluded.kg_desecho,
  horarios=excluded.horarios, actualizado=datetime('now')
`);
const porSemana = db.prepare('SELECT * FROM registros WHERE semana = ? ORDER BY local');
const buscar = db.prepare('SELECT * FROM registros WHERE semana = ? AND local = ?');
const semanas = db.prepare('SELECT DISTINCT semana FROM registros ORDER BY semana DESC');

module.exports = {
  guardar(r) {
    upsert.run(r.semana, r.nombre, r.local, r.giro, r.telefono || null, r.kg_ingreso, r.kg_desecho, r.horarios);
  },
  porSemana: (s) => porSemana.all(s),
  buscar: (s, l) => buscar.get(s, l),
  semanas: () => semanas.all().map((x) => x.semana),
};
