@echo off
cd /d "%~dp0"

REM Kontrollera forst att GitHub inte har arbete vi saknar. Utan detta
REM avvisas pushen och man tror latt att allt gick bra.
echo Hamtar senaste fran GitHub...
git fetch origin
if errorlevel 1 (
  echo.
  echo Kunde inte kontakta GitHub. Kontrollera natverket.
  pause
  exit /b 1
)

for /f %%i in ('git rev-list --count HEAD..origin/main') do set BEHIND=%%i
if not "%BEHIND%"=="0" (
  echo.
  echo *** STOPP: GitHub har %BEHIND% commit^(s^) som du saknar lokalt. ***
  echo.
  echo Pushen skulle avvisas. Kor detta forst:
  echo     git pull origin main
  echo och losa eventuella konflikter.
  pause
  exit /b 1
)

git add -A
git diff --cached --quiet && (echo Inga andringar att pusha. & pause & exit /b 0)

echo.
echo Foljande filer pushas:
git diff --cached --name-only
echo.

git commit -m "Uppdaterade filer"
if errorlevel 1 (
  echo.
  echo Commit misslyckades. GitHub uppdaterades INTE.
  pause
  exit /b 1
)

git push origin main
if errorlevel 1 (
  echo.
  echo *** PUSH MISSLYCKADES - GitHub uppdaterades INTE. ***
  echo Las felmeddelandet ovan.
  pause
  exit /b 1
)

echo.
echo Klart! GitHub ar nu uppdaterat.
pause
