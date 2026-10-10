namespace PdfEditor.UI.Dialogos;

/// <summary>Equivalente a InputBox de VB, con opción de ocultar caracteres (contraseñas).</summary>
public sealed class FormEntrada : DialogoBase
{
    private readonly TextBox _texto = new() { Width = 280 };

    private FormEntrada(string titulo, string mensaje, string valor, bool esContrasena) : base(titulo)
    {
        _texto.Text = valor;
        _texto.UseSystemPasswordChar = esContrasena;
        AgregarFila(mensaje, _texto);
    }

    public static string? Pedir(IWin32Window? duenio, string titulo, string mensaje, string valor = "", bool esContrasena = false)
    {
        using var f = new FormEntrada(titulo, mensaje, valor, esContrasena);
        return f.ShowDialog(duenio) == DialogResult.OK ? f._texto.Text : null;
    }
}
