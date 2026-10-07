using CamarasWeb.Models;

namespace CamarasWeb.Services;

public sealed class CamarasOptions
{
    public int PuertoRtsp { get; set; } = 554;
    /// <summary>Subtype del stream principal Dahua (el que se ve al ampliar con doble clic). 0 = principal.</summary>
    public int DahuaSubtype { get; set; } = 0;
    /// <summary>Agrega ?videocodec=h264 a las Axis (los navegadores reproducen H.264 sin problemas).</summary>
    public bool AxisForzarH264 { get; set; } = true;
    /// <summary>
    /// true = la grilla usa el SUBSTREAM (Dahua subtype=1 / Axis resolucion reducida) y el principal solo
    /// al ampliar una camara. Reduce mucho el ancho de banda de las sucursales y la carga del navegador.
    /// </summary>
    public bool SubstreamEnGrilla { get; set; } = true;
    /// <summary>Resolucion pedida a las Axis para la grilla (debe existir en la camara: 640x360 16:9, 640x480 4:3).</summary>
    public string AxisResolucionSub { get; set; } = "640x360";
}

/// <summary>Arma la URL RTSP igual que CamarasDahuaAxis.cs, con variante principal (HD) y substream (grilla).</summary>
public static class RtspUrlBuilder
{
    public const int TipoAxis = 1;

    /// <param name="hd">true = stream principal; false = el de la grilla (substream si SubstreamEnGrilla).</param>
    public static string Construir(CamaraMonitor c, CamarasOptions o, bool hd = true)
    {
        var ip = c.Ip.Trim();

        // Permite escribir una URL completa en el campo IP (rtsp://..., ffmpeg:..., etc.)
        if (ip.Contains("://") || ip.StartsWith("ffmpeg:", StringComparison.OrdinalIgnoreCase))
            return ip;

        var usuario = Uri.EscapeDataString(c.Usuario);
        var password = Uri.EscapeDataString(c.Contrasena);
        // Si la IP ya trae puerto (192.168.1.10:8554) se respeta
        var host = ip.Contains(':') ? ip : $"{ip}:{o.PuertoRtsp}";
        bool sub = !hd && o.SubstreamEnGrilla;

        if (c.TipoCamara == TipoAxis)
        {
            var query = new List<string>();
            if (o.AxisForzarH264) query.Add("videocodec=h264");
            if (sub && !string.IsNullOrWhiteSpace(o.AxisResolucionSub)) query.Add("resolution=" + o.AxisResolucionSub.Trim());
            return $"rtsp://{usuario}:{password}@{host}/axis-media/media.amp" + (query.Count > 0 ? "?" + string.Join("&", query) : "");
        }

        var subtype = sub ? 1 : o.DahuaSubtype;
        return $"rtsp://{usuario}:{password}@{host}/cam/realmonitor?channel=1&subtype={subtype}";
    }

    public static string NombreTipo(int tipo) => tipo == TipoAxis ? "Axis" : "Dahua";
}
