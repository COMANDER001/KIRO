# Composta Central de Abastos

Agente de chat para que los comerciantes de la Central de Abastos registren cada semana:

- cuántos kilos de producto van a llevar,
- cuántos kilos estiman que quedarán como desecho,
- sus días y horarios de venta.

Con esos datos se organiza la recolección de desechos orgánicos para composta.

## Partes

- `/` — chat para los comerciantes (pensado para celular).
- `/admin` — panel con los registros por semana, totales y descarga en CSV. Pide la clave `ADMIN_TOKEN`.

Cada registro se asigna al lunes de su semana. Si un local se registra dos veces en la misma semana, se actualiza el registro anterior.

## Cómo correrla

Requiere [Node.js](https://nodejs.org) 22.13 o más reciente. No tiene dependencias externas.

```bash
ADMIN_TOKEN=su-clave npm start
```

En Windows (PowerShell):

```powershell
$env:ADMIN_TOKEN="su-clave"; npm start
```

Después abran `http://localhost:3000` (chat) y `http://localhost:3000/admin` (panel).

Variables de entorno:

| Variable      | Uso                                             | Valor por defecto        |
|---------------|-------------------------------------------------|--------------------------|
| `ADMIN_TOKEN` | Clave del panel `/admin`                        | Se genera una temporal   |
| `PORT`        | Puerto del servidor                             | `3000`                   |
| `DB_PATH`     | Archivo de la base de datos SQLite              | `data.db` en esta carpeta |

Pruebas: `npm test`.

## Publicarla en internet

Usen un servicio que soporte Node 22.13+ con disco persistente y HTTPS (por ejemplo Render, Railway o Fly.io):

- Comando de inicio: `npm start`
- `ADMIN_TOKEN`: su clave
- `DB_PATH`: una ruta dentro del disco persistente, por ejemplo `/data/data.db`

## Demo sin servidor

La carpeta `demo/` tiene una copia que corre completa en el navegador, con el mismo agente pero guardando los datos solo en memoria. Sirve para mostrar la aplicación abriendo `demo/index.html`; no guarda nada de forma permanente. La clave del panel de la demo es `demo123`.
