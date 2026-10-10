using PdfEditor.Datos.Interfaces;
using PdfEditor.Entidades;
using PdfSharp.Drawing;
using PdfSharp.Fonts;
using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;

namespace PdfEditor.Datos.Pdf;

/// <summary>Implementación de <see cref="IMotorPdf"/> con PDFsharp 6 (MIT).</summary>
public sealed class MotorPdfSharp : IMotorPdf
{
    static MotorPdfSharp()
    {
        GlobalFontSettings.FontResolver ??= new ResolverFuentes();
    }

    // ------------------------------------------------------------------ apertura

    public byte[] AbrirYNormalizar(byte[] pdf, string? contrasena)
    {
        bool pidioContrasena = false;
        PdfDocument? doc;
        try
        {
            using var ms = new MemoryStream(pdf);
            doc = PdfReader.Open(ms, contrasena, PdfDocumentOpenMode.Modify, args =>
            {
                pidioContrasena = true;
                args.Abort = true;
            });
        }
        catch (Exception) when (pidioContrasena)
        {
            throw new PdfProtegidoException(contrasenaIncorrecta: !string.IsNullOrEmpty(contrasena));
        }

        // Si se aborta la solicitud de contraseña, PDFsharp devuelve null en lugar de lanzar.
        if (doc is null || pidioContrasena)
        {
            doc?.Dispose();
            throw new PdfProtegidoException(contrasenaIncorrecta: !string.IsNullOrEmpty(contrasena));
        }

        using (doc)
        {
            if (doc.SecuritySettings.IsEncrypted)
                doc.SecurityHandler.SetEncryptionToNoneAndResetPasswords();
            return Guardar(doc);
        }
    }

    public byte[] CrearDocumentoVacio(double anchoPt = 595, double altoPt = 842)
    {
        using var doc = new PdfDocument();
        var p = doc.AddPage();
        p.Width = XUnit.FromPoint(anchoPt);
        p.Height = XUnit.FromPoint(altoPt);
        return Guardar(doc);
    }

    // ------------------------------------------------------------------ consultas

    public int ContarPaginas(byte[] pdf)
    {
        using var doc = Abrir(pdf, PdfDocumentOpenMode.Import);
        return doc.PageCount;
    }

    public TamanoPagina ObtenerTamano(byte[] pdf, int indicePagina)
    {
        using var doc = Abrir(pdf, PdfDocumentOpenMode.Import);
        var p = Pagina(doc, indicePagina);
        var (w, h) = TamanoSinRotar(p);
        int r = Rotacion(p);
        return r is 90 or 270 ? new TamanoPagina(h, w, r) : new TamanoPagina(w, h, r);
    }

    public MetadatosPdf ObtenerMetadatos(byte[] pdf)
    {
        using var doc = Abrir(pdf, PdfDocumentOpenMode.Import);
        var i = doc.Info;
        return new MetadatosPdf
        {
            Titulo = i.Title ?? "",
            Autor = i.Author ?? "",
            Asunto = i.Subject ?? "",
            PalabrasClave = i.Keywords ?? "",
            Creador = i.Creator ?? "",
            NumeroPaginas = doc.PageCount
        };
    }

    public byte[] EstablecerMetadatos(byte[] pdf, MetadatosPdf m) => Modificar(pdf, doc =>
    {
        doc.Info.Title = m.Titulo;
        doc.Info.Author = m.Autor;
        doc.Info.Subject = m.Asunto;
        doc.Info.Keywords = m.PalabrasClave;
    });

    // ------------------------------------------------------------------ páginas

    public byte[] RotarPagina(byte[] pdf, int indicePagina, int grados) => Modificar(pdf, doc =>
    {
        if (grados % 90 != 0) throw new ArgumentException("La rotación debe ser múltiplo de 90.", nameof(grados));
        var p = Pagina(doc, indicePagina);
        p.Rotate = ((Rotacion(p) + grados) % 360 + 360) % 360;
    });

