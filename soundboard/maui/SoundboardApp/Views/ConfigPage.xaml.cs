using SoundboardApp.ViewModels;

namespace SoundboardApp.Views;

public partial class ConfigPage : ContentPage
{
    public ConfigPage(ConfigViewModel vm)
    {
        InitializeComponent();
        BindingContext = vm;
    }
}
