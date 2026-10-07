using System.Text.Json;
using SoundboardApp.Models;

namespace SoundboardApp.Data;

/// <summary>
/// Repositorio en JSON: sounds.json con los metadatos y una carpeta "sounds" con los audios.
/// Todo vive en FileSystem.AppDataDirectory, así que solo esta app lo ve y se borra al desinstalar.
/// </summary>
public class JsonSoundRepository : ISoundRepository
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private readonly SemaphoreSlim _lock = new(1, 1);
    private readonly string _root;
    private readonly string _soundsDir;
    private readonly string _indexPath;

    public JsonSoundRepository()
    {
        _root = FileSystem.AppDataDirectory;
        _soundsDir = Path.Combine(_root, "sounds");
        _indexPath = Path.Combine(_root, "sounds.json");
        Directory.CreateDirectory(_soundsDir);
    }

    public async Task<List<Sound>> GetAllAsync()
    {
        await _lock.WaitAsync();
        try
        {
            if (!File.Exists(_indexPath)) return new List<Sound>();
            await using var fs = File.OpenRead(_indexPath);
            var list = await JsonSerializer.DeserializeAsync<List<Sound>>(fs, JsonOptions) ?? new List<Sound>();
            // Descarta entradas cuyo archivo ya no existe
            return list.Where(s => File.Exists(GetFullPath(s.FileName))).OrderBy(s => s.Order).ToList();
        }
        catch (JsonException)
        {
            return new List<Sound>();
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task SaveAllAsync(IEnumerable<Sound> sounds)
    {
        await _lock.WaitAsync();
        try
        {
            var tmp = _indexPath + ".tmp";
            await using (var fs = File.Create(tmp))
            {
                await JsonSerializer.SerializeAsync(fs, sounds.OrderBy(s => s.Order).ToList(), JsonOptions);
            }
            File.Move(tmp, _indexPath, overwrite: true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<string> StoreFileAsync(Stream source, string extension)
    {
        if (string.IsNullOrWhiteSpace(extension)) extension = ".audio";
        if (!extension.StartsWith('.')) extension = "." + extension;
        var fileName = Guid.NewGuid().ToString("N") + extension.ToLowerInvariant();
        await using var target = File.Create(GetFullPath(fileName));
        await source.CopyToAsync(target);
        return fileName;
    }

    public void DeleteFile(string fileName)
    {
        var path = GetFullPath(fileName);
        if (File.Exists(path)) File.Delete(path);
    }

    public string GetFullPath(string fileName) => Path.Combine(_soundsDir, fileName);
}
