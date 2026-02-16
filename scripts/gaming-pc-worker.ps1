<#
.SYNOPSIS
    Glacier Backup Manager - Gaming PC Transcode Worker

.DESCRIPTION
    Polls the Glacier Backup Manager server for queued transcode jobs and processes
    them locally using NVIDIA NVENC hardware encoding. Designed to run on a Windows
    gaming PC (e.g., 9800x3d + RTX 5080) that has fast GPU encoding capabilities.

    The worker:
    - Polls the server for queued jobs via the REST API
    - Downloads source files from the NAS via SMB
    - Transcodes using ffmpeg with NVENC (HEVC/AV1)
    - Reports progress back to the server in real-time
    - Copies the completed file back to the NAS
    - Reports completion with file size for space-savings tracking

.PARAMETER ServerUrl
    URL of the Glacier Backup Manager server (e.g., http://192.168.3.202:3000).

.PARAMETER NasPath
    Windows SMB path to the NAS root share. The worker converts Linux-style NAS
    paths from the server (e.g., /mnt/user/noobnoob/...) to this SMB prefix.

.PARAMETER TempDir
    Local directory for storing transcoded files before copying back to the NAS.
    Created automatically if it does not exist.

.PARAMETER PollInterval
    Seconds to wait between polling the server when no jobs are available.

.PARAMETER FfmpegPath
    Path to the ffmpeg executable. Defaults to "ffmpeg" (assumes it is in PATH).

.EXAMPLE
    .\gaming-pc-worker.ps1 -ServerUrl http://192.168.3.202:3000

.EXAMPLE
    .\gaming-pc-worker.ps1 -ServerUrl http://192.168.3.202:3000 -NasPath "\\192.168.3.188\noobnoob" -PollInterval 15

.LINK
    https://github.com/yourrepo/glacier-backup-manager
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, HelpMessage = "URL of the Glacier Backup Manager server")]
    [string]$ServerUrl,

    [Parameter(HelpMessage = "Windows SMB path to the NAS share")]
    [string]$NasPath = "\\192.168.3.188\noobnoob",

    [Parameter(HelpMessage = "Local temp directory for transcoded output")]
    [string]$TempDir = "$env:TEMP\glacier-transcode",

    [Parameter(HelpMessage = "Seconds between polling when idle")]
    [int]$PollInterval = 30,

    [Parameter(HelpMessage = "Path to ffmpeg executable")]
    [string]$FfmpegPath = "ffmpeg"
)

# ---------------------------------------------------------------------------
# Strict mode and preferences
# ---------------------------------------------------------------------------
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Graceful shutdown handler
# ---------------------------------------------------------------------------
# Track whether a shutdown has been requested so the main loop can exit cleanly.
$script:ShutdownRequested = $false
$script:CurrentJobId = $null

function Register-ShutdownHandler {
    # Register a Ctrl+C handler using try/catch to avoid strict mode issues
    try {
        $script:ShutdownDelegate = [ConsoleCancelEventHandler]{
            param($sender, $e)
            $e.Cancel = $true
            $script:ShutdownRequested = $true
        }
        [Console]::add_CancelKeyPress($script:ShutdownDelegate)
    }
    catch {
        # Fallback: Ctrl+C will just kill the script (originals are still safe)
        Write-Log "Could not register Ctrl+C handler (non-fatal)" -Level "WARN"
    }
}

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
function Write-Log {
    param(
        [Parameter(Mandatory)][string]$Message,
        [ValidateSet("INFO", "WARN", "ERROR", "OK")][string]$Level = "INFO"
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) {
        "INFO"  { "Cyan" }
        "WARN"  { "Yellow" }
        "ERROR" { "Red" }
        "OK"    { "Green" }
    }
    Write-Host "[$timestamp] " -NoNewline -ForegroundColor DarkGray
    Write-Host "[$Level] " -NoNewline -ForegroundColor $color
    Write-Host $Message
}

