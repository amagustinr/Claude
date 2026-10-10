using PdfEditor.Datos.Interfaces;

namespace PdfEditor.Datos;

public sealed class AlmacenArchivos : IAlmacenArchivos
{
    public byte[] Leer(string ruta) => File.ReadAllBytes(ruta);

    public void Escribir(string ruta, byte[] contenido)
    {
        // Se escribe primero a un temporal para no corromper el archivo si algo falla.
        var temporal = ruta + ".tmp";
        File.WriteAllBytes(temporal, contenido);
        File.Move(temporal, ruta, overwrite: true);
    }

    public bool Existe(string ruta) => File.Exists(ruta);
}
