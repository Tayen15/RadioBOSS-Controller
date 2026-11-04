"""Application entrypoint for Radio Caster Bridge (Pure Native Desktop GUI)."""
import os
import sys
import logging

# Ensure backend root is on sys.path
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

# Ensure native_gui root is on sys.path
root_path = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if root_path not in sys.path:
    sys.path.insert(0, root_path)

from PySide6.QtWidgets import QApplication
from PySide6.QtGui import QFont, QIcon
from PySide6.QtCore import Qt

from native_gui.views.main_window import MainWindow

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("RadioCasterNative")


def load_stylesheet(app: QApplication):
    """Load dark carbon broadcast theme stylesheet."""
    qss_path = os.path.join(os.path.dirname(__file__), "styles", "theme.qss")
    if os.path.exists(qss_path):
        try:
            with open(qss_path, "r", encoding="utf-8") as f:
                app.setStyleSheet(f.read())
            logger.info("Loaded theme.qss successfully.")
        except Exception as e:
            logger.warning(f"Could not load stylesheet: {e}")


def main():
    # High DPI scaling enabled
    QApplication.setHighDpiScaleFactorRoundingPolicy(
        Qt.HighDpiScaleFactorRoundingPolicy.PassThrough
    )

    app = QApplication(sys.argv)
    app.setApplicationName("Radio Caster Bridge Native")
    app.setOrganizationName("RadioBOSSCaster")

    # Set default modern clean font
    app_font = QFont("Plus Jakarta Sans", 10)
    app_font.setStyleHint(QFont.SansSerif)
    app.setFont(app_font)

    # Apply dark broadcast theme stylesheet
    load_stylesheet(app)

    # Launch MainWindow
    window = MainWindow()
    window.show()

    logger.info("Radio Caster Bridge Native Desktop GUI started.")
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
