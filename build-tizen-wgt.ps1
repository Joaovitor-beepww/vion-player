$ErrorActionPreference = "Stop"
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "    VION PLAYER - GERADOR DE PACOTE SAMSUNG TIZEN"      -ForegroundColor Cyan
Write-Host "       Formato: .wgt (Tizen Web Widget) & USB"         -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$srcWeb      = "C:\Users\Windows10\Desktop\player-tv"
$tempBuild   = "$srcWeb\build-tizen"
$finalWgt    = "C:\Users\Windows10\Desktop\vion-player.wgt"
$usbDir      = "C:\Users\Windows10\Desktop\SAMSUNG_USB\user_widget"
$finalUsbWgt = "$usbDir\vion-player.wgt"

Write-Host "[1/4] Limpando ambiente temporario..." -ForegroundColor Yellow
if (Test-Path $tempBuild) {
    Remove-Item $tempBuild -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $tempBuild | Out-Null
New-Item -ItemType Directory -Force -Path "$tempBuild\css" | Out-Null
New-Item -ItemType Directory -Force -Path "$tempBuild\js" | Out-Null

Write-Host "[2/4] Copiando arquivos e gerando assinatura digital (author-signature.xml)..." -ForegroundColor Yellow
& node "$srcWeb\sign-tizen-wgt.js"
Copy-Item "$srcWeb\config.xml" "$tempBuild\config.xml" -Force
Copy-Item "$srcWeb\index.html" "$tempBuild\index.html" -Force
Copy-Item "$srcWeb\icon.png" "$tempBuild\icon.png" -Force
Copy-Item "$srcWeb\logo.png" "$tempBuild\logo.png" -Force
Copy-Item "$srcWeb\author-signature.xml" "$tempBuild\author-signature.xml" -Force
Copy-Item "$srcWeb\css\*" "$tempBuild\css\" -Recurse -Force
Copy-Item "$srcWeb\js\*" "$tempBuild\js\" -Recurse -Force

Write-Host "[3/4] Compactando pacote .wgt (Tizen Web Widget)..." -ForegroundColor Yellow
if (Test-Path $finalWgt) { Remove-Item $finalWgt -Force }

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempBuild, $finalWgt, [System.IO.Compression.CompressionLevel]::Optimal, $false)

Write-Host "[4/4] Gerando estrutura de Pendrive USB (pasta user_widget)..." -ForegroundColor Yellow
if (Test-Path $usbDir) {
    Remove-Item $usbDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $usbDir | Out-Null
Copy-Item $finalWgt $finalUsbWgt -Force

# Limpa temporarios
Remove-Item $tempBuild -Recurse -Force

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  [SUCESSO] PACOTE SAMSUNG TIZEN GERADO COM SUCESSO!"     -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  1. Pacote para Samsung Seller Office:"
Write-Host "     $finalWgt" -ForegroundColor Cyan
Write-Host ""
Write-Host "  2. Pasta para Instalação via Pendrive (Sideload USB):"
Write-Host "     C:\Users\Windows10\Desktop\SAMSUNG_USB" -ForegroundColor Cyan
Write-Host "     (Basta copiar a pasta 'user_widget' para a raiz de um pendrive FAT32!)" -ForegroundColor Gray
Write-Host "========================================================" -ForegroundColor Green
