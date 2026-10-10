using PdfEditor.Entidades;
using PdfEditor.Negocio;
using SkiaSharp;
using Xunit;

namespace PdfEditor.Pruebas;

public sealed class DocumentoPdfServicioTests : IDisposable
{
    private readonly string _carpeta = Directory.CreateTempSubdirectory("pdfeditor_").FullName;
    private const int Negro = unchecked((int)0xFF000000);

    public void Dispose() => Directory.Delete(_carpeta, recursive: true);

    private static DocumentoPdfServicio NuevoDoc(int paginas)
    {
        var s = FabricaServicios.CrearDocumento();
        s.Nuevo();
        for (int i = 1; i < paginas; i++) s.InsertarPaginaEnBlanco(s.NumeroPaginas);
        return s;
    }

    private static SKColor Pixel(DocumentoPdfServicio s, int pagina, int x, int y)
    {
        using var bmp = SKBitmap.Decode(s.RenderizarPagina(pagina, 72));
        return bmp.GetPixel(x, y);
    }

    private static bool EsOscuro(SKColor c) => c.Red < 80 && c.Green < 80 && c.Blue < 80;

    [Fact]
    public void Nuevo_CreaUnaPaginaA4()
    {
        var s = NuevoDoc(1);
        Assert.Equal(1, s.NumeroPaginas);
        var t = s.ObtenerTamano(0);
        Assert.Equal(595, t.Ancho, 0);
        Assert.Equal(842, t.Alto, 0);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(90)]
    [InlineData(180)]
    [InlineData(270)]
    public void Tapar_EnPaginaRotada_DibujaDondeElUsuarioVe(int rotacion)
    {
        var s = NuevoDoc(1);
        if (rotacion != 0) s.RotarPagina(0, rotacion);

        var t = s.ObtenerTamano(0);
        s.TaparArea(0, new RectanguloPdf(0, 0, 60, 60), Negro);

        Assert.True(EsOscuro(Pixel(s, 0, 20, 20)), "Esquina superior izquierda visible debería estar negra");
        Assert.False(EsOscuro(Pixel(s, 0, (int)t.Ancho - 20, (int)t.Alto - 20)), "Esquina opuesta debería seguir blanca");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(90)]
    public void Texto_SeDibujaEnLaPosicionIndicada(int rotacion)
    {
        var s = NuevoDoc(1);
        if (rotacion != 0) s.RotarPagina(0, rotacion);
        s.AgregarTexto(new AnotacionTexto { IndicePagina = 0, X = 100, Y = 100, Texto = "████", Tamano = 40, ColorArgb = Negro });

        using var bmp = SKBitmap.Decode(s.RenderizarPagina(0, 72));
        int oscuros = 0;
        for (int x = 100; x < 160; x++)
            for (int y = 100; y < 140; y++)
                if (EsOscuro(bmp.GetPixel(x, y))) oscuros++;
        Assert.True(oscuros > 200, $"Se esperaban píxeles de texto cerca de (100,100); hubo {oscuros}");
        Assert.False(EsOscuro(bmp.GetPixel(20, 20)));
    }

    [Fact]
    public void Eliminar_Mover_Deshacer_Rehacer()
    {
        var s = NuevoDoc(3);
        s.TaparArea(0, new RectanguloPdf(0, 0, 60, 60), Negro);   // marca la página 1

        s.MoverPagina(0, 2);
        Assert.True(EsOscuro(Pixel(s, 2, 10, 10)));
        Assert.False(EsOscuro(Pixel(s, 0, 10, 10)));

        s.EliminarPaginas([2]);
        Assert.Equal(2, s.NumeroPaginas);

        s.Deshacer();
        Assert.Equal(3, s.NumeroPaginas);
        s.Rehacer();
        Assert.Equal(2, s.NumeroPaginas);
    }

    [Fact]
    public void NoPermiteEliminarTodasLasPaginas()
    {
        var s = NuevoDoc(2);
        Assert.Throws<ReglaNegocioException>(() => s.EliminarPaginas([0, 1]));
    }

    [Fact]
    public void Guardar_Abrir_Unir_Extraer()
    {
        var a = Path.Combine(_carpeta, "a.pdf");
        var b = Path.Combine(_carpeta, "b.pdf");
        NuevoDoc(2).GuardarComo(a);
        NuevoDoc(3).GuardarComo(b);

        var s = FabricaServicios.CrearDocumento();
        var unido = Path.Combine(_carpeta, "unido.pdf");
        s.UnirArchivos([a, b], unido);
        s.Abrir(unido);
        Assert.Equal(5, s.NumeroPaginas);
        Assert.False(s.Modificado);

        var extraido = Path.Combine(_carpeta, "extraido.pdf");
        s.ExtraerPaginas("2-3, 5", extraido);
        s.Abrir(extraido);
        Assert.Equal(3, s.NumeroPaginas);

        var partes = s.DividirCada(2, _carpeta, "parte");
        Assert.Equal(2, partes.Count);

        s.InsertarDesdeArchivo(a, 1);
        Assert.Equal(5, s.NumeroPaginas);
    }

    [Fact]
    public void Contrasena_SeExigeAlAbrir()
    {
        var ruta = Path.Combine(_carpeta, "protegido.pdf");
        NuevoDoc(1).GuardarComo(ruta, contrasena: "secreta");

        var s = FabricaServicios.CrearDocumento();
        var sin = Assert.Throws<PdfProtegidoException>(() => s.Abrir(ruta));
        Assert.False(sin.ContrasenaIncorrecta);
        var mala = Assert.Throws<PdfProtegidoException>(() => s.Abrir(ruta, "otra"));
        Assert.True(mala.ContrasenaIncorrecta);

        s.Abrir(ruta, "secreta");
        Assert.Equal(1, s.NumeroPaginas);
        Assert.NotNull(s.RenderizarPagina(0, 50)); // la copia de trabajo ya está descifrada
    }

    [Fact]
    public void Metadatos_SeGuardan()
    {
        var s = NuevoDoc(1);
        s.EstablecerMetadatos(new MetadatosPdf { Titulo = "Informe", Autor = "Alexander" });
        var m = s.ObtenerMetadatos();
        Assert.Equal("Informe", m.Titulo);
        Assert.Equal("Alexander", m.Autor);
    }

    [Fact]
    public void Imagen_SeInserta()
    {
        var png = Path.Combine(_carpeta, "img.png");
        using (var bmp = new SKBitmap(20, 20))
        {
            bmp.Erase(SKColors.Black);
            using var f = File.Create(png);
            bmp.Encode(f, SKEncodedImageFormat.Png, 100);
        }
        var s = NuevoDoc(1);
        s.AgregarImagen(0, png, new RectanguloPdf(200, 300, 100, 100));
        Assert.True(EsOscuro(Pixel(s, 0, 250, 350)));
        Assert.False(EsOscuro(Pixel(s, 0, 150, 350)));
    }

    [Fact]
    public void Texto_ConAcentosYVariasLineas()
    {
        var s = NuevoDoc(1);
        s.AgregarTexto(new AnotacionTexto { IndicePagina = 0, X = 50, Y = 50, Texto = "Año, ñandú y acción\r\nSegunda línea €", Negrita = true, Tamano = 18 });
        Assert.True(s.PuedeDeshacer);
    }
}
