# Editor PDF (Windows Forms · .NET 8 · N-capas)

Aplicación de escritorio para **ver y editar PDF** en Windows, con librerías open source de licencia MIT (sin costes de licencia, uso comercial permitido).

| Capa | Proyecto | Responsabilidad |
|---|---|---|
| Presentación | `PdfEditor.UI` (WinForms, `net8.0-windows`) | Ventanas, menús, visor, miniaturas. No sabe nada de PDF. |
| Negocio | `PdfEditor.Negocio` | `DocumentoPdfServicio`: estado del documento, validaciones, Deshacer/Rehacer, rangos de páginas. |
| Datos | `PdfEditor.Datos` | Acceso a archivos, edición con **PDFsharp 6** y renderizado con **PDFium** (vía PDFtoImage). Expuesto por interfaces (`IMotorPdf`, `IRenderizadorPdf`, `IAlmacenArchivos`). |
| Entidades | `PdfEditor.Entidades` | DTOs y excepciones compartidas (`AnotacionTexto`, `RectanguloPdf`, `PdfProtegidoException`...). |
| Pruebas | `tests/PdfEditor.Pruebas` (xUnit) | 22 pruebas de negocio que renderizan y comprueban píxeles. |

Dependencias: UI → Negocio → Datos; todas → Entidades. La UI solo referencia Negocio y Entidades (`FabricaServicios` es la raíz de composición).

## Funciones

**Leer**
- Abrir PDF (diálogo, arrastrar a la ventana o "Abrir con…"), incluidos PDF con contraseña.
- Visor con zoom (Ctrl + rueda, Ctrl+ / Ctrl−, ajustar al ancho o a la página), nítido en pantallas HiDPI.
- Panel de miniaturas, navegación con RePág/AvPág, rueda del ratón y caja de número de página.
- Imprimir (todas o un rango de páginas, orientación automática).
- Propiedades del documento (título, autor, asunto, palabras clave).

**Editar**
- Insertar **texto** (fuente, tamaño, negrita, cursiva, color, varias líneas).
- Insertar **imagen** (PNG/JPG/BMP/GIF), arrastrando el área o con un clic.
- **Resaltar**, **tapar** un área en blanco y dibujar **marcos** de color.
- **Rotar**, **eliminar**, **mover** páginas (también arrastrando miniaturas), insertar páginas en blanco o desde otro PDF.
- **Extraer** páginas ("1-3, 5, 8-") a un PDF nuevo, **dividir** cada N páginas, **unir** varios PDF.
- Guardar con **contraseña**.
- **Deshacer/Rehacer** (50 niveles) en todas las operaciones.

Las coordenadas se manejan siempre "como se ve en pantalla": puede escribir sobre páginas rotadas y el texto sale derecho.

## Compilar y ejecutar

Requisitos: **Visual Studio 2022** (17.8 o superior) con la carga de trabajo *Desarrollo de escritorio de .NET*, o el SDK de .NET 8.

1. Abra `PdfEditor.sln`.
2. Clic derecho en **PdfEditor.UI** → *Establecer como proyecto de inicio*.
3. F5. Visual Studio restaura los paquetes NuGet (PDFsharp 6.2.4, PDFtoImage 5.4.0) automáticamente.

Desde consola:

```
dotnet run --project src\PdfEditor.UI
dotnet test
dotnet publish src\PdfEditor.UI -c Release -o publicar
```

La UI está construida por código (sin `.Designer.cs`) para que sea fácil de leer; puede añadir formularios con el diseñador sin problema.

## Atajos

| Acción | Tecla |
|---|---|
| Abrir / Guardar / Guardar como | Ctrl+O / Ctrl+S / Ctrl+Shift+S |
| Deshacer / Rehacer | Ctrl+Z / Ctrl+Y |
| Rotar derecha / izquierda | Ctrl+R / Ctrl+Shift+R |
| Mover página arriba / abajo | Ctrl+↑ / Ctrl+↓ |
| Eliminar páginas | Supr (en miniaturas) |
| Zoom 100% / ancho / página | Ctrl+1 / Ctrl+2 / Ctrl+0 |
| Volver a la herramienta Seleccionar | Esc |

## Limitaciones conocidas

- El texto existente del PDF **no se edita en sitio** (eso requiere reescribir el flujo de contenido; ninguna librería MIT lo hace bien). Para corregir un texto: *Tapar* el original y escribir encima con *Texto*.
- *Tapar* es visual: el contenido original sigue dentro del archivo. No sirve para ocultar datos confidenciales.
- No hay búsqueda ni selección de texto todavía.

## Usarlo desde VB.NET

Las capas Negocio, Datos y Entidades son bibliotecas .NET normales: puede crear un proyecto **Windows Forms (VB)**, referenciar `PdfEditor.Negocio` y `PdfEditor.Entidades` y usar:

```vb
Private ReadOnly _doc As DocumentoPdfServicio = FabricaServicios.CrearDocumento()

_doc.Abrir("C:\docs\contrato.pdf")
Dim png As Byte() = _doc.RenderizarPagina(0, 96)
_doc.AgregarTexto(New AnotacionTexto With {.IndicePagina = 0, .X = 72, .Y = 72, .Texto = "Aprobado", .Tamano = 18})
_doc.GuardarComo("C:\docs\contrato_firmado.pdf")
```