# ---------------------------------------------------------------------------
# Startup banner
# ---------------------------------------------------------------------------
function Show-Banner {
    $banner = @"

    ================================================================
      Glacier Backup Manager - Gaming PC Transcode Worker
    ================================================================

      Server URL    : $ServerUrl
      NAS Path      : $NasPath
      Temp Dir      : $TempDir
      Poll Interval : ${PollInterval}s
      FFmpeg        : $FfmpegPath

    ================================================================

"@
    Write-Host $banner -ForegroundColor Cyan
}

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------
function Test-Prerequisites {
    # Verify ffmpeg is available
    Write-Log "Checking ffmpeg availability..."
    try {
        $prevPref = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $version = & $FfmpegPath -version 2>&1 | Select-Object -First 1
        $ErrorActionPreference = $prevPref
        Write-Log "ffmpeg found: $version" -Level "OK"
    }
    catch {
        Write-Log "ffmpeg not found at '$FfmpegPath'. Install ffmpeg or provide -FfmpegPath." -Level "ERROR"
        exit 1
    }

    # Verify NVENC support by checking for hevc_nvenc encoder
    Write-Log "Checking NVENC encoder support..."
    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $encoders = & $FfmpegPath -encoders 2>&1 | Select-String "hevc_nvenc"
    $ErrorActionPreference = $prevPref
    if ($encoders) {
        Write-Log "NVENC HEVC encoder available" -Level "OK"
    }
    else {
        Write-Log "hevc_nvenc not found. Ensure your ffmpeg build includes NVENC support." -Level "WARN"
    }

    # Create temp directory if needed
    if (-not (Test-Path $TempDir)) {
        New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
        Write-Log "Created temp directory: $TempDir" -Level "OK"
    }

    # Test server connectivity
    Write-Log "Testing server connectivity..."
    try {
        $response = Invoke-RestMethod -Uri "$ServerUrl/api/transcode" -Method Get -TimeoutSec 10
        $jobCount = if ($response -is [array]) { $response.Count } else { 0 }
        Write-Log "Server reachable. $jobCount total transcode job(s) in database." -Level "OK"
    }
    catch {
        Write-Log "Cannot reach server at $ServerUrl - $($_.Exception.Message)" -Level "ERROR"
        exit 1
    }

    # Test NAS accessibility
    Write-Log "Testing NAS path..."
    if (Test-Path $NasPath) {
        Write-Log "NAS path accessible: $NasPath" -Level "OK"
    }
    else {
        Write-Log "NAS path not accessible: $NasPath (jobs will fail until resolved)" -Level "WARN"
    }
}

# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------
function Get-NextJob {
    <#
    .SYNOPSIS
        Polls the server for the next available transcode job.
    .OUTPUTS
        Job object if available, $null otherwise.
    #>
    try {
        # Use Invoke-WebRequest instead of Invoke-RestMethod to get raw JSON,
        # then parse manually to avoid PowerShell strict mode issues with null properties
        $webResponse = Invoke-WebRequest -Uri "$ServerUrl/api/transcode/worker" -Method Get -TimeoutSec 15 -UseBasicParsing
        $body = $webResponse.Content

        # Server returns "null" when no jobs available
        if ([string]::IsNullOrWhiteSpace($body) -or $body.Trim() -eq "null") {
            return $null
        }

        $job = $body | ConvertFrom-Json
        if ($null -eq $job) {
            return $null
        }

        # Verify it has an id (it's a real job, not an error)
        $idProp = $job.PSObject.Properties.Match('id')
        if ($idProp.Count -eq 0) {
            return $null
        }

        return $job
    }
    catch {
        Write-Log "Error polling for jobs: $($_.Exception.Message)" -Level "WARN"
        return $null
    }
}

function Get-TranscodeProfiles {
    <#
    .SYNOPSIS
        Fetches all transcode profiles from the server.
    #>
    try {
        $profiles = Invoke-RestMethod -Uri "$ServerUrl/api/transcode/profiles" -Method Get -TimeoutSec 10
        return $profiles
    }
    catch {
        Write-Log "Error fetching transcode profiles: $($_.Exception.Message)" -Level "WARN"
        return $null
    }
}

