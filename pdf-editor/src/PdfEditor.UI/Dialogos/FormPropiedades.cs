using PdfEditor.Entidades;

namespace PdfEditor.UI.Dialogos;

public sealed class FormPropiedades : DialogoBase
{
    private readonly TextBox _titulo = new() { Width = 320 };
    private readonly TextBox _autor = new();
    private readonly TextBox _asunto = new();
    private readonly TextBox _claves = new();
    private readonly MetadatosPdf _datos;

    public FormPropiedades(MetadatosPdf datos, string? ruta) : base("Propiedades del documento")
    {
        _datos = datos;
        _titulo.Text = datos.Titulo;
        _autor.Text = datos.Autor;
        _asunto.Text = datos.Asunto;
        _claves.Text = datos.PalabrasClave;

        AgregarFila("Archivo:", new Label { Text = ruta ?? "(sin guardar)", AutoSize = true, MaximumSize = new Size(320, 0) });
        AgregarFila("Páginas:", new Label { Text = datos.NumeroPaginas.ToString(), AutoSize = true });
        AgregarFila("Creado con:", new Label { Text = datos.Creador, AutoSize = true });
        AgregarFila("Título:", _titulo);
        AgregarFila("Autor:", _autor);
        AgregarFila("Asunto:", _asunto);
        AgregarFila("Palabras clave:", _claves);
    }

    public MetadatosPdf Resultado => new()
    {
        Titulo = _titulo.Text,
        Autor = _autor.Text,
        Asunto = _asunto.Text,
        PalabrasClave = _claves.Text,
        Creador = _datos.Creador,
        NumeroPaginas = _datos.NumeroPaginas
    };
}
