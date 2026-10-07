using SoundboardApp.Models;

namespace SoundboardApp.Services;

public record ImportResult(int Added, int Failed);

/// <summary>Capa de negocio: reglas para añadir, editar, ordenar y borrar sonidos.</summary>
public interface ISoundLibraryService
{
    IReadOnlyList<Sound> Sounds { get; }
    /// <summary>Se dispara cuando cambia la lista (alta, baja u orden). Los cambios de nombre/color también.</summary>
    event EventHandler? Changed;

    Task InitializeAsync();
    Task<ImportResult> ImportAsync(IEnumerable<FileResult> files);
    Task UpdateAsync(Sound sound);
    Task MoveAsync(Sound sound, int delta);
    Task DeleteAsync(Sound sound);
}
