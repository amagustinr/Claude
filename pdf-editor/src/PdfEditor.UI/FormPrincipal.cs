using System.Drawing.Printing;
using PdfEditor.Entidades;
using PdfEditor.Negocio;
using PdfEditor.UI.Controles;
using PdfEditor.UI.Dialogos;

namespace PdfEditor.UI;

/// <summary>
/// Ventana principal. Solo contiene lógica de presentación: toda operación sobre
/// el PDF se delega en <see cref="DocumentoPdfServicio"/> (capa de Negocio).
/// </summary>
public sealed class FormPrincipal : Form
{
    private const string FiltroPdf = "Documentos PDF (*.pdf)|*.pdf";
    private const string FiltroImagen = "Imágenes|*.png;*.jpg;*.jpeg;*.bmp;*.gif|Todos los archivos|*.*";
    private const double ZoomMinimo = 0.25, ZoomMaximo = 5.0;
    private static readonly Size TamanoMiniatura = new(96, 128);

    private readonly DocumentoPdfServicio _doc = FabricaServicios.CrearDocumento();
    private readonly string? _archivoInicial;

    private int _pagina;
    private double _zoom = 1.0;
    private int _generacionMiniaturas;
    private bool _sincronizandoSeleccion;
    private Color _colorMarco = Color.Red;

    // --- controles
    private readonly MenuStrip _menu = new();
    private readonly ToolStrip _barra = new() { GripStyle = ToolStripGripStyle.Hidden, ImageScalingSize = new Size(20, 20) };
    private readonly SplitContainer _split = new() { Dock = DockStyle.Fill, FixedPanel = FixedPanel.Panel1 };
    private readonly ImageList _imagenes = new() { ImageSize = TamanoMiniatura, ColorDepth = ColorDepth.Depth32Bit };
    private readonly ListView _miniaturas = new()
    {
        Dock = DockStyle.Fill,
        View = View.LargeIcon,
        MultiSelect = true,
        HideSelection = false,
        AllowDrop = true,
        BorderStyle = BorderStyle.None,
        BackColor = Color.FromArgb(240, 240, 240)
    };
    private readonly VisorPagina _visor = new() { Dock = DockStyle.Fill };
    private readonly StatusStrip _estado = new();
    private readonly ToolStripStatusLabel _lblMensaje = new() { Spring = true, TextAlign = ContentAlignment.MiddleLeft };
    private readonly ToolStripStatusLabel _lblHerramienta = new();
    private readonly ToolStripStatusLabel _lblZoom = new();
    private readonly ToolStripTextBox _txtPagina = new() { Width = 40, TextBoxTextAlign = HorizontalAlignment.Center };
    private readonly ToolStripLabel _lblTotal = new("/ 0");

    private readonly List<ToolStripItem> _requierenDocumento = [];
    private readonly Dictionary<Herramienta, ToolStripButton> _botonesHerramienta = [];
    private ToolStripMenuItem _mnuDeshacer = null!, _mnuRehacer = null!;
    private ToolStripButton _btnDeshacer = null!, _btnRehacer = null!;

    public FormPrincipal(string? archivoInicial = null)
    {
        _archivoInicial = archivoInicial;
        Text = "Editor PDF";
        Size = new Size(1200, 850);
        StartPosition = FormStartPosition.CenterScreen;
        KeyPreview = true;
        AllowDrop = true;

        ConstruirMenu();
        ConstruirBarra();
        ConstruirCuerpo();

        _estado.Items.AddRange(new ToolStripItem[] { _lblMensaje, _lblHerramienta, _lblZoom });
        Controls.Add(_split);
        Controls.Add(_barra);
        Controls.Add(_menu);
        Controls.Add(_estado);
        MainMenuStrip = _menu;

        _doc.DocumentoCambiado += (_, _) => AlCambiarDocumento();
        DragEnter += (_, e) => e.Effect = ArchivosArrastrados(e).Any() ? DragDropEffects.Copy : DragDropEffects.None;
        DragDrop += (_, e) => { var a = ArchivosArrastrados(e).FirstOrDefault(); if (a != null) AbrirArchivo(a); };

        SeleccionarHerramienta(Herramienta.Seleccionar);
        ActualizarEstado();
    }

    // =====================================================================
    //  Construcción de la interfaz
    // =====================================================================

