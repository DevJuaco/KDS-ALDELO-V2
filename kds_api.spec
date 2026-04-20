# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec para compilar el backend KDS como exe standalone.
Uso:
    pip install pyinstaller
    pyinstaller kds_api.spec
El ejecutable queda en dist\kds_api.exe
"""
from pathlib import Path
import os

block_cipher = None

datas = [
    ('zones.json', '.'),
    ('utils', 'utils'),
    ('app', 'app'),
]

if Path('database.txt').exists():
    datas.append(('database.txt', '.'))

if Path('adResSettings.dat').exists():
    datas.append(('adResSettings.dat', '.'))

a = Analysis(
    ['main_api.py'],
    pathex=[str(Path('.').resolve())],
    binaries=[],
    datas=datas,
    hiddenimports=[
        'pyodbc',
        'flask',
        'flask_cors',
        'flask_sock',
        'simple_websocket',
        'werkzeug',
        'werkzeug.serving',
        'werkzeug.routing',
        'jinja2',
        'click',
        'itsdangerous',
        'logging.handlers',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'unittest', 'email', 'html', 'http', 'xml'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='kds_api',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
