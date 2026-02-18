<#
.SYNOPSIS
    Glacier Backup Manager - Transcoder GUI

.DESCRIPTION
    Windows GUI application for the gaming PC transcode worker. Shows real-time
    progress, job stats, and speed. Wraps the gaming-pc-worker.ps1 logic with
    a visual interface.

.PARAMETER ServerUrl
    URL of the Glacier Backup Manager server.

.EXAMPLE
    .\transcoder-gui.ps1
    .\transcoder-gui.ps1 -ServerUrl http://192.168.3.202:3000
#>

[CmdletBinding()]
param(
    [string]$ServerUrl = "http://192.168.3.202:3000",
    [string]$NasPath = "\\192.168.3.188\noobnoob",
    [string]$TempDir = "$env:TEMP\glacier-transcode",
    [string]$FfmpegPath = "ffmpeg"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Ensure temp dir exists
if (!(Test-Path $TempDir)) { New-Item -ItemType Directory -Path $TempDir -Force | Out-Null }

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
$script:Running = $false
$script:CurrentJob = $null
$script:FfmpegProcess = $null
$script:Stats = @{
    Completed = 0
    Failed = 0
    TotalSavedBytes = 0
    StartTime = $null
}

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------
function Format-Bytes($bytes) {
    if ($bytes -lt 1KB) { return "$bytes B" }
    if ($bytes -lt 1MB) { return "{0:N1} KB" -f ($bytes / 1KB) }
    if ($bytes -lt 1GB) { return "{0:N1} MB" -f ($bytes / 1MB) }
    if ($bytes -lt 1TB) { return "{0:N2} GB" -f ($bytes / 1GB) }
    return "{0:N2} TB" -f ($bytes / 1TB)
}

function Convert-NasPath($linuxPath) {
    $converted = $linuxPath -replace "^/mnt/nas/", "$NasPath\" -replace "^/mnt/noobnoob/", "$NasPath\" -replace "^/mnt/user/noobnoob/", "$NasPath\"
    return $converted -replace "/", "\"
}

function Get-NextJob {
    try {
        $response = Invoke-RestMethod -Uri "$ServerUrl/api/transcode/worker" -Method GET -TimeoutSec 10
        return $response
    } catch {
        return $null
    }
}

function Report-Progress($jobId, $status, $progress, $outputPath, $transcodedSize, $error) {
    $body = @{
        id = $jobId
        status = $status
    }
    if ($progress -ne $null) { $body.progress = $progress }
    if ($outputPath) { $body.output_path = $outputPath }
    if ($transcodedSize) { $body.transcoded_size = $transcodedSize }
    if ($error) { $body.error = $error }

    try {
        Invoke-RestMethod -Uri "$ServerUrl/api/transcode/worker" -Method POST -Body ($body | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 10
    } catch {
        # Ignore reporting errors
    }
}

# ---------------------------------------------------------------------------
# GUI Setup
# ---------------------------------------------------------------------------
$form = New-Object System.Windows.Forms.Form
$form.Text = "Glacier Transcoder"
$form.Size = New-Object System.Drawing.Size(560, 480)
$form.StartPosition = "CenterScreen"
$form.BackColor = [System.Drawing.Color]::FromArgb(20, 20, 30)
$form.ForeColor = [System.Drawing.Color]::White
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox = $false
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)

# Title
$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text = "Glacier Transcoder"
$lblTitle.Location = New-Object System.Drawing.Point(20, 15)
$lblTitle.Size = New-Object System.Drawing.Size(300, 25)
$lblTitle.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$lblTitle.ForeColor = [System.Drawing.Color]::FromArgb(96, 165, 250)
$form.Controls.Add($lblTitle)

$lblServer = New-Object System.Windows.Forms.Label
$lblServer.Text = "Server: $ServerUrl"
$lblServer.Location = New-Object System.Drawing.Point(20, 42)
$lblServer.Size = New-Object System.Drawing.Size(500, 18)
$lblServer.ForeColor = [System.Drawing.Color]::FromArgb(120, 120, 140)
$lblServer.Font = New-Object System.Drawing.Font("Segoe UI", 8)
$form.Controls.Add($lblServer)

# Status panel
$panelStatus = New-Object System.Windows.Forms.Panel
$panelStatus.Location = New-Object System.Drawing.Point(20, 70)
$panelStatus.Size = New-Object System.Drawing.Size(510, 100)
$panelStatus.BackColor = [System.Drawing.Color]::FromArgb(30, 30, 45)
$form.Controls.Add($panelStatus)

$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Text = "Idle - Press Start to begin"
$lblStatus.Location = New-Object System.Drawing.Point(15, 10)
$lblStatus.Size = New-Object System.Drawing.Size(480, 20)
$lblStatus.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$lblStatus.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 220)
$panelStatus.Controls.Add($lblStatus)

