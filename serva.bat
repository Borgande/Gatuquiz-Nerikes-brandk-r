@echo off
cd /d "%~dp0"
echo Startar lokal server pa http://localhost:8000
echo Stang det har fonstret for att stoppa servern.
echo.
start "" http://localhost:8000/index.html
py -m http.server 8000
pause
