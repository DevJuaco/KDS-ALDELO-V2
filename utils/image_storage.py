"""
Utilidades para almacenamiento local de imágenes.
"""
import os
import re
import unicodedata
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
BASE_IMAGE_DIR = PROJECT_ROOT / "imagenes"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
MIMETYPE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/bmp": ".bmp",
}


def sanitize_path_name(value, default="sin_nombre"):
    """Convierte un texto en un nombre seguro para carpeta/archivo."""
    if value is None:
        return default

    normalized = unicodedata.normalize("NFKD", str(value))
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    clean_text = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', " ", ascii_text)
    clean_text = re.sub(r"\s+", "_", clean_text.strip())
    clean_text = re.sub(r"_+", "_", clean_text).strip("._")
    return clean_text or default


def get_image_extension(uploaded_file):
    """Obtiene y valida la extensión de una imagen subida."""
    original_name = uploaded_file.filename or ""
    extension = os.path.splitext(original_name)[1].lower()

    if extension in ALLOWED_EXTENSIONS:
        return extension

    mimetype = (uploaded_file.mimetype or "").lower()
    if mimetype in MIMETYPE_EXTENSIONS:
        return MIMETYPE_EXTENSIONS[mimetype]

    raise ValueError("El archivo debe ser una imagen válida")


def remove_previous_versions(directory, base_name):
    """Elimina archivos previos del mismo recurso con extensiones soportadas."""
    directory = Path(directory)
    for extension in ALLOWED_EXTENSIONS:
        existing_file = directory / f"{base_name}{extension}"
        if existing_file.exists():
            existing_file.unlink()


def find_existing_image(*subdirectories, entity_name):
    """Busca una imagen existente para una entidad."""
    safe_name = sanitize_path_name(entity_name)
    target_dir = BASE_IMAGE_DIR.joinpath(*[sanitize_path_name(part) for part in subdirectories])

    for extension in ALLOWED_EXTENSIONS:
        candidate = target_dir / f"{safe_name}{extension}"
        if candidate.exists():
            return candidate

    return None


def save_uploaded_image(uploaded_file, *subdirectories, entity_name):
    """Guarda una imagen en disco y devuelve su metadata."""
    if uploaded_file is None or not uploaded_file.filename:
        raise ValueError("Debe enviar un archivo en el campo 'imagen'")

    extension = get_image_extension(uploaded_file)
    safe_name = sanitize_path_name(entity_name)

    target_dir = BASE_IMAGE_DIR.joinpath(*[sanitize_path_name(part) for part in subdirectories])
    target_dir.mkdir(parents=True, exist_ok=True)

    remove_previous_versions(target_dir, safe_name)

    filename = f"{safe_name}{extension}"
    destination = target_dir / filename
    uploaded_file.save(destination)

    return {
        "filename": filename,
        "absolute_path": str(destination),
        "relative_path": destination.relative_to(PROJECT_ROOT).as_posix(),
        "directory": target_dir.relative_to(PROJECT_ROOT).as_posix(),
    }
