# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec para compilar el backend KDS como exe standalone.
Uso:
    pyinstaller kds_api.spec
El ejecutable queda en dist\kds_api.exe

NOTA: zones.json, database.txt y kds.accdb deben copiarse
manualmente al lado del exe despues de compilar.
"""
from pathlib import Path

block_cipher = None

a = Analysis(
    ['main_api.py'],
    pathex=[str(Path('.').resolve())],
    binaries=[],
    datas=[],
    hiddenimports=[
        'pyodbc',
        'flask',
        'flask_cors',
        'flask_sock',
        'simple_websocket',
        'werkzeug',
        'werkzeug.serving',
        'werkzeug.routing',
        'werkzeug.routing.converters',
        'werkzeug.exceptions',
        'jinja2',
        'click',
        'itsdangerous',
        'logging.handlers',
        'winreg',
        'app.models.order',
        'app.repositories.order_repository',
        'app.services.order_service',
        'app.utils.order_state_manager',
        'app.controllers.order_controller',
        'app.controllers.config_controller',
        'app.websockets.order_socket',
        'utils.database',
        'utils.helpers',
        'utils.logging_config',
        'utils.image_storage',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'unittest', 'email', 'html', 'xml'],
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
