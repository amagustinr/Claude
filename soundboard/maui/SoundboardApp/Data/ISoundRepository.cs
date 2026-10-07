using SoundboardApp.Models;

namespace SoundboardApp.Data;

/// <summary>Capa de datos: guarda los metadatos y los archivos de audio en el almacenamiento privado de la app.</summary>
public interface ISoundRepository
{
    Task<List<Sound>> GetAllAsync();
    Task SaveAllAsync(IEnumerable<Sound> sounds);
    Task<string> StoreFileAsync(Stream source, string extension);
    void DeleteFile(string fileName);
    string GetFullPath(string fileName);
}
