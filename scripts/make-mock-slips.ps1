# Generate mock order slips for the live AI read check.
#
#   powershell -ExecutionPolicy Bypass -File scripts/make-mock-slips.ps1
#
# Writes fixtures/slips/mock-*.jpg (gitignored — these are images, not source).
#
# These are MOCKS, not Dad's handwriting. They exist so the live API contract
# (model id, response_format dialect, image part shape, token ceiling) can be
# proved without waiting on photos. Real handwriting is TESTING.md §2 and needs
# Siva. A pass here says the pipeline works; it says nothing about whether the
# model can read a real slip.
#
# Rendered at 1200x1600 and saved as JPEG q85 — the same shape and quality
# `prepareImage` produces after downscaling a phone photo to maxEdge 1600, so
# the bytes the model sees resemble the bytes Dad's photo becomes.

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$out  = Join-Path $root 'fixtures\slips'
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out -Force | Out-Null }

$W = 1200
$H = 1600

function Save-Jpeg($bitmap, $path, $quality) {
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $ps = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ps.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([int]$quality)
  $bitmap.Save($path, $codec, $ps)
}

function New-Slip($path, $titleFontName, $bodyFontName, $lines, $title, $subtitle) {
  $bmp = New-Object System.Drawing.Bitmap $W, $H
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  # Off-white paper rather than pure white — a photographed slip never is.
  $paper = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(250, 248, 241))
  $g.FillRectangle($paper, 0, 0, $W, $H)

  # Faint ruled lines, like a notebook page.
  $rule = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(60, 120, 150, 190)), 2
  for ($y = 300; $y -lt $H - 80; $y += 110) { $g.DrawLine($rule, 70, $y, $W - 70, $y) }

  # A degree of tilt: the page is never square to the camera.
  $g.TranslateTransform(($W / 2), ($H / 2))
  $g.RotateTransform(-1.2)
  $g.TranslateTransform(-($W / 2), -($H / 2))

  $ink   = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(28, 42, 90))
  $titleFont = New-Object System.Drawing.Font $titleFontName, 40, ([System.Drawing.FontStyle]::Bold)
  $subFont   = New-Object System.Drawing.Font $bodyFontName, 26
  $bodyFont  = New-Object System.Drawing.Font $bodyFontName, 32

  $g.DrawString($title, $titleFont, $ink, 90, 90)
  $g.DrawString($subtitle, $subFont, $ink, 90, 175)

  $y = 285
  foreach ($ln in $lines) {
    $g.DrawString($ln[0], $bodyFont, $ink, 90, $y)          # sl.no + item name
    $g.DrawString($ln[1], $bodyFont, $ink, 760, $y)         # qty
    $g.DrawString($ln[2], $bodyFont, $ink, 950, $y)         # rate
    $y += 110
  }

  Save-Jpeg $bmp $path 85
  $g.Dispose(); $bmp.Dispose()
  Write-Output ("{0}  ({1:N0} bytes)" -f $path, (Get-Item $path).Length)
}

# --- Slip A: English, handwriting font -------------------------------------
# Row 3 deliberately carries BOTH a unit rate and a line total, to test the
# prompt's "the smaller one is usually the unit rate" instruction.
$english = @(
  @('1) Wire 1.5sq Finolex', '6 no',  '1650'),
  @('2) MCB 32A DP',         '4 no',  '450'),
  @('3) Switch 6A modular',  '25 no', '95   = 2375'),
  @('4) PVC conduit 25mm',   '30 mtr','48'),
  @('5) Copper lug 35mm',    '12 no', '125'),
  @('6) Fan box deep',       '8 no',  '70')
)
New-Slip (Join-Path $out 'mock-english.jpg') 'Ink Free' 'Ink Free' $english `
  'Sri Balaji Electricals' 'Order  -  dt. 12/08/26'

# --- Slip B: Telugu item names ---------------------------------------------
# Ink Free has no Telugu glyphs; Nirmala UI is Windows' Indic face.
$telugu = @(
  @('1) వైర్ 1.5sq',      '5 no',  '1650'),
  @('2) స్విచ్ 6A',        '3 no',  '240'),
  @('3) ఎంసిబి 32A',      '10 no', '450'),
  @('4) పైపు 25mm',       '20 mtr','48'),
  @('5) ఫ్యాన్ బాక్స్',      '8 no',  '70')
)
New-Slip (Join-Path $out 'mock-telugu.jpg') 'Nirmala UI' 'Nirmala UI' $telugu `
  'శ్రీ బాలాజీ ఎలక్ట్రికల్స్' 'ఆర్డర్  -  తే. 12/08/26'
