using CamarasWeb.Data;
using CamarasWeb.Endpoints;
using CamarasWeb.Services;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    // Permite correr como servicio de Windows (sc create ...) con rutas relativas al exe
    ContentRootPath = WindowsServiceHelpersIsService() ? AppContext.BaseDirectory : default,
});

builder.Host.UseWindowsService(o => o.ServiceName = "CamarasWeb");

builder.Services.Configure<CamarasOptions>(builder.Configuration.GetSection("Camaras"));
builder.Services.Configure<Go2RtcOptions>(builder.Configuration.GetSection("Go2rtc"));
builder.Services.AddHttpClient("go2rtc", c => c.Timeout = TimeSpan.FromSeconds(10))
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { UseProxy = false });

builder.Services.AddSingleton<Go2RtcService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<Go2RtcService>());

if (string.Equals(builder.Configuration["Datos:Modo"], "Demo", StringComparison.OrdinalIgnoreCase))
    builder.Services.AddSingleton<ICamaraRepository, DemoCamaraRepository>();
else
    builder.Services.AddSingleton<ICamaraRepository, SqlCamaraRepository>();

var app = builder.Build();

app.UseExceptionHandler(e => e.Run(async ctx =>
{
    var ex = ctx.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>()?.Error;
    app.Logger.LogError(ex, "Error no controlado");
    ctx.Response.StatusCode = 500;
    await ctx.Response.WriteAsJsonAsync(new { error = ex?.Message ?? "Error interno" });
}));

app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(20) });
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapCamarasApi();
app.MapGo2RtcProxy();

app.Run();

static bool WindowsServiceHelpersIsService() =>
    OperatingSystem.IsWindows() && Microsoft.Extensions.Hosting.WindowsServices.WindowsServiceHelpers.IsWindowsService();

public partial class Program;
