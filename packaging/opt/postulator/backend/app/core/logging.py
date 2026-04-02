"""
app/core/logging.py
Configuration Loguru pour Postulator.
"""
import sys
from loguru import logger


def setup_logging(debug: bool = False) -> None:
    logger.remove()
    level = "DEBUG" if debug else "INFO"
    logger.add(
        sys.stderr,
        format=(
            "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
            "<level>{level: <8}</level> | "
            "<cyan>{name}</cyan>:<cyan>{function}</cyan> - "
            "<level>{message}</level>"
        ),
        level=level,
        colorize=True,
    )
    logger.add(
        "logs/postulator.log",
        rotation="10 MB",
        retention="14 days",
        level="INFO",
        encoding="utf-8",
    )