    private void ConstruirMenu()
    {
        var archivo = Menu("&Archivo",
            Item("&Nuevo", Keys.Control | Keys.N, NuevoDocumento),
            Item("&Abrir...", Keys.Control | Keys.O, AbrirConDialogo),
            new ToolStripSeparator(),
            Doc(Item("&Guardar", Keys.Control | Keys.S, () => Guardar())),
            Doc(Item("Guardar &como...", Keys.Control | Keys.Shift | Keys.S, () => GuardarComo())),
            Doc(Item("Guardar con &contraseña...", Keys.None, GuardarConContrasena)),
            new ToolStripSeparator(),
            Doc(Item("&Imprimir...", Keys.Control | Keys.P, Imprimir)),
            Doc(Item("&Propiedades...", Keys.Control | Keys.D, Propiedades)),
            new ToolStripSeparator(),
            Doc(Item("C&errar", Keys.Control | Keys.W, () => { if (ConfirmarDescartar()) _doc.Cerrar(); })),
            Item("&Salir", Keys.Alt | Keys.F4, Close));

        _mnuDeshacer = Doc(Item("&Deshacer", Keys.Control | Keys.Z, _doc.Deshacer));
        _mnuRehacer = Doc(Item("&Rehacer", Keys.Control | Keys.Y, _doc.Rehacer));
        var editar = Menu("&Edición",
            _mnuDeshacer, _mnuRehacer,
            new ToolStripSeparator(),
            Doc(Item("Seleccionar &todas las páginas", Keys.Control | Keys.A, SeleccionarTodas)));

        var ver = Menu("&Ver",
            Doc(Item("&Acercar", Keys.Control | Keys.Oemplus, () => CambiarZoom(_zoom * 1.25))),
            Doc(Item("A&lejar", Keys.Control | Keys.OemMinus, () => CambiarZoom(_zoom / 1.25))),
            Doc(Item("Tamaño &real (100%)", Keys.Control | Keys.D1, () => CambiarZoom(1))),
            Doc(Item("Ajustar al &ancho", Keys.Control | Keys.D2, AjustarAncho)),
            Doc(Item("Ajustar &página", Keys.Control | Keys.D0, AjustarPagina)),
            new ToolStripSeparator(),
            Doc(Item("Página &siguiente", Keys.None, () => IrAPagina(_pagina + 1))),
            Doc(Item("Página a&nterior", Keys.None, () => IrAPagina(_pagina - 1))));

        var paginas = Menu("&Páginas", MenuPaginas());

        var herramientas = Menu("&Herramientas",
            ItemHerramienta("&Seleccionar / desplazar", Herramienta.Seleccionar),
            ItemHerramienta("Insertar &texto", Herramienta.Texto),
            ItemHerramienta("Insertar &imagen", Herramienta.Imagen),
            ItemHerramienta("&Resaltar", Herramienta.Resaltar),
            ItemHerramienta("T&apar área (blanco)", Herramienta.Tapar),
            ItemHerramienta("&Marco / rectángulo", Herramienta.Marco),
            new ToolStripSeparator(),
            Item("&Unir varios PDF...", Keys.None, UnirArchivos),
            Doc(Item("&Dividir documento...", Keys.None, Dividir)));

        var ayuda = Menu("A&yuda", Item("&Acerca de...", Keys.None, () =>
            MessageBox.Show(this,
                "Editor PDF 1.0\n\nVisualización: PDFium (Google) vía PDFtoImage — MIT\nEdición: PDFsharp 6 — MIT\n\nArquitectura N-capas: UI · Negocio · Datos · Entidades",
                "Acerca de", MessageBoxButtons.OK, MessageBoxIcon.Information)));

        _menu.Items.AddRange(new ToolStripItem[] { archivo, editar, ver, paginas, herramientas, ayuda });
    }

    /// <summary>Elementos de página compartidos por el menú principal y el menú contextual de miniaturas.</summary>
    private ToolStripItem[] MenuPaginas() =>
    [
        Doc(Item("Rotar a la &derecha", Keys.Control | Keys.R, () => RotarSeleccion(90))),
        Doc(Item("Rotar a la &izquierda", Keys.Control | Keys.Shift | Keys.R, () => RotarSeleccion(-90))),
        Doc(Item("Rotar &180°", Keys.None, () => RotarSeleccion(180))),
        new ToolStripSeparator(),
        Doc(Item("Mover &arriba", Keys.Control | Keys.Up, () => MoverPagina(-1))),
        Doc(Item("Mover a&bajo", Keys.Control | Keys.Down, () => MoverPagina(1))),
        new ToolStripSeparator(),
        Doc(Item("Insertar página en &blanco después", Keys.None, () => { int pos = _pagina + 1; _pagina = pos; _doc.InsertarPaginaEnBlanco(pos); })),
        Doc(Item("Insertar páginas desde &PDF...", Keys.None, InsertarDesdePdf)),
        Doc(Item("E&xtraer páginas a un PDF nuevo...", Keys.None, ExtraerPaginas)),
        new ToolStripSeparator(),
        Doc(Item("&Eliminar páginas seleccionadas", Keys.None, EliminarSeleccion)),
    ];

