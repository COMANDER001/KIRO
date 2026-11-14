// Agente conversacional basado en reglas (sin servicios externos).
// Flujo: nombre -> local -> giro -> teléfono -> kg a llevar -> kg de desecho -> horarios -> confirmar.
const db = require('./db');

function lunesDeSemana(fecha = new Date()) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const dia = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dia);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// Interpreta "500", "500 kg", "1.5 toneladas", "media tonelada", "1,200 kilos".
function parseKg(texto) {
  const t = norm(texto);
  if (/media tonelada/.test(t)) return 500;
  const m = t.match(/(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  let num = m[1];
  num = /^\d{1,3}(,\d{3})+/.test(num) ? num.replace(/,/g, '') : num.replace(',', '.');
  let v = parseFloat(num);
  if (!isFinite(v)) return null;
  if (/\bton/.test(t)) v *= 1000;
  return Math.round(v * 100) / 100;
}

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const horarioValido = (t) => {
  const n = norm(t);
  const tieneDia = DIAS.some((d) => n.includes(d)) || /todos los dias|diario|lun|mar|mie|jue|vie|sab|dom/.test(n);
  const tieneHora = /\d/.test(n) || /manana|tarde|noche|madrugada/.test(n);
  return tieneDia && tieneHora && n.length >= 5;
};

const fmt = (n) => Number(n).toLocaleString('es-MX');

function resumen(d) {
  const pct = d.kg_ingreso > 0 ? Math.round((d.kg_desecho / d.kg_ingreso) * 100) : 0;
  return (
    `Este es tu registro de la semana del ${d.semana}:\n` +
    `• Nombre: ${d.nombre}\n• Local/bodega: ${d.local}\n• Producto: ${d.giro}\n` +
    `• Teléfono: ${d.telefono || 'no proporcionado'}\n` +
    `• Llevarás: ${fmt(d.kg_ingreso)} kg\n• Desecho estimado: ${fmt(d.kg_desecho)} kg (${pct}%)\n` +
    `• Horarios de venta: ${d.horarios}\n\n¿Está correcto?`
  );
}

const SI = ['si', 'sí', 'correcto', 'ok', 'confirmo', 'confirmar', 'va', 'listo', 'esta bien', 'claro'];

// Pasos: cada uno define la pregunta y cómo procesar la respuesta.
const pasos = {
  nombre: {
    pregunta: '¿Cuál es tu nombre completo?',
    procesar(t, d) {
      if (t.trim().length < 3) return 'Necesito tu nombre completo, por favor.';
      d.nombre = t.trim().slice(0, 80);
    },
  },
  local: {
    pregunta: '¿Cuál es tu número de local o bodega? (ej. B-24)',
    procesar(t, d) {
      const v = t.trim().toUpperCase().slice(0, 20);
      if (!/[A-Z0-9]/.test(v)) return 'No entendí el número de local. Ejemplo: B-24 o 118.';
      d.local = v;
    },
  },
  giro: {
    pregunta: '¿Qué productos vendes? (ej. frutas, verduras, flores, abarrotes)',
    sugerencias: ['Frutas', 'Verduras', 'Flores', 'Otro'],
    procesar(t, d) {
      if (t.trim().length < 3) return 'Cuéntame un poco más sobre lo que vendes.';
      d.giro = t.trim().slice(0, 80);
    },
  },
  telefono: {
    pregunta: '¿Un teléfono de contacto para avisarte de la recolección? (puedes escribir "omitir")',
    sugerencias: ['Omitir'],
    procesar(t, d) {
      if (norm(t) === 'omitir') { d.telefono = ''; return; }
      const digitos = t.replace(/\D/g, '');
      if (digitos.length < 8 || digitos.length > 15) return 'El teléfono no parece válido. Escríbelo con 10 dígitos o di "omitir".';
      d.telefono = digitos;
    },
  },
  kg_ingreso: {
    pregunta: '¿Cuántos kilos de producto piensas llevar esta semana en total?',
    procesar(t, d) {
      const v = parseKg(t);
      if (v === null || v <= 0) return 'No entendí la cantidad. Escribe un número en kilos, por ejemplo 800 o "1.5 toneladas".';
      if (v > 500000) return 'Esa cantidad parece demasiado alta. ¿Puedes confirmarla en kilos?';
      d.kg_ingreso = v;
    },
  },
  kg_desecho: {
    pregunta: '¿Cuántos kilos calculas que se quedarán como desecho (producto maltratado o que no se venda)?',
    procesar(t, d) {
      const v = parseKg(t);
      if (v === null && /\b(nada|ninguno|cero)\b/.test(norm(t))) { d.kg_desecho = 0; return; }
      if (v === null || v < 0) return 'No entendí la cantidad. Escribe un número en kilos, por ejemplo 60.';
      if (v > d.kg_ingreso) return `El desecho no puede ser mayor a lo que llevarás (${fmt(d.kg_ingreso)} kg). ¿Lo revisas?`;
      d.kg_desecho = v;
    },
  },
  horarios: {
    pregunta: '¿Qué días y en qué horario vas a vender? (ej. "Lunes a viernes de 5am a 2pm, sábado de 5am a 12pm")',
    procesar(t, d) {
      if (!horarioValido(t)) return 'Incluye días y horas, por ejemplo: "Lunes a sábado de 5am a 2pm".';
      d.horarios = t.trim().slice(0, 200);
    },
  },
};
const orden = ['nombre', 'local', 'giro', 'telefono', 'kg_ingreso', 'kg_desecho', 'horarios'];
const campoCorregible = {
  nombre: 'nombre', local: 'local', producto: 'giro', giro: 'giro', telefono: 'telefono', teléfono: 'telefono',
  llevare: 'kg_ingreso', llevar: 'kg_ingreso', ingreso: 'kg_ingreso', kilos: 'kg_ingreso',
  desecho: 'kg_desecho', horario: 'horarios', horarios: 'horarios',
};

const sesiones = new Map();
const TTL = 60 * 60 * 1000;
function limpiar() {
  const ahora = Date.now();
  for (const [k, s] of sesiones) if (ahora - s.ts > TTL) sesiones.delete(k);
}
setInterval(limpiar, 10 * 60 * 1000).unref();

function responder(sid, mensaje) {
  let s = sesiones.get(sid);
  const texto = String(mensaje || '').slice(0, 500);
  const n = norm(texto);

  if (!s || n === 'reiniciar' || n === 'empezar de nuevo') {
    s = { paso: 'nombre', datos: { semana: lunesDeSemana() }, ts: Date.now() };
    sesiones.set(sid, s);
    return {
      mensajes: [
        '¡Hola! Soy el asistente de composta de la Central de Abastos 🌱. Con este registro semanal nos ayudas a organizar la recolección de tus desechos orgánicos.',
        `Te haré unas preguntas rápidas: cuánto llevarás, cuánto estimas que quedará como desecho y tus horarios de venta.\n\n${pasos.nombre.pregunta}`,
      ],
      sugerencias: [],
    };
  }
  s.ts = Date.now();
  const d = s.datos;

  if (s.paso === 'confirmar') {
    if (SI.includes(n)) {
      db.guardar(d);
      s.paso = 'fin';
      return {
        mensajes: [`¡Listo, ${d.nombre.split(' ')[0]}! Tu registro quedó guardado ✅. Pasaremos a recolectar según tus horarios. Si necesitas cambiar algo, escribe "reiniciar" y vuelve a registrarte con el mismo número de local: se actualizará.`],
        sugerencias: ['Reiniciar'],
        completo: true,
      };
    }
    const campo = Object.keys(campoCorregible).find((k) => n.includes(norm(k)));
    if (campo) {
      s.paso = campoCorregible[campo];
      s.corrigiendo = true;
      return { mensajes: [pasos[s.paso].pregunta], sugerencias: pasos[s.paso].sugerencias || [] };
    }
    return {
      mensajes: ['Dime "sí" para confirmar, o qué quieres corregir (nombre, local, producto, teléfono, kilos, desecho u horario).'],
      sugerencias: ['Sí', 'Corregir horario', 'Corregir kilos'],
    };
  }

  if (s.paso === 'fin') {
    return { mensajes: ['Tu registro ya está guardado. Escribe "reiniciar" para registrar otro local o modificarlo.'], sugerencias: ['Reiniciar'], completo: true };
  }

  const paso = pasos[s.paso];
  const error = paso.procesar(texto, d);
  if (error) return { mensajes: [error], sugerencias: paso.sugerencias || [] };

  // Si ya existía registro esta semana para ese local, avisarlo.
  let extra = [];
  if (s.paso === 'local') {
    const previo = db.buscar(d.semana, d.local);
    if (previo) extra = [`Ya tenías un registro esta semana para el local ${d.local}. Si continúas, se actualizará.`];
  }

  if (s.corrigiendo) {
    s.corrigiendo = false;
    s.paso = 'confirmar';
    return { mensajes: [resumen(d)], sugerencias: ['Sí', 'Corregir horario', 'Corregir kilos'] };
  }
  const sig = orden[orden.indexOf(s.paso) + 1];
  if (!sig) {
    s.paso = 'confirmar';
    return { mensajes: [resumen(d)], sugerencias: ['Sí', 'Corregir horario', 'Corregir kilos'] };
  }
  s.paso = sig;
  return { mensajes: [...extra, pasos[sig].pregunta], sugerencias: pasos[sig].sugerencias || [] };
}

module.exports = { responder, parseKg, lunesDeSemana, horarioValido };
