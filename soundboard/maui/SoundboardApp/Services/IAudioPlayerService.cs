using SoundboardApp.Models;

namespace SoundboardApp.Services;

public interface IAudioPlayerService
{
    /// <summary>Se dispara (en el hilo de UI) cuando un sonido empieza o termina.</summary>
    event EventHandler<string>? PlaybackChanged;

    void Play(Sound sound, TapMode mode);
    void Stop(string soundId);
    void StopAll();
    bool IsPlaying(string soundId);
    bool AnyPlaying { get; }
    /// <summary>Progreso 0..1 de la última reproducción del sonido.</summary>
    double GetProgress(string soundId);
    /// <summary>Duración en segundos, o null si el formato no se puede reproducir.</summary>
    double? ProbeDuration(string fullPath);
}
