@echo off
cd /d "%~dp0"
call venv\Scripts\activate
REM Cambia el modelo de Whisper si quieres: tiny, base, small, medium, turbo, large-v3
set WHISPER_MODEL=medium
python app.py
pause
