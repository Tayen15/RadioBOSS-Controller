"""History Service: Manages persistent request and queue history via SQLite db_service."""
import logging
import time
from typing import List, Dict, Any
from app.services.db_service import db_service

logger = logging.getLogger(__name__)


class HistoryService:
    def __init__(self):
        self.db = db_service

    def get_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Load history items from SQLite database."""
        return self.db.get_history(limit=limit)

    def save_history(self, items: List[Dict[str, Any]]) -> bool:
        """Save history items to SQLite database."""
        try:
            for item in reversed(items[:100]):
                self.db.add_history_entry(item)
            return True
        except Exception as e:
            logger.error(f"Failed to save history: {e}")
            return False

    def add_entry(self, item: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Insert a new queue record to SQLite history and return updated list."""
        if "timestamp" not in item:
            item["timestamp"] = int(time.time() * 1000)
        self.db.add_history_entry(item)
        return self.get_history()

    def clear(self) -> bool:
        """Clear all history entries from SQLite."""
        return self.db.clear_history()


history_service = HistoryService()