    private void ConstruirBarra()
    {
        _barra.Items.AddRange(new ToolStripItem[]
        {
            Boton("Abrir", "Abrir un PDF (Ctrl+O)", AbrirConDialogo),
            Doc(Boton("Guardar", "Guardar (Ctrl+S)", () => Guardar())),
            Doc(Boton("Imprimir", "Imprimir (Ctrl+P)", Imprimir)),
            new ToolStripSeparator(),
            _btnDeshacer = Doc(Boton("↶", "Deshacer (Ctrl+Z)", _doc.Deshacer)),
            _btnRehacer = Doc(Boton("↷", "Rehacer (Ctrl+Y)", _doc.Rehacer)),
            new ToolStripSeparator(),
            Doc(Boton("◀", "Página anterior (RePág)", () => IrAPagina(_pagina - 1))),
            Doc(_txtPagina),
            _lblTotal,
            Doc(Boton("▶", "Página siguiente (AvPág)", () => IrAPagina(_pagina + 1))),
            new ToolStripSeparator(),
            Doc(Boton("−", "Alejar (Ctrl+-)", () => CambiarZoom(_zoom / 1.25))),
            Doc(Boton("+", "Acercar (Ctrl++)", () => CambiarZoom(_zoom * 1.25))),
            Doc(Boton("↔ Ancho", "Ajustar al ancho", AjustarAncho)),
            new ToolStripSeparator(),
            Doc(Boton("⟲", "Rotar a la izquierda", () => RotarSeleccion(-90))),
            Doc(Boton("⟳", "Rotar a la derecha", () => RotarSeleccion(90))),
            Doc(Boton("✕", "Eliminar páginas seleccionadas", EliminarSeleccion)),
            new ToolStripSeparator(),
            BotonHerramienta("Seleccionar", Herramienta.Seleccionar),
            BotonHerramienta("Texto", Herramienta.Texto),
            BotonHerramienta("Imagen", Herramienta.Imagen),
            BotonHerramienta("Resaltar", Herramienta.Resaltar),
            BotonHerramienta("Tapar", Herramienta.Tapar),
            BotonHerramienta("Marco", Herramienta.Marco),
            Doc(Boton("Color...", "Color del marco", ElegirColorMarco)),
        });

        _txtPagina.KeyDown += (_, e) =>
        {
            if (e.KeyCode != Keys.Enter) return;
            e.SuppressKeyPress = true;
            if (int.TryParse(_txtPagina.Text, out var n)) IrAPagina(n - 1);
            _visor.Focus();
        };
    }

    private void ConstruirCuerpo()
    {
        _miniaturas.LargeImageList = _imagenes;
        _miniaturas.ContextMenuStrip = new ContextMenuStrip();
        _miniaturas.ContextMenuStrip.Items.AddRange(MenuPaginas());

        _miniaturas.SelectedIndexChanged += (_, _) =>
        {
            if (_sincronizandoSeleccion || _miniaturas.FocusedItem is null || !_miniaturas.FocusedItem.Selected) return;
            IrAPagina(_miniaturas.FocusedItem.Index);
        };
        _miniaturas.KeyDown += (_, e) => { if (e.KeyCode == Keys.Delete) EliminarSeleccion(); };

        // Reordenar páginas arrastrando miniaturas.
        _miniaturas.ItemDrag += (_, e) => _miniaturas.DoDragDrop(e.Item!, DragDropEffects.Move);
        _miniaturas.DragOver += (_, e) =>
        {
            if (e.Data?.GetDataPresent(typeof(ListViewItem)) != true) { e.Effect = DragDropEffects.None; return; }
            e.Effect = DragDropEffects.Move;
            var p = _miniaturas.PointToClient(new Point(e.X, e.Y));
            int i = _miniaturas.InsertionMark.NearestIndex(p);
            if (i >= 0)
            {
                var r = _miniaturas.GetItemRect(i);
                _miniaturas.InsertionMark.AppearsAfterItem = p.Y > r.Bottom || (p.Y > r.Top && p.X > r.Left + r.Width / 2);
            }
            _miniaturas.InsertionMark.Index = i;
        };
        _miniaturas.DragLeave += (_, _) => _miniaturas.InsertionMark.Index = -1;
        _miniaturas.DragDrop += (_, e) =>
        {
            int marca = _miniaturas.InsertionMark.Index;
            bool despues = _miniaturas.InsertionMark.AppearsAfterItem;
            _miniaturas.InsertionMark.Index = -1;
            if (marca < 0 || e.Data?.GetData(typeof(ListViewItem)) is not ListViewItem item) return;
            int desde = item.Index;
            int hasta = marca + (despues ? 1 : 0);
            if (hasta > desde) hasta--;
            if (hasta == desde) return;
            Ejecutar(() => { _pagina = hasta; _doc.MoverPagina(desde, hasta); });
        };

        _visor.ClicEnPagina += (_, p) => AlHacerClic(p);
        _visor.AreaSeleccionada += (_, r) => AlSeleccionarArea(r);
        _visor.ZoomSolicitado += (_, d) => CambiarZoom(d > 0 ? _zoom * 1.1 : _zoom / 1.1);
        _visor.CambioPaginaSolicitado += (_, d) =>
        {
            if (!_doc.HayDocumento) return;
            int destino = _pagina + d;
            if (destino < 0 || destino >= _doc.NumeroPaginas) return;
            IrAPagina(destino);
            // Al avanzar se empieza arriba de la página; al retroceder, abajo.
            if (d < 0) _visor.AutoScrollPosition = new Point(0, _visor.DisplayRectangle.Height);
        };

        _split.Panel1.Controls.Add(_miniaturas);
        _split.Panel2.Controls.Add(_visor);
        _split.Panel1MinSize = 120;
        Load += (_, _) => _split.SplitterDistance = 150;
    }

