namespace PdfEditor.Entidades;

/// <summary>Texto que se estampa sobre una página.</summary>
public sealed class AnotacionTexto
{
    public int IndicePagina { get; set; }

    /// <summary>Posición (pt) de la esquina superior izquierda del texto, en coordenadas visibles.</summary>
    public double X { get; set; }
    public double Y { get; set; }

    public string Texto { get; set; } = string.Empty;
    public string Fuente { get; set; } = "Arial";
    public double Tamano { get; set; } = 12;
    public bool Negrita { get; set; }
    public bool Cursiva { get; set; }

    /// <summary>Color en formato ARGB (igual que System.Drawing.Color.ToArgb()).</summary>
    public int ColorArgb { get; set; } = unchecked((int)0xFF000000);
}
