@echo off
cd /d "%~dp0"
git add -A
git diff --cached --quiet && (echo Inga ändringar att pusha. & pause & exit)
echo.
echo Följande filer pushas:
git diff --cached --name-status
echo.
git commit -m "Uppdaterade filer"
git push origin main
echo.
echo Klart! GitHub är nu uppdaterat.
pause
