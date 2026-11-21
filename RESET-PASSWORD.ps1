$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$env:NO_COLOR = '1'
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $project
$Host.UI.RawUI.WindowTitle = 'إعادة تعيين كلمة المرور — برنامج الأملاك'
Write-Host ''
Write-Host '=== إعادة تعيين كلمة المرور ===' -ForegroundColor Cyan
Write-Host 'تتغير كلمة المرور فقط. كل البيانات (العقارات والعقود والسندات...) تبقى كما هي.' -ForegroundColor Gray
Write-Host ''
try {
  # إيقاف البرنامج فقط (العملية التي تشغّل المنفذ 3000) — قاعدة البيانات لا تقبل اتصالين في نفس الوقت
  $conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  $wasRunning = $false
  if ($conn) {
    $wasRunning = $true
    Write-Host 'إيقاف البرنامج مؤقتاً...' -ForegroundColor Yellow
    foreach ($c in @($conn)) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 3
  }
  & node RESET-PASSWORD.cjs --list
  Write-Host ''
  $user = Read-Host 'اسم المستخدم (اضغط Enter لـ admin)'
  if ([string]::IsNullOrWhiteSpace($user)) { $user = 'admin' }
  while ($true) {
    $p1 = Read-Host 'كلمة المرور الجديدة (8 أحرف على الأقل)' -AsSecureString
    $p2 = Read-Host 'أعد كتابة كلمة المرور' -AsSecureString
    $a = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p1))
    $b = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p2))
    if ($a.Length -lt 8) { Write-Host 'كلمة المرور أقصر من 8 أحرف. أعد المحاولة.' -ForegroundColor Red; continue }
    if ($a -ne $b) { Write-Host 'كلمتا المرور غير متطابقتين. أعد المحاولة.' -ForegroundColor Red; continue }
    break
  }
  $env:AMLAK_NEW_PASS = $a
  & node RESET-PASSWORD.cjs $user
  $code = $LASTEXITCODE
  Remove-Item Env:\AMLAK_NEW_PASS -ErrorAction SilentlyContinue
  if ($code -ne 0) { throw 'لم يتم التغيير. راجع الرسالة أعلاه.' }
  Write-Host ''
  Write-Host "تم. ادخل الآن باسم المستخدم $user وكلمة المرور الجديدة." -ForegroundColor Green
  if ($wasRunning -or -not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
    Write-Host 'تشغيل البرنامج...' -ForegroundColor Cyan
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'start.bat' -WorkingDirectory $project
    Start-Sleep -Seconds 8
    Start-Process 'http://localhost:3000/login'
  }
} catch {
  Write-Host ''
  Write-Host ('خطأ: ' + $_.Exception.Message) -ForegroundColor Red
}
Write-Host ''
Read-Host 'اضغط Enter لإغلاق النافذة'
