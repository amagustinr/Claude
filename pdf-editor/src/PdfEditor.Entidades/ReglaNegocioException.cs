namespace PdfEditor.Entidades;

/// <summary>Error de validación de negocio con mensaje apto para mostrar al usuario.</summary>
public sealed class ReglaNegocioException(string mensaje) : Exception(mensaje);
