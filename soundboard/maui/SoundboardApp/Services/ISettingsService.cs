using SoundboardApp.Models;

namespace SoundboardApp.Services;

public interface ISettingsService
{
    int Columns { get; set; }
    TapMode TapMode { get; set; }
    bool ExamplesCreated { get; set; }
    event EventHandler? Changed;
}
