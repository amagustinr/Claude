namespace CamarasWeb.Models;

/// <summary>Fila devuelta por spGetCamarasxMonitor_DAHUA_AXIS (se lee por índice, igual que el WinForms).</summary>
public sealed record CamaraMonitor(
    string Usuario,
    string Contrasena,
    string Ip,
    int TipoCamara,
    string Nombre);

/// <summary>
/// Lo que recibe el navegador: nunca incluye credenciales, solo nombres de stream en go2rtc.
/// Stream = el de la grilla (substream); StreamHd = el principal, usado al ampliar (doble clic).
/// </summary>
public sealed record CamaraVisor(int Posicion, string Nombre, string Stream, string StreamHd, string Tipo);

/// <summary>Registro de cámara (spGetSucursalesxId / spInsertCamaraDahuaAxis / spUpdateCamaraDahuaAxis).</summary>
public sealed class CamaraRegistro
{
    public int? Id { get; set; }
    public string NombreSucursal { get; set; } = "";
    public string Descripcion { get; set; } = "";
    public string Usuario { get; set; } = "";
    /// <summary>Al leer se devuelve vacía; al actualizar, vacía = conservar la actual.</summary>
    public string Contrasena { get; set; } = "";
    public bool TieneContrasena { get; set; }
    public string Ip { get; set; } = "";
    public bool Activar { get; set; }
    public int Monitor { get; set; }
    public string Webcam { get; set; } = "";
    public int Posicion { get; set; }
    public int TipoCam { get; set; } = 2;
}

/// <summary>Resultado genérico de spGetSucursales (columnas dinámicas, como el DataGridView).</summary>
public sealed record TablaResultado(IReadOnlyList<string> Columnas, IReadOnlyList<Dictionary<string, object?>> Filas);
