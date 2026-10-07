using System.Collections.Concurrent;
using CamarasWeb.Models;

namespace CamarasWeb.Data;

/// <summary>
/// Repositorio en memoria para probar la web SIN SQL Server ("Datos:Modo": "Demo").
/// Usa fuentes de prueba de go2rtc + FFmpeg en lugar de cámaras reales.
/// </summary>
public sealed class DemoCamaraRepository : ICamaraRepository
{
    private readonly ConcurrentDictionary<int, CamaraRegistro> _datos = new();
    private int _ultimoId;

    public DemoCamaraRepository()
    {
        string[] patrones = ["testsrc", "smptebars", "testsrc2", "rgbtestsrc"];
        for (int i = 0; i < 4; i++)
        {
            Agregar(new CamaraRegistro
            {
                NombreSucursal = $"DEMO {i + 1}",
                Descripcion = "Cámara de prueba",
                Usuario = "demo",
                Contrasena = "demo",
                Ip = $"ffmpeg:virtual?video={patrones[i]}&size=720#video=h264",
                Monitor = 1,
                Posicion = i + 1,
                TipoCam = 2,
            });
        }
    }

    private void Agregar(CamaraRegistro c)
    {
        c.Id = Interlocked.Increment(ref _ultimoId);
        _datos[c.Id.Value] = c;
    }

    public Task<IReadOnlyList<CamaraMonitor>> GetCamarasPorMonitorAsync(int monitor, CancellationToken ct = default)
    {
        IReadOnlyList<CamaraMonitor> r = _datos.Values
            .Where(c => c.Monitor == monitor)
            .OrderBy(c => c.Posicion)
            .Select(c => new CamaraMonitor(c.Usuario, c.Contrasena, c.Ip, c.TipoCam, c.NombreSucursal))
            .ToList();
        return Task.FromResult(r);
    }

    public Task<TablaResultado> GetSucursalesAsync(CancellationToken ct = default)
    {
        var cols = new[] { "id", "Sucursal", "descripcion", "ip", "monitor", "posicion", "tipoCam" };
        var filas = _datos.Values.OrderBy(c => c.Id).Select(c => new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["id"] = c.Id, ["Sucursal"] = c.NombreSucursal, ["descripcion"] = c.Descripcion,
            ["ip"] = c.Ip, ["monitor"] = c.Monitor, ["posicion"] = c.Posicion, ["tipoCam"] = c.TipoCam,
        }).ToList();
        return Task.FromResult(new TablaResultado(cols, filas));
    }

    public Task<CamaraRegistro?> GetSucursalPorIdAsync(int id, CancellationToken ct = default)
    {
        if (!_datos.TryGetValue(id, out var c)) return Task.FromResult<CamaraRegistro?>(null);
        var copia = Clonar(c);
        copia.TieneContrasena = copia.Contrasena.Length > 0;
        return Task.FromResult<CamaraRegistro?>(copia);
    }

    public Task InsertarAsync(CamaraRegistro c, CancellationToken ct = default)
    {
        Agregar(Clonar(c));
        return Task.CompletedTask;
    }

    public Task ActualizarAsync(CamaraRegistro c, CancellationToken ct = default)
    {
        _datos[c.Id!.Value] = Clonar(c);
        return Task.CompletedTask;
    }

    private static CamaraRegistro Clonar(CamaraRegistro c) => new()
    {
        Id = c.Id, NombreSucursal = c.NombreSucursal, Descripcion = c.Descripcion, Usuario = c.Usuario,
        Contrasena = c.Contrasena, Ip = c.Ip, Activar = c.Activar, Monitor = c.Monitor, Webcam = c.Webcam,
        Posicion = c.Posicion, TipoCam = c.TipoCam,
    };
}
