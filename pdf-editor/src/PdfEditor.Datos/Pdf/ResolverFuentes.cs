using PdfSharp.Fonts;

namespace PdfEditor.Datos.Pdf;

/// <summary>
/// PDFsharp 6 necesita saber de dónde sacar los archivos de fuente.
/// Busca en C:\Windows\Fonts (y en las carpetas típicas de Linux como respaldo).
/// </summary>
public sealed class ResolverFuentes : IFontResolver
{
    // familia -> archivos (normal, negrita, cursiva, negrita+cursiva)
    private static readonly Dictionary<string, string[]> Familias = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Arial"] = ["arial.ttf", "arialbd.ttf", "ariali.ttf", "arialbi.ttf"],
        ["Times New Roman"] = ["times.ttf", "timesbd.ttf", "timesi.ttf", "timesbi.ttf"],
        ["Courier New"] = ["cour.ttf", "courbd.ttf", "couri.ttf", "courbi.ttf"],
        ["Verdana"] = ["verdana.ttf", "verdanab.ttf", "verdanai.ttf", "verdanaz.ttf"],
        ["Calibri"] = ["calibri.ttf", "calibrib.ttf", "calibrii.ttf", "calibriz.ttf"],
        ["Segoe UI"] = ["segoeui.ttf", "segoeuib.ttf", "segoeuii.ttf", "segoeuiz.ttf"],
        ["Tahoma"] = ["tahoma.ttf", "tahomabd.ttf", "tahoma.ttf", "tahomabd.ttf"],
        ["Georgia"] = ["georgia.ttf", "georgiab.ttf", "georgiai.ttf", "georgiaz.ttf"],
    };

    // Equivalentes métricamente compatibles en Linux (solo para pruebas/CI).
    private static readonly Dictionary<string, string[]> Respaldo = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Times New Roman"] = ["LiberationSerif-Regular.ttf", "LiberationSerif-Bold.ttf", "LiberationSerif-Italic.ttf", "LiberationSerif-BoldItalic.ttf"],
        ["Georgia"] = ["LiberationSerif-Regular.ttf", "LiberationSerif-Bold.ttf", "LiberationSerif-Italic.ttf", "LiberationSerif-BoldItalic.ttf"],
        ["Courier New"] = ["LiberationMono-Regular.ttf", "LiberationMono-Bold.ttf", "LiberationMono-Italic.ttf", "LiberationMono-BoldItalic.ttf"],
        ["*"] = ["LiberationSans-Regular.ttf", "LiberationSans-Bold.ttf", "LiberationSans-Italic.ttf", "LiberationSans-BoldItalic.ttf"],
    };

    private static readonly string[] Carpetas =
    [
        Environment.GetFolderPath(Environment.SpecialFolder.Fonts),
        "/usr/share/fonts/truetype/liberation",
        "/usr/share/fonts/truetype/liberation2",
    ];

    private static readonly Dictionary<string, string> CachePorCara = new(StringComparer.OrdinalIgnoreCase);
    private static readonly object Candado = new();

    public static IReadOnlyList<string> FamiliasDisponibles => Familias.Keys.ToList();

    public FontResolverInfo? ResolveTypeface(string familyName, bool bold, bool italic)
    {
        int estilo = (bold ? 1 : 0) + (italic ? 2 : 0);

        // 1) Archivo exacto del estilo pedido; 2) archivo normal + simulación.
        foreach (var lista in Candidatos(familyName))
        {
            var exacto = Buscar(lista[estilo]);
            if (exacto != null) return Registrar(exacto, false, false);

            var normal = Buscar(lista[0]);
            if (normal != null) return Registrar(normal, bold, italic);
        }

        // Familia desconocida: probar "<familia>.ttf" directamente.
        var directo = Buscar(familyName.Replace(" ", "") + ".ttf");
        if (directo != null) return Registrar(directo, bold, italic);

        return familyName.Equals("Arial", StringComparison.OrdinalIgnoreCase)
            ? null
            : ResolveTypeface("Arial", bold, italic);
    }

    public byte[]? GetFont(string faceName)
    {
        lock (Candado)
        {
            return CachePorCara.TryGetValue(faceName, out var ruta) ? File.ReadAllBytes(ruta) : null;
        }
    }

    private static IEnumerable<string[]> Candidatos(string familia)
    {
        if (Familias.TryGetValue(familia, out var f)) yield return f;
        if (Respaldo.TryGetValue(familia, out var r)) yield return r;
        yield return Respaldo["*"];
    }

    private static string? Buscar(string archivo)
    {
        foreach (var carpeta in Carpetas)
        {
            if (string.IsNullOrEmpty(carpeta)) continue;
            var ruta = Path.Combine(carpeta, archivo);
            if (File.Exists(ruta)) return ruta;
        }
        return null;
    }

    private static FontResolverInfo Registrar(string ruta, bool simularNegrita, bool simularCursiva)
    {
        var cara = Path.GetFileNameWithoutExtension(ruta);
        lock (Candado) CachePorCara[cara] = ruta;
        return new FontResolverInfo(cara, simularNegrita, simularCursiva);
    }
}
