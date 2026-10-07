using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SoundboardApp.Models;
using SoundboardApp.Services;

namespace SoundboardApp.ViewModels;

public partial class ConfigViewModel : ObservableObject
{
    private static readonly FilePickerFileType AudioFiles = new(new Dictionary<DevicePlatform, IEnumerable<string>>
    {
        { DevicePlatform.Android, new[] { "audio/*" } },
        { DevicePlatform.iOS, new[] { "public.audio" } },
        { DevicePlatform.MacCatalyst, new[] { "public.audio" } },
        { DevicePlatform.WinUI, new[] { ".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac", ".wma" } }
    });

    private readonly ISoundLibraryService _library;
    private readonly IAudioPlayerService _player;
    private readonly ISettingsService _settings;
    private bool _suppressRebuild;

    public ConfigViewModel(ISoundLibraryService library, IAudioPlayerService player, ISettingsService settings)
    {
        _library = library;
        _player = player;
        _settings = settings;
        _columns = settings.Columns;
        _tapModeIndex = (int)settings.TapMode;
        _library.Changed += (_, _) => { if (!_suppressRebuild) Rebuild(); };
        Rebuild();
    }

    public ObservableCollection<SoundItemViewModel> Items { get; } = new();

    public IReadOnlyList<string> TapModes { get; } = new[] { "Reiniciar", "Detener", "Superponer" };

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(Is2), nameof(Is3), nameof(Is4))]
    private int _columns;

    public bool Is2 => Columns == 2;
    public bool Is3 => Columns == 3;
    public bool Is4 => Columns == 4;

    [ObservableProperty]
    private int _tapModeIndex;

    [ObservableProperty]
    private string _listTitle = "Mis sonidos";

    [ObservableProperty]
    private bool _isBusy;

    partial void OnColumnsChanged(int value) => _settings.Columns = value;

    partial void OnTapModeIndexChanged(int value)
    {
        if (value >= 0) _settings.TapMode = (TapMode)value;
    }

    [RelayCommand]
    private void SetColumns(string value) => Columns = int.Parse(value);

    private void Rebuild()
    {
        Items.Clear();
        var list = _library.Sounds;
        for (var i = 0; i < list.Count; i++) Items.Add(new SoundItemViewModel(this, list[i], i, list.Count));
        ListTitle = $"Mis sonidos ({list.Count})";
    }

    [RelayCommand]
    private async Task AddSounds()
    {
        if (IsBusy) return;
        try
        {
            var files = await FilePicker.Default.PickMultipleAsync(new PickOptions
            {
                PickerTitle = "Elige tus audios",
                FileTypes = AudioFiles
            });
            var picked = files?.Where(f => f != null).ToList();
            if (picked == null || picked.Count == 0) return;

            IsBusy = true;
            var result = await _library.ImportAsync(picked!);
            var msg = result.Added switch
            {
                0 => "No se añadió ningún audio.",
                1 => "1 audio añadido.",
                _ => $"{result.Added} audios añadidos."
            };
            if (result.Failed > 0) msg += $" {result.Failed} con formato no compatible.";
            await Toast(msg);
        }
        catch (Exception ex)
        {
            await Shell.Current.DisplayAlertAsync("No se pudieron añadir", ex.Message, "Vale");
        }
        finally
        {
            IsBusy = false;
        }
    }

    internal async Task SaveAsync(SoundItemViewModel item, bool updateBoard)
    {
        // Guardar sin reconstruir esta lista, para no perder el foco del campo que se está editando
        _suppressRebuild = true;
        try { await _library.UpdateAsync(item.Sound); }
        finally { _suppressRebuild = false; }
    }

    internal void Preview(SoundItemViewModel item) => _player.Play(item.Sound, _settings.TapMode);

    internal Task MoveAsync(SoundItemViewModel item, int delta) => _library.MoveAsync(item.Sound, delta);

    internal async Task DeleteAsync(SoundItemViewModel item)
    {
        var ok = await Shell.Current.DisplayAlertAsync("Borrar sonido", $"¿Borrar \"{item.Sound.Name}\"? No se puede deshacer.", "Borrar", "Cancelar");
        if (!ok) return;
        await _library.DeleteAsync(item.Sound);
        await Toast($"\"{item.Sound.Name}\" borrado.");
    }

    private static Task Toast(string message)
    {
#if ANDROID
        Android.Widget.Toast.MakeText(Platform.AppContext, message, Android.Widget.ToastLength.Short)?.Show();
        return Task.CompletedTask;
#else
        return Shell.Current.DisplayAlertAsync("Soundboard", message, "Vale");
#endif
    }
}
