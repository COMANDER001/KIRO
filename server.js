const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('./db');
const { responder, lunesDeSemana } = require('./agent');

const PORT = process.env.PORT || 3000;
let ADMIN_TOKEN = process.env.ADMIN_TOKEN;
if (!ADMIN_TOKEN) {
  ADMIN_TOKEN = crypto.randomBytes(9).toString('base64url');
  console.log(`ADMIN_TOKEN no definido. Clave temporal para /admin: ${ADMIN_TOKEN}`);
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
const PUBLIC = path.join(__dirname, 'public');

function esAdmin(req) {
  const dado = Buffer.from(req.headers['x-admin-token'] || '');
  const real = Buffer.from(ADMIN_TOKEN);
  return dado.length === real.length && crypto.timingSafeEqual(dado, real);
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 10000) { reject(new Error('grande')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const csvCelda = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita inyección de fórmulas en Excel
  return `"${s.replace(/"/g, '""')}"`;
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const body = JSON.parse((await leerCuerpo(req)) || '{}');
      const sid = String(body.sessionId || '').slice(0, 64);
      if (!sid) return json(res, 400, { error: 'sessionId requerido' });
      return json(res, 200, responder(sid, body.mensaje));
    }

    if (url.pathname.startsWith('/api/admin/')) {
      if (!esAdmin(req)) return json(res, 401, { error: 'No autorizado' });
      const semana = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('semana') || '')
        ? url.searchParams.get('semana') : lunesDeSemana();
      if (url.pathname === '/api/admin/registros') {
        const registros = db.porSemana(semana);
        const total = (k) => registros.reduce((a, r) => a + r[k], 0);
        return json(res, 200, {
          semana, semanas: db.semanas(), registros,
          totales: { kg_ingreso: total('kg_ingreso'), kg_desecho: total('kg_desecho'), participantes: registros.length },
        });
      }
      if (url.pathname === '/api/admin/csv') {
        const cols = ['semana', 'nombre', 'local', 'giro', 'telefono', 'kg_ingreso', 'kg_desecho', 'horarios', 'actualizado'];
        const filas = [cols.join(',')].concat(db.porSemana(semana).map((r) => cols.map((c) => csvCelda(r[c])).join(',')));
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="registros-${semana}.csv"`,
        });
        return res.end('\uFEFF' + filas.join('\n'));
      }
      return json(res, 404, { error: 'No encontrado' });
    }

    // Archivos estáticos
    let rel = url.pathname === '/' ? '/index.html' : url.pathname === '/admin' ? '/admin.html' : url.pathname;
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); return res.end('No encontrado');
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    json(res, 400, { error: 'Solicitud inválida' });
  }
});

if (require.main === module) server.listen(PORT, () => console.log(`http://localhost:${PORT}  (admin: /admin)`));
module.exports = server;
