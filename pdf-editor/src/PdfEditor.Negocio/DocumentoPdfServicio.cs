using PdfEditor.Datos.Interfaces;
using PdfEditor.Entidades;

namespace PdfEditor.Negocio;

/// <summary>
/// Documento abierto en el editor. Mantiene la copia de trabajo en memoria,
/// el historial para Deshacer/Rehacer y aplica las reglas de negocio.
/// La UI solo habla con esta clase.
/// </summary>
public sealed class DocumentoPdfServicio
{
    public const int MaximoHistorial = 50;

    private readonly IAlmacenArchivos _almacen;
    private readonly IMotorPdf _motor;
    private readonly IRenderizadorPdf _renderizador;

    private readonly LinkedList<byte[]> _deshacer = new();
    private readonly Stack<byte[]> _rehacer = new();
    private byte[]? _actual;

    public DocumentoPdfServicio(IAlmacenArchivos almacen, IMotorPdf motor, IRenderizadorPdf renderizador)
    {
        _almacen = almacen;
        _motor = motor;
        _renderizador = renderizador;
    }

    /// <summary>Se dispara cada vez que cambia el contenido o se abre/cierra un documento.</summary>
    public event EventHandler? DocumentoCambiado;

    public bool HayDocumento => _actual != null;
    public string? RutaArchivo { get; private set; }
    public bool Modificado { get; private set; }
    public int NumeroPaginas { get; private set; }
    public bool PuedeDeshacer => _deshacer.Count > 0;
    public bool PuedeRehacer => _rehacer.Count > 0;

    /// <summary>Contraseña con la que se volverá a cifrar al usar "Guardar" (null = sin cifrar).</summary>
    public string? ContrasenaArchivo { get; private set; }

    /// <summary>Copia de los bytes actuales (para exportar o pruebas).</summary>
    public byte[] ObtenerBytes() => (byte[])Actual.Clone();

    private byte[] Actual => _actual ?? throw new ReglaNegocioException("No hay ningún documento abierto.");

    // ------------------------------------------------------------ ciclo de vida

    /// <exception cref="PdfProtegidoException">Si requiere contraseña.</exception>
    public void Abrir(string ruta, string? contrasena = null)
    {
        if (!_almacen.Existe(ruta)) throw new ReglaNegocioException($"No se encontró el archivo:\n{ruta}");
        var bytes = _motor.AbrirYNormalizar(_almacen.Leer(ruta), contrasena);
        Reiniciar(bytes, ruta);
        ContrasenaArchivo = string.IsNullOrEmpty(contrasena) ? null : contrasena;
    }

    public void AbrirDesdeBytes(byte[] pdf, string? contrasena = null) =>
        Reiniciar(_motor.AbrirYNormalizar(pdf, contrasena), null);

    public void Nuevo() => Reiniciar(_motor.CrearDocumentoVacio(), null, modificado: true);

    public void Cerrar()
    {
        _actual = null;
        RutaArchivo = null;
        ContrasenaArchivo = null;
        Modificado = false;
        NumeroPaginas = 0;
        _deshacer.Clear();
        _rehacer.Clear();
        DocumentoCambiado?.Invoke(this, EventArgs.Empty);
    }

    public void Guardar()
    {
        if (RutaArchivo is null) throw new ReglaNegocioException("El documento aún no tiene nombre. Use 'Guardar como'.");
        GuardarComo(RutaArchivo, ContrasenaArchivo);
    }

    /// <param name="contrasena">Si se indica, el archivo se guarda cifrado (la copia de trabajo no).</param>
    public void GuardarComo(string ruta, string? contrasena = null)
    {
        var bytes = string.IsNullOrEmpty(contrasena) ? Actual : _motor.ProtegerConContrasena(Actual, contrasena, null);
        _almacen.Escribir(ruta, bytes);
        RutaArchivo = ruta;
        ContrasenaArchivo = string.IsNullOrEmpty(contrasena) ? null : contrasena;
        Modificado = false;
        DocumentoCambiado?.Invoke(this, EventArgs.Empty);
    }

    // ------------------------------------------------------------ consulta

