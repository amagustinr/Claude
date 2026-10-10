namespace PdfEditor.UI.Dialogos;

/// <summary>Permite elegir y ordenar los PDF que se van a unir.</summary>
public sealed class FormUnir : DialogoBase
{
    private readonly ListBox _lista = new() { Width = 420, Height = 220, HorizontalScrollbar = true, SelectionMode = SelectionMode.MultiExtended };

    public FormUnir(IEnumerable<string> iniciales) : base("Unir archivos PDF")
    {
        foreach (var r in iniciales) _lista.Items.Add(r);

        var botones = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true };
        botones.Controls.Add(Boton("Agregar...", Agregar));
        botones.Controls.Add(Boton("Quitar", Quitar));
        botones.Controls.Add(Boton("Subir", () => Mover(-1)));
        botones.Controls.Add(Boton("Bajar", () => Mover(1)));

        Tabla.Controls.Add(_lista, 0, 0);
        Tabla.Controls.Add(botones, 1, 0);
        Tabla.RowCount = 1;
        Tabla.Controls.Add(new Label
        {
            Text = "Las páginas se unirán en el orden de la lista. También puede arrastrar archivos aquí.",
            AutoSize = true
        }, 0, 1);
        Tabla.SetColumnSpan(Tabla.GetControlFromPosition(0, 1)!, 2);

        AllowDrop = true;
        DragEnter += (_, e) => e.Effect = e.Data?.GetDataPresent(DataFormats.FileDrop) == true ? DragDropEffects.Copy : DragDropEffects.None;
        DragDrop += (_, e) =>
        {
            if (e.Data?.GetData(DataFormats.FileDrop) is string[] archivos)
                foreach (var a in archivos.Where(a => a.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)))
                    _lista.Items.Add(a);
        };
    }

    public IReadOnlyList<string> Archivos => _lista.Items.Cast<string>().ToList();

    private static Button Boton(string texto, Action accion)
    {
        var b = new Button { Text = texto, Width = 90 };
        b.Click += (_, _) => accion();
        return b;
    }

    private void Agregar()
    {
        using var dlg = new OpenFileDialog { Filter = "Documentos PDF (*.pdf)|*.pdf", Multiselect = true };
        if (dlg.ShowDialog(this) == DialogResult.OK) _lista.Items.AddRange(dlg.FileNames);
    }

    private void Quitar()
    {
        for (int i = _lista.SelectedIndices.Count - 1; i >= 0; i--)
            _lista.Items.RemoveAt(_lista.SelectedIndices[i]);
    }

    private void Mover(int delta)
    {
        int i = _lista.SelectedIndex;
        int j = i + delta;
        if (i < 0 || j < 0 || j >= _lista.Items.Count) return;
        var item = _lista.Items[i];
        _lista.Items.RemoveAt(i);
        _lista.Items.Insert(j, item);
        _lista.ClearSelected();
        _lista.SelectedIndex = j;
    }
}
