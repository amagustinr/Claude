using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace CamarasWeb.Services;

public sealed class Go2RtcOptions
{
    public string RutaExe { get; set; } = "go2rtc\\go2rtc.exe";
    public string ApiUrl { get; set; } = "http://127.0.0.1:1984";
    public bool IniciarAutomaticamente { get; set; } = true;
    public int PuertoWebRtc { get; set; } = 8555;
    /// <summary>Pasa cada cámara por FFmpeg a H.264 (útil si las Dahua envían H.265). Consume CPU.</summary>
    public bool TranscodificarAH264 { get; set; }
    public string RutaFfmpeg { get; set; } = "ffmpeg";
    public string NivelLog { get; set; } = "info";
}

/// <summary>
/// Arranca go2rtc como proceso hijo y registra/actualiza los streams RTSP.
/// go2rtc convierte RTSP a WebRTC/MSE para el navegador (reemplaza a VLC).
/// La API de go2rtc queda en 127.0.0.1: el navegador nunca ve usuarios ni contraseñas de las cámaras.
/// </summary>
public sealed partial class Go2RtcService : IHostedService, IDisposable
{
    private readonly Go2RtcOptions _opt;
    private readonly ILogger<Go2RtcService> _log;
    private readonly HttpClient _http;
    private readonly ConcurrentDictionary<string, string> _streams = new(StringComparer.Ordinal);
    private readonly SemaphoreSlim _lock = new(1, 1);
    private Process? _proceso;
    private readonly CancellationTokenSource _detener = new();

    public Go2RtcService(IOptions<Go2RtcOptions> opt, ILogger<Go2RtcService> log, IHttpClientFactory httpFactory)
    {
        _opt = opt.Value;
        _log = log;
        _http = httpFactory.CreateClient("go2rtc");
    }

    public Uri ApiBase => new(_opt.ApiUrl.TrimEnd('/') + "/");

    [GeneratedRegex("^[a-zA-Z0-9_-]{1,64}$")]
    private static partial Regex NombreValido();

    /// <summary>Solo se permite reproducir streams que este servidor registró.</summary>
    public bool EsStreamPermitido(string? nombre) =>
        !string.IsNullOrEmpty(nombre) && NombreValido().IsMatch(nombre) && _streams.ContainsKey(nombre);

