@echo off
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (set "GITA_PY=python") else (set "GITA_PY=py -3")
%GITA_PY% setup_project.py
if errorlevel 1 goto failed
%GITA_PY% run.py
:failed
pause