$lblCurrentFile = New-Object System.Windows.Forms.Label
$lblCurrentFile.Text = ""
$lblCurrentFile.Location = New-Object System.Drawing.Point(15, 35)
$lblCurrentFile.Size = New-Object System.Drawing.Size(480, 18)
$lblCurrentFile.ForeColor = [System.Drawing.Color]::FromArgb(160, 160, 180)
$lblCurrentFile.Font = New-Object System.Drawing.Font("Segoe UI", 8)
$panelStatus.Controls.Add($lblCurrentFile)

# Progress bar
$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Location = New-Object System.Drawing.Point(15, 60)
$progressBar.Size = New-Object System.Drawing.Size(480, 25)
$progressBar.Style = "Continuous"
$progressBar.ForeColor = [System.Drawing.Color]::FromArgb(96, 165, 250)
$panelStatus.Controls.Add($progressBar)

# Stats panel
$panelStats = New-Object System.Windows.Forms.Panel
$panelStats.Location = New-Object System.Drawing.Point(20, 180)
$panelStats.Size = New-Object System.Drawing.Size(510, 90)
$panelStats.BackColor = [System.Drawing.Color]::FromArgb(30, 30, 45)
$form.Controls.Add($panelStats)

$lblCompleted = New-Object System.Windows.Forms.Label
$lblCompleted.Text = "Completed: 0"
$lblCompleted.Location = New-Object System.Drawing.Point(15, 10)
$lblCompleted.Size = New-Object System.Drawing.Size(150, 20)
$lblCompleted.ForeColor = [System.Drawing.Color]::FromArgb(74, 222, 128)
$panelStats.Controls.Add($lblCompleted)

$lblFailed = New-Object System.Windows.Forms.Label
$lblFailed.Text = "Failed: 0"
$lblFailed.Location = New-Object System.Drawing.Point(170, 10)
$lblFailed.Size = New-Object System.Drawing.Size(150, 20)
$lblFailed.ForeColor = [System.Drawing.Color]::FromArgb(248, 113, 113)
$panelStats.Controls.Add($lblFailed)

$lblSaved = New-Object System.Windows.Forms.Label
$lblSaved.Text = "Space saved: 0 B"
$lblSaved.Location = New-Object System.Drawing.Point(325, 10)
$lblSaved.Size = New-Object System.Drawing.Size(170, 20)
$lblSaved.ForeColor = [System.Drawing.Color]::FromArgb(96, 165, 250)
$panelStats.Controls.Add($lblSaved)

$lblSpeed = New-Object System.Windows.Forms.Label
$lblSpeed.Text = "Speed: -"
$lblSpeed.Location = New-Object System.Drawing.Point(15, 35)
$lblSpeed.Size = New-Object System.Drawing.Size(200, 20)
$lblSpeed.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 220)
$panelStats.Controls.Add($lblSpeed)

$lblEta = New-Object System.Windows.Forms.Label
$lblEta.Text = "ETA: -"
$lblEta.Location = New-Object System.Drawing.Point(220, 35)
$lblEta.Size = New-Object System.Drawing.Size(200, 20)
$lblEta.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 220)
$panelStats.Controls.Add($lblEta)

$lblRuntime = New-Object System.Windows.Forms.Label
$lblRuntime.Text = "Runtime: -"
$lblRuntime.Location = New-Object System.Drawing.Point(15, 60)
$lblRuntime.Size = New-Object System.Drawing.Size(300, 20)
$lblRuntime.ForeColor = [System.Drawing.Color]::FromArgb(160, 160, 180)
$panelStats.Controls.Add($lblRuntime)

