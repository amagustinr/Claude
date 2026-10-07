using Plugin.Maui.Audio;
using SoundboardApp.Data;
using SoundboardApp.Services;
using SoundboardApp.ViewModels;
using SoundboardApp.Views;

namespace SoundboardApp;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder
            .UseMauiApp<App>()
            .AddAudio();

        // Capa de datos
        builder.Services.AddSingleton<ISoundRepository, JsonSoundRepository>();
        // Capa de negocio / servicios
        builder.Services.AddSingleton<ISettingsService, SettingsService>();
        builder.Services.AddSingleton<IAudioPlayerService, AudioPlayerService>();
        builder.Services.AddSingleton<ISoundLibraryService, SoundLibraryService>();
        // Presentación
        builder.Services.AddSingleton<BoardViewModel>();
        builder.Services.AddSingleton<ConfigViewModel>();
        builder.Services.AddSingleton<BoardPage>();
        builder.Services.AddSingleton<ConfigPage>();

        return builder.Build();
    }
}
