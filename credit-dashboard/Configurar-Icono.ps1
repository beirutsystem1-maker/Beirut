Add-Type -AssemblyName System.Drawing

$PngSource = 'c:\Users\nauze\OneDrive\Documentos\Antigravity\Beirut\beirut_icon.png'
$IcoPath = 'c:\Users\nauze\OneDrive\Documentos\Antigravity\Beirut\beirut_icon.ico'
$BatPath = 'c:\Users\nauze\OneDrive\Documentos\Antigravity\Beirut\Iniciar-Beirut.bat'
$ShortcutPath = 'c:\Users\nauze\OneDrive\Documentos\Antigravity\Beirut\Iniciar Beirut.lnk'

Write-Host ''
Write-Host '  Convirtiendo PNG a ICO...' -ForegroundColor Cyan

try {
    $png = [System.Drawing.Image]::FromFile($PngSource)
    $bitmap = New-Object System.Drawing.Bitmap($png)
    $hIcon = $bitmap.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($hIcon)
    $fs = [System.IO.File]::Create($IcoPath)
    $icon.Save($fs)
    $fs.Close()
    $icon.Dispose()
    $bitmap.Dispose()
    $png.Dispose()
    Write-Host '  [OK] beirut_icon.ico creado' -ForegroundColor Green
}
catch {
    Write-Host "  [WARN] No se pudo crear el ICO: $_" -ForegroundColor Yellow
    $IcoPath = $null
}

Write-Host '  Creando acceso directo...' -ForegroundColor Cyan

$WS = New-Object -ComObject WScript.Shell
$lnk = $WS.CreateShortcut($ShortcutPath)
$lnk.TargetPath = $BatPath
$lnk.WorkingDirectory = 'c:\Users\nauze\OneDrive\Documentos\Antigravity\Beirut'
$lnk.Description = 'Iniciar Sistema Beirut - Control de Creditos'
$lnk.WindowStyle = 1

if ($IcoPath -and (Test-Path $IcoPath)) {
    $lnk.IconLocation = "$IcoPath,0"
    Write-Host '  [OK] Icono personalizado asignado' -ForegroundColor Green
}

$lnk.Save()

Write-Host ''
Write-Host '  Listo! El acceso directo "Iniciar Beirut.lnk" ha sido creado.' -ForegroundColor White
Write-Host '  Haz doble clic en el para arrancar el sistema.' -ForegroundColor Gray
Write-Host ''