    public async Task<bool> EstaVivoAsync(CancellationToken ct = default)
    {
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(2));
            using var r = await _http.GetAsync(new Uri(ApiBase, "api"), cts.Token);
            return r.IsSuccessStatusCode;
        }
        catch { return false; }
    }

    public async Task StartAsync(CancellationToken ct)
    {
        if (await EstaVivoAsync(ct))
            _log.LogInformation("go2rtc ya está en ejecución en {Url}; se reutiliza.", _opt.ApiUrl);
        else if (!_opt.IniciarAutomaticamente)
            _log.LogWarning("go2rtc no responde en {Url} y IniciarAutomaticamente=false.", _opt.ApiUrl);
        else
            await IniciarProcesoAsync(ct);

        // Vigilante: si go2rtc se cae (o el que se reutilizó muere) lo vuelve a levantar
        // y registra de nuevo todos los streams. Antes, una caída dejaba todas las pantallas en negro
        // hasta reiniciar el servicio.
        _ = Task.Run(() => VigilarAsync(_detener.Token));
    }

    private async Task VigilarAsync(CancellationToken ct)
    {
        int fallos = 0;
        while (!ct.IsCancellationRequested)
        {
            try { await Task.Delay(TimeSpan.FromSeconds(10), ct); } catch (OperationCanceledException) { break; }
            if (await EstaVivoAsync(ct)) { fallos = 0; continue; }

            fallos++;
            _log.LogWarning("go2rtc no responde (intento {N}).", fallos);
            if (!_opt.IniciarAutomaticamente) continue;
            if (fallos > 3 && fallos % 6 != 0) continue;   // si falla seguido, reintentar cada ~1 min

            try
            {
                if (_proceso is { HasExited: false }) { _proceso.Kill(entireProcessTree: true); _proceso.WaitForExit(3000); }
                await IniciarProcesoAsync(ct);
                if (await EstaVivoAsync(ct)) await ReRegistrarTodoAsync(ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _log.LogError(ex, "No se pudo reiniciar go2rtc");
            }
        }
    }

    /// <summary>go2rtc guarda los streams en memoria: tras reiniciarlo hay que volver a crearlos.</summary>
    private async Task ReRegistrarTodoAsync(CancellationToken ct)
    {
        int ok = 0;
        foreach (var (nombre, fuente) in _streams.ToArray())
        {
            try { await PutAsync(nombre, fuente, ct); ok++; }
            catch (Exception ex) { _log.LogWarning("No se pudo re-registrar {Stream}: {Msg}", nombre, ex.Message); }
        }
        _log.LogInformation("go2rtc reiniciado: {N} streams registrados de nuevo.", ok);
    }

    private async Task IniciarProcesoAsync(CancellationToken ct)
    {
        var exe = Path.IsPathRooted(_opt.RutaExe) ? _opt.RutaExe : Path.Combine(AppContext.BaseDirectory, _opt.RutaExe);
        if (!File.Exists(exe))
        {
            // En desarrollo (dotnet run) el exe está junto al .csproj
            var alt = Path.Combine(Directory.GetCurrentDirectory(), _opt.RutaExe);
            if (File.Exists(alt)) exe = alt;
        }
        if (!File.Exists(exe))
        {
            _log.LogError("No se encontró go2rtc en '{Exe}'. Ejecuta scripts\\descargar-go2rtc.ps1", exe);
            return;
        }

        var api = new Uri(_opt.ApiUrl);
        // Configuración en línea (sin archivo): así go2rtc no guarda contraseñas en disco.
        var config = new Dictionary<string, object>
        {
            ["api"] = new { listen = $"{api.Host}:{api.Port}" },
            // Solo local: FFmpeg (demo / transcodificación) publica aquí; no se expone a la red
            ["rtsp"] = new { listen = "127.0.0.1:8554" },
            ["webrtc"] = new { listen = $":{_opt.PuertoWebRtc}" },
            ["ffmpeg"] = new { bin = _opt.RutaFfmpeg },
            ["log"] = new { level = _opt.NivelLog },
        };

        var psi = new ProcessStartInfo(exe)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = Path.GetDirectoryName(exe)!,
        };
        psi.ArgumentList.Add("-config");
        psi.ArgumentList.Add(JsonSerializer.Serialize(config));

        _proceso?.Dispose();
        _proceso = new Process { StartInfo = psi, EnableRaisingEvents = true };
        _proceso.OutputDataReceived += (_, e) => Reenviar(e.Data);
        _proceso.ErrorDataReceived += (_, e) => Reenviar(e.Data);
        // Ya NO se borra _streams al terminar: el vigilante los vuelve a registrar al reiniciar go2rtc
        _proceso.Exited += (_, _) => { if (!_detener.IsCancellationRequested) _log.LogWarning("go2rtc terminó inesperadamente."); };
        _proceso.Start();
        _proceso.BeginOutputReadLine();
        _proceso.BeginErrorReadLine();

        for (int i = 0; i < 40 && !await EstaVivoAsync(ct); i++)
            await Task.Delay(250, ct);

        _log.LogInformation("go2rtc iniciado (PID {Pid}).", _proceso.Id);
    }

    /// <summary>Reenvía el log de go2rtc ocultando usuario:clave de las URL RTSP.</summary>
    private void Reenviar(string? linea)
    {
        if (linea is null) return;
        _log.LogInformation("[go2rtc] {L}", Credenciales().Replace(linea, "://***@"));
    }

    [GeneratedRegex(@"://[^/\s@""]+@")]
    internal static partial Regex Credenciales();

    /// <summary>Crea o actualiza un stream. Si la fuente no cambió, no hace nada (no corta a los que ya miran).</summary>
    public async Task RegistrarAsync(string nombre, string fuente, bool forzar, CancellationToken ct = default)
    {
        if (!NombreValido().IsMatch(nombre)) throw new ArgumentException("Nombre de stream inválido", nameof(nombre));

        if (_opt.TranscodificarAH264 && fuente.StartsWith("rtsp", StringComparison.OrdinalIgnoreCase))
            fuente = $"ffmpeg:{fuente}#video=h264";

        await _lock.WaitAsync(ct);
        try
        {
            if (!forzar && _streams.TryGetValue(nombre, out var actual) && actual == fuente && await ExisteAsync(nombre, ct))
                return;

            // Borrar primero para que los clientes se reconecten a la nueva fuente
            using (await _http.DeleteAsync(new Uri(ApiBase, $"api/streams?src={Uri.EscapeDataString(nombre)}"), ct)) { }

            await PutAsync(nombre, fuente, ct);
            _streams[nombre] = fuente;
        }
        finally { _lock.Release(); }
    }

    private async Task PutAsync(string nombre, string fuente, CancellationToken ct)
    {
        var url = new Uri(ApiBase, $"api/streams?name={Uri.EscapeDataString(nombre)}&src={Uri.EscapeDataString(fuente)}");
        using var r = await _http.PutAsync(url, null, ct);
        if (!r.IsSuccessStatusCode)
        {
            // Con configuración en línea go2rtc crea el stream pero responde 400 "config file disabled"
            var body = await r.Content.ReadAsStringAsync(ct);
            if (!body.Contains("config file disabled", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException($"go2rtc rechazó el stream '{nombre}': {(int)r.StatusCode} {Credenciales().Replace(body, "://***@")}");
        }
    }

    private async Task<bool> ExisteAsync(string nombre, CancellationToken ct)
    {
        try
        {
            using var r = await _http.GetAsync(new Uri(ApiBase, "api/streams"), ct);
            if (!r.IsSuccessStatusCode) return false;
            using var doc = JsonDocument.Parse(await r.Content.ReadAsStringAsync(ct));
            return doc.RootElement.TryGetProperty(nombre, out _);
        }
        catch { return false; }
    }

    public Task StopAsync(CancellationToken ct)
    {
        _detener.Cancel();
        try
        {
            if (_proceso is { HasExited: false })
            {
                _log.LogInformation("Deteniendo go2rtc...");
                _proceso.Kill(entireProcessTree: true);
            }
        }
        catch (Exception ex) { _log.LogWarning(ex, "No se pudo detener go2rtc"); }
        return Task.CompletedTask;
    }

    public void Dispose()
    {
        _proceso?.Dispose();
        _detener.Dispose();
    }
}
