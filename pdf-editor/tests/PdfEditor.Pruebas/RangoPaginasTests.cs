using PdfEditor.Entidades;
using PdfEditor.Negocio;
using Xunit;

namespace PdfEditor.Pruebas;

public class RangoPaginasTests
{
    [Theory]
    [InlineData("1-3, 5", 10, new[] { 0, 1, 2, 4 })]
    [InlineData("5-3", 10, new[] { 4, 3, 2 })]
    [InlineData("8-", 10, new[] { 7, 8, 9 })]
    [InlineData("-2;2;1", 10, new[] { 0, 1 })]
    public void ParseaRangos(string texto, int total, int[] esperado) =>
        Assert.Equal(esperado, RangoPaginas.Parsear(texto, total));

    [Theory]
    [InlineData("")]
    [InlineData("0")]
    [InlineData("11")]
    [InlineData("a-b")]
    public void RechazaRangosInvalidos(string texto) =>
        Assert.Throws<ReglaNegocioException>(() => RangoPaginas.Parsear(texto, 10));
}