# Log panel
$txtLog = New-Object System.Windows.Forms.TextBox
$txtLog.Location = New-Object System.Drawing.Point(20, 280)
$txtLog.Size = New-Object System.Drawing.Size(510, 110)
$txtLog.Multiline = $true
$txtLog.ScrollBars = "Vertical"
$txtLog.ReadOnly = $true
$txtLog.BackColor = [System.Drawing.Color]::FromArgb(15, 15, 25)
$txtLog.ForeColor = [System.Drawing.Color]::FromArgb(160, 160, 180)
$txtLog.Font = New-Object System.Drawing.Font("Consolas", 8)
$form.Controls.Add($txtLog)

# Buttons
$btnStart = New-Object System.Windows.Forms.Button
$btnStart.Text = "Start"
$btnStart.Location = New-Object System.Drawing.Point(20, 400)
$btnStart.Size = New-Object System.Drawing.Size(120, 35)
$btnStart.BackColor = [System.Drawing.Color]::FromArgb(22, 163, 74)
$btnStart.ForeColor = [System.Drawing.Color]::White
$btnStart.FlatStyle = "Flat"
$btnStart.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($btnStart)

$btnStop = New-Object System.Windows.Forms.Button
$btnStop.Text = "Stop"
$btnStop.Location = New-Object System.Drawing.Point(150, 400)
$btnStop.Size = New-Object System.Drawing.Size(120, 35)
$btnStop.BackColor = [System.Drawing.Color]::FromArgb(185, 28, 28)
$btnStop.ForeColor = [System.Drawing.Color]::White
$btnStop.FlatStyle = "Flat"
$btnStop.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$btnStop.Enabled = $false
$form.Controls.Add($btnStop)

$chkStartup = New-Object System.Windows.Forms.CheckBox
$chkStartup.Text = "Run on Windows startup"
$chkStartup.Location = New-Object System.Drawing.Point(310, 407)
$chkStartup.Size = New-Object System.Drawing.Size(200, 22)
$chkStartup.ForeColor = [System.Drawing.Color]::FromArgb(160, 160, 180)
# Check if startup shortcut exists
$startupPath = [System.IO.Path]::Combine([Environment]::GetFolderPath("Startup"), "Glacier Transcoder.lnk")
$chkStartup.Checked = (Test-Path $startupPath)
$form.Controls.Add($chkStartup)

# ---------------------------------------------------------------------------
# Log helper
# ---------------------------------------------------------------------------
function Write-Log($msg) {
    $timestamp = Get-Date -Format "HH:mm:ss"
    $txtLog.AppendText("[$timestamp] $msg`r`n")
    $txtLog.SelectionStart = $txtLog.TextLength
    $txtLog.ScrollToCaret()
}

# ---------------------------------------------------------------------------
# Timer for polling and processing
# ---------------------------------------------------------------------------
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000  # 5 seconds

