namespace PdfEditor.Entidades;

/// <summary>Propiedades del documento (diccionario Info del PDF).</summary>
public sealed class MetadatosPdf
{
    public string Titulo { get; set; } = string.Empty;
    public string Autor { get; set; } = string.Empty;
    public string Asunto { get; set; } = string.Empty;
    public string PalabrasClave { get; set; } = string.Empty;
    public string Creador { get; set; } = string.Empty;
    public int NumeroPaginas { get; set; }
}