    public byte[] RenderizarPagina(int indice, int dpi)
    {
        ValidarPagina(indice);
        return _renderizador.RenderizarPng(Actual, indice, Math.Clamp(dpi, 10, 600));
    }

    public TamanoPagina ObtenerTamano(int indice)
    {
        ValidarPagina(indice);
        return _motor.ObtenerTamano(Actual, indice);
    }

    public MetadatosPdf ObtenerMetadatos() => _motor.ObtenerMetadatos(Actual);

    // ------------------------------------------------------------ edición

    public void EstablecerMetadatos(MetadatosPdf m) => Aplicar(_motor.EstablecerMetadatos(Actual, m));

    public void RotarPagina(int indice, int grados)
    {
        ValidarPagina(indice);
        Aplicar(_motor.RotarPagina(Actual, indice, grados));
    }

    /// <summary>Rota varias páginas en un solo paso de Deshacer.</summary>
    public void RotarPaginas(IReadOnlyCollection<int> indices, int grados)
    {
        if (indices.Count == 0) return;
        foreach (var i in indices) ValidarPagina(i);
        var bytes = Actual;
        foreach (var i in indices.Distinct()) bytes = _motor.RotarPagina(bytes, i, grados);
        Aplicar(bytes);
    }

    public void RotarTodas(int grados) => RotarPaginas(Enumerable.Range(0, NumeroPaginas).ToList(), grados);

    public void EliminarPaginas(IReadOnlyCollection<int> indices)
    {
        if (indices.Count == 0) return;
        foreach (var i in indices) ValidarPagina(i);
        if (indices.Distinct().Count() >= NumeroPaginas)
            throw new ReglaNegocioException("No se pueden eliminar todas las páginas. El documento debe conservar al menos una.");

        var bytes = Actual;
        foreach (var i in indices.Distinct().OrderByDescending(x => x))
            bytes = _motor.EliminarPagina(bytes, i);
        Aplicar(bytes);
    }

    public void MoverPagina(int desde, int hasta)
    {
        ValidarPagina(desde);
        ValidarPagina(hasta);
        if (desde == hasta) return;
        Aplicar(_motor.MoverPagina(Actual, desde, hasta));
    }

    public void InsertarPaginaEnBlanco(int posicion) =>
        Aplicar(_motor.InsertarPaginaEnBlanco(Actual, Math.Clamp(posicion, 0, NumeroPaginas)));

    /// <summary>Inserta todas las páginas de otro PDF en la posición indicada.</summary>
    public void InsertarDesdeArchivo(string ruta, int posicion, string? contrasena = null)
    {
        var origen = _motor.AbrirYNormalizar(_almacen.Leer(ruta), contrasena);
        Aplicar(_motor.InsertarDocumento(Actual, origen, Math.Clamp(posicion, 0, NumeroPaginas)));
    }

    /// <summary>Guarda en un archivo nuevo las páginas indicadas ("1-3, 5"). No modifica el documento abierto.</summary>
    public void ExtraerPaginas(string rangos, string rutaDestino)
    {
        var indices = RangoPaginas.Parsear(rangos, NumeroPaginas);
        _almacen.Escribir(rutaDestino, _motor.ExtraerPaginas(Actual, indices));
    }

    /// <summary>Divide el documento en archivos de N páginas. Devuelve las rutas creadas.</summary>
    public IReadOnlyList<string> DividirCada(int paginasPorArchivo, string carpeta, string nombreBase)
    {
        if (paginasPorArchivo < 1) throw new ReglaNegocioException("Indique al menos 1 página por archivo.");
        var rutas = new List<string>();
        for (int inicio = 0, n = 1; inicio < NumeroPaginas; inicio += paginasPorArchivo, n++)
        {
            var indices = Enumerable.Range(inicio, Math.Min(paginasPorArchivo, NumeroPaginas - inicio)).ToList();
            var ruta = Path.Combine(carpeta, $"{nombreBase}_parte{n:D2}.pdf");
            _almacen.Escribir(ruta, _motor.ExtraerPaginas(Actual, indices));
            rutas.Add(ruta);
        }
        return rutas;
    }

