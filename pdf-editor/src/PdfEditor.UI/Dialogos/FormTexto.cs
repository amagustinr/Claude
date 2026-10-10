using PdfEditor.Negocio;

namespace PdfEditor.UI.Dialogos;

/// <summary>Captura el texto a insertar y su formato.</summary>
public sealed class FormTexto : DialogoBase
{
    private static string _ultimaFuente = "Arial";
    private static decimal _ultimoTamano = 12;
    private static Color _ultimoColor = Color.Black;

    private readonly TextBox _texto = new() { Multiline = true, Height = 90, Width = 320, ScrollBars = ScrollBars.Vertical, AcceptsReturn = true };
    private readonly ComboBox _fuente = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly NumericUpDown _tamano = new() { Minimum = 4, Maximum = 200, DecimalPlaces = 1, Increment = 1 };
    private readonly CheckBox _negrita = new() { Text = "Negrita", AutoSize = true };
    private readonly CheckBox _cursiva = new() { Text = "Cursiva", AutoSize = true };
    private readonly Button _color = new() { Text = "  ", Width = 60, FlatStyle = FlatStyle.Flat };

    public FormTexto() : base("Insertar texto")
    {
        _fuente.Items.AddRange(FabricaServicios.FuentesDisponibles.Cast<object>().ToArray());
        _fuente.SelectedItem = _ultimaFuente;
        if (_fuente.SelectedIndex < 0) _fuente.SelectedIndex = 0;
        _tamano.Value = _ultimoTamano;
        _color.BackColor = _ultimoColor;
        _color.Click += (_, _) =>
        {
            using var dlg = new ColorDialog { Color = _color.BackColor, FullOpen = true };
            if (dlg.ShowDialog(this) == DialogResult.OK) _color.BackColor = dlg.Color;
        };

        var estilo = new FlowLayoutPanel { AutoSize = true, Margin = Padding.Empty };
        estilo.Controls.AddRange([_negrita, _cursiva]);

        AgregarFila("Texto:", _texto);
        AgregarFila("Fuente:", _fuente);
        AgregarFila("Tamaño (pt):", _tamano);
        AgregarFila("Estilo:", estilo);
        AgregarFila("Color:", _color);

        // En un TextBox multilínea, Enter crea una línea nueva: Aceptar con Ctrl+Enter.
        AcceptButton = null;
        _texto.KeyDown += (_, e) =>
        {
            if (e.Control && e.KeyCode == Keys.Enter) { DialogResult = DialogResult.OK; e.SuppressKeyPress = true; }
        };
        FormClosing += (_, _) =>
        {
            if (DialogResult != DialogResult.OK) return;
            _ultimaFuente = Fuente; _ultimoTamano = _tamano.Value; _ultimoColor = _color.BackColor;
        };
    }

    public string Texto => _texto.Text;
    public string Fuente => _fuente.SelectedItem?.ToString() ?? "Arial";
    public double Tamano => (double)_tamano.Value;
    public bool Negrita => _negrita.Checked;
    public bool Cursiva => _cursiva.Checked;
    public Color ColorTexto => _color.BackColor;
}
