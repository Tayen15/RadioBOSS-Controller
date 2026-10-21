"""History Service: Manages persistent request and queue history in %APPDATA%/RadioBOSSCaster/history.json."""
import json
import logging
import os
import time
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class HistoryService:
    def __init__(self):
        appdata = os.environ.get("APPDATA") or os.path.expanduser("~")
        self.data_dir = os.path.join(appdata, "RadioBOSSCaster")
        self.history_file = os.path.join(self.data_dir, "history.json")
        try:
            os.makedirs(self.data_dir, exist_ok=True)
        except Exception:
            pass

    def get_history(self) -> List[Dict[str, Any]]:
        """Load history items from persistent JSON file."""
        if not os.path.isfile(self.history_file):
            return []
        try:
            with open(self.history_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except Exception as e:
            logger.error(f"Failed to read history from {self.history_file}: {e}")
        return []

    def save_history(self, items: List[Dict[str, Any]]) -> bool:
        """Write history list to persistent JSON file (max 100 entries)."""
        try:
            trimmed = items[:100]
            with open(self.history_file, "w", encoding="utf-8") as f:
                json.dump(trimmed, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            logger.error(f"Failed to save history to {self.history_file}: {e}")
            return False

    def add_entry(self, item: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Prepend a new queue record to history and persist it."""
        current = self.get_history()
        # Ensure timestamp exists
        if "timestamp" not in item:
            item["timestamp"] = int(time.time() * 1000)
        # Prepend
        updated = [item] + [x for x in current if x.get("id") != item.get("id")]
        self.save_history(updated)
        return updated

    def clear(self) -> bool:
        """Clear all history entries."""
        try:
            if os.path.isfile(self.history_file):
                os.remove(self.history_file)
            return True
        except Exception as e:
            logger.error(f"Failed to clear history: {e}")
            return False


history_service = HistoryService()