$timer.Add_Tick({
    if (-not $script:Running) { return }

    # Update runtime
    if ($script:Stats.StartTime) {
        $elapsed = (Get-Date) - $script:Stats.StartTime
        $lblRuntime.Text = "Runtime: {0:hh\:mm\:ss}" -f $elapsed
    }

    # If no current job, poll for one
    if ($null -eq $script:CurrentJob) {
        $lblStatus.Text = "Polling for jobs..."
        $lblCurrentFile.Text = ""
        $progressBar.Value = 0

        $job = Get-NextJob
        if ($null -eq $job -or $null -eq $job.id) {
            $lblStatus.Text = "Waiting for jobs... (polling every 5s)"
            return
        }

        $script:CurrentJob = $job
        $sourcePath = Convert-NasPath $job.source_path
        $fileName = [System.IO.Path]::GetFileName($sourcePath)
        $ext = [System.IO.Path]::GetExtension($sourcePath)
        $nameNoExt = [System.IO.Path]::GetFileNameWithoutExtension($sourcePath)
        $outputName = "$nameNoExt.hevc$ext"
        $tempOutput = Join-Path $TempDir $outputName

        Write-Log "Job #$($job.id): $fileName"
        Write-Log "  Codec: $($job.codec_from) -> $($job.codec_to)"
        $lblStatus.Text = "Transcoding: $fileName"
        $lblCurrentFile.Text = $sourcePath

        # Check source exists
        if (!(Test-Path $sourcePath)) {
            Write-Log "  ERROR: Source not found"
            Report-Progress $job.id "failed" $null $null $null "Source file not found: $sourcePath"
            $script:Stats.Failed++
            $lblFailed.Text = "Failed: $($script:Stats.Failed)"
            $script:CurrentJob = $null
            return
        }

        # Report transcoding started
        Report-Progress $job.id "transcoding" 0 $null $null $null

        # Build ffmpeg command
        $codec = if ($job.codec_to -eq "av1") { "av1_nvenc" } else { "hevc_nvenc" }
        $cq = if ($job.cq) { $job.cq } else { 22 }
        $preset = if ($job.preset) { $job.preset } else { "p5" }

        $ffmpegArgs = @(
            "-i", "`"$sourcePath`"",
            "-c:v", $codec,
            "-preset", $preset,
            "-cq", $cq,
            "-c:a", "copy",
            "-c:s", "copy",
            "-y",
            "`"$tempOutput`""
        )

        try {
            $psi = New-Object System.Diagnostics.ProcessStartInfo
            $psi.FileName = $FfmpegPath
            $psi.Arguments = $ffmpegArgs -join " "
            $psi.UseShellExecute = $false
            $psi.RedirectStandardError = $true
            $psi.CreateNoWindow = $true

            $script:FfmpegProcess = [System.Diagnostics.Process]::Start($psi)
            $script:FfmpegStartTime = Get-Date
            $script:TempOutputPath = $tempOutput
            $script:NasOutputDir = [System.IO.Path]::GetDirectoryName($sourcePath)
            $script:NasOutputFile = $outputName
        } catch {
            Write-Log "  ERROR: Failed to start ffmpeg: $_"
            Report-Progress $job.id "failed" $null $null $null "Failed to start ffmpeg: $_"
            $script:Stats.Failed++
            $lblFailed.Text = "Failed: $($script:Stats.Failed)"
            $script:CurrentJob = $null
        }

        return
    }

    # If we have a running ffmpeg process, check on it
    if ($null -ne $script:FfmpegProcess) {
        if ($script:FfmpegProcess.HasExited) {
            $exitCode = $script:FfmpegProcess.ExitCode
            $stderr = $script:FfmpegProcess.StandardError.ReadToEnd()
            $script:FfmpegProcess = $null

            if ($exitCode -eq 0 -and (Test-Path $script:TempOutputPath)) {
                $transcodedSize = (Get-Item $script:TempOutputPath).Length
                $originalSize = if ($script:CurrentJob.original_size) { $script:CurrentJob.original_size } else { 0 }
                $saved = $originalSize - $transcodedSize

                Write-Log "  Done! $(Format-Bytes $originalSize) -> $(Format-Bytes $transcodedSize) (saved $(Format-Bytes $saved))"

                # Copy back to NAS
                $nasDest = Join-Path $script:NasOutputDir $script:NasOutputFile
                try {
                    Copy-Item $script:TempOutputPath $nasDest -Force
                    $linuxOutputPath = $nasDest -replace "\\", "/" -replace [regex]::Escape($NasPath), "/mnt/nas"
                    Report-Progress $script:CurrentJob.id "completed" 100 $linuxOutputPath $transcodedSize $null

                    $script:Stats.Completed++
                    $script:Stats.TotalSavedBytes += [Math]::Max(0, $saved)
                    $lblCompleted.Text = "Completed: $($script:Stats.Completed)"
                    $lblSaved.Text = "Space saved: $(Format-Bytes $script:Stats.TotalSavedBytes)"

                    # Clean up temp file
                    Remove-Item $script:TempOutputPath -Force -ErrorAction SilentlyContinue
                } catch {
                    Write-Log "  ERROR copying to NAS: $_"
                    Report-Progress $script:CurrentJob.id "failed" $null $null $null "Failed to copy to NAS: $_"
                    $script:Stats.Failed++
                    $lblFailed.Text = "Failed: $($script:Stats.Failed)"
                }
            } else {
                $errSnippet = if ($stderr.Length -gt 200) { $stderr.Substring($stderr.Length - 200) } else { $stderr }
                Write-Log "  FAILED (exit $exitCode): $errSnippet"
                Report-Progress $script:CurrentJob.id "failed" $null $null $null "ffmpeg exit code $exitCode"
                $script:Stats.Failed++
                $lblFailed.Text = "Failed: $($script:Stats.Failed)"
            }

            $progressBar.Value = 0
            $lblSpeed.Text = "Speed: -"
            $lblEta.Text = "ETA: -"
            $script:CurrentJob = $null
        } else {
            # Process still running - try to read progress from stderr
            # ffmpeg writes progress to stderr, read available output
            $elapsed = (Get-Date) - $script:FfmpegStartTime
            $elapsedStr = "{0:mm\:ss}" -f $elapsed
            $lblSpeed.Text = "Encoding... ($elapsedStr elapsed)"

            # Estimate progress based on time (rough)
            # A better approach would be to parse ffmpeg's progress output
            # For now just show an animated progress
            $currentVal = $progressBar.Value
            if ($currentVal -lt 95) {
                $progressBar.Value = [Math]::Min(95, $currentVal + 1)
            }
        }
    }
})

