# Turn the raw slip images into what the APP would actually upload.
#
#   powershell -ExecutionPolicy Bypass -File scripts/prepare-slips.ps1
#
# Writes fixtures/slips/prepared/*.jpg — the input for
# scripts/openrouter-live-check.ts.
#
# WHY THIS EXISTS. `src/readImage.ts` never uploads the file Dad picked. It
# downscales the long edge to appConfig.image.maxEdge (1600) and re-encodes as
# JPEG at appConfig.image.jpegQuality (0.85), because a 12MP phone photo is an
# ~8MB base64 POST. Feeding the live check a full-size PNG would test an image
# the model will never be sent — and would quietly hide any accuracy the
# downscale costs. So this mimics `prepareImage` before anything is read.
#
# It also splits the one image that holds three pages side by side into three
# separate files, because PI-8 reads pages SEQUENTIALLY, one call each, and a
# single wide image would test the opposite of that.
#
# THE MANIFEST IS BY FILENAME and those names came from the tool that made them.
# If the fixtures are replaced, update this list; anything missing is skipped
# with a warning rather than failing the run.

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root 'fixtures\slips'
$out  = Join-Path $src  'prepared'
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out -Force | Out-Null }

# Matches config/app.config.ts -> image.maxEdge / image.jpegQuality
$MAX_EDGE = 1600
$QUALITY  = 85

function Save-Jpeg($bitmap, $path) {
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $ps = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ps.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([int]$QUALITY)
  $bitmap.Save($path, $codec, $ps)
}

# The same maths as `fitWithin` in src/readImage.ts: scale by the longest edge,
# and never enlarge an image that is already small enough.
function Convert-Slip($inPath, $outName, $cropFraction, $cropIndex) {
  if (-not (Test-Path $inPath)) {
    Write-Warning "missing: $inPath"
    return
  }
  $img = [System.Drawing.Image]::FromFile($inPath)

  $sx = 0; $sw = $img.Width
  if ($cropFraction -gt 0) {
    $sw = [int]($img.Width * $cropFraction)
    $sx = [int]($sw * $cropIndex)
  }
  $sh = $img.Height

  $longest = [Math]::Max($sw, $sh)
  $scale = 1.0
  if ($longest -gt $MAX_EDGE) { $scale = $MAX_EDGE / $longest }
  $w = [Math]::Max(1, [int][Math]::Round($sw * $scale))
  $h = [Math]::Max(1, [int][Math]::Round($sh * $scale))

  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $w, $h),
                     (New-Object System.Drawing.Rectangle $sx, 0, $sw, $sh),
                     [System.Drawing.GraphicsUnit]::Pixel)

  $dest = Join-Path $out $outName
  Save-Jpeg $bmp $dest
  Write-Output ("{0,-22} {1}x{2}  {3:N0} KB" -f $outName, $w, $h, ((Get-Item $dest).Length / 1KB))

  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
}

$clean    = Join-Path $src 'ChatGPT Image Aug 12, 2026, 08_34_34 AM.png'
$messy    = Join-Path $src 'ChatGPT Image Aug 12, 2026, 08_36_06 AM.png'
$crumpled = Join-Path $src 'ChatGPT Image Aug 12, 2026, 08_40_12 AM.png'
$threeUp  = Join-Path $src 'ChatGPT Image Aug 12, 2026, 08_44_22 AM.png'
$telugu   = Join-Path $src 'ChatGPT Image Aug 12, 2026, 08_57_15 AM.png'

Convert-Slip $clean    'real-clean.jpg'      0 0
Convert-Slip $messy    'real-messy.jpg'      0 0
Convert-Slip $crumpled 'real-crumpled.jpg'   0 0
Convert-Slip $telugu   'real-telugu.jpg'     0 0

# Three pages photographed side by side in one frame — split into the three
# separate photos Dad would actually take.
Convert-Slip $threeUp 'real-page1.jpg' (1/3) 0
Convert-Slip $threeUp 'real-page2.jpg' (1/3) 1
Convert-Slip $threeUp 'real-page3.jpg' (1/3) 2
