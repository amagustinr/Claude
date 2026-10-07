using SoundboardApp.Models;

namespace SoundboardApp.Services;

/// <summary>Ajustes del usuario guardados con Preferences (SharedPreferences en Android).</summary>
public class SettingsService : ISettingsService
{
    public event EventHandler? Changed;

    public int Columns
    {
        get => Math.Clamp(Preferences.Default.Get(nameof(Columns), 3), 2, 4);
        set { Preferences.Default.Set(nameof(Columns), Math.Clamp(value, 2, 4)); Changed?.Invoke(this, EventArgs.Empty); }
    }

    public TapMode TapMode
    {
        get => (TapMode)Preferences.Default.Get(nameof(TapMode), (int)TapMode.Restart);
        set { Preferences.Default.Set(nameof(TapMode), (int)value); Changed?.Invoke(this, EventArgs.Empty); }
    }

    public bool ExamplesCreated
    {
        get => Preferences.Default.Get(nameof(ExamplesCreated), false);
        set => Preferences.Default.Set(nameof(ExamplesCreated), value);
    }
}
