using System.Data;
using CamarasWeb.Models;
using Microsoft.Data.SqlClient;

namespace CamarasWeb.Data;

/// <summary>
/// Acceso a la BD CAMARAS usando los MISMOS procedimientos almacenados del proyecto WinForms.
/// No requiere cambios en SQL Server.
/// </summary>
public sealed class SqlCamaraRepository : ICamaraRepository
{
    private readonly string _constr;

    public SqlCamaraRepository(IConfiguration config)
    {
        _constr = config.GetConnectionString("ConexionCAMARAS")
                  ?? throw new InvalidOperationException("Falta ConnectionStrings:ConexionCAMARAS en appsettings.json");
    }

    public async Task<IReadOnlyList<CamaraMonitor>> GetCamarasPorMonitorAsync(int monitor, CancellationToken ct = default)
    {
        await using var con = new SqlConnection(_constr);
        await using var cmd = new SqlCommand("spGetCamarasxMonitor_DAHUA_AXIS", con) { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.Add("@monitor", SqlDbType.Int).Value = monitor;
        await con.OpenAsync(ct);
        await using var rd = await cmd.ExecuteReaderAsync(ct);

        var lista = new List<CamaraMonitor>();
        while (await rd.ReadAsync(ct))
        {
            // Mismos índices que CamarasDahuaAxis.cs: [2]usuario [3]password [4]ip [5]tipo [6]nombre
            lista.Add(new CamaraMonitor(
                Usuario: Str(rd, 2),
                Contrasena: Str(rd, 3),
                Ip: Str(rd, 4),
                TipoCamara: Int(rd, 5),
                Nombre: Str(rd, 6)));
        }
        return lista;
    }

    public async Task<TablaResultado> GetSucursalesAsync(CancellationToken ct = default)
    {
        await using var con = new SqlConnection(_constr);
        await using var cmd = new SqlCommand("spGetSucursales", con) { CommandType = CommandType.StoredProcedure };
        await con.OpenAsync(ct);
        await using var rd = await cmd.ExecuteReaderAsync(ct);

        var columnas = Enumerable.Range(0, rd.FieldCount).Select(rd.GetName).ToList();
        var filas = new List<Dictionary<string, object?>>();
        while (await rd.ReadAsync(ct))
        {
            var fila = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < rd.FieldCount; i++)
                fila[columnas[i]] = rd.IsDBNull(i) ? null : rd.GetValue(i);
            filas.Add(fila);
        }
        return new TablaResultado(columnas, filas);
    }

    public async Task<CamaraRegistro?> GetSucursalPorIdAsync(int id, CancellationToken ct = default)
    {
        await using var con = new SqlConnection(_constr);
        await using var cmd = new SqlCommand("spGetSucursalesxId", con) { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.Add("@id_sucursal", SqlDbType.Int).Value = id;
        await con.OpenAsync(ct);
        await using var rd = await cmd.ExecuteReaderAsync(ct);
        if (!await rd.ReadAsync(ct)) return null;

        // Mismos índices que RegistrarDahuaAxis.cs (0..9). tipoCam se lee si el SP lo devuelve.
        var c = new CamaraRegistro
        {
            Id = Int(rd, 0),
            NombreSucursal = Str(rd, 1),
            Descripcion = Str(rd, 2),
            Usuario = Str(rd, 3),
            Contrasena = Str(rd, 4),
            Ip = Str(rd, 5),
            Activar = Int(rd, 6) != 0,
            Monitor = Int(rd, 7),
            Webcam = Str(rd, 8),
            Posicion = Int(rd, 9),
        };
        c.TieneContrasena = c.Contrasena.Length > 0;

        int idxTipo = BuscarColumna(rd, "tipoCam", "tipo_cam", "tipoCamara", "tipo");
        if (idxTipo < 0 && rd.FieldCount > 10) idxTipo = 10;
        if (idxTipo >= 0) c.TipoCam = Int(rd, idxTipo);
        return c;
    }

    public Task InsertarAsync(CamaraRegistro c, CancellationToken ct = default) =>
        EjecutarAsync("spInsertCamaraDahuaAxis", c, incluirId: false, ct);

    public Task ActualizarAsync(CamaraRegistro c, CancellationToken ct = default) =>
        EjecutarAsync("spUpdateCamaraDahuaAxis", c, incluirId: true, ct);

    private async Task EjecutarAsync(string sp, CamaraRegistro c, bool incluirId, CancellationToken ct)
    {
        await using var con = new SqlConnection(_constr);
        await using var cmd = new SqlCommand(sp, con) { CommandType = CommandType.StoredProcedure };
        if (incluirId) cmd.Parameters.Add("@id", SqlDbType.Int).Value = c.Id!.Value;
        cmd.Parameters.Add("@nombre_sucursal", SqlDbType.NVarChar).Value = c.NombreSucursal;
        cmd.Parameters.Add("@descripcion", SqlDbType.NVarChar).Value = c.Descripcion;
        cmd.Parameters.Add("@usuario", SqlDbType.NVarChar).Value = c.Usuario;
        cmd.Parameters.Add("@contrasena", SqlDbType.NVarChar).Value = c.Contrasena;
        cmd.Parameters.Add("@ip", SqlDbType.NVarChar).Value = c.Ip;
        cmd.Parameters.Add("@activar", SqlDbType.Int).Value = c.Activar ? 1 : 0;
        cmd.Parameters.Add("@monitor", SqlDbType.Int).Value = c.Monitor;
        cmd.Parameters.Add("@webcam", SqlDbType.NVarChar).Value = c.Webcam;
        cmd.Parameters.Add("@posicion", SqlDbType.Int).Value = c.Posicion;
        cmd.Parameters.Add("@tipoCam", SqlDbType.Int).Value = c.TipoCam;
        await con.OpenAsync(ct);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static string Str(SqlDataReader rd, int i) =>
        i < rd.FieldCount && !rd.IsDBNull(i) ? Convert.ToString(rd.GetValue(i))?.Trim() ?? "" : "";

    private static int Int(SqlDataReader rd, int i) =>
        i < rd.FieldCount && !rd.IsDBNull(i) && int.TryParse(Convert.ToString(rd.GetValue(i)), out var v) ? v : 0;

    private static int BuscarColumna(SqlDataReader rd, params string[] nombres)
    {
        for (int i = 0; i < rd.FieldCount; i++)
            if (nombres.Contains(rd.GetName(i), StringComparer.OrdinalIgnoreCase)) return i;
        return -1;
    }
}
