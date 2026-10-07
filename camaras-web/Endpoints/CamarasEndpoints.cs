using CamarasWeb.Data;
using CamarasWeb.Models;
using CamarasWeb.Services;
using Microsoft.Extensions.Options;

namespace CamarasWeb.Endpoints;

public static class CamarasEndpoints
{
    public static void MapCamarasApi(this WebApplication app)
    {
        var api = app.MapGroup("/api");

        // ---- Visor (equivale a InicializarCamaras / RecargarCamaras) ----
        api.MapGet("/monitor/{monitor:int}/camaras", async (
            int monitor, bool? recargar, ICamaraRepository repo, Go2RtcService g2,
            IOptions<CamarasOptions> opt, ILogger<Program> log, CancellationToken ct) =>
        {
            if (!await g2.EstaVivoAsync(ct))
                return Results.Problem("go2rtc no está en ejecución. Revisa la carpeta go2rtc y el log del servidor.", statusCode: 503);

            var camaras = await repo.GetCamarasPorMonitorAsync(monitor, ct);
            var resultado = new List<CamaraVisor>();

            for (int i = 0; i < camaras.Count; i++)
            {
                var c = camaras[i];
                var stream = $"m{monitor}_{i}";
                var fuenteGrilla = RtspUrlBuilder.Construir(c, opt.Value, hd: false);
                var fuenteHd = RtspUrlBuilder.Construir(c, opt.Value, hd: true);
                // Si no hay substream (o esta desactivado) la vista ampliada usa el mismo stream
                var streamHd = fuenteHd == fuenteGrilla ? stream : stream + "_hd";
                try
                {
                    // go2rtc solo se conecta a la camara cuando alguien mira: registrar el HD no consume nada
                    await g2.RegistrarAsync(stream, fuenteGrilla, recargar == true, ct);
                    if (streamHd != stream) await g2.RegistrarAsync(streamHd, fuenteHd, recargar == true, ct);
                }
                catch (Exception ex)
                {
                    log.LogWarning("No se pudo registrar {Stream} ({Nombre}): {Msg}", stream, c.Nombre, ex.Message);
                }
                resultado.Add(new CamaraVisor(i + 1, c.Nombre, stream, streamHd, RtspUrlBuilder.NombreTipo(c.TipoCamara)));
            }
            return Results.Ok(resultado);
        });

        // ---- Registrar cámaras (RegistrarDahuaAxis) ----
        api.MapGet("/sucursales", async (ICamaraRepository repo, CancellationToken ct) =>
        {
            var t = await repo.GetSucursalesAsync(ct);
            // Nunca mandar contraseñas al navegador
            var ocultas = t.Columnas.Where(EsColumnaSecreta).ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var f in t.Filas)
                foreach (var col in ocultas)
                    if (f.ContainsKey(col)) f[col] = "••••••";
            return Results.Ok(t);
        });

        api.MapGet("/sucursales/{id:int}", async (int id, ICamaraRepository repo, CancellationToken ct) =>
        {
            var c = await repo.GetSucursalPorIdAsync(id, ct);
            if (c is null) return Results.NotFound();
            c.Contrasena = "";   // el formulario la deja vacía = conservar
            return Results.Ok(c);
        });

        api.MapPost("/sucursales", async (CamaraRegistro c, ICamaraRepository repo, CancellationToken ct) =>
        {
            var error = Validar(c, nueva: true);
            if (error is not null) return Results.BadRequest(new { error });
            c.Id = null;
            await repo.InsertarAsync(c, ct);
            return Results.Ok(new { ok = true });
        });

        api.MapPut("/sucursales/{id:int}", async (int id, CamaraRegistro c, ICamaraRepository repo, CancellationToken ct) =>
        {
            var actual = await repo.GetSucursalPorIdAsync(id, ct);
            if (actual is null) return Results.NotFound();
            c.Id = id;
            if (string.IsNullOrEmpty(c.Contrasena)) c.Contrasena = actual.Contrasena;
            var error = Validar(c, nueva: false);
            if (error is not null) return Results.BadRequest(new { error });
            await repo.ActualizarAsync(c, ct);
            return Results.Ok(new { ok = true });
        });

        api.MapGet("/estado", async (Go2RtcService g2, IConfiguration cfg, CancellationToken ct) => Results.Ok(new
        {
            go2rtc = await g2.EstaVivoAsync(ct),
            modoDatos = cfg["Datos:Modo"] ?? "Sql",
            version = typeof(Program).Assembly.GetName().Version?.ToString(3),
        }));
    }

    private static bool EsColumnaSecreta(string col) =>
        col.Contains("contra", StringComparison.OrdinalIgnoreCase) ||
        col.Contains("pass", StringComparison.OrdinalIgnoreCase) ||
        col.Contains("clave", StringComparison.OrdinalIgnoreCase);

    private static string? Validar(CamaraRegistro c, bool nueva)
    {
        if (string.IsNullOrWhiteSpace(c.NombreSucursal)) return "Ingrese el nombre de la sucursal.";
        if (string.IsNullOrWhiteSpace(c.Ip)) return "Ingrese la IP.";
        if (c.Monitor <= 0) return "Ingrese un monitor válido.";
        if (c.Posicion <= 0) return "Ingrese una posición válida.";
        if (nueva && string.IsNullOrEmpty(c.Contrasena)) return "Ingrese la contraseña.";
        return null;
    }
}
