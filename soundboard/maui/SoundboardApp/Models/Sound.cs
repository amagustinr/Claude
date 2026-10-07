namespace SoundboardApp.Models;

/// <summary>Entidad persistida: un audio del soundboard.</summary>
public class Sound
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "Sonido";
    /// <summary>Nombre del archivo dentro de la carpeta privada de la app.</summary>
    public string FileName { get; set; } = "";
    public string ColorHex { get; set; } = "#FF4D4D";
    public double Volume { get; set; } = 1.0;
    public int Order { get; set; }
    public double DurationSeconds { get; set; }
    public long SizeBytes { get; set; }
    public bool IsExample { get; set; }
}
