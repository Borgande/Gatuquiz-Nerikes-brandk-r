@echo off
cd /d "%~dp0"
git add areas.geojson index.html
git diff --cached --quiet && (echo Inga ändringar att pusha. & pause & exit)
git commit -m "Uppdaterade filer"
git push origin main
echo.
echo Klart! GitHub är nu uppdaterat.
pause