function Send-JobUpdate {
    <#
    .SYNOPSIS
        Reports job status/progress back to the server.
    .PARAMETER JobId
        The transcode job ID.
    .PARAMETER Status
        One of: transcoding, completed, failed.
    .PARAMETER Progress
        Progress percentage (0-100). Used when Status is 'transcoding'.
    .PARAMETER OutputPath
        Path to the transcoded output file on the NAS. Used when Status is 'completed'.
    .PARAMETER TranscodedSize
        Size in bytes of the transcoded file. Used when Status is 'completed'.
    .PARAMETER ErrorMessage
        Error description. Used when Status is 'failed'.
    #>
    param(
        [Parameter(Mandatory)][int]$JobId,
        [Parameter(Mandatory)][string]$Status,
        [double]$Progress = 0,
        [string]$OutputPath = "",
        [long]$TranscodedSize = 0,
        [string]$ErrorMessage = ""
    )

    $body = @{
        id     = $JobId
        status = $Status
    }

    switch ($Status) {
        "transcoding" {
            $body.progress = [math]::Round($Progress, 1)
        }
        "completed" {
            $body.output_path = $OutputPath
            $body.transcoded_size = $TranscodedSize
        }
        "failed" {
            $body.error = $ErrorMessage
        }
    }

    try {
        $json = $body | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "$ServerUrl/api/transcode/worker" `
            -Method Post `
            -Body $json `
            -ContentType "application/json" `
            -TimeoutSec 10 | Out-Null
    }
    catch {
        Write-Log "Failed to send job update (id=$JobId, status=$Status): $($_.Exception.Message)" -Level "WARN"
    }
}

# ---------------------------------------------------------------------------
# Path conversion
# ---------------------------------------------------------------------------
function Convert-LinuxPathToSmb {
    <#
    .SYNOPSIS
        Converts a Linux NAS path to a Windows SMB path.
    .DESCRIPTION
        The server stores paths in Linux format (e.g., /mnt/user/noobnoob/Media/TV/...).
        This function strips the Linux prefix and prepends the Windows SMB share path.
    .EXAMPLE
        Convert-LinuxPathToSmb "/mnt/user/noobnoob/Media/TV/Show/episode.mkv"
        # Returns: \\192.168.3.188\noobnoob\Media\TV\Show\episode.mkv
    #>
    param([Parameter(Mandatory)][string]$LinuxPath)

    # Strip the /mnt/user/noobnoob prefix (or any /mnt/user/<share> prefix)
    $relativePath = $LinuxPath -replace "^/mnt/user/noobnoob/?", ""

    # Also handle /mnt/nas/ prefix (used in some configurations)
    $relativePath = $relativePath -replace "^/mnt/nas/?", ""

    # Convert forward slashes to backslashes
    $relativePath = $relativePath -replace "/", "\"

    # Combine with the Windows SMB path
    return Join-Path $NasPath $relativePath
}

