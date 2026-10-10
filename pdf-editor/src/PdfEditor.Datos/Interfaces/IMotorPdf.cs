using PdfEditor.Entidades;

namespace PdfEditor.Datos.Interfaces;

/// <summary>
/// Operaciones de bajo nivel sobre un PDF. Cada operación recibe el documento
/// como bytes y devuelve una NUEVA copia modificada (no muta la entrada), lo que
/// facilita Deshacer/Rehacer en la capa de negocio.
/// Los índices de página son base 0.
/// </summary>
public interface IMotorPdf
{
    /// <summary>Valida el PDF y, si está cifrado, devuelve una copia descifrada.</summary>
    byte[] AbrirYNormalizar(byte[] pdf, string? contrasena);

    byte[] CrearDocumentoVacio(double anchoPt = 595, double altoPt = 842);

    int ContarPaginas(byte[] pdf);
    TamanoPagina ObtenerTamano(byte[] pdf, int indicePagina);
    MetadatosPdf ObtenerMetadatos(byte[] pdf);
    byte[] EstablecerMetadatos(byte[] pdf, MetadatosPdf metadatos);

    // --- Páginas ---
    byte[] RotarPagina(byte[] pdf, int indicePagina, int grados);
    byte[] EliminarPagina(byte[] pdf, int indicePagina);
    byte[] MoverPagina(byte[] pdf, int desde, int hasta);
    byte[] InsertarPaginaEnBlanco(byte[] pdf, int posicion);
    byte[] InsertarDocumento(byte[] destino, byte[] origen, int posicion);
    byte[] ExtraerPaginas(byte[] pdf, IReadOnlyList<int> indices);
    byte[] Unir(IEnumerable<byte[]> documentos);

    // --- Contenido ---
    byte[] AgregarTexto(byte[] pdf, AnotacionTexto anotacion);
    byte[] AgregarImagen(byte[] pdf, int indicePagina, byte[] imagen, RectanguloPdf area);
    byte[] DibujarRectangulo(byte[] pdf, int indicePagina, RectanguloPdf area, int rellenoArgb, int? bordeArgb, double grosorBorde);

    // --- Seguridad ---
    byte[] ProtegerConContrasena(byte[] pdf, string contrasenaUsuario, string? contrasenaPropietario);
}
