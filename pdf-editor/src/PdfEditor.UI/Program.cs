namespace PdfEditor.UI;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) =>
            MessageBox.Show(e.Exception.Message, "Error inesperado", MessageBoxButtons.OK, MessageBoxIcon.Error);

        // Permite "Abrir con..." desde el Explorador de Windows.
        var archivoInicial = args.FirstOrDefault(a => a.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase));
        Application.Run(new FormPrincipal(archivoInicial));
    }
}
