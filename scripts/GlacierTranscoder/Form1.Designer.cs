namespace GlacierTranscoder;

partial class Form1
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            components?.Dispose();
            _pollTimer?.Dispose();
            _httpClient?.Dispose();
        }
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();

        // Form settings
        Text = "Glacier Transcoder";
        ClientSize = new Size(560, 490);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(20, 20, 30);
        ForeColor = Color.White;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        Font = new Font("Segoe UI", 9F);

        // Title
        _lblTitle = new Label
        {
            Text = "Glacier Transcoder",
            Location = new Point(20, 15),
            Size = new Size(300, 28),
            Font = new Font("Segoe UI", 14F, FontStyle.Bold),
            ForeColor = Color.FromArgb(96, 165, 250)
        };

        // Server label
        _lblServer = new Label
        {
            Text = "Server: ...",
            Location = new Point(20, 44),
            Size = new Size(500, 18),
            ForeColor = Color.FromArgb(120, 120, 140),
            Font = new Font("Segoe UI", 8F)
        };

        // Status panel
        _panelStatus = new Panel
        {
            Location = new Point(20, 70),
            Size = new Size(520, 105),
            BackColor = Color.FromArgb(30, 30, 45)
        };

        _lblStatus = new Label
        {
            Text = "Idle - Press Start to begin",
            Location = new Point(15, 10),
            Size = new Size(490, 22),
            Font = new Font("Segoe UI", 10F, FontStyle.Bold),
            ForeColor = Color.FromArgb(200, 200, 220)
        };

        _lblCurrentFile = new Label
        {
            Text = "",
            Location = new Point(15, 35),
            Size = new Size(490, 18),
            ForeColor = Color.FromArgb(160, 160, 180),
            Font = new Font("Segoe UI", 8F)
        };

        _progressBar = new ProgressBar
        {
            Location = new Point(15, 62),
            Size = new Size(490, 28),
            Style = ProgressBarStyle.Continuous
        };

        _panelStatus.Controls.AddRange(new Control[] { _lblStatus, _lblCurrentFile, _progressBar });

        // Stats panel
        _panelStats = new Panel
        {
            Location = new Point(20, 185),
            Size = new Size(520, 95),
            BackColor = Color.FromArgb(30, 30, 45)
        };

        _lblCompleted = new Label
        {
            Text = "Completed: 0",
            Location = new Point(15, 10),
            Size = new Size(160, 20),
            ForeColor = Color.FromArgb(74, 222, 128)
        };

        _lblFailed = new Label
        {
            Text = "Failed: 0",
            Location = new Point(180, 10),
            Size = new Size(150, 20),
            ForeColor = Color.FromArgb(248, 113, 113)
        };

        _lblSaved = new Label
        {
            Text = "Space saved: 0 B",
            Location = new Point(335, 10),
            Size = new Size(175, 20),
            ForeColor = Color.FromArgb(96, 165, 250)
        };

        _lblSpeed = new Label
        {
            Text = "Speed: -",
            Location = new Point(15, 38),
            Size = new Size(220, 20),
            ForeColor = Color.FromArgb(200, 200, 220)
        };

        _lblEta = new Label
        {
            Text = "ETA: -",
            Location = new Point(240, 38),
            Size = new Size(200, 20),
            ForeColor = Color.FromArgb(200, 200, 220)
        };

        _lblRuntime = new Label
        {
            Text = "Runtime: -",
            Location = new Point(15, 65),
            Size = new Size(300, 20),
            ForeColor = Color.FromArgb(160, 160, 180)
        };

        _panelStats.Controls.AddRange(new Control[] {
            _lblCompleted, _lblFailed, _lblSaved, _lblSpeed, _lblEta, _lblRuntime
        });

        // Log textbox
        _txtLog = new TextBox
        {
            Location = new Point(20, 290),
            Size = new Size(520, 115),
            Multiline = true,
            ScrollBars = ScrollBars.Vertical,
            ReadOnly = true,
            BackColor = Color.FromArgb(15, 15, 25),
            ForeColor = Color.FromArgb(160, 160, 180),
            Font = new Font("Consolas", 8.25F)
        };

        // Buttons
        _btnStart = new Button
        {
            Text = "Start",
            Location = new Point(20, 415),
            Size = new Size(120, 38),
            BackColor = Color.FromArgb(22, 163, 74),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat,
            Font = new Font("Segoe UI", 10F, FontStyle.Bold)
        };

        _btnStop = new Button
        {
            Text = "Stop",
            Location = new Point(150, 415),
            Size = new Size(120, 38),
            BackColor = Color.FromArgb(185, 28, 28),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat,
            Font = new Font("Segoe UI", 10F, FontStyle.Bold),
            Enabled = false
        };

        _chkStartup = new CheckBox
        {
            Text = "Run on Windows startup",
            Location = new Point(310, 422),
            Size = new Size(200, 24),
            ForeColor = Color.FromArgb(160, 160, 180)
        };

        // Add all to form
        Controls.AddRange(new Control[] {
            _lblTitle, _lblServer, _panelStatus, _panelStats,
            _txtLog, _btnStart, _btnStop, _chkStartup
        });
    }

    // Controls
    private Label _lblTitle;
    private Label _lblServer;
    private Panel _panelStatus;
    private Label _lblStatus;
    private Label _lblCurrentFile;
    private ProgressBar _progressBar;
    private Panel _panelStats;
    private Label _lblCompleted;
    private Label _lblFailed;
    private Label _lblSaved;
    private Label _lblSpeed;
    private Label _lblEta;
    private Label _lblRuntime;
    private TextBox _txtLog;
    private Button _btnStart;
    private Button _btnStop;
    private CheckBox _chkStartup;
}
