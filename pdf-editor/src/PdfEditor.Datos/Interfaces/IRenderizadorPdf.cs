namespace PdfEditor.Datos.Interfaces;

/// <summary>Convierte páginas PDF en imágenes.</summary>
public interface IRenderizadorPdf
{
    /// <summary>Devuelve la página indicada (base 0) como imagen PNG.</summary>
    byte[] RenderizarPng(byte[] pdf, int indicePagina, int dpi);
}
