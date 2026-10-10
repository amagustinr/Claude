using PdfEditor.Entidades;

namespace PdfEditor.Negocio;

/// <summary>Interpreta rangos escritos por el usuario, p. ej. "1-3, 5, 8-10".</summary>
public static class RangoPaginas
{
    /// <returns>Índices base 0, en el orden escrito y sin duplicados.</returns>
    public static IReadOnlyList<int> Parsear(string texto, int totalPaginas)
    {
        if (string.IsNullOrWhiteSpace(texto))
            throw new ReglaNegocioException("Indique las páginas, por ejemplo: 1-3, 5");

        var resultado = new List<int>();
        var vistos = new HashSet<int>();

        foreach (var parteCruda in texto.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries))
        {
            var parte = parteCruda.Trim();
            int desde, hasta;
            var guion = parte.IndexOf('-');
            if (guion >= 0)
            {
                desde = Numero(parte[..guion], totalPaginas, 1);
                hasta = Numero(parte[(guion + 1)..], totalPaginas, totalPaginas);
            }
            else
            {
                desde = hasta = Numero(parte, totalPaginas, null);
            }

            int paso = desde <= hasta ? 1 : -1;
            for (int p = desde; p != hasta + paso; p += paso)
                if (vistos.Add(p)) resultado.Add(p - 1);
        }

        if (resultado.Count == 0) throw new ReglaNegocioException("No se indicó ninguna página.");
        return resultado;
    }

    private static int Numero(string s, int total, int? siVacio)
    {
        s = s.Trim();
        if (s.Length == 0 && siVacio.HasValue) return siVacio.Value;
        if (!int.TryParse(s, out var n))
            throw new ReglaNegocioException($"'{s}' no es un número de página válido.");
        if (n < 1 || n > total)
            throw new ReglaNegocioException($"La página {n} no existe. El documento tiene {total} página(s).");
        return n;
    }
}
