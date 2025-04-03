@echo off
echo ==============================
echo VIBES Network Visualizer Setup
echo ==============================
echo.
echo This script will launch WSL and install all prerequisites for the VIBES project.
echo.
echo Requirements:
echo - Windows Subsystem for Linux (WSL) must be installed
echo - Ubuntu or similar distribution should be installed in WSL
echo.
echo If you don't have WSL installed, please follow these steps:
echo 1. Open PowerShell as Administrator
echo 2. Run: wsl --install
echo 3. Restart your computer
echo 4. Run this script again
echo.
pause

REM Check if WSL is available
wsl -l -v > nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: WSL doesn't seem to be installed or configured correctly.
  echo Please install WSL first, then run this script again.
  pause
  exit /b 1
)

echo Launching WSL to run the installation script...
echo.

REM Get the directory of the current script
set SCRIPT_DIR=%~dp0
set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

REM Convert Windows path to WSL path format
set WSL_PATH=%SCRIPT_DIR:\=/%
set WSL_PATH=%WSL_PATH::=%
set WSL_PATH=/mnt/%WSL_PATH%

REM Launch WSL and run the installer
wsl -e bash -c "cd %WSL_PATH% && if [ -f ./install_prereqs.sh ]; then chmod +x ./install_prereqs.sh && ./install_prereqs.sh; else echo 'ERROR: install_prereqs.sh not found in the current directory'; fi"

echo.
echo Installation process completed.
echo If there were any errors, please check the TROUBLESHOOTING.md file for solutions.
echo.
pause 