    // ---- fábricas pequeñas para no repetir código

    private static ToolStripMenuItem Menu(string texto, params ToolStripItem[] items)
    {
        var m = new ToolStripMenuItem(texto);
        m.DropDownItems.AddRange(items);
        return m;
    }

    private ToolStripMenuItem Item(string texto, Keys atajo, Action accion)
    {
        var m = new ToolStripMenuItem(texto) { ShortcutKeys = atajo };
        m.Click += (_, _) => Ejecutar(accion);
        return m;
    }

    private ToolStripButton Boton(string texto, string ayuda, Action accion)
    {
        var b = new ToolStripButton(texto) { ToolTipText = ayuda, DisplayStyle = ToolStripItemDisplayStyle.Text };
        b.Click += (_, _) => Ejecutar(accion);
        return b;
    }

    private ToolStripMenuItem ItemHerramienta(string texto, Herramienta h)
    {
        var m = Item(texto, Keys.None, () => SeleccionarHerramienta(h));
        return h == Herramienta.Seleccionar ? m : Doc(m);
    }

    private ToolStripButton BotonHerramienta(string texto, Herramienta h)
    {
        var b = Boton(texto, $"Herramienta: {texto}", () => SeleccionarHerramienta(h));
        _botonesHerramienta[h] = b;
        return h == Herramienta.Seleccionar ? b : Doc(b);
    }

    /// <summary>Registra un elemento que solo se habilita cuando hay documento abierto.</summary>
    private T Doc<T>(T item) where T : ToolStripItem
    {
        _requierenDocumento.Add(item);
        return item;
    }

