# Taller Web

Constructor de sitios web por bloques, al estilo de WordPress: eliges una plantilla base, la modificas en un editor visual y exportas el resultado como HTML.

Es un prototipo de un solo archivo (`index.html`) en HTML, CSS y JavaScript, sin dependencias ni servidor.

## Cómo usarlo

Abre `index.html` en el navegador (doble clic) o publícalo en GitHub Pages.

- **Nuevo sitio**: crea un sitio a partir de una plantilla base (cafetería, portafolio .NET, landing de producto o en blanco).
- **Lienzo**: haz clic en una sección para seleccionarla; los textos se escriben directamente sobre la página.
- **Columna izquierda**: agrega bloques (11 tipos) y ve la estructura de la página.
- **Panel derecho**: opciones del bloque, diseño global (colores, tipografía, redondeo, ancho) y páginas del sitio.
- **Exportar**: HTML de cada página listo para cualquier hosting estático, el sitio completo en JSON e importación de JSON.
- **Deshacer / Rehacer**: Ctrl+Z y Ctrl+Y.

Los sitios se guardan en el `localStorage` del navegador. Para no perder trabajo, exporta el JSON.

## Modelo de datos

Un sitio es un JSON con tema, páginas y bloques:

```json
{
  "name": "Cafetería El Molino",
  "theme": { "primary": "#8a4b2a", "bg": "#faf6f0", "text": "#2b1d14", "font": "elegante", "radius": 6, "width": 1120 },
  "pages": [
    { "title": "Inicio", "slug": "index", "blocks": [
      { "type": "hero", "props": { "title": "Café tostado cada mañana", "layout": "split" } }
    ] }
  ]
}
```

Cada tipo de bloque se define en el objeto `B` de `index.html` con sus campos (`f`), valores por defecto (`def`) y su función de render (`r`). Para agregar un bloque nuevo basta con añadir una entrada ahí.

## Siguiente paso: versión con servidor

La propuesta es una solución ASP.NET Core en C# con arquitectura N-capas:

| Capa | Contenido |
| --- | --- |
| Presentación | Web API (`/api/sitios`, `/api/paginas`) y renderizador Razor que convierte el JSON en HTML |
| Negocio (BLL) | `SitioService`, `PaginaService`, `PublicacionService` |
| Datos (DAL) | Repositorios con Dapper o EF Core, almacén de imágenes en disco o Azure Blob |
| Entidades | Sitio, Pagina, Bloque, Tema, Plantilla |

En SQL Server, el tema y los bloques de cada página se guardan como JSON en columnas `NVARCHAR(MAX)` (`TemaJson`, `ContenidoJson`), junto a tablas relacionales para usuarios, sitios, páginas, versiones, plantillas y medios.
