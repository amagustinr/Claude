using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SoundboardApp.Models;
using SoundboardApp.Services;

namespace SoundboardApp.ViewModels;

/// <summary>Una fila editable en Configurar.</summary>
public partial class SoundItemViewModel : ObservableObject
{
    private readonly ConfigViewModel _owner;
    private CancellationTokenSource? _saveDelay;

    public SoundItemViewModel(ConfigViewModel owner, Sound sound, int index, int total)
    {
        _owner = owner;
        Sound = sound;
        _name = sound.Name;
        _volume = sound.Volume;
        CanMoveUp = index > 0;
        CanMoveDown = index < total - 1;
        Info = $"{SoundLibraryService.PadLabel(index)} · {FormatDuration(sound.DurationSeconds)} · {FormatSize(sound.SizeBytes)}";
        Swatches = SoundLibraryService.Palette.Select(h => new SwatchViewModel(this, h)).ToList();
    }

    public Sound Sound { get; }
    public string Info { get; }
    public bool IsExample => Sound.IsExample;
    public bool CanMoveUp { get; }
    public bool CanMoveDown { get; }
    public List<SwatchViewModel> Swatches { get; }
    public Color PadColor => Color.FromArgb(Sound.ColorHex);

    [ObservableProperty]
    private string _name;

    [ObservableProperty]
    private double _volume;

    partial void OnNameChanged(string value)
    {
        Sound.Name = value.Trim();
        SaveSoon();
    }

    partial void OnVolumeChanged(double value)
    {
        Sound.Volume = Math.Round(value, 2);
        SaveSoon(updateBoard: false);
    }

    /// <summary>Guarda tras una pausa breve para no escribir en disco con cada tecla.</summary>
    private async void SaveSoon(bool updateBoard = true)
    {
        _saveDelay?.Cancel();
        var cts = _saveDelay = new CancellationTokenSource();
        try
        {
            await Task.Delay(500, cts.Token);
            await _owner.SaveAsync(this, updateBoard);
        }
        catch (TaskCanceledException) { }
    }

    public void SelectColor(string hex)
    {
        Sound.ColorHex = hex;
        foreach (var s in Swatches) s.IsSelected = s.Hex == hex;
        OnPropertyChanged(nameof(PadColor));
        _ = _owner.SaveAsync(this, updateBoard: true);
    }

    [RelayCommand]
    private void Preview() => _owner.Preview(this);

    [RelayCommand]
    private Task MoveUp() => _owner.MoveAsync(this, -1);

    [RelayCommand]
    private Task MoveDown() => _owner.MoveAsync(this, 1);

    [RelayCommand]
    private Task Delete() => _owner.DeleteAsync(this);

    private static string FormatDuration(double s) => $"{(int)(s / 60)}:{s % 60:00.0}";

    private static string FormatSize(long b) => b > 1_048_576 ? $"{b / 1_048_576.0:0.0} MB" : $"{Math.Max(1, b / 1024)} KB";
}

public partial class SwatchViewModel : ObservableObject
{
    private readonly SoundItemViewModel _item;

    public SwatchViewModel(SoundItemViewModel item, string hex)
    {
        _item = item;
        Hex = hex;
        _isSelected = string.Equals(item.Sound.ColorHex, hex, StringComparison.OrdinalIgnoreCase);
    }

    public string Hex { get; }
    public Color Color => Color.FromArgb(Hex);

    [ObservableProperty]
    private bool _isSelected;

    [RelayCommand]
    private void Select() => _item.SelectColor(Hex);
}
