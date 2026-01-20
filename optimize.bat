@echo off
echo ========================================
echo  Optimisation Mots-cles Actualites
echo ========================================
echo.

REM Verifier si ANTHROPIC_API_KEY est defini
if "%ANTHROPIC_API_KEY%"=="" (
    echo ERREUR: La variable ANTHROPIC_API_KEY n'est pas definie!
    echo.
    echo Definissez-la avec:
    echo   set ANTHROPIC_API_KEY=sk-ant-...
    echo.
    echo Ou ajoutez-la dans vos variables d'environnement systeme.
    echo.
    pause
    exit /b 1
)

echo Cle API detectee: %ANTHROPIC_API_KEY:~0,20%...
echo.

REM Executer le script principal
node run_keyword_optimization.js

echo.
pause
