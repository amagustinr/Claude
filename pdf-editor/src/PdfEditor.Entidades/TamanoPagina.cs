namespace PdfEditor.Entidades;

/// <summary>Tamaño visible de una página en puntos PDF (considera la rotación).</summary>
public readonly record struct TamanoPagina(double Ancho, double Alto, int Rotacion);
