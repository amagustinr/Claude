using SoundboardApp.Data;
using SoundboardApp.Models;

namespace SoundboardApp.Services;

public class SoundLibraryService : ISoundLibraryService
{
    public static readonly string[] Palette =
        { "#FF4D4D", "#FF8A3D", "#FFD23F", "#3DDC84", "#2EC4E6", "#4D7CFF", "#A66BFF", "#FF5FA2" };

    private readonly ISoundRepository _repository;
    private readonly IAudioPlayerService _player;
    private readonly ISettingsService _settings;
    private readonly List<Sound> _sounds = new();
    private bool _initialized;

    public SoundLibraryService(ISoundRepository repository, IAudioPlayerService player, ISettingsService settings)
    {
        _repository = repository;
        _player = player;
        _settings = settings;
    }

    public IReadOnlyList<Sound> Sounds => _sounds;
    public event EventHandler? Changed;

    public async Task InitializeAsync()
    {
        if (_initialized) return;
        _initialized = true;
        _sounds.AddRange(await _repository.GetAllAsync());

        if (_sounds.Count == 0 && !_settings.ExamplesCreated)
        {
            await CreateExamplesAsync();
            _settings.ExamplesCreated = true;
        }
        Changed?.Invoke(this, EventArgs.Empty);
    }

    private async Task CreateExamplesAsync()
    {
        foreach (var ex in ExampleSoundGenerator.Create())
        {
            using var ms = new MemoryStream(ex.Wav);
            var file = await _repository.StoreFileAsync(ms, ".wav");
            _sounds.Add(new Sound
            {
                Name = ex.Name,
                ColorHex = ex.ColorHex,
                FileName = file,
                DurationSeconds = ex.Seconds,
                SizeBytes = ex.Wav.Length,
                Order = _sounds.Count,
                IsExample = true
            });
        }
        await _repository.SaveAllAsync(_sounds);
    }

    public async Task<ImportResult> ImportAsync(IEnumerable<FileResult> files)
    {
        int added = 0, failed = 0;
        foreach (var f in files)
        {
            string? stored = null;
            try
            {
                await using (var src = await f.OpenReadAsync())
                {
                    stored = await _repository.StoreFileAsync(src, Path.GetExtension(f.FileName));
                }
                var fullPath = _repository.GetFullPath(stored);
                var duration = _player.ProbeDuration(fullPath);
                if (duration is null)
                {
                    _repository.DeleteFile(stored);
                    failed++;
                    continue;
                }
                _sounds.Add(new Sound
                {
                    Name = CleanName(f.FileName),
                    FileName = stored,
                    ColorHex = Palette[_sounds.Count % Palette.Length],
                    DurationSeconds = duration.Value,
                    SizeBytes = new FileInfo(fullPath).Length,
                    Order = _sounds.Count
                });
                added++;
            }
            catch
            {
                if (stored != null) _repository.DeleteFile(stored);
                failed++;
            }
        }
        if (added > 0)
        {
            await _repository.SaveAllAsync(_sounds);
            Changed?.Invoke(this, EventArgs.Empty);
        }
        return new ImportResult(added, failed);
    }

    private static string CleanName(string fileName)
    {
        var name = Path.GetFileNameWithoutExtension(fileName).Replace('_', ' ').Replace('-', ' ').Trim();
        if (name.Length > 40) name = name[..40];
        return string.IsNullOrWhiteSpace(name) ? "Sonido" : name;
    }

    public async Task UpdateAsync(Sound sound)
    {
        if (string.IsNullOrWhiteSpace(sound.Name)) sound.Name = "Sin nombre";
        await _repository.SaveAllAsync(_sounds);
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public async Task MoveAsync(Sound sound, int delta)
    {
        var i = _sounds.IndexOf(sound);
        var j = i + delta;
        if (i < 0 || j < 0 || j >= _sounds.Count) return;
        (_sounds[i], _sounds[j]) = (_sounds[j], _sounds[i]);
        Renumber();
        await _repository.SaveAllAsync(_sounds);
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public async Task DeleteAsync(Sound sound)
    {
        _player.Stop(sound.Id);
        _sounds.Remove(sound);
        _repository.DeleteFile(sound.FileName);
        Renumber();
        await _repository.SaveAllAsync(_sounds);
        Changed?.Invoke(this, EventArgs.Empty);
    }

    private void Renumber()
    {
        for (var i = 0; i < _sounds.Count; i++) _sounds[i].Order = i;
    }

    /// <summary>Etiqueta tipo sampler: A01..A16, B01..</summary>
    public static string PadLabel(int index) => $"{(char)('A' + index / 16 % 8)}{index % 16 + 1:00}";
}
