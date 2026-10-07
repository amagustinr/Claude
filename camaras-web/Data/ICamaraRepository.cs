using CamarasWeb.Models;

namespace CamarasWeb.Data;

public interface ICamaraRepository
{
    Task<IReadOnlyList<CamaraMonitor>> GetCamarasPorMonitorAsync(int monitor, CancellationToken ct = default);
    Task<TablaResultado> GetSucursalesAsync(CancellationToken ct = default);
    /// <summary>Devuelve el registro con la contraseña real (uso interno del servidor).</summary>
    Task<CamaraRegistro?> GetSucursalPorIdAsync(int id, CancellationToken ct = default);
    Task InsertarAsync(CamaraRegistro c, CancellationToken ct = default);
    Task ActualizarAsync(CamaraRegistro c, CancellationToken ct = default);
}
