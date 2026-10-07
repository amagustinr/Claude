using System.Buffers;
using System.Net.WebSockets;

namespace CamarasWeb.Services;

/// <summary>
/// Proxy mínimo hacia go2rtc para que el navegador use un solo puerto (el de esta web)
/// y la API de go2rtc siga escuchando solo en 127.0.0.1.
///   /go2rtc/video-stream.js, /go2rtc/video-rtc.js  -> reproductor oficial de go2rtc
///   /go2rtc/api/ws?src=NOMBRE                        -> señalización WebRTC / datos MSE
/// </summary>
public static class Go2RtcProxy
{
    // video-rtc.js, video-stream.js y los módulos que importen (p. ej. video-webcodecs.js en versiones nuevas)
    private static readonly System.Text.RegularExpressions.Regex ArchivoJs = new("^video-[a-z0-9-]{1,40}\\.js$");

    public static void MapGo2RtcProxy(this WebApplication app)
    {
        app.MapGet("/go2rtc/{archivo}", async (string archivo, Go2RtcService g2, IHttpClientFactory f, HttpContext ctx) =>
        {
            if (!ArchivoJs.IsMatch(archivo)) return Results.NotFound();
            try
            {
                var js = await f.CreateClient("go2rtc").GetStringAsync(new Uri(g2.ApiBase, archivo), ctx.RequestAborted);
                ctx.Response.Headers.CacheControl = "no-cache";
                return Results.Content(js, "text/javascript; charset=utf-8");
            }
            catch (Exception)
            {
                return Results.Problem("go2rtc no está disponible", statusCode: 503);
            }
        });

        app.Map("/go2rtc/api/ws", async (HttpContext ctx, Go2RtcService g2, ILoggerFactory lf) =>
        {
            var src = ctx.Request.Query["src"].ToString();
            if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
            if (!g2.EsStreamPermitido(src)) { ctx.Response.StatusCode = 404; return; }

            var destino = new UriBuilder(new Uri(g2.ApiBase, "api/ws"))
            {
                Scheme = g2.ApiBase.Scheme == "https" ? "wss" : "ws",
                Query = "src=" + Uri.EscapeDataString(src),
            }.Uri;

            using var upstream = new ClientWebSocket();
            try
            {
                await upstream.ConnectAsync(destino, ctx.RequestAborted);
            }
            catch (Exception ex)
            {
                lf.CreateLogger("Go2RtcProxy").LogWarning("No se pudo conectar a go2rtc: {Msg}", ex.Message);
                ctx.Response.StatusCode = 502;
                return;
            }

            using var cliente = await ctx.WebSockets.AcceptWebSocketAsync();
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ctx.RequestAborted);

            var t1 = Bombear(cliente, upstream, cts.Token, sanear: false);
            var t2 = Bombear(upstream, cliente, cts.Token, sanear: true);
            await Task.WhenAny(t1, t2);
            cts.Cancel();

            await CerrarSilencioso(cliente);
            await CerrarSilencioso(upstream);
        });
    }

    /// <param name="sanear">Mensajes de texto de go2rtc (errores) pueden traer la URL RTSP con usuario:clave: se ocultan.</param>
    private static async Task Bombear(WebSocket origen, WebSocket destino, CancellationToken ct, bool sanear)
    {
        var buffer = ArrayPool<byte>.Shared.Rent(64 * 1024);
        try
        {
            while (!ct.IsCancellationRequested && origen.State == WebSocketState.Open && destino.State == WebSocketState.Open)
            {
                var r = await origen.ReceiveAsync(new ArraySegment<byte>(buffer), ct);
                if (r.MessageType == WebSocketMessageType.Close) break;
                if (sanear && r.MessageType == WebSocketMessageType.Text && r.EndOfMessage)
                {
                    var txt = System.Text.Encoding.UTF8.GetString(buffer, 0, r.Count);
                    if (txt.Contains('@'))
                    {
                        var limpio = System.Text.Encoding.UTF8.GetBytes(Go2RtcService.Credenciales().Replace(txt, "://***@"));
                        await destino.SendAsync(limpio, WebSocketMessageType.Text, true, ct);
                        continue;
                    }
                }
                await destino.SendAsync(buffer.AsMemory(0, r.Count), r.MessageType, r.EndOfMessage, ct);
            }
        }
        catch (OperationCanceledException) { }
        catch (WebSocketException) { }
        finally { ArrayPool<byte>.Shared.Return(buffer); }
    }

    private static async Task CerrarSilencioso(WebSocket ws)
    {
        try
        {
            if (ws.State is WebSocketState.Open or WebSocketState.CloseReceived)
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, cts.Token);
            }
        }
        catch { /* ignorar */ }
    }
}
