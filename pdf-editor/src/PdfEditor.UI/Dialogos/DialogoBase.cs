namespace PdfEditor.UI.Dialogos;

/// <summary>Base para diálogos sencillos: botones Aceptar/Cancelar y estilo común.</summary>
public class DialogoBase : Form
{
    protected readonly TableLayoutPanel Tabla = new()
    {
        Dock = DockStyle.Fill,
        Padding = new Padding(12),
        ColumnCount = 2,
        AutoSize = true,
    };

    protected readonly Button BotonAceptar = new() { Text = "Aceptar", DialogResult = DialogResult.OK, Width = 90 };
    protected readonly Button BotonCancelar = new() { Text = "Cancelar", DialogResult = DialogResult.Cancel, Width = 90 };

    public DialogoBase(string titulo)
    {
        Text = titulo;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterParent;
        MaximizeBox = MinimizeBox = ShowInTaskbar = false;
        AcceptButton = BotonAceptar;
        CancelButton = BotonCancelar;

        Tabla.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        Tabla.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        _botones = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            FlowDirection = FlowDirection.RightToLeft,
            AutoSize = true,
            Padding = new Padding(8)
        };
        _botones.Controls.Add(BotonCancelar);
        _botones.Controls.Add(BotonAceptar);

        Controls.Add(Tabla);
        Controls.Add(_botones);
    }

    private readonly FlowLayoutPanel _botones;

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        // Ajusta la ventana al contenido (más fiable que Form.AutoSize con controles acoplados).
        var tabla = Tabla.GetPreferredSize(Size.Empty);
        var botones = _botones.GetPreferredSize(Size.Empty);
        ClientSize = new Size(Math.Max(tabla.Width, botones.Width), tabla.Height + botones.Height);
    }

    protected void AgregarFila(string etiqueta, Control control)
    {
        int fila = Tabla.RowCount++;
        Tabla.Controls.Add(new Label { Text = etiqueta, AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(3, 8, 8, 3) }, 0, fila);
        control.Anchor = AnchorStyles.Left | AnchorStyles.Right;
        Tabla.Controls.Add(control, 1, fila);
    }
}