function Convert-SmbPathToLinux {
    <#
    .SYNOPSIS
        Converts a Windows SMB path back to Linux NAS path format for the server.
    #>
    param([Parameter(Mandatory)][string]$SmbPath)

    # Strip the SMB prefix and convert backslashes to forward slashes
    $relativePath = $SmbPath
    # Normalize the NAS path for comparison (handle both \\ and single \)
    $nasPathNormalized = $NasPath.TrimEnd("\")
    if ($relativePath.StartsWith($nasPathNormalized, [StringComparison]::OrdinalIgnoreCase)) {
        $relativePath = $relativePath.Substring($nasPathNormalized.Length).TrimStart("\")
    }
    $relativePath = $relativePath -replace "\\", "/"

    return "/mnt/user/noobnoob/$relativePath"
}

# ---------------------------------------------------------------------------
# Output filename generation
# ---------------------------------------------------------------------------
function Get-OutputFileName {
    <#
    .SYNOPSIS
        Generates the output filename by inserting a codec suffix before the extension.
    .EXAMPLE
        Get-OutputFileName "episode.s01e01.mkv" "hevc"
        # Returns: episode.s01e01.hevc.mkv
    #>
    param(
        [Parameter(Mandatory)][string]$SourceFileName,
        [string]$CodecSuffix = "hevc"
    )

    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($SourceFileName)
    $extension = [System.IO.Path]::GetExtension($SourceFileName)
    return "${baseName}.${CodecSuffix}${extension}"
}

# ---------------------------------------------------------------------------
# FFmpeg transcoding with progress parsing
# ---------------------------------------------------------------------------
function Invoke-Transcode {
    <#
    .SYNOPSIS
        Runs ffmpeg to transcode a video file using NVENC and reports progress.
    .DESCRIPTION
        Launches ffmpeg as a background process, parses stderr for progress info,
        and periodically reports the progress percentage back to the server.
    .OUTPUTS
        $true on success, $false on failure.
    #>
    param(
        [Parameter(Mandatory)][string]$InputPath,
        [Parameter(Mandatory)][string]$OutputPath,
        [Parameter(Mandatory)][int]$JobId,
        [string]$Codec = "hevc",
        [string]$Preset = "p5",
        [int]$Cq = 22,
        [string]$ExtraArgs = ""
    )

    # Determine the encoder based on the codec
    $encoder = switch ($Codec.ToLower()) {
        "hevc"  { "hevc_nvenc" }
        "h265"  { "hevc_nvenc" }
        "av1"   { "av1_nvenc" }
        default { "hevc_nvenc" }
    }

    # Build the ffmpeg argument list
    $ffmpegArgs = @(
        "-y"                        # Overwrite output without asking
        "-i", $InputPath            # Input file
        "-c:v", $encoder            # Video codec (NVENC)
        "-preset", $Preset          # Encoding preset (p1-p7)
        "-cq", $Cq                  # Constant quality level
        "-c:a", "copy"              # Copy audio streams
        "-c:s", "copy"              # Copy subtitle streams
    )

    # Append any extra arguments from the profile
    if ($ExtraArgs -and $ExtraArgs.Trim()) {
        # If extra_args overrides the video codec (e.g., "-c:v av1_nvenc"), we need
        # to handle that. Extra args are appended after the base args, so ffmpeg
        # will use the last -c:v value specified.
        $extraParts = $ExtraArgs.Trim() -split "\s+"
        $ffmpegArgs += $extraParts
    }

    # Output file path
    $ffmpegArgs += $OutputPath

    Write-Log "Starting transcode: $encoder preset=$Preset cq=$Cq"
    Write-Log "Input:  $InputPath"
    Write-Log "Output: $OutputPath"

    # -------------------------------------------------------------------
    # First pass: probe the input duration so we can calculate progress
    # -------------------------------------------------------------------
    $totalDurationSeconds = 0
    try {
        $prevPref = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $probeOutput = & $FfmpegPath -i $InputPath 2>&1 | Out-String
        $ErrorActionPreference = $prevPref
        if ($probeOutput -match "Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})") {
            $totalDurationSeconds = [int]$Matches[1] * 3600 + [int]$Matches[2] * 60 + [int]$Matches[3] + [int]$Matches[4] / 100.0
            $durationFormatted = "{0:D2}:{1:D2}:{2:D2}" -f [int]$Matches[1], [int]$Matches[2], [int]$Matches[3]
            Write-Log "Source duration: $durationFormatted ($([math]::Round($totalDurationSeconds, 1))s)"
        }
    }
    catch {
        Write-Log "Could not probe input duration, progress will be estimated" -Level "WARN"
    }

    # -------------------------------------------------------------------
    # Run ffmpeg with stderr redirected to a temp file for progress parsing
    # -------------------------------------------------------------------
    $stderrFile = Join-Path $TempDir "ffmpeg-stderr-$JobId.log"

    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = $FfmpegPath
    $processInfo.Arguments = ($ffmpegArgs | ForEach-Object {
        # Quote arguments that contain spaces
        if ($_ -match "\s") { "`"$_`"" } else { $_ }
    }) -join " "
    $processInfo.UseShellExecute = $false
    $processInfo.RedirectStandardError = $true
    $processInfo.RedirectStandardOutput = $true
    $processInfo.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $processInfo

    # Use StringBuilder to accumulate stderr asynchronously
    $stderrBuilder = New-Object System.Text.StringBuilder
    $stderrEvent = Register-ObjectEvent -InputObject $process -EventName ErrorDataReceived -Action {
        if ($null -ne $EventArgs.Data) {
            $stderrBuilder.AppendLine($EventArgs.Data) | Out-Null
        }
    }

    try {
        $process.Start() | Out-Null
        $process.BeginErrorReadLine()

        $lastReportTime = [datetime]::MinValue
        $reportIntervalSeconds = 5
        $startTime = Get-Date

        # Poll for progress while ffmpeg is running
        while (-not $process.HasExited) {
            Start-Sleep -Milliseconds 500

            # Check for shutdown request
            if ($script:ShutdownRequested) {
                Write-Log "Shutdown requested - killing ffmpeg process..." -Level "WARN"
                $process.Kill()
                return $false
            }

            $now = Get-Date
            $elapsed = ($now - $lastReportTime).TotalSeconds

            if ($elapsed -ge $reportIntervalSeconds) {
                $stderrContent = $stderrBuilder.ToString()

                # Parse the most recent "time=" value from ffmpeg's stderr
                $currentSeconds = 0
                $timeMatches = [regex]::Matches($stderrContent, "time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})")
                if ($timeMatches.Count -gt 0) {
                    $lastMatch = $timeMatches[$timeMatches.Count - 1]
                    $currentSeconds = [int]$lastMatch.Groups[1].Value * 3600 +
                                      [int]$lastMatch.Groups[2].Value * 60 +
                                      [int]$lastMatch.Groups[3].Value +
                                      [int]$lastMatch.Groups[4].Value / 100.0
                }

                # Parse speed for display
                $speed = ""
                $speedMatches = [regex]::Matches($stderrContent, "speed=\s*([\d.]+x)")
                if ($speedMatches.Count -gt 0) {
                    $speed = $speedMatches[$speedMatches.Count - 1].Groups[1].Value
                }

                # Calculate and report progress
                if ($totalDurationSeconds -gt 0 -and $currentSeconds -gt 0) {
                    $progressPct = [math]::Min(99.9, ($currentSeconds / $totalDurationSeconds) * 100)
                    $elapsedTime = $now - $startTime
                    $etaSeconds = if ($progressPct -gt 0) {
                        ($elapsedTime.TotalSeconds / $progressPct) * (100 - $progressPct)
                    } else { 0 }
                    $etaFormatted = if ($etaSeconds -gt 0) {
                        $ts = [timespan]::FromSeconds([int]$etaSeconds)
                        "{0:D2}:{1:D2}:{2:D2}" -f $ts.Hours, $ts.Minutes, $ts.Seconds
                    } else { "calculating..." }

                    Write-Log ("Progress: {0:F1}% | Speed: {1} | ETA: {2}" -f $progressPct, $(if ($speed) { $speed } else { "N/A" }), $etaFormatted)
                    Send-JobUpdate -JobId $JobId -Status "transcoding" -Progress $progressPct
                }
                elseif ($currentSeconds -gt 0) {
                    # No total duration known, just report the current time position
                    Write-Log "Encoding position: $([math]::Round($currentSeconds, 0))s | Speed: $(if ($speed) { $speed } else { 'N/A' })"
                }

                $lastReportTime = $now
            }
        }

        # Wait for the process to fully exit and collect the exit code
        $process.WaitForExit()
        $exitCode = $process.ExitCode

        # Write the full stderr log for debugging
        $finalStderr = $stderrBuilder.ToString()
        Set-Content -Path $stderrFile -Value $finalStderr -Force

        if ($exitCode -eq 0) {
            Write-Log "ffmpeg completed successfully (exit code 0)" -Level "OK"
            return $true
        }
        else {
            # Extract the last few lines of stderr for the error message
            $stderrLines = $finalStderr -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 5
            $errorDetail = ($stderrLines -join " ").Trim()
            Write-Log "ffmpeg failed with exit code $exitCode" -Level "ERROR"
            Write-Log "ffmpeg stderr (last lines): $errorDetail" -Level "ERROR"
            return $false
        }
    }
    finally {
        Unregister-Event -SourceIdentifier $stderrEvent.Name -ErrorAction SilentlyContinue
        Remove-Job -Id $stderrEvent.Id -Force -ErrorAction SilentlyContinue
        if (-not $process.HasExited) {
            $process.Kill()
        }
        $process.Dispose()
    }
}

# ---------------------------------------------------------------------------
# Job processing
# ---------------------------------------------------------------------------
function Invoke-ProcessJob {
    <#
    .SYNOPSIS
        Processes a single transcode job from start to finish.
    #>
    param([Parameter(Mandatory)]$Job)

    $jobId = $Job.id
    $sourcePath = $Job.source_path
    $profileId = $Job.profile_id
    $script:CurrentJobId = $jobId

    Write-Log "============================================================"
    Write-Log "Processing job #$jobId"
    Write-Log "Source: $sourcePath"

    # ------------------------------------------------------------------
    # Step 1: Convert the Linux NAS path to a Windows SMB path
    # ------------------------------------------------------------------
    $smbSourcePath = Convert-LinuxPathToSmb $sourcePath
    Write-Log "SMB path: $smbSourcePath"

    if (-not (Test-Path $smbSourcePath)) {
        $errorMsg = "Source file not found: $smbSourcePath"
        Write-Log $errorMsg -Level "ERROR"
        Send-JobUpdate -JobId $jobId -Status "failed" -ErrorMessage $errorMsg
        return
    }

    # Get original file size for reporting
    $originalSize = (Get-Item $smbSourcePath).Length
    $originalSizeMB = [math]::Round($originalSize / 1MB, 1)
    Write-Log "Original file size: ${originalSizeMB} MB"

    # ------------------------------------------------------------------
    # Step 2: Determine transcode settings from the profile or defaults
    # ------------------------------------------------------------------
    $codec = "hevc"
    $preset = "p5"
    $cq = 22
    $extraArgs = ""
    $codecSuffix = "hevc"

    if ($profileId) {
        Write-Log "Loading transcode profile (id=$profileId)..."
        $profiles = Get-TranscodeProfiles
        if ($profiles) {
            $profile = $profiles | Where-Object { $_.id -eq $profileId } | Select-Object -First 1
            if ($profile) {
                $codec = $profile.codec
                $preset = $profile.preset
                $cq = $profile.cq
                $extraArgs = $profile.extra_args
                $codecSuffix = $codec.ToLower()
                Write-Log "Using profile '$($profile.name)': codec=$codec preset=$preset cq=$cq" -Level "OK"
            }
            else {
                Write-Log "Profile id=$profileId not found, using defaults" -Level "WARN"
            }
        }
        else {
            Write-Log "Could not fetch profiles, using defaults" -Level "WARN"
        }
    }
    else {
        Write-Log "No profile specified, using defaults: codec=$codec preset=$preset cq=$cq"
    }

    # ------------------------------------------------------------------
    # Step 3: Prepare output paths
    # ------------------------------------------------------------------
    $sourceFileName = [System.IO.Path]::GetFileName($smbSourcePath)
    $outputFileName = Get-OutputFileName -SourceFileName $sourceFileName -CodecSuffix $codecSuffix
    $tempOutputPath = Join-Path $TempDir $outputFileName
    $sourceDir = [System.IO.Path]::GetDirectoryName($smbSourcePath)
    $nasOutputPath = Join-Path $sourceDir $outputFileName

    Write-Log "Output filename: $outputFileName"

    # ------------------------------------------------------------------
    # Step 4: Report 'transcoding' status with 0% progress
    # ------------------------------------------------------------------
    Send-JobUpdate -JobId $jobId -Status "transcoding" -Progress 0

    # ------------------------------------------------------------------
    # Step 5: Run the transcode
    # ------------------------------------------------------------------
    $transcodeStartTime = Get-Date
    $success = Invoke-Transcode `
        -InputPath $smbSourcePath `
        -OutputPath $tempOutputPath `
        -JobId $jobId `
        -Codec $codec `
        -Preset $preset `
        -Cq $cq `
        -ExtraArgs $extraArgs

    $transcodeElapsed = (Get-Date) - $transcodeStartTime
    $elapsedFormatted = "{0:D2}:{1:D2}:{2:D2}" -f [int]$transcodeElapsed.TotalHours, $transcodeElapsed.Minutes, $transcodeElapsed.Seconds

    if ($success) {
        # ------------------------------------------------------------------
        # Step 6a: Success - copy output back to NAS and report completion
        # ------------------------------------------------------------------
        if (-not (Test-Path $tempOutputPath)) {
            $errorMsg = "Transcode reported success but output file not found: $tempOutputPath"
            Write-Log $errorMsg -Level "ERROR"
            Send-JobUpdate -JobId $jobId -Status "failed" -ErrorMessage $errorMsg
            return
        }

        $transcodedSize = (Get-Item $tempOutputPath).Length
        $transcodedSizeMB = [math]::Round($transcodedSize / 1MB, 1)
        $savingsPercent = if ($originalSize -gt 0) {
            [math]::Round((1 - $transcodedSize / $originalSize) * 100, 1)
        } else { 0 }

        Write-Log "Transcode completed in $elapsedFormatted" -Level "OK"
        Write-Log "Output size: ${transcodedSizeMB} MB (${savingsPercent}% savings)" -Level "OK"

        # Copy output to NAS
        Write-Log "Copying output to NAS: $nasOutputPath"
        try {
            Copy-Item -Path $tempOutputPath -Destination $nasOutputPath -Force
            Write-Log "File copied to NAS successfully" -Level "OK"
        }
        catch {
            $errorMsg = "Failed to copy output to NAS: $($_.Exception.Message)"
            Write-Log $errorMsg -Level "ERROR"
            Send-JobUpdate -JobId $jobId -Status "failed" -ErrorMessage $errorMsg
            # Clean up temp file
            Remove-Item -Path $tempOutputPath -Force -ErrorAction SilentlyContinue
            return
        }

        # Convert the NAS output path back to Linux format for the server
        $linuxOutputPath = Convert-SmbPathToLinux $nasOutputPath

        # Report completion to the server
        Send-JobUpdate -JobId $jobId -Status "completed" -OutputPath $linuxOutputPath -TranscodedSize $transcodedSize
        Write-Log "Job #$jobId completed successfully" -Level "OK"

        # Clean up temp file
        Remove-Item -Path $tempOutputPath -Force -ErrorAction SilentlyContinue
        Write-Log "Temp file cleaned up"
    }
    else {
        # ------------------------------------------------------------------
        # Step 6b: Failure - report error and clean up
        # ------------------------------------------------------------------
        $stderrFile = Join-Path $TempDir "ffmpeg-stderr-$jobId.log"
        $errorDetail = "ffmpeg transcode failed"
        if (Test-Path $stderrFile) {
            $stderrContent = Get-Content $stderrFile -Tail 10 -ErrorAction SilentlyContinue
            if ($stderrContent) {
                $errorDetail = ($stderrContent | Where-Object { $_.Trim() } | Select-Object -Last 3) -join " | "
            }
            # Keep the stderr log for debugging but don't let it accumulate forever
        }

        if ($script:ShutdownRequested) {
            $errorDetail = "Worker shutdown requested during transcode"
        }

        Write-Log "Job #$jobId failed after $elapsedFormatted" -Level "ERROR"
        Send-JobUpdate -JobId $jobId -Status "failed" -ErrorMessage $errorDetail

        # Clean up temp output file if it exists
        if (Test-Path $tempOutputPath) {
            Remove-Item -Path $tempOutputPath -Force -ErrorAction SilentlyContinue
            Write-Log "Temp file cleaned up"
        }
    }

    $script:CurrentJobId = $null
    Write-Log "============================================================"
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
function Start-Worker {
    Show-Banner
    Test-Prerequisites
    Register-ShutdownHandler

    Write-Log "Worker started. Polling for jobs every ${PollInterval}s. Press Ctrl+C to stop." -Level "OK"
    Write-Host ""

    $jobsCompleted = 0
    $jobsFailed = 0

    while (-not $script:ShutdownRequested) {
        try {
            # Poll for the next available job
            $job = Get-NextJob

            if ($null -eq $job) {
                # No job available - wait and retry
                # Use a loop of short sleeps so we can respond to Ctrl+C promptly
                $waited = 0
                while ($waited -lt $PollInterval -and -not $script:ShutdownRequested) {
                    Start-Sleep -Seconds 1
                    $waited++
                }
                continue
            }

            # Process the job
            Write-Log "Job received: #$($job.id) - $($job.source_path)" -Level "OK"

            try {
                Invoke-ProcessJob -Job $job
                if (-not $script:ShutdownRequested) {
                    $jobsCompleted++
                }
            }
            catch {
                $jobsFailed++
                $errorMsg = $_.Exception.Message
                Write-Log "Unhandled error processing job #$($job.id): $errorMsg" -Level "ERROR"
                Write-Log $_.ScriptStackTrace -Level "ERROR"

                # Try to report the failure to the server
                try {
                    Send-JobUpdate -JobId $job.id -Status "failed" -ErrorMessage "Worker error: $errorMsg"
                }
                catch {
                    Write-Log "Could not report failure to server" -Level "WARN"
                }
            }
        }
        catch {
            # Catch errors in the main loop itself (e.g., network issues during polling)
            Write-Log "Error in main loop: $($_.Exception.Message)" -Level "ERROR"
            Start-Sleep -Seconds $PollInterval
        }
    }

    # Shutdown summary
    Write-Log ""
    Write-Log "================================================================"
    Write-Log "Worker shutting down gracefully"
    Write-Log "  Jobs completed: $jobsCompleted"
    Write-Log "  Jobs failed:    $jobsFailed"
    Write-Log "================================================================"
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
Start-Worker