# ---------------------------------------------------------------------------
# Button handlers
# ---------------------------------------------------------------------------
$btnStart.Add_Click({
    $script:Running = $true
    $script:Stats.StartTime = Get-Date
    $btnStart.Enabled = $false
    $btnStop.Enabled = $true
    $timer.Start()
    Write-Log "Worker started - polling $ServerUrl"
    $lblStatus.Text = "Starting..."
})

$btnStop.Add_Click({
    $script:Running = $false
    $timer.Stop()
    $btnStart.Enabled = $true
    $btnStop.Enabled = $false

    # Kill ffmpeg if running
    if ($null -ne $script:FfmpegProcess -and -not $script:FfmpegProcess.HasExited) {
        try {
            $script:FfmpegProcess.Kill()
            Write-Log "Killed active ffmpeg process"
        } catch {}
        $script:FfmpegProcess = $null

        # Report job as failed
        if ($null -ne $script:CurrentJob) {
            Report-Progress $script:CurrentJob.id "failed" $null $null $null "Worker stopped by user"
            $script:CurrentJob = $null
        }
    }

    $lblStatus.Text = "Stopped"
    Write-Log "Worker stopped"
})

$chkStartup.Add_CheckedChanged({
    $startupPath = [System.IO.Path]::Combine([Environment]::GetFolderPath("Startup"), "Glacier Transcoder.lnk")
    if ($chkStartup.Checked) {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($startupPath)
        $shortcut.TargetPath = "powershell.exe"
        $shortcut.Arguments = "-ExecutionPolicy Bypass -File `"$PSScriptRoot\transcoder-gui.ps1`" -ServerUrl `"$ServerUrl`""
        $shortcut.WorkingDirectory = $PSScriptRoot
        $shortcut.Save()
        Write-Log "Added to Windows startup"
    } else {
        if (Test-Path $startupPath) {
            Remove-Item $startupPath -Force
            Write-Log "Removed from Windows startup"
        }
    }
})

# ---------------------------------------------------------------------------
# Form close handler
# ---------------------------------------------------------------------------
$form.Add_FormClosing({
    $script:Running = $false
    $timer.Stop()

    if ($null -ne $script:FfmpegProcess -and -not $script:FfmpegProcess.HasExited) {
        try { $script:FfmpegProcess.Kill() } catch {}
        if ($null -ne $script:CurrentJob) {
            Report-Progress $script:CurrentJob.id "failed" $null $null $null "Worker closed"
        }
    }
})

# ---------------------------------------------------------------------------
# Auto-start if launched with -AutoStart flag (for startup shortcut)
# ---------------------------------------------------------------------------
if ($env:GLACIER_AUTOSTART -eq "1") {
    $btnStart.PerformClick()
}

# Show the form
Write-Log "Ready. Server: $ServerUrl"
Write-Log "NAS: $NasPath"
Write-Log "Temp: $TempDir"
[void]$form.ShowDialog()