    public byte[] EliminarPagina(byte[] pdf, int indicePagina) => Modificar(pdf, doc =>
    {
        Pagina(doc, indicePagina);
        doc.Pages.RemoveAt(indicePagina);
    });

    public byte[] MoverPagina(byte[] pdf, int desde, int hasta) => Modificar(pdf, doc =>
    {
        Pagina(doc, desde);
        Pagina(doc, hasta);
        if (desde != hasta) doc.Pages.MovePage(desde, hasta);
    });

    public byte[] InsertarPaginaEnBlanco(byte[] pdf, int posicion) => Modificar(pdf, doc =>
    {
        // Usa el tamaño de la página vecina para que el documento quede uniforme.
        var referencia = doc.Pages[Math.Clamp(posicion - 1, 0, doc.PageCount - 1)];
        var (w, h) = TamanoSinRotar(referencia);
        var nueva = doc.Pages.Insert(Math.Clamp(posicion, 0, doc.PageCount));
        nueva.Width = XUnit.FromPoint(w);
        nueva.Height = XUnit.FromPoint(h);
        nueva.Rotate = Rotacion(referencia);
    });

    public byte[] InsertarDocumento(byte[] destino, byte[] origen, int posicion) => Modificar(destino, doc =>
    {
        using var src = Abrir(origen, PdfDocumentOpenMode.Import);
        int pos = Math.Clamp(posicion, 0, doc.PageCount);
        for (int i = 0; i < src.PageCount; i++)
            doc.Pages.Insert(pos + i, src.Pages[i]);
    });

    public byte[] ExtraerPaginas(byte[] pdf, IReadOnlyList<int> indices)
    {
        using var src = Abrir(pdf, PdfDocumentOpenMode.Import);
        using var nuevo = new PdfDocument();
        nuevo.Info.Title = src.Info.Title;
        nuevo.Info.Author = src.Info.Author;
        foreach (var i in indices)
            nuevo.AddPage(Pagina(src, i));
        return Guardar(nuevo);
    }

    public byte[] Unir(IEnumerable<byte[]> documentos)
    {
        using var nuevo = new PdfDocument();
        foreach (var bytes in documentos)
        {
            using var src = Abrir(bytes, PdfDocumentOpenMode.Import);
            foreach (var p in src.Pages)
                nuevo.AddPage(p);
        }
        if (nuevo.PageCount == 0) throw new ReglaNegocioException("No hay páginas para unir.");
        return Guardar(nuevo);
    }

    // ------------------------------------------------------------------ contenido

    public byte[] AgregarTexto(byte[] pdf, AnotacionTexto a) => Modificar(pdf, doc =>
    {
        var p = Pagina(doc, a.IndicePagina);
        using var gfx = GraficosEnCoordenadasVisibles(p);

        var estilo = (a.Negrita ? XFontStyleEx.Bold : 0) | (a.Cursiva ? XFontStyleEx.Italic : 0);
        var fuente = new XFont(a.Fuente, a.Tamano, estilo);
        var pincel = new XSolidBrush(AColor(a.ColorArgb));
        double alto = fuente.GetHeight();

        var lineas = a.Texto.Replace("\r\n", "\n").Split('\n');
        for (int i = 0; i < lineas.Length; i++)
        {
            gfx.DrawString(lineas[i], fuente, pincel, new XPoint(a.X, a.Y + i * alto), XStringFormats.TopLeft);
        }
    });

    public byte[] AgregarImagen(byte[] pdf, int indicePagina, byte[] imagen, RectanguloPdf area) => Modificar(pdf, doc =>
    {
        var p = Pagina(doc, indicePagina);
        using var gfx = GraficosEnCoordenadasVisibles(p);
        using var ms = new MemoryStream(imagen);
        using var img = XImage.FromStream(ms);
        gfx.DrawImage(img, area.X, area.Y, area.Ancho, area.Alto);
    });

