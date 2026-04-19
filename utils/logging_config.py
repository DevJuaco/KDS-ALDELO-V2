"""
Utilidades para configurar logs diarios en archivos TXT.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from pathlib import Path

LOGS_DIR = Path("logs")
LOG_FILE_PREFIX = "api-"
LOG_FILE_EXTENSION = ".txt"
LOG_RETENTION_DAYS = 2
LOG_FORMAT = "%(asctime)s - %(levelname)s - %(message)s"


def ensure_logs_dir() -> Path:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    return LOGS_DIR


def get_log_file_path(for_date: datetime | None = None) -> Path:
    target_date = for_date or datetime.now()
    return ensure_logs_dir() / f"{LOG_FILE_PREFIX}{target_date.strftime('%Y-%m-%d')}{LOG_FILE_EXTENSION}"


def get_latest_log_file_path() -> Path | None:
    log_files = sorted(
        ensure_logs_dir().glob(f"{LOG_FILE_PREFIX}*{LOG_FILE_EXTENSION}"),
        key=lambda path: path.stat().st_mtime,
        reverse=True
    )
    return log_files[0] if log_files else None


def resolve_log_file(date_str: str | None = None) -> Path:
    if date_str:
        target_date = datetime.strptime(date_str, "%Y-%m-%d")
        return get_log_file_path(target_date)

    current_log = get_log_file_path()
    if current_log.exists():
        return current_log

    latest_log = get_latest_log_file_path()
    return latest_log or current_log


def cleanup_old_logs(retention_days: int = LOG_RETENTION_DAYS) -> list[Path]:
    ensure_logs_dir()
    cutoff = datetime.now() - timedelta(days=retention_days)
    deleted_files: list[Path] = []

    for log_file in LOGS_DIR.glob(f"{LOG_FILE_PREFIX}*{LOG_FILE_EXTENSION}"):
        if not log_file.is_file():
            continue

        try:
            modified_at = datetime.fromtimestamp(log_file.stat().st_mtime)
            if modified_at < cutoff:
                log_file.unlink()
                deleted_files.append(log_file)
        except OSError:
            continue

    return deleted_files


class DailyTxtFileHandler(logging.Handler):
    """
    Handler que escribe en logs/api-YYYY-MM-DD.txt y cambia de archivo automáticamente al cambiar el día.
    """

    terminator = "\n"

    def __init__(self, encoding: str = "utf-8"):
        super().__init__()
        self.encoding = encoding
        self._current_path: Path | None = None
        self._stream = None

    def _get_target_path(self) -> Path:
        return get_log_file_path()

    def _ensure_stream(self) -> None:
        target_path = self._get_target_path()
        if self._stream is not None and self._current_path == target_path:
            return

        self._close_stream()
        ensure_logs_dir()
        self._stream = open(target_path, "a", encoding=self.encoding)
        self._current_path = target_path

    def _close_stream(self) -> None:
        if self._stream is not None:
            try:
                self._stream.close()
            finally:
                self._stream = None
                self._current_path = None

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self._ensure_stream()
            message = self.format(record)
            self._stream.write(message + self.terminator)
            self.flush()
        except Exception:
            self.handleError(record)

    def flush(self) -> None:
        if self._stream is not None:
            self._stream.flush()

    def close(self) -> None:
        try:
            self.flush()
        finally:
            self._close_stream()
            super().close()


def configure_daily_logging(level: int = logging.INFO) -> Path:
    deleted_files = cleanup_old_logs()
    handler = DailyTxtFileHandler()

    logging.basicConfig(
        level=level,
        format=LOG_FORMAT,
        handlers=[handler],
        force=True
    )

    current_log_file = get_log_file_path()
    if deleted_files:
        logging.info(
            f"🧹 Se eliminaron {len(deleted_files)} archivo(s) de log con más de {LOG_RETENTION_DAYS} días de antigüedad"
        )
    logging.info(f"📁 Logs configurados en: {current_log_file}")
    return current_log_file
