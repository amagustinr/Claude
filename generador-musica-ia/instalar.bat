@echo off
chcp 65001 >nul
echo === Instalando Generador de Musica IA ===
where python >nul 2>&1 || (echo Instala Python 3.10 u 3.11 desde python.org y marca "Add to PATH" & pause & exit /b 1)
python -m venv venv
call venv\Scripts\activate.bat
python -m pip install --upgrade pip
echo --- PyTorch con CUDA (NVIDIA) ---
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124
pip install -r requirements.txt
python -c "import torch;print('CUDA disponible:',torch.cuda.is_available())"
echo.
echo Listo. Ejecuta iniciar.bat
pause
