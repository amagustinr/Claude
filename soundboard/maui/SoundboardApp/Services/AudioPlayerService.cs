using Plugin.Maui.Audio;
using SoundboardApp.Data;
using SoundboardApp.Models;

namespace SoundboardApp.Services;

/// <summary>
/// Reproduce los audios con Plugin.Maui.Audio. Cada toque crea su propio reproductor,
/// así varios sonidos (o el mismo varias veces) pueden sonar a la vez.
/// </summary>
public class AudioPlayerService : IAudioPlayerService
{
    private sealed class Voice
    {
        public required IAudioPlayer Player { get; init; }
        public required Stream Stream { get; init; }
    }

    private readonly IAudioManager _audio;
    private readonly ISoundRepository _repository;
    private readonly Dictionary<string, List<Voice>> _voices = new();

    public event EventHandler<string>? PlaybackChanged;

    public AudioPlayerService(IAudioManager audio, ISoundRepository repository)
    {
        _audio = audio;
        _repository = repository;
    }

    public bool AnyPlaying => _voices.Count > 0;

    public void Play(Sound sound, TapMode mode)
    {
        var playing = IsPlaying(sound.Id);
        if (playing && mode == TapMode.Stop)
        {
            Stop(sound.Id);
            return;
        }
        if (playing && mode == TapMode.Restart)
        {
            StopVoices(sound.Id);
        }

        Stream? stream = null;
        try
        {
            stream = File.OpenRead(_repository.GetFullPath(sound.FileName));
            var player = _audio.CreatePlayer(stream);
            player.Volume = Math.Clamp(sound.Volume, 0, 1);
            var voice = new Voice { Player = player, Stream = stream };
            player.PlaybackEnded += (_, _) => MainThread.BeginInvokeOnMainThread(() => OnEnded(sound.Id, voice));

            if (!_voices.TryGetValue(sound.Id, out var list))
            {
                list = new List<Voice>();
                _voices[sound.Id] = list;
            }
            list.Add(voice);
            player.Play();
            PlaybackChanged?.Invoke(this, sound.Id);
        }
        catch (Exception ex)
        {
            stream?.Dispose();
            System.Diagnostics.Debug.WriteLine($"No se pudo reproducir {sound.Name}: {ex.Message}");
        }
    }

    private void OnEnded(string soundId, Voice voice)
    {
        if (!_voices.TryGetValue(soundId, out var list) || !list.Remove(voice)) return;
        Dispose(voice);
        if (list.Count == 0) _voices.Remove(soundId);
        PlaybackChanged?.Invoke(this, soundId);
    }

    public void Stop(string soundId)
    {
        StopVoices(soundId);
        PlaybackChanged?.Invoke(this, soundId);
    }

    public void StopAll()
    {
        foreach (var id in _voices.Keys.ToList()) Stop(id);
    }

    private void StopVoices(string soundId)
    {
        if (!_voices.Remove(soundId, out var list)) return;
        foreach (var v in list)
        {
            try { v.Player.Stop(); } catch { /* ya terminado */ }
            Dispose(v);
        }
    }

    private static void Dispose(Voice v)
    {
        try { v.Player.Dispose(); } catch { }
        v.Stream.Dispose();
    }

    public bool IsPlaying(string soundId) => _voices.TryGetValue(soundId, out var l) && l.Count > 0;

    public double GetProgress(string soundId)
    {
        if (!_voices.TryGetValue(soundId, out var list) || list.Count == 0) return 0;
        var p = list[^1].Player;
        return p.Duration > 0 ? Math.Clamp(p.CurrentPosition / p.Duration, 0, 1) : 0;
    }

    public double? ProbeDuration(string fullPath)
    {
        try
        {
            using var stream = File.OpenRead(fullPath);
            using var player = _audio.CreatePlayer(stream);
            return player.Duration;
        }
        catch
        {
            return null;
        }
    }
}
