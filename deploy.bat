@echo off
chcp 65001 >nul
title Deploy - Clickup Dashboard

echo.
echo =========================================================
echo   DEPLOY - Clickup Dashboard Production
echo =========================================================
echo.

:: ── Pastikan di direktori yang benar ─────────────────────
cd /d "%~dp0"

:: ── Cek ada perubahan yang belum di-commit ───────────────
git diff --quiet --exit-code
if errorlevel 1 (
    echo   [!] Ada perubahan yang belum di-commit.
    set /p CONFIRM="   Lanjut push tanpa commit perubahan ini? (y/N): "
    if /i not "%CONFIRM%"=="y" (
        echo   Dibatalkan. Silakan commit dulu lalu jalankan deploy.bat lagi.
        pause
        exit /b 1
    )
)

:: ── Git push ─────────────────────────────────────────────
echo   [1/5] Git push ke origin master...
git push origin master
if errorlevel 1 (
    echo   [!!] Git push GAGAL. Cek koneksi atau conflict.
    pause
    exit /b 1
)
echo   [OK] Push berhasil.
echo.

:: ── Cek Python tersedia ───────────────────────────────────
echo   [2/5] Cek Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo   [!!] Python tidak ditemukan. Install Python dulu.
    pause
    exit /b 1
)

:: ── Cek Paramiko tersedia ────────────────────────────────
echo   [3/5] Cek Paramiko...
python -c "import paramiko" >nul 2>&1
if errorlevel 1 (
    echo   [!] Paramiko belum ada, installing...
    pip install paramiko --quiet
    if errorlevel 1 (
        echo   [!!] Gagal install paramiko.
        pause
        exit /b 1
    )
)

:: ── Deploy ke server ─────────────────────────────────────
echo   [4/5] Deploy ke server production...
echo.
python -X utf8 "%~dp0deploy.py"
if errorlevel 1 (
    echo.
    echo   [!!] Deploy GAGAL. Lihat error di atas.
    pause
    exit /b 1
)

echo   [5/5] Selesai!
echo.
pause
