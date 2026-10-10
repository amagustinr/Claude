namespace PdfEditor.Entidades;

/// <summary>
/// Rectángulo en puntos PDF (1 pt = 1/72 pulgada), con origen en la esquina
/// superior izquierda de la página tal como se VE en pantalla (ya rotada).
/// </summary>
public readonly record struct RectanguloPdf(double X, double Y, double Ancho, double Alto)
{
    /// <summary>Crea un rectángulo normalizado a partir de dos esquinas cualesquiera.</summary>
    public static RectanguloPdf DesdeEsquinas(double x1, double y1, double x2, double y2) =>
        new(Math.Min(x1, x2), Math.Min(y1, y2), Math.Abs(x2 - x1), Math.Abs(y2 - y1));

    public bool EsVacio => Ancho < 1 || Alto < 1;
}
