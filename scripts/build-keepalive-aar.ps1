param(
  [switch]$Clean
)

$ErrorActionPreference = 'Stop'

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PluginAndroid = Join-Path $ProjectRoot 'nativeplugins\MinechatKeepAlive\android'
$CacheRoot = Join-Path $ProjectRoot '.cache\keepalive-aar'
$SdkRoot = Join-Path $CacheRoot 'android-sdk'
$GradleRoot = Join-Path $CacheRoot 'gradle'

Ensure-Dir $CacheRoot
Ensure-Dir $SdkRoot
Ensure-Dir $GradleRoot

$GradleVersion = '8.5'
$GradleZip = Join-Path $GradleRoot "gradle-$GradleVersion-bin.zip"
$GradleHome = Join-Path $GradleRoot "gradle-$GradleVersion"
$GradleBin = Join-Path $GradleHome 'bin\gradle.bat'
$GradleUrl = "https://services.gradle.org/distributions/gradle-$GradleVersion-bin.zip"

$CmdlineToolsZip = Join-Path $SdkRoot 'cmdline-tools.zip'
# 说明：此版本号可能随 Google 更新而变化；如果下载失败，替换为最新的 commandlinetools-win-*_latest.zip
$CmdlineToolsUrl = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'
$CmdlineToolsDir = Join-Path $SdkRoot 'cmdline-tools\latest'
$SdkManager = Join-Path $CmdlineToolsDir 'bin\sdkmanager.bat'

function Invoke-SdkManager([string[]]$SdkManagerArgs) {
  if (-not (Test-Path $SdkManager)) {
    throw "sdkmanager not found: $SdkManager"
  }

  # 注意：Windows PowerShell 5.1 会把原生命令的 stderr 行转换为 ErrorRecord（NativeCommandError）。
  # 由于脚本全局设置了 $ErrorActionPreference='Stop'，sdkmanager 即使成功也可能因为输出到 stderr 而被中断。
  # 所以这里使用 cmd.exe 来执行并用管道喂 y，避免 PowerShell 的 stderr->ErrorRecord 行为。
  # 这里的参数本身不包含空格（platforms;android-33 等），无需逐个再加引号
  $joinedArgs = ($SdkManagerArgs -join ' ')
  # 直接生成给 cmd.exe /c 使用的命令行："path\sdkmanager.bat" args...
  # 说明：sdkmanager 可能会连续询问多个 license，需要持续输入 y。
  $cmd = ('(for /l %i in (1,1,200) do @echo y) | "{0}" {1}' -f $SdkManager, $joinedArgs)

  # Windows PowerShell 5.1 会把原生命令的 stderr 转成 ErrorRecord。
  # 全局 ErrorActionPreference=Stop 会导致这里提前终止，所以临时降级为 Continue。
  $oldEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = cmd.exe /d /c $cmd 2>&1
  } finally {
    $ErrorActionPreference = $oldEap
  }

  if ($LASTEXITCODE -ne 0) {
    throw ("sdkmanager failed (exit=$LASTEXITCODE). Command: {0}`n{1}" -f $cmd, ($output | Out-String))
  }

  return $output
}

if (-not (Test-Path $GradleBin)) {
  Write-Host "Downloading Gradle $GradleVersion..." -ForegroundColor Cyan
  Invoke-WebRequest -Uri $GradleUrl -OutFile $GradleZip
  Expand-Archive -Path $GradleZip -DestinationPath $GradleRoot -Force
}

if (-not (Test-Path $SdkManager)) {
  Write-Host 'Downloading Android cmdline-tools...' -ForegroundColor Cyan
  Invoke-WebRequest -Uri $CmdlineToolsUrl -OutFile $CmdlineToolsZip

  $TmpExtract = Join-Path $SdkRoot '_tmp_cmdline'
  if (Test-Path $TmpExtract) { Remove-Item -Recurse -Force $TmpExtract }
  Ensure-Dir $TmpExtract
  Expand-Archive -Path $CmdlineToolsZip -DestinationPath $TmpExtract -Force

  # zip 内层一般是 cmdline-tools/，需要移动到 cmdline-tools/latest
  if (Test-Path (Join-Path $TmpExtract 'cmdline-tools')) {
    Ensure-Dir (Split-Path $CmdlineToolsDir -Parent)
    if (Test-Path $CmdlineToolsDir) { Remove-Item -Recurse -Force $CmdlineToolsDir }
    Move-Item -Path (Join-Path $TmpExtract 'cmdline-tools') -Destination $CmdlineToolsDir
  } else {
    throw "Unexpected cmdline-tools zip layout at $TmpExtract"
  }

  Remove-Item -Recurse -Force $TmpExtract
}

# 写入 local.properties，指向自动下载的 SDK
$LocalProps = Join-Path $PluginAndroid 'local.properties'
"sdk.dir=$($SdkRoot -replace '\\','\\\\')" | Out-File -FilePath $LocalProps -Encoding ascii -Force

$env:ANDROID_SDK_ROOT = $SdkRoot
$env:ANDROID_HOME = $SdkRoot

# 安装必须的 SDK 组件（首次会比较慢）
Write-Host 'Installing Android SDK packages (once)...' -ForegroundColor Cyan
$packages = @(
  'platform-tools',
  'platforms;android-33',
  # AGP 8.x 默认会要求 34.x build-tools（即使 compileSdk=33），这里显式安装避免下载/许可问题
  'build-tools;34.0.0'
)

foreach ($p in $packages) {
  Invoke-SdkManager @("--sdk_root=$SdkRoot", $p) | Out-Null
}
Invoke-SdkManager @("--sdk_root=$SdkRoot", '--licenses') | Out-Null

Push-Location $PluginAndroid
try {
  if ($Clean) {
    & $GradleBin 'clean'
  }

  Write-Host 'Building MinechatKeepAlive AAR...' -ForegroundColor Cyan
  & $GradleBin '--no-daemon' 'assembleRelease'
  if ($LASTEXITCODE -ne 0) {
    throw "Gradle build failed (exit=$LASTEXITCODE). See output above."
  }

  $AarDir = Join-Path $PluginAndroid 'build\outputs\aar'
  # 某些环境/AGP 版本输出路径可能变化，优先在 build\outputs 下递归找
  $SearchRoot = if (Test-Path (Join-Path $PluginAndroid 'build\outputs')) { Join-Path $PluginAndroid 'build\outputs' } else { Join-Path $PluginAndroid 'build' }
  $Aar = Get-ChildItem -Path $SearchRoot -Recurse -Filter '*.aar' -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'release' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $Aar) {
    throw "AAR not found under: $SearchRoot"
  }

  $Dest = Join-Path $PluginAndroid 'MinechatKeepAlive.aar'
  Copy-Item -Path $Aar.FullName -Destination $Dest -Force
  Write-Host "OK: $Dest" -ForegroundColor Green
} finally {
  Pop-Location
}