    public void AgregarTexto(AnotacionTexto anotacion)
    {
        ValidarPagina(anotacion.IndicePagina);
        if (string.IsNullOrWhiteSpace(anotacion.Texto)) throw new ReglaNegocioException("Escriba el texto a insertar.");
        if (anotacion.Tamano is < 4 or > 200) throw new ReglaNegocioException("El tamaño de letra debe estar entre 4 y 200.");
        Aplicar(_motor.AgregarTexto(Actual, anotacion));
    }

    public void AgregarImagen(int indice, string rutaImagen, RectanguloPdf area)
    {
        ValidarPagina(indice);
        ValidarArea(area);
        Aplicar(_motor.AgregarImagen(Actual, indice, _almacen.Leer(rutaImagen), area));
    }

    /// <summary>Resaltador amarillo semitransparente.</summary>
    public void Resaltar(int indice, RectanguloPdf area, int colorArgb = unchecked((int)0x66FFFF00))
    {
        ValidarPagina(indice);
        ValidarArea(area);
        Aplicar(_motor.DibujarRectangulo(Actual, indice, area, colorArgb, null, 0));
    }

    /// <summary>
    /// Tapa visualmente un área con un rectángulo opaco (blanco por defecto).
    /// OJO: el contenido original sigue existiendo debajo; no es una redacción segura.
    /// </summary>
    public void TaparArea(int indice, RectanguloPdf area, int colorArgb = unchecked((int)0xFFFFFFFF))
    {
        ValidarPagina(indice);
        ValidarArea(area);
        Aplicar(_motor.DibujarRectangulo(Actual, indice, area, colorArgb, null, 0));
    }

    public void DibujarMarco(int indice, RectanguloPdf area, int bordeArgb, double grosor)
    {
        ValidarPagina(indice);
        ValidarArea(area);
        Aplicar(_motor.DibujarRectangulo(Actual, indice, area, 0, bordeArgb, grosor));
    }

    // ------------------------------------------------------------ historial

    public void Deshacer()
    {
        if (!PuedeDeshacer) return;
        _rehacer.Push(Actual);
        var previo = _deshacer.Last!.Value;
        _deshacer.RemoveLast();
        Establecer(previo);
    }

    public void Rehacer()
    {
        if (!PuedeRehacer) return;
        _deshacer.AddLast(Actual);
        Establecer(_rehacer.Pop());
    }

    // ------------------------------------------------------------ utilidades estáticas

    /// <summary>Une varios archivos PDF en uno nuevo, en el orden recibido.</summary>
    public void UnirArchivos(IReadOnlyList<string> rutas, string rutaDestino)
    {
        if (rutas.Count < 2) throw new ReglaNegocioException("Seleccione al menos dos archivos para unir.");
        var docs = rutas.Select(r => _motor.AbrirYNormalizar(_almacen.Leer(r), null));
        _almacen.Escribir(rutaDestino, _motor.Unir(docs));
    }

    // ------------------------------------------------------------ privados

    private void Reiniciar(byte[] bytes, string? ruta, bool modificado = false)
    {
        ContrasenaArchivo = null;
        _deshacer.Clear();
        _rehacer.Clear();
        RutaArchivo = ruta;
        _actual = bytes;
        NumeroPaginas = _motor.ContarPaginas(bytes);
        Modificado = modificado;
        DocumentoCambiado?.Invoke(this, EventArgs.Empty);
    }

    private void Aplicar(byte[] nuevo)
    {
        _deshacer.AddLast(Actual);
        if (_deshacer.Count > MaximoHistorial) _deshacer.RemoveFirst();
        _rehacer.Clear();
        Establecer(nuevo);
    }

    private void Establecer(byte[] bytes)
    {
        _actual = bytes;
        NumeroPaginas = _motor.ContarPaginas(bytes);
        Modificado = true;
        DocumentoCambiado?.Invoke(this, EventArgs.Empty);
    }

    private void ValidarPagina(int indice)
    {
        if (indice < 0 || indice >= NumeroPaginas)
            throw new ReglaNegocioException($"La página {indice + 1} no existe.");
    }

    private static void ValidarArea(RectanguloPdf area)
    {
        if (area.EsVacio) throw new ReglaNegocioException("Arrastre el ratón para marcar un área.");
    }
}
