using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SoundboardApp.Services;

namespace SoundboardApp.ViewModels;

public partial class BoardViewModel : ObservableObject
{
    private readonly ISoundLibraryService _library;
    private readonly IAudioPlayerService _player;
    private readonly ISettingsService _settings;
    private IDispatcherTimer? _timer;

    public BoardViewModel(ISoundLibraryService library, IAudioPlayerService player, ISettingsService settings)
    {
        _library = library;
        _player = player;
        _settings = settings;
        _library.Changed += (_, _) => Rebuild();
        _player.PlaybackChanged += (_, _) => RefreshPlaying();
        _settings.Changed += (_, _) => { Columns = _settings.Columns; UpdatePadSize(_lastWidth); };
        _columns = _settings.Columns;
    }

    public ObservableCollection<PadViewModel> Pads { get; } = new();

    [ObservableProperty]
    private int _columns;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CountText))]
    private bool _isEmpty = true;

    /// <summary>Alto de cada pad, igual a su ancho para que sean cuadrados.</summary>
    [ObservableProperty]
    private double _padSize = 110;

    private const double Spacing = 10;
    private double _lastWidth;

    public void UpdatePadSize(double width)
    {
        if (width <= 0) return;
        _lastWidth = width;
        PadSize = Math.Floor((width - Spacing * (Columns - 1)) / Columns);
    }

    public string CountText => Pads.Count == 1 ? "1 pad" : $"{Pads.Count} pads";

    public async Task InitializeAsync() => await _library.InitializeAsync();

    private void Rebuild()
    {
        Pads.Clear();
        for (var i = 0; i < _library.Sounds.Count; i++) Pads.Add(new PadViewModel(_library.Sounds[i], i));
        IsEmpty = Pads.Count == 0;
        OnPropertyChanged(nameof(CountText));
        RefreshPlaying();
    }

    public void Play(PadViewModel pad) => _player.Play(pad.Sound, _settings.TapMode);

    [RelayCommand]
    private void StopAll() => _player.StopAll();

    [RelayCommand]
    private Task GoToConfig() => Shell.Current.GoToAsync("//config");

    private void RefreshPlaying()
    {
        foreach (var p in Pads)
        {
            p.IsPlaying = _player.IsPlaying(p.Sound.Id);
            if (!p.IsPlaying) p.Progress = 0;
        }

        if (_player.AnyPlaying) StartTimer();
    }

    private void StartTimer()
    {
        if (_timer == null)
        {
            _timer = Application.Current!.Dispatcher.CreateTimer();
            _timer.Interval = TimeSpan.FromMilliseconds(50);
            _timer.Tick += (_, _) =>
            {
                foreach (var p in Pads.Where(p => p.IsPlaying)) p.Progress = _player.GetProgress(p.Sound.Id);
                if (!_player.AnyPlaying) _timer!.Stop();
            };
        }
        if (!_timer.IsRunning) _timer.Start();
    }
}
