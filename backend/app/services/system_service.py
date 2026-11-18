"""System Service: Detects hardware specifications and provides performance presets."""
import os
import platform
import sys
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


def get_system_specs() -> Dict[str, Any]:
    """
    Detect local host CPU cores, RAM, and platform.
    Returns recommended audio transcode settings tailored to hardware capability.
    """
    cpu_cores = os.cpu_count() or 2
    ram_gb = 8.0  # default assumption if detection unavailable

    if sys.platform == "win32":
        try:
            import ctypes

            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]

            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
                ram_gb = round(stat.ullTotalPhys / (1024 ** 3), 1)
        except Exception as e:
            logger.debug(f"Could not query Windows memory via kernel32: {e}")
    else:
        try:
            pages = os.sysconf("SC_PHYS_PAGES")
            page_size = os.sysconf("SC_PAGE_SIZE")
            ram_gb = round((pages * page_size) / (1024 ** 3), 1)
        except Exception as e:
            logger.debug(f"Could not query Linux memory via sysconf: {e}")

    # Low-spec threshold: <= 4 cores OR < 6.0 GB RAM
    is_low_spec = bool(cpu_cores <= 4 or ram_gb < 6.0)

    os_desc = f"{platform.system()} {platform.release()}"

    if is_low_spec:
        preset_name = "low_spec"
        recommended_loudnorm = False
        recommended_bitrate = "192k"
        reason = (
            f"Terdeteksi perangkat spesifikasi standar ({cpu_cores} Core CPU, {ram_gb} GB RAM). "
            "Direkomendasikan menonaktifkan normalisasi volume EBU R128 dan memakai bitrate 192 kbps "
            "agar proses transfer lagu instan dan tidak membebani prosesor (mencegah timeout FFmpeg)."
        )
    else:
        preset_name = "studio_high"
        recommended_loudnorm = True
        recommended_bitrate = "320k"
        reason = (
            f"Spesifikasi perangkat sangat mumpuni ({cpu_cores} Core CPU, {ram_gb} GB RAM). "
            "Mendukung normalisasi audio EBU R128 (-14 LUFS) dan kualitas master 320 kbps secara mulus."
        )

    return {
        "os_name": os_desc,
        "cpu_cores": cpu_cores,
        "ram_gb": ram_gb,
        "is_low_spec": is_low_spec,
        "recommended_preset": preset_name,
        "recommended_loudnorm": recommended_loudnorm,
        "recommended_bitrate": recommended_bitrate,
        "reason": reason,
    }
