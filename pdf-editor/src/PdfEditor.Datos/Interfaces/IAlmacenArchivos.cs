namespace PdfEditor.Datos.Interfaces;

/// <summary>Acceso al sistema de archivos (permite simularlo en pruebas).</summary>
public interface IAlmacenArchivos
{
    byte[] Leer(string ruta);
    void Escribir(string ruta, byte[] contenido);
    bool Existe(string ruta);
}
