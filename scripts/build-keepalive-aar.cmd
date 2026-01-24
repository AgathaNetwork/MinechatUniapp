@echo off
setlocal

REM Windows wrapper to avoid PowerShell execution-policy issues when invoking npm from PowerShell.
REM Usage:
REM   scripts\build-keepalive-aar.cmd
REM   scripts\build-keepalive-aar.cmd -Clean

powershell -ExecutionPolicy Bypass -File "%~dp0build-keepalive-aar.ps1" %*

endlocal
