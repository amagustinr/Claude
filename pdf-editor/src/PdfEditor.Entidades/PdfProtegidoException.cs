namespace PdfEditor.Entidades;

/// <summary>Se lanza cuando el PDF requiere contraseña y no se proporcionó (o es incorrecta).</summary>
public sealed class PdfProtegidoException : Exception
{
    public bool ContrasenaIncorrecta { get; }

    public PdfProtegidoException(bool contrasenaIncorrecta)
        : base(contrasenaIncorrecta ? "La contraseña no es correcta." : "El documento está protegido con contraseña.")
    {
        ContrasenaIncorrecta = contrasenaIncorrecta;
    }
}
