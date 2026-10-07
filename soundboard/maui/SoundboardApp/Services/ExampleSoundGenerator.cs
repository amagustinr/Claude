namespace SoundboardApp.Services;

/// <summary>Sintetiza unos sonidos de ejemplo en WAV para que el tablero no empiece vacío.</summary>
public static class ExampleSoundGenerator
{
    public record Example(string Name, string ColorHex, double Seconds, byte[] Wav);

    private const int SampleRate = 22050;

    public static IEnumerable<Example> Create()
    {
        var rnd = new Random(7);
        double Noise() => rnd.NextDouble() * 2 - 1;
        const double Tau = Math.PI * 2;

        double phase = 0;
        yield return Make("Bombo", "#FF4D4D", 0.6, t =>
        {
            phase += Tau * (45 + 110 * Math.Exp(-t * 28)) / SampleRate;
            return Math.Sin(phase) * Math.Exp(-t * 7);
        });

        yield return Make("Caja", "#FFD23F", 0.3, t => (Noise() * 0.7 + Math.Sin(Tau * 185 * t) * 0.5) * Math.Exp(-t * 16));

        double last = 0;
        yield return Make("Platillo", "#2EC4E6", 0.25, t =>
        {
            var n = Noise();
            var o = n - last;
            last = n;
            return o * 0.5 * Math.Exp(-t * 20);
        });

        yield return Make("Bocina", "#FF8A3D", 1.2, t =>
        {
            double Saw(double f) => (t * f % 1) * 2 - 1;
            var env = Math.Min(1, t * 30) * Math.Min(1, (1.2 - t) * 8);
            return (Saw(440) + Saw(554) + Saw(659)) * 0.22 * env * (0.85 + 0.15 * Math.Sin(Tau * 7 * t));
        });

        yield return Make("Ding", "#3DDC84", 1.6, t =>
            (Math.Sin(Tau * 1046 * t) * 0.5 + Math.Sin(Tau * 2093 * t) * 0.2 + Math.Sin(Tau * 3140 * t) * 0.1)
            * Math.Exp(-t * 3) * Math.Min(1, t * 400));

        phase = 0;
        yield return Make("Láser", "#A66BFF", 0.45, t =>
        {
            phase += Tau * (200 + 1600 * Math.Exp(-t * 9)) / SampleRate;
            return Math.Sign(Math.Sin(phase)) * 0.25 * Math.Exp(-t * 5);
        });
    }

    private static Example Make(string name, string color, double seconds, Func<double, double> fn)
    {
        var n = (int)(seconds * SampleRate);
        using var ms = new MemoryStream(44 + n * 2);
        using var w = new BinaryWriter(ms);
        w.Write("RIFF"u8.ToArray()); w.Write(36 + n * 2); w.Write("WAVEfmt "u8.ToArray());
        w.Write(16); w.Write((short)1); w.Write((short)1);
        w.Write(SampleRate); w.Write(SampleRate * 2); w.Write((short)2); w.Write((short)16);
        w.Write("data"u8.ToArray()); w.Write(n * 2);
        for (var i = 0; i < n; i++)
        {
            var v = Math.Clamp(fn((double)i / SampleRate), -1, 1);
            w.Write((short)(v * short.MaxValue));
        }
        w.Flush();
        return new Example(name, color, seconds, ms.ToArray());
    }
}
