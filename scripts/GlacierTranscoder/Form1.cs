using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace GlacierTranscoder;

public partial class Form1 : Form
{
    // Config
    private const string DefaultServerUrl = "http://192.168.3.202:3000";
    private const string DefaultNasPath = @"\\192.168.3.188\noobnoob";
    private const string DefaultFfmpegPath = "ffmpeg";

    private readonly string _serverUrl;
    private readonly string _nasPath;
    private readonly string _tempDir;
    private readonly string _ffmpegPath;

    // State
    private bool _running;
    private TranscodeJob? _currentJob;
    private Process? _ffmpegProcess;
    private DateTime? _ffmpegStartTime;
    private string? _tempOutputPath;
    private string? _nasOutputDir;
    private string? _nasOutputName;
    private DateTime? _workerStartTime;
    private int _completedCount;
    private int _failedCount;
    private long _totalSavedBytes;

    // Services
    private readonly HttpClient _httpClient;
    private readonly System.Windows.Forms.Timer _pollTimer;

    public Form1()
    {
        InitializeComponent();

        // Read config from command line args or defaults
        var args = Environment.GetCommandLineArgs();
        _serverUrl = GetArg(args, "--server") ?? DefaultServerUrl;
        _nasPath = GetArg(args, "--nas") ?? DefaultNasPath;
        _ffmpegPath = GetArg(args, "--ffmpeg") ?? DefaultFfmpegPath;
        _tempDir = GetArg(args, "--temp") ?? Path.Combine(Path.GetTempPath(), "glacier-transcode");

        Directory.CreateDirectory(_tempDir);

        _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        _lblServer.Text = $"Server: {_serverUrl}";

        // Check startup shortcut
        var startupLink = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Startup),
            "Glacier Transcoder.lnk");
        _chkStartup.Checked = System.IO.File.Exists(startupLink);

        // Wire events
        _btnStart.Click += BtnStart_Click;
        _btnStop.Click += BtnStop_Click;
        _chkStartup.CheckedChanged += ChkStartup_CheckedChanged;
        FormClosing += Form1_FormClosing;

        // Poll timer
        _pollTimer = new System.Windows.Forms.Timer { Interval = 5000 };
        _pollTimer.Tick += PollTimer_Tick;

        Log($"Ready. Server: {_serverUrl}");
        Log($"NAS: {_nasPath}");
        Log($"Temp: {_tempDir}");

        // Auto-start if env var set (for startup shortcut)
        if (Environment.GetEnvironmentVariable("GLACIER_AUTOSTART") == "1")
        {
            BeginInvoke(() => _btnStart.PerformClick());
        }
    }

    private static string? GetArg(string[] args, string key)
    {
        for (int i = 0; i < args.Length - 1; i++)
            if (args[i].Equals(key, StringComparison.OrdinalIgnoreCase))
                return args[i + 1];
        return null;
    }

    // ---------------------------------------------------------------
    // Logging
    // ---------------------------------------------------------------
    private void Log(string msg)
    {
        var ts = DateTime.Now.ToString("HH:mm:ss");
        _txtLog.AppendText($"[{ts}] {msg}\r\n");
    }

    // ---------------------------------------------------------------
    // Formatting helpers
    // ---------------------------------------------------------------
    private static string FormatBytes(long bytes)
    {
        if (bytes < 1024) return $"{bytes} B";
        if (bytes < 1024 * 1024) return $"{bytes / 1024.0:N1} KB";
        if (bytes < 1024L * 1024 * 1024) return $"{bytes / (1024.0 * 1024):N1} MB";
        if (bytes < 1024L * 1024 * 1024 * 1024) return $"{bytes / (1024.0 * 1024 * 1024):N2} GB";
        return $"{bytes / (1024.0 * 1024 * 1024 * 1024):N2} TB";
    }

    // ---------------------------------------------------------------
    // NAS path conversion
    // ---------------------------------------------------------------
    private string ConvertNasPath(string linuxPath)
    {
        var result = linuxPath;
        result = Regex.Replace(result, @"^/mnt/nas/", _nasPath + @"\");
        result = Regex.Replace(result, @"^/mnt/noobnoob/", _nasPath + @"\");
        result = Regex.Replace(result, @"^/mnt/user/noobnoob/", _nasPath + @"\");
        return result.Replace('/', '\\');
    }

    // ---------------------------------------------------------------
    // API calls
    // ---------------------------------------------------------------
    private async Task<TranscodeJob?> GetNextJobAsync()
    {
        try
        {
            var json = await _httpClient.GetStringAsync($"{_serverUrl}/api/transcode/worker");
            var job = JsonSerializer.Deserialize<TranscodeJob>(json);
            if (job?.Id == null || job.Id == 0) return null;
            return job;
        }
        catch
        {
            return null;
        }
    }

    private async Task ReportProgressAsync(int jobId, string status, double? progress = null,
        string? outputPath = null, long? transcodedSize = null, string? error = null)
    {
        try
        {
            var body = new Dictionary<string, object> { ["id"] = jobId, ["status"] = status };
            if (progress.HasValue) body["progress"] = progress.Value;
            if (outputPath != null) body["output_path"] = outputPath;
            if (transcodedSize.HasValue) body["transcoded_size"] = transcodedSize.Value;
            if (error != null) body["error"] = error;

            var content = new StringContent(
                JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
            await _httpClient.PostAsync($"{_serverUrl}/api/transcode/worker", content);
        }
        catch { /* ignore reporting errors */ }
    }

    // ---------------------------------------------------------------
    // Button handlers
    // ---------------------------------------------------------------
    private void BtnStart_Click(object? sender, EventArgs e)
    {
        _running = true;
        _workerStartTime = DateTime.Now;
        _btnStart.Enabled = false;
        _btnStop.Enabled = true;
        _pollTimer.Start();
        Log("Worker started - polling " + _serverUrl);
        _lblStatus.Text = "Starting...";
    }

    private void BtnStop_Click(object? sender, EventArgs e)
    {
        _running = false;
        _pollTimer.Stop();
        _btnStart.Enabled = true;
        _btnStop.Enabled = false;

        KillFfmpeg("Worker stopped by user");
        _lblStatus.Text = "Stopped";
        Log("Worker stopped");
    }

    private void KillFfmpeg(string reason)
    {
        if (_ffmpegProcess != null && !_ffmpegProcess.HasExited)
        {
            try { _ffmpegProcess.Kill(true); } catch { }
            Log("Killed active ffmpeg process");
        }
        _ffmpegProcess = null;

        if (_currentJob != null)
        {
            _ = ReportProgressAsync(_currentJob.Id, "failed", error: reason);
            _currentJob = null;
        }
    }

    // ---------------------------------------------------------------
    // Startup shortcut
    // ---------------------------------------------------------------
    private void ChkStartup_CheckedChanged(object? sender, EventArgs e)
    {
        var startupLink = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Startup),
            "Glacier Transcoder.lnk");

        if (_chkStartup.Checked)
        {
            try
            {
                var exePath = Application.ExecutablePath;
                var workDir = Path.GetDirectoryName(exePath) ?? "";
                var ps = $"$s=(New-Object -COM WScript.Shell).CreateShortcut('{startupLink}');" +
                         $"$s.TargetPath='{exePath}';" +
                         $"$s.Arguments='--server \"{_serverUrl}\"';" +
                         $"$s.WorkingDirectory='{workDir}';" +
                         $"$s.Save()";
                Process.Start(new ProcessStartInfo("powershell", $"-NoProfile -Command \"{ps}\"")
                {
                    CreateNoWindow = true, UseShellExecute = false
                })?.WaitForExit(5000);
                Log("Added to Windows startup");
            }
            catch (Exception ex)
            {
                Log($"Failed to create startup shortcut: {ex.Message}");
                _chkStartup.Checked = false;
            }
        }
        else
        {
            if (System.IO.File.Exists(startupLink))
            {
                System.IO.File.Delete(startupLink);
                Log("Removed from Windows startup");
            }
        }
    }

    // ---------------------------------------------------------------
    // Form closing
    // ---------------------------------------------------------------
    private void Form1_FormClosing(object? sender, FormClosingEventArgs e)
    {
        _running = false;
        _pollTimer.Stop();
        KillFfmpeg("Worker closed");
    }

    // ---------------------------------------------------------------
    // Main poll loop
    // ---------------------------------------------------------------
    private async void PollTimer_Tick(object? sender, EventArgs e)
    {
        if (!_running) return;

        // Update runtime
        if (_workerStartTime.HasValue)
        {
            var elapsed = DateTime.Now - _workerStartTime.Value;
            _lblRuntime.Text = $"Runtime: {elapsed:hh\\:mm\\:ss}";
        }

        // If ffmpeg is running, check progress
        if (_ffmpegProcess != null)
        {
            CheckFfmpegProgress();
            return;
        }

        // No active job — poll for next one
        if (_currentJob == null)
        {
            _lblStatus.Text = "Polling for jobs...";
            _lblCurrentFile.Text = "";
            _progressBar.Value = 0;

            var job = await GetNextJobAsync();
            if (job == null)
            {
                _lblStatus.Text = "Waiting for jobs... (polling every 5s)";
                return;
            }

            await StartTranscodeJob(job);
        }
    }

    // ---------------------------------------------------------------
    // Start a transcode job
    // ---------------------------------------------------------------
    private async Task StartTranscodeJob(TranscodeJob job)
    {
        _currentJob = job;
        var sourcePath = ConvertNasPath(job.SourcePath);
        var fileName = Path.GetFileName(sourcePath);
        var ext = Path.GetExtension(sourcePath);
        var nameNoExt = Path.GetFileNameWithoutExtension(sourcePath);
        var outputName = $"{nameNoExt}.hevc{ext}";
        var tempOutput = Path.Combine(_tempDir, outputName);

        Log($"Job #{job.Id}: {fileName}");
        Log($"  Codec: {job.CodecFrom} -> {job.CodecTo}");
        _lblStatus.Text = $"Transcoding: {fileName}";
        _lblCurrentFile.Text = sourcePath;

        if (!System.IO.File.Exists(sourcePath))
        {
            Log("  ERROR: Source not found");
            await ReportProgressAsync(job.Id, "failed", error: $"Source file not found: {sourcePath}");
            _failedCount++;
            _lblFailed.Text = $"Failed: {_failedCount}";
            _currentJob = null;
            return;
        }

        await ReportProgressAsync(job.Id, "transcoding", 0);

        var codec = job.CodecTo == "av1" ? "av1_nvenc" : "hevc_nvenc";
        var cq = job.Cq > 0 ? job.Cq : 22;
        var preset = !string.IsNullOrEmpty(job.Preset) ? job.Preset : "p5";

        var psi = new ProcessStartInfo
        {
            FileName = _ffmpegPath,
            Arguments = $"-i \"{sourcePath}\" -c:v {codec} -preset {preset} -cq {cq} -c:a copy -c:s copy -y \"{tempOutput}\"",
            UseShellExecute = false,
            RedirectStandardError = true,
            CreateNoWindow = true
        };

        try
        {
            _ffmpegProcess = Process.Start(psi);
            _ffmpegStartTime = DateTime.Now;
            _tempOutputPath = tempOutput;
            _nasOutputDir = Path.GetDirectoryName(sourcePath);
            _nasOutputName = outputName;

            // Start reading stderr asynchronously for progress
            if (_ffmpegProcess != null)
            {
                _ffmpegProcess.BeginErrorReadLine();
                _ffmpegProcess.ErrorDataReceived += FfmpegErrorDataReceived;
            }
        }
        catch (Exception ex)
        {
            Log($"  ERROR: Failed to start ffmpeg: {ex.Message}");
            await ReportProgressAsync(job.Id, "failed", error: $"Failed to start ffmpeg: {ex.Message}");
            _failedCount++;
            _lblFailed.Text = $"Failed: {_failedCount}";
            _currentJob = null;
        }
    }

    // ---------------------------------------------------------------
    // Parse ffmpeg stderr for progress
    // ---------------------------------------------------------------
    private double _lastFfmpegFps;
    private string _lastFfmpegSpeed = "";
    private TimeSpan _sourceDuration;
    private TimeSpan _lastEncodedTime;

    private void FfmpegErrorDataReceived(object sender, DataReceivedEventArgs e)
    {
        if (string.IsNullOrEmpty(e.Data)) return;

        // Parse duration from input: "Duration: 01:23:45.67"
        var durMatch = Regex.Match(e.Data, @"Duration:\s*(\d+):(\d+):(\d+)\.(\d+)");
        if (durMatch.Success)
        {
            _sourceDuration = new TimeSpan(0,
                int.Parse(durMatch.Groups[1].Value),
                int.Parse(durMatch.Groups[2].Value),
                int.Parse(durMatch.Groups[3].Value),
                int.Parse(durMatch.Groups[4].Value) * 10);
        }

        // Parse progress: "time=00:12:34.56"
        var timeMatch = Regex.Match(e.Data, @"time=(\d+):(\d+):(\d+)\.(\d+)");
        if (timeMatch.Success)
        {
            _lastEncodedTime = new TimeSpan(0,
                int.Parse(timeMatch.Groups[1].Value),
                int.Parse(timeMatch.Groups[2].Value),
                int.Parse(timeMatch.Groups[3].Value),
                int.Parse(timeMatch.Groups[4].Value) * 10);
        }

        // Parse fps
        var fpsMatch = Regex.Match(e.Data, @"fps=\s*([\d.]+)");
        if (fpsMatch.Success)
            double.TryParse(fpsMatch.Groups[1].Value, out _lastFfmpegFps);

        // Parse speed
        var speedMatch = Regex.Match(e.Data, @"speed=\s*([\d.]+x)");
        if (speedMatch.Success)
            _lastFfmpegSpeed = speedMatch.Groups[1].Value;
    }

    // ---------------------------------------------------------------
    // Check ffmpeg progress / completion
    // ---------------------------------------------------------------
    private async void CheckFfmpegProgress()
    {
        if (_ffmpegProcess == null) return;

        if (_ffmpegProcess.HasExited)
        {
            var exitCode = _ffmpegProcess.ExitCode;
            _ffmpegProcess.Dispose();
            _ffmpegProcess = null;

            if (exitCode == 0 && _tempOutputPath != null && System.IO.File.Exists(_tempOutputPath))
            {
                var transcodedSize = new FileInfo(_tempOutputPath).Length;
                var originalSize = _currentJob?.OriginalSize ?? 0;
                var saved = originalSize - transcodedSize;

                Log($"  Done! {FormatBytes(originalSize)} -> {FormatBytes(transcodedSize)} (saved {FormatBytes(saved)})");

                // Copy back to NAS
                var nasDest = Path.Combine(_nasOutputDir ?? "", _nasOutputName ?? "");
                try
                {
                    System.IO.File.Copy(_tempOutputPath, nasDest, overwrite: true);
                    var linuxOutputPath = nasDest.Replace('\\', '/');
                    linuxOutputPath = Regex.Replace(linuxOutputPath,
                        Regex.Escape(_nasPath.Replace('\\', '/')), "/mnt/nas");

                    await ReportProgressAsync(_currentJob!.Id, "completed", 100,
                        linuxOutputPath, transcodedSize);

                    _completedCount++;
                    _totalSavedBytes += Math.Max(0, saved);
                    _lblCompleted.Text = $"Completed: {_completedCount}";
                    _lblSaved.Text = $"Space saved: {FormatBytes(_totalSavedBytes)}";

                    try { System.IO.File.Delete(_tempOutputPath); } catch { }
                }
                catch (Exception ex)
                {
                    Log($"  ERROR copying to NAS: {ex.Message}");
                    await ReportProgressAsync(_currentJob!.Id, "failed",
                        error: $"Failed to copy to NAS: {ex.Message}");
                    _failedCount++;
                    _lblFailed.Text = $"Failed: {_failedCount}";
                }
            }
            else
            {
                Log($"  FAILED (exit {exitCode})");
                if (_currentJob != null)
                    await ReportProgressAsync(_currentJob.Id, "failed",
                        error: $"ffmpeg exit code {exitCode}");
                _failedCount++;
                _lblFailed.Text = $"Failed: {_failedCount}";
            }

            _progressBar.Value = 0;
            _lblSpeed.Text = "Speed: -";
            _lblEta.Text = "ETA: -";
            _currentJob = null;
            _lastFfmpegFps = 0;
            _lastFfmpegSpeed = "";
            _sourceDuration = TimeSpan.Zero;
            _lastEncodedTime = TimeSpan.Zero;
        }
        else
        {
            // Still running - update progress UI
            if (_ffmpegStartTime.HasValue)
            {
                var elapsed = DateTime.Now - _ffmpegStartTime.Value;

                // Calculate actual percentage if we have duration info
                if (_sourceDuration.TotalSeconds > 0 && _lastEncodedTime.TotalSeconds > 0)
                {
                    var pct = Math.Min(99, (int)(_lastEncodedTime.TotalSeconds / _sourceDuration.TotalSeconds * 100));
                    _progressBar.Value = pct;

                    // Estimate ETA
                    if (pct > 0)
                    {
                        var remaining = TimeSpan.FromSeconds(
                            elapsed.TotalSeconds / pct * (100 - pct));
                        _lblEta.Text = $"ETA: {remaining:hh\\:mm\\:ss}";
                    }

                    // Report progress to server periodically
                    if (_currentJob != null)
                        _ = ReportProgressAsync(_currentJob.Id, "transcoding", pct);
                }
                else
                {
                    // No duration info yet, show animated bar
                    if (_progressBar.Value < 95)
                        _progressBar.Value = Math.Min(95, _progressBar.Value + 1);
                }

                var speedStr = _lastFfmpegFps > 0
                    ? $"{_lastFfmpegFps:N1} fps"
                    : $"{elapsed:mm\\:ss} elapsed";
                if (!string.IsNullOrEmpty(_lastFfmpegSpeed))
                    speedStr += $" ({_lastFfmpegSpeed})";
                _lblSpeed.Text = $"Encoding: {speedStr}";
            }
        }
    }
}

// ---------------------------------------------------------------
// Job model
// ---------------------------------------------------------------
public class TranscodeJob
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("source_path")]
    public string SourcePath { get; set; } = "";

    [JsonPropertyName("codec_from")]
    public string CodecFrom { get; set; } = "";

    [JsonPropertyName("codec_to")]
    public string CodecTo { get; set; } = "hevc";

    [JsonPropertyName("original_size")]
    public long OriginalSize { get; set; }

    [JsonPropertyName("cq")]
    public int Cq { get; set; }

    [JsonPropertyName("preset")]
    public string Preset { get; set; } = "";

    [JsonPropertyName("profile_id")]
    public int? ProfileId { get; set; }
}
