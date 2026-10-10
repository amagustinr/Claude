using PdfEditor.Datos;
using PdfEditor.Datos.Pdf;

namespace PdfEditor.Negocio;

/// <summary>Raíz de composición: la UI no necesita referenciar la capa de Datos.</summary>
public static class FabricaServicios
{
    public static DocumentoPdfServicio CrearDocumento() =>
        new(new AlmacenArchivos(), new MotorPdfSharp(), new RenderizadorPdfium());

    public static IReadOnlyList<string> FuentesDisponibles => ResolverFuentes.FamiliasDisponibles;
}
