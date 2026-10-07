using CommunityToolkit.Mvvm.ComponentModel;
using SoundboardApp.Models;
using SoundboardApp.Services;

namespace SoundboardApp.ViewModels;

/// <summary>Un pad del tablero.</summary>
public partial class PadViewModel : ObservableObject
{
    public PadViewModel(Sound sound, int index)
    {
        Sound = sound;
        Label = SoundLibraryService.PadLabel(index);
    }

    public Sound Sound { get; }
    public string Label { get; }
    public string Name => Sound.Name;
    public Color PadColor => Color.FromArgb(Sound.ColorHex);
    /// <summary>Fondo apagado: el color del pad mezclado con el chasis.</summary>
    public Color IdleBackground => Mix(PadColor, Color.FromArgb("#1E2026"), 0.30);
    public Color PlayingBackground => Mix(PadColor, Color.FromArgb("#1E2026"), 0.62);
    public Color BorderColor => Mix(PadColor, Color.FromArgb("#34373F"), 0.45);
    public Color LedOff => Mix(PadColor, Colors.Black, 0.35);

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(Background), nameof(LedColor))]
    private bool _isPlaying;

    [ObservableProperty]
    private double _progress;

    public Color Background => IsPlaying ? PlayingBackground : IdleBackground;
    public Color LedColor => IsPlaying ? PadColor : LedOff;

    private static Color Mix(Color a, Color b, double amountOfA) => new(
        (float)(a.Red * amountOfA + b.Red * (1 - amountOfA)),
        (float)(a.Green * amountOfA + b.Green * (1 - amountOfA)),
        (float)(a.Blue * amountOfA + b.Blue * (1 - amountOfA)));
}
