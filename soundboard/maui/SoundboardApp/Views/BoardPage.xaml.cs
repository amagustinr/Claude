using SoundboardApp.ViewModels;

namespace SoundboardApp.Views;

public partial class BoardPage : ContentPage
{
    private readonly BoardViewModel _vm;
    private bool _loaded;

    public BoardPage(BoardViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        if (_loaded) return;
        _loaded = true;
        await _vm.InitializeAsync();
    }

    private void OnGridSizeChanged(object? sender, EventArgs e)
    {
        if (sender is View v) _vm.UpdatePadSize(v.Width);
    }

    private async void OnPadTapped(object? sender, TappedEventArgs e)
    {
        if (sender is not View view || view.BindingContext is not PadViewModel pad) return;
        _vm.Play(pad);
        // Pequeña animación de "pulsado"
        await view.ScaleToAsync(0.95, 50, Easing.CubicOut);
        await view.ScaleToAsync(1, 90, Easing.CubicIn);
    }
}
