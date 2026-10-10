namespace PdfEditor.Negocio;

/// <summary>Conversión entre píxeles de la imagen renderizada y puntos PDF.</summary>
public static class Coordenadas
{
    public const double PuntosPorPulgada = 72.0;

    public static double PixelAPunto(double pixel, int dpi) => pixel * PuntosPorPulgada / dpi;
    public static double PuntoAPixel(double punto, int dpi) => punto * dpi / PuntosPorPulgada;
}
