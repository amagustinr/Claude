@echo off
REM ==== Instalacion de Mi Voz TTS (Windows + GPU NVIDIA) ====
REM Requiere Python 3.11 o 3.12 instalado (py launcher).
cd /d "%~dp0"

py -3.11 -m venv venv || py -3.12 -m venv venv
call venv\Scripts\activate
python -m pip install --upgrade pip

REM torch 2.8 con CUDA 12.6. Si tienes una RTX serie 50, cambia cu126 por cu128.
REM (Se fija 2.8 porque torchaudio 2.9+ cambio la carga de audio que usa XTTS.)
pip install torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu126

pip install -r requirements.txt

python -c "import torch; print('CUDA disponible:', torch.cuda.is_available(), '-', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'sin GPU')"
echo.
echo Instalacion terminada. Ejecuta iniciar.bat
pause