    public byte[] DibujarRectangulo(byte[] pdf, int indicePagina, RectanguloPdf area, int rellenoArgb, int? bordeArgb, double grosorBorde) =>
        Modificar(pdf, doc =>
        {
            var p = Pagina(doc, indicePagina);
            using var gfx = GraficosEnCoordenadasVisibles(p);
            var relleno = new XSolidBrush(AColor(rellenoArgb));
            var borde = bordeArgb is int b ? new XPen(AColor(b), grosorBorde) : null;
            if (borde != null)
                gfx.DrawRectangle(borde, relleno, area.X, area.Y, area.Ancho, area.Alto);
            else
                gfx.DrawRectangle(relleno, area.X, area.Y, area.Ancho, area.Alto);
        });

    // ------------------------------------------------------------------ seguridad

    public byte[] ProtegerConContrasena(byte[] pdf, string contrasenaUsuario, string? contrasenaPropietario) =>
        Modificar(pdf, doc =>
        {
            doc.SecuritySettings.UserPassword = contrasenaUsuario;
            doc.SecuritySettings.OwnerPassword = string.IsNullOrEmpty(contrasenaPropietario) ? contrasenaUsuario : contrasenaPropietario;
        });

    // ------------------------------------------------------------------ utilidades

    private static PdfDocument Abrir(byte[] pdf, PdfDocumentOpenMode modo)
    {
        using var ms = new MemoryStream(pdf);
        return PdfReader.Open(ms, modo);
    }

    private static byte[] Modificar(byte[] pdf, Action<PdfDocument> accion)
    {
        using var doc = Abrir(pdf, PdfDocumentOpenMode.Modify);
        accion(doc);
        return Guardar(doc);
    }

    private static byte[] Guardar(PdfDocument doc)
    {
        using var ms = new MemoryStream();
        doc.Save(ms, closeStream: false);
        return ms.ToArray();
    }

    private static PdfPage Pagina(PdfDocument doc, int indice)
    {
        if (indice < 0 || indice >= doc.PageCount)
            throw new ArgumentOutOfRangeException(nameof(indice), $"La página {indice + 1} no existe (el documento tiene {doc.PageCount}).");
        return doc.Pages[indice];
    }

    private static int Rotacion(PdfPage p) => ((p.Rotate % 360) + 360) % 360;

    private static (double w, double h) TamanoSinRotar(PdfPage p)
    {
        // Se usa MediaBox porque es la referencia que toma XGraphics al dibujar.
        return (p.MediaBox.Width, p.MediaBox.Height);
    }

    /// <summary>
    /// Devuelve un XGraphics cuyo sistema de coordenadas coincide con lo que el usuario
    /// ve en pantalla: origen arriba-izquierda de la página YA rotada. Así la UI no
    /// necesita saber nada de /Rotate y el texto queda derecho.
    /// </summary>
    private static XGraphics GraficosEnCoordenadasVisibles(PdfPage p)
    {
        var gfx = XGraphics.FromPdfPage(p, XGraphicsPdfPageOptions.Append);
        var (w, h) = TamanoSinRotar(p);
        // (x, y) visibles -> (u, v) sin rotar:  u = x*m11 + y*m21 + dx ; v = x*m12 + y*m22 + dy
        XMatrix? m = Rotacion(p) switch
        {
            90 => new XMatrix(0, -1, 1, 0, 0, h),
            180 => new XMatrix(-1, 0, 0, -1, w, h),
            270 => new XMatrix(0, 1, -1, 0, w, 0),
            _ => null
        };
        if (m is XMatrix matriz) gfx.MultiplyTransform(matriz, XMatrixOrder.Prepend);
        return gfx;
    }

    private static XColor AColor(int argb) =>
        XColor.FromArgb((argb >> 24) & 0xFF, (argb >> 16) & 0xFF, (argb >> 8) & 0xFF, argb & 0xFF);
}
