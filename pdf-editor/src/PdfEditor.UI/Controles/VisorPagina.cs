using PdfEditor.Entidades;
using PdfEditor.Negocio;

namespace PdfEditor.UI.Controles;

/// <summary>
/// Muestra una página renderizada y traduce los clics/arrastres del ratón a
/// coordenadas PDF (puntos) según la herramienta activa.
/// </summary>
public sealed class VisorPagina : Panel
{
    private readonly Lienzo _lienzo = new();

    public VisorPagina()
    {
        AutoScroll = true;
        BackColor = Color.FromArgb(82, 86, 89);
        DoubleBuffered = true;
        Controls.Add(_lienzo);
        _lienzo.Visor = this;
        Resize += (_, _) => Centrar();
    }

    /// <summary>Clic simple (herramientas Texto e Imagen). Coordenadas en puntos PDF.</summary>
    public event EventHandler<PointF>? ClicEnPagina;

    /// <summary>Área arrastrada con el ratón. Coordenadas en puntos PDF.</summary>
    public event EventHandler<RectanguloPdf>? AreaSeleccionada;

    /// <summary>Ctrl + rueda del ratón. Valor positivo = acercar.</summary>
    public event EventHandler<int>? ZoomSolicitado;

    /// <summary>Rueda al llegar al final/principio de la página: +1 siguiente, -1 anterior.</summary>
    public event EventHandler<int>? CambioPaginaSolicitado;

    public Herramienta Herramienta
    {
        get => _herramienta;
        set
        {
            _herramienta = value;
            _lienzo.Cursor = value switch
            {
                Herramienta.Seleccionar => Cursors.Default,
                Herramienta.Texto => Cursors.IBeam,
                _ => Cursors.Cross
            };
        }
    }
    private Herramienta _herramienta;

    /// <summary>Resolución con la que se renderizó <see cref="Imagen"/>.</summary>
    public int Dpi { get; private set; } = 96;

    public Image? Imagen => _lienzo.Imagen;

    public void MostrarImagen(Image? imagen, int dpi, bool mantenerScroll)
    {
        var scroll = AutoScrollPosition;
        var anterior = _lienzo.Imagen;
        _lienzo.Imagen = imagen;
        Dpi = dpi;
        _lienzo.Size = imagen?.Size ?? Size.Empty;
        anterior?.Dispose();
        Centrar();
        AutoScrollPosition = mantenerScroll ? new Point(-scroll.X, -scroll.Y) : Point.Empty;
        _lienzo.Invalidate();
    }

    private void Centrar()
    {
        const int margen = 16;
        int x = Math.Max(margen, (ClientSize.Width - _lienzo.Width) / 2);
        int y = Math.Max(margen, (ClientSize.Height - _lienzo.Height) / 2);
        _lienzo.Location = new Point(x + AutoScrollPosition.X, y + AutoScrollPosition.Y);
        AutoScrollMinSize = new Size(_lienzo.Width + margen * 2, _lienzo.Height + margen * 2);
    }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        if ((ModifierKeys & Keys.Control) != 0)
        {
            ZoomSolicitado?.Invoke(this, Math.Sign(e.Delta));
            return;
        }

        int antes = VerticalScroll.Value;
        base.OnMouseWheel(e);
        bool sinMovimiento = VerticalScroll.Value == antes;
        if (sinMovimiento) CambioPaginaSolicitado?.Invoke(this, e.Delta < 0 ? 1 : -1);
    }

    internal void NotificarClic(Point px) =>
        ClicEnPagina?.Invoke(this, new PointF((float)Coordenadas.PixelAPunto(px.X, Dpi), (float)Coordenadas.PixelAPunto(px.Y, Dpi)));

    internal void NotificarArea(Rectangle px) =>
        AreaSeleccionada?.Invoke(this, new RectanguloPdf(
            Coordenadas.PixelAPunto(px.X, Dpi), Coordenadas.PixelAPunto(px.Y, Dpi),
            Coordenadas.PixelAPunto(px.Width, Dpi), Coordenadas.PixelAPunto(px.Height, Dpi)));

    /// <summary>Superficie que dibuja la página y el rectángulo elástico.</summary>
    private sealed class Lienzo : Control
    {
        private Point? _inicio;
        private Rectangle _seleccion;

        public VisorPagina Visor { get; set; } = null!;
        public Image? Imagen { get; set; }

        public Lienzo()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
            BackColor = Color.White;
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            Focus();
            if (e.Button != MouseButtons.Left || Imagen is null) return;

            if (Visor.Herramienta == Herramienta.Texto)
            {
                Visor.NotificarClic(e.Location);
                return;
            }
            if (Visor.Herramienta != Herramienta.Seleccionar)
            {
                _inicio = e.Location;
                _seleccion = Rectangle.Empty;
            }
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);
            if (_inicio is not Point p) return;
            var x = Math.Clamp(e.X, 0, Width);
            var y = Math.Clamp(e.Y, 0, Height);
            _seleccion = Rectangle.FromLTRB(Math.Min(p.X, x), Math.Min(p.Y, y), Math.Max(p.X, x), Math.Max(p.Y, y));
            Invalidate();
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            base.OnMouseUp(e);
            if (_inicio is not Point p) return;
            _inicio = null;
            var area = _seleccion;
            _seleccion = Rectangle.Empty;
            Invalidate();

            if (area.Width < 4 || area.Height < 4)
            {
                // Un clic sin arrastrar con la herramienta Imagen la coloca con tamaño automático.
                if (Visor.Herramienta == Herramienta.Imagen) Visor.NotificarClic(p);
                return;
            }
            Visor.NotificarArea(area);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            if (Imagen != null) e.Graphics.DrawImageUnscaled(Imagen, 0, 0);
            if (_seleccion.IsEmpty) return;

            var color = Visor.Herramienta switch
            {
                Herramienta.Resaltar => Color.FromArgb(90, 255, 230, 0),
                Herramienta.Tapar => Color.FromArgb(120, 255, 255, 255),
                _ => Color.FromArgb(40, 0, 120, 215)
            };
            using var relleno = new SolidBrush(color);
            using var borde = new Pen(Color.FromArgb(0, 120, 215)) { DashStyle = System.Drawing.Drawing2D.DashStyle.Dash };
            e.Graphics.FillRectangle(relleno, _seleccion);
            e.Graphics.DrawRectangle(borde, _seleccion);
        }
    }
}
