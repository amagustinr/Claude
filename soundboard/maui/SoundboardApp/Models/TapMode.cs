namespace SoundboardApp.Models;

/// <summary>Qué hace un pad si se toca mientras ya está sonando.</summary>
public enum TapMode
{
    Restart = 0,
    Stop = 1,
    Overlap = 2
}
