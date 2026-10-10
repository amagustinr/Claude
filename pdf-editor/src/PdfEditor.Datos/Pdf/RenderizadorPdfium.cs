using PDFtoImage;
using PdfEditor.Datos.Interfaces;

namespace PdfEditor.Datos.Pdf;

/// <summary>Renderiza con PDFium (el motor de Chrome) a través de PDFtoImage.</summary>
public sealed class RenderizadorPdfium : IRenderizadorPdf
{
    // PDFium no es seguro para hilos: se serializan las llamadas.
    private static readonly object Candado = new();

    public byte[] RenderizarPng(byte[] pdf, int indicePagina, int dpi)
    {
        var opciones = new RenderOptions(Dpi: dpi, WithAnnotations: true, WithFormFill: true);
        using var salida = new MemoryStream();
        lock (Candado)
        {
            Conversion.SavePng(salida, pdf, indicePagina, password: null, options: opciones);
        }
        return salida.ToArray();
    }
}