    // =====================================================================
    //  Archivo
    // =====================================================================

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        if (_archivoInicial != null) AbrirArchivo(_archivoInicial);
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!ConfirmarDescartar()) e.Cancel = true;
        base.OnFormClosing(e);
    }

    private void NuevoDocumento()
    {
        if (!ConfirmarDescartar()) return;
        _pagina = 0;
        _doc.Nuevo();
    }

    private void AbrirConDialogo()
    {
        if (!ConfirmarDescartar()) return;
        using var dlg = new OpenFileDialog { Filter = FiltroPdf, Title = "Abrir PDF" };
        if (dlg.ShowDialog(this) == DialogResult.OK) AbrirArchivo(dlg.FileName, yaConfirmado: true);
    }

    private void AbrirArchivo(string ruta, bool yaConfirmado = false)
    {
        if (!yaConfirmado && !ConfirmarDescartar()) return;
        Ejecutar(() =>
        {
            string? contrasena = null;
            while (true)
            {
                try
                {
                    _pagina = 0;
                    using (new CursorEspera(this)) _doc.Abrir(ruta, contrasena);
                    AjustarAncho();
                    return;
                }
                catch (PdfProtegidoException ex)
                {
                    var msg = ex.ContrasenaIncorrecta ? "Contraseña incorrecta. Inténtelo de nuevo:" : "Este PDF está protegido. Contraseña:";
                    contrasena = FormEntrada.Pedir(this, Path.GetFileName(ruta), msg, esContrasena: true);
                    if (contrasena is null) return;
                }
            }
        });
    }

    private bool Guardar()
    {
        if (_doc.RutaArchivo is null) return GuardarComo();
        bool ok = false;
        Ejecutar(() => { _doc.Guardar(); ok = true; Mensaje("Documento guardado."); });
        return ok;
    }

    private bool GuardarComo(string? contrasena = null)
    {
        using var dlg = new SaveFileDialog
        {
            Filter = FiltroPdf,
            FileName = Path.GetFileName(_doc.RutaArchivo ?? "documento.pdf"),
            InitialDirectory = Path.GetDirectoryName(_doc.RutaArchivo) ?? ""
        };
        if (dlg.ShowDialog(this) != DialogResult.OK) return false;
        bool ok = false;
        Ejecutar(() => { _doc.GuardarComo(dlg.FileName, contrasena); ok = true; Mensaje($"Guardado en {dlg.FileName}"); });
        return ok;
    }

    private void GuardarConContrasena()
    {
        var c1 = FormEntrada.Pedir(this, "Proteger con contraseña", "Nueva contraseña:", esContrasena: true);
        if (string.IsNullOrEmpty(c1)) return;
        var c2 = FormEntrada.Pedir(this, "Proteger con contraseña", "Repita la contraseña:", esContrasena: true);
        if (c2 is null) return;
        if (c1 != c2) throw new ReglaNegocioException("Las contraseñas no coinciden.");
        GuardarComo(c1);
    }

    /// <returns>true si se puede continuar (no había cambios, se guardaron o se descartaron).</returns>
    private bool ConfirmarDescartar()
    {
        if (!_doc.HayDocumento || !_doc.Modificado) return true;
        var r = MessageBox.Show(this, "¿Desea guardar los cambios del documento actual?", "Editor PDF",
            MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
        return r switch
        {
            DialogResult.Yes => Guardar(),
            DialogResult.No => true,
            _ => false
        };
    }

    private void Propiedades()
    {
        using var f = new FormPropiedades(_doc.ObtenerMetadatos(), _doc.RutaArchivo);
        if (f.ShowDialog(this) == DialogResult.OK) _doc.EstablecerMetadatos(f.Resultado);
    }

    private void Imprimir()
    {
        using var impresion = new PrintDocument { DocumentName = Path.GetFileName(_doc.RutaArchivo ?? "Documento PDF") };
        using var dlg = new PrintDialog { Document = impresion, AllowSomePages = true, UseEXDialog = true };
        impresion.PrinterSettings.MinimumPage = 1;
        impresion.PrinterSettings.MaximumPage = _doc.NumeroPaginas;
        impresion.PrinterSettings.FromPage = 1;
        impresion.PrinterSettings.ToPage = _doc.NumeroPaginas;
        if (dlg.ShowDialog(this) != DialogResult.OK) return;

        var ajustes = impresion.PrinterSettings;
        int actual = ajustes.PrintRange == PrintRange.SomePages ? ajustes.FromPage - 1 : 0;
        int ultima = ajustes.PrintRange == PrintRange.SomePages ? ajustes.ToPage - 1 : _doc.NumeroPaginas - 1;

        impresion.QueryPageSettings += (_, e) =>
        {
            var t = _doc.ObtenerTamano(actual);
            e.PageSettings.Landscape = t.Ancho > t.Alto;
        };
        impresion.PrintPage += (_, e) =>
        {
            using var img = ImagenDesdePng(_doc.RenderizarPagina(actual, 200));
            var area = e.MarginBounds;
            double escala = Math.Min((double)area.Width / img.Width, (double)area.Height / img.Height);
            int w = (int)(img.Width * escala), h = (int)(img.Height * escala);
            e.Graphics!.DrawImage(img, area.X + (area.Width - w) / 2, area.Y + (area.Height - h) / 2, w, h);
            actual++;
            e.HasMorePages = actual <= ultima;
        };
        using (new CursorEspera(this)) impresion.Print();
    }

    // =====================================================================
    //  Páginas
    // =====================================================================

    private List<int> PaginasSeleccionadas()
    {
        var sel = _miniaturas.SelectedIndices.Cast<int>().OrderBy(i => i).ToList();
        return sel.Count > 0 ? sel : [_pagina];
    }

    private void SeleccionarTodas()
    {
        foreach (ListViewItem i in _miniaturas.Items) i.Selected = true;
        _miniaturas.Focus();
    }

    private void RotarSeleccion(int grados) => _doc.RotarPaginas(PaginasSeleccionadas(), grados);

    private void EliminarSeleccion()
    {
        var sel = PaginasSeleccionadas();
        var texto = sel.Count == 1 ? $"la página {sel[0] + 1}" : $"{sel.Count} páginas";
        if (MessageBox.Show(this, $"¿Eliminar {texto}?", "Eliminar páginas", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes)
            return;
        Ejecutar(() =>
        {
            _doc.EliminarPaginas(sel);
            _pagina = Math.Min(sel[0], _doc.NumeroPaginas - 1);
            MostrarPagina();
        });
    }

    private void MoverPagina(int delta)
    {
        int destino = _pagina + delta;
        if (destino < 0 || destino >= _doc.NumeroPaginas) return;
        int origen = _pagina;
        _pagina = destino;
        _doc.MoverPagina(origen, destino);
    }

    private void InsertarDesdePdf()
    {
        using var dlg = new OpenFileDialog { Filter = FiltroPdf, Title = "Insertar páginas de otro PDF" };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        var r = MessageBox.Show(this, $"¿Insertar DESPUÉS de la página {_pagina + 1}?\n\nSí = después   ·   No = antes",
            "Insertar páginas", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
        if (r == DialogResult.Cancel) return;
        int pos = r == DialogResult.Yes ? _pagina + 1 : _pagina;
        using (new CursorEspera(this)) _doc.InsertarDesdeArchivo(dlg.FileName, pos);
        IrAPagina(pos);
    }

    private void ExtraerPaginas()
    {
        var sugerencia = string.Join(", ", PaginasSeleccionadas().Select(i => i + 1));
        var rangos = FormEntrada.Pedir(this, "Extraer páginas", "Páginas (ej.: 1-3, 5, 8-):", sugerencia);
        if (rangos is null) return;
        RangoPaginas.Parsear(rangos, _doc.NumeroPaginas); // valida antes de pedir la ruta
        using var dlg = new SaveFileDialog { Filter = FiltroPdf, FileName = NombreBase() + "_extracto.pdf" };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        _doc.ExtraerPaginas(rangos, dlg.FileName);
        Mensaje($"Páginas extraídas en {dlg.FileName}");
    }

    private void Dividir()
    {
        var n = FormEntrada.Pedir(this, "Dividir documento", "Páginas por archivo:", "1");
        if (n is null) return;
        if (!int.TryParse(n, out var porArchivo)) throw new ReglaNegocioException("Escriba un número entero.");
        using var dlg = new FolderBrowserDialog { Description = "Carpeta donde se guardarán las partes" };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        IReadOnlyList<string> rutas;
        using (new CursorEspera(this)) rutas = _doc.DividirCada(porArchivo, dlg.SelectedPath, NombreBase());
        MessageBox.Show(this, $"Se crearon {rutas.Count} archivo(s) en:\n{dlg.SelectedPath}", "Dividir", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private void UnirArchivos()
    {
        var iniciales = _doc.RutaArchivo != null && !_doc.Modificado ? new[] { _doc.RutaArchivo } : [];
        using var f = new FormUnir(iniciales);
        if (f.ShowDialog(this) != DialogResult.OK) return;
        using var dlg = new SaveFileDialog { Filter = FiltroPdf, FileName = "unido.pdf" };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        using (new CursorEspera(this)) _doc.UnirArchivos(f.Archivos, dlg.FileName);
        if (MessageBox.Show(this, "PDF creado. ¿Desea abrirlo?", "Unir", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
            AbrirArchivo(dlg.FileName);
    }

    private string NombreBase() => Path.GetFileNameWithoutExtension(_doc.RutaArchivo ?? "documento");

    // =====================================================================
    //  Herramientas de edición sobre la página
    // =====================================================================

    private void SeleccionarHerramienta(Herramienta h)
    {
        _visor.Herramienta = h;
        foreach (var (clave, boton) in _botonesHerramienta) boton.Checked = clave == h;
        _lblHerramienta.Text = h switch
        {
            Herramienta.Texto => "Clic donde desea insertar el texto",
            Herramienta.Imagen => "Arrastre un área (o haga clic) para colocar la imagen",
            Herramienta.Resaltar => "Arrastre sobre el área a resaltar",
            Herramienta.Tapar => "Arrastre sobre el área a tapar",
            Herramienta.Marco => "Arrastre para dibujar un rectángulo",
            _ => "Seleccionar"
        };
    }

    private void AlHacerClic(PointF p) => Ejecutar(() =>
    {
        switch (_visor.Herramienta)
        {
            case Herramienta.Texto:
                using (var f = new FormTexto())
                {
                    if (f.ShowDialog(this) != DialogResult.OK) return;
                    _doc.AgregarTexto(new AnotacionTexto
                    {
                        IndicePagina = _pagina,
                        X = p.X,
                        Y = p.Y,
                        Texto = f.Texto,
                        Fuente = f.Fuente,
                        Tamano = f.Tamano,
                        Negrita = f.Negrita,
                        Cursiva = f.Cursiva,
                        ColorArgb = f.ColorTexto.ToArgb()
                    });
                }
                break;

            case Herramienta.Imagen:
                InsertarImagen(new RectanguloPdf(p.X, p.Y, 0, 0));
                break;
        }
    });

    private void AlSeleccionarArea(RectanguloPdf r) => Ejecutar(() =>
    {
        switch (_visor.Herramienta)
        {
            case Herramienta.Imagen: InsertarImagen(r); break;
            case Herramienta.Resaltar: _doc.Resaltar(_pagina, r); break;
            case Herramienta.Tapar: _doc.TaparArea(_pagina, r); break;
            case Herramienta.Marco: _doc.DibujarMarco(_pagina, r, _colorMarco.ToArgb(), 2); break;
        }
    });

    /// <param name="area">Área destino; si viene vacía se usa un ancho de 200 pt desde la esquina indicada.</param>
    private void InsertarImagen(RectanguloPdf area)
    {
        using var dlg = new OpenFileDialog { Filter = FiltroImagen, Title = "Elegir imagen" };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;

        Size px;
        using (var img = Image.FromFile(dlg.FileName)) px = img.Size;
        double proporcion = (double)px.Height / px.Width;

        RectanguloPdf destino;
        if (area.EsVacio)
        {
            var t = _doc.ObtenerTamano(_pagina);
            double ancho = Math.Min(200, t.Ancho - area.X);
            destino = new RectanguloPdf(area.X, area.Y, ancho, ancho * proporcion);
        }
        else
        {
            // Encaja la imagen en el área conservando su proporción.
            double ancho = area.Ancho, alto = area.Ancho * proporcion;
            if (alto > area.Alto) { alto = area.Alto; ancho = alto / proporcion; }
            destino = new RectanguloPdf(area.X + (area.Ancho - ancho) / 2, area.Y + (area.Alto - alto) / 2, ancho, alto);
        }
        _doc.AgregarImagen(_pagina, dlg.FileName, destino);
    }

    private void ElegirColorMarco()
    {
        using var dlg = new ColorDialog { Color = _colorMarco, FullOpen = true };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        _colorMarco = dlg.Color;
        SeleccionarHerramienta(Herramienta.Marco);
    }

    // =====================================================================
    //  Navegación y zoom
    // =====================================================================

    private void IrAPagina(int indice)
    {
        if (!_doc.HayDocumento) return;
        int nuevo = Math.Clamp(indice, 0, _doc.NumeroPaginas - 1);
        if (nuevo == _pagina && _visor.Imagen != null) { ActualizarEstado(); return; }
        _pagina = nuevo;
        MostrarPagina();
    }

    private void CambiarZoom(double zoom)
    {
        if (!_doc.HayDocumento) return;
        _zoom = Math.Clamp(zoom, ZoomMinimo, ZoomMaximo);
        MostrarPagina();
    }

    private double DpiPantalla => DeviceDpi;

    private void AjustarAncho()
    {
        if (!_doc.HayDocumento) return;
        var t = _doc.ObtenerTamano(_pagina);
        double anchoPx = t.Ancho / 72.0 * DpiPantalla;
        CambiarZoom((_visor.ClientSize.Width - SystemInformation.VerticalScrollBarWidth - 40) / anchoPx);
    }

    private void AjustarPagina()
    {
        if (!_doc.HayDocumento) return;
        var t = _doc.ObtenerTamano(_pagina);
        double zx = (_visor.ClientSize.Width - 40) / (t.Ancho / 72.0 * DpiPantalla);
        double zy = (_visor.ClientSize.Height - 40) / (t.Alto / 72.0 * DpiPantalla);
        CambiarZoom(Math.Min(zx, zy));
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (_doc.HayDocumento && !_txtPagina.Focused)
        {
            switch (keyData)
            {
                case Keys.PageDown: IrAPagina(_pagina + 1); return true;
                case Keys.PageUp: IrAPagina(_pagina - 1); return true;
                case Keys.Control | Keys.Home: IrAPagina(0); return true;
                case Keys.Control | Keys.End: IrAPagina(_doc.NumeroPaginas - 1); return true;
                case Keys.Escape: SeleccionarHerramienta(Herramienta.Seleccionar); return true;
            }
        }
        return base.ProcessCmdKey(ref msg, keyData);
    }

    // =====================================================================
    //  Refresco de pantalla
    // =====================================================================

    private void AlCambiarDocumento()
    {
        if (!_doc.HayDocumento)
        {
            _visor.MostrarImagen(null, 96, false);
            _miniaturas.Items.Clear();
            _imagenes.Images.Clear();
            _generacionMiniaturas++;
            ActualizarEstado();
            return;
        }
        _pagina = Math.Clamp(_pagina, 0, _doc.NumeroPaginas - 1);
        MostrarPagina(mantenerScroll: true);
        _ = GenerarMiniaturasAsync();
    }

    private void MostrarPagina(bool mantenerScroll = false)
    {
        if (!_doc.HayDocumento) return;
        int dpi = (int)Math.Round(DpiPantalla * _zoom);
        try
        {
            using (new CursorEspera(this))
                _visor.MostrarImagen(ImagenDesdePng(_doc.RenderizarPagina(_pagina, dpi)), dpi, mantenerScroll);
        }
        catch (Exception ex)
        {
            _visor.MostrarImagen(null, dpi, false);
            Mensaje("No se pudo mostrar la página: " + ex.Message);
        }
        SincronizarMiniatura();
        ActualizarEstado();
    }

    private void SincronizarMiniatura()
    {
        if (_pagina >= _miniaturas.Items.Count) return;
        var item = _miniaturas.Items[_pagina];
        if (item.Selected && _miniaturas.SelectedItems.Count >= 1) { item.EnsureVisible(); return; }
        _sincronizandoSeleccion = true;
        try
        {
            _miniaturas.SelectedItems.Clear();
            item.Selected = true;
            item.Focused = true;
            item.EnsureVisible();
        }
        finally { _sincronizandoSeleccion = false; }
    }

    /// <summary>Genera las miniaturas en segundo plano; si el documento cambia a mitad, se cancela.</summary>
    private async Task GenerarMiniaturasAsync()
    {
        int generacion = ++_generacionMiniaturas;
        int total = _doc.NumeroPaginas;

        _miniaturas.BeginUpdate();
        while (_imagenes.Images.Count < total) _imagenes.Images.Add(new Bitmap(TamanoMiniatura.Width, TamanoMiniatura.Height));
        while (_imagenes.Images.Count > total) _imagenes.Images.RemoveAt(_imagenes.Images.Count - 1);
        while (_miniaturas.Items.Count > total) _miniaturas.Items.RemoveAt(_miniaturas.Items.Count - 1);
        while (_miniaturas.Items.Count < total) _miniaturas.Items.Add(new ListViewItem((_miniaturas.Items.Count + 1).ToString(), _miniaturas.Items.Count));
        _miniaturas.EndUpdate();
        SincronizarMiniatura();

        for (int i = 0; i < total; i++)
        {
            int indice = i;
            Bitmap? miniatura;
            try
            {
                miniatura = await Task.Run(() => CrearMiniatura(_doc.RenderizarPagina(indice, 20)));
            }
            catch
            {
                return; // el documento cambió o se cerró mientras se generaba
            }
            if (generacion != _generacionMiniaturas || IsDisposed) { miniatura.Dispose(); return; }
            _imagenes.Images[indice] = miniatura;
            _miniaturas.RedrawItems(indice, indice, true);
        }
    }

    private static Bitmap CrearMiniatura(byte[] png)
    {
        using var pagina = ImagenDesdePng(png);
        var lienzo = new Bitmap(TamanoMiniatura.Width, TamanoMiniatura.Height);
        using var g = Graphics.FromImage(lienzo);
        g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
        double escala = Math.Min((TamanoMiniatura.Width - 4.0) / pagina.Width, (TamanoMiniatura.Height - 4.0) / pagina.Height);
        int w = (int)(pagina.Width * escala), h = (int)(pagina.Height * escala);
        var r = new Rectangle((TamanoMiniatura.Width - w) / 2, (TamanoMiniatura.Height - h) / 2, w, h);
        g.DrawImage(pagina, r);
        g.DrawRectangle(Pens.DarkGray, r);
        return lienzo;
    }

    private void ActualizarEstado()
    {
        bool hay = _doc.HayDocumento;
        foreach (var item in _requierenDocumento) item.Enabled = hay;
        _mnuDeshacer.Enabled = _btnDeshacer.Enabled = hay && _doc.PuedeDeshacer;
        _mnuRehacer.Enabled = _btnRehacer.Enabled = hay && _doc.PuedeRehacer;

        var nombre = hay ? Path.GetFileName(_doc.RutaArchivo) ?? "Sin título" : null;
        Text = hay ? $"{nombre}{(_doc.Modificado ? " *" : "")} - Editor PDF" : "Editor PDF";
        _txtPagina.Text = hay ? (_pagina + 1).ToString() : "";
        _lblTotal.Text = $"/ {(hay ? _doc.NumeroPaginas : 0)}";
        _lblZoom.Text = hay ? $"{_zoom:P0}" : "";
        if (!hay) _lblMensaje.Text = "Abra un PDF (Ctrl+O) o arrástrelo a la ventana.";
    }

    private void Mensaje(string texto) => _lblMensaje.Text = texto;

    // =====================================================================
    //  Utilidades
    // =====================================================================

    /// <summary>Ejecuta una acción mostrando los errores de forma amigable.</summary>
    private void Ejecutar(Action accion)
    {
        try
        {
            accion();
        }
        catch (ReglaNegocioException ex)
        {
            MessageBox.Show(this, ex.Message, "Editor PDF", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            ActualizarEstado();
        }
    }

    private static Bitmap ImagenDesdePng(byte[] png)
    {
        // GDI+ exige mantener abierto el stream de origen; se copia para poder liberarlo.
        using var ms = new MemoryStream(png);
        using var temporal = Image.FromStream(ms);
        return new Bitmap(temporal);
    }

    private static IEnumerable<string> ArchivosArrastrados(DragEventArgs e) =>
        (e.Data?.GetData(DataFormats.FileDrop) as string[] ?? [])
            .Where(a => a.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase));

    /// <summary>Equivalente a Cursor = WaitCursor ... Finally Cursor = Default.</summary>
    private sealed class CursorEspera : IDisposable
    {
        private readonly Form _form;
        public CursorEspera(Form form) { _form = form; _form.UseWaitCursor = true; Cursor.Current = Cursors.WaitCursor; }
        public void Dispose() { _form.UseWaitCursor = false; Cursor.Current = Cursors.Default; }
    }
}
