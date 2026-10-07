using SoundboardApp.Views;

namespace SoundboardApp;

public partial class AppShell : Shell
{
    public AppShell(IServiceProvider services)
    {
        InitializeComponent();
        // Las páginas se resuelven por inyección de dependencias
        BoardTab.Items.Add(new ShellContent { Content = services.GetRequiredService<BoardPage>() });
        ConfigTab.Items.Add(new ShellContent { Content = services.GetRequiredService<ConfigPage>() });
    }
}
