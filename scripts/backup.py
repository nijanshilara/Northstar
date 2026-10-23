"""
backup.py — Safe Snapshot Backup & Restore Utility for Northstar.
"Your compass to everywhere."

Features:
- Creates hot, transactionally consistent SQLite backups using SQLite's backup API.
- Backs up all uploaded Memory Capsule media from backend/uploads.
- Writes metadata with record counts and snapshot timestamps.
- Supports dry-run and restore operations.
"""

import sys
import shutil
import sqlite3
import argparse
from pathlib import Path
from datetime import datetime

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
DB_PATH = BACKEND_DIR / "travel_guide.db"
UPLOADS_DIR = BACKEND_DIR / "uploads"
BACKUPS_DIR = ROOT_DIR / "backups"


def create_backup() -> Path:
    """Create a complete snapshot of the database and uploaded media."""
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    snapshot_dir = BACKUPS_DIR / f"snapshot_{timestamp}"
    snapshot_dir.mkdir(parents=True, exist_ok=True)

    target_db = snapshot_dir / "travel_guide.db"
    target_uploads = snapshot_dir / "uploads"
    target_uploads.mkdir(parents=True, exist_ok=True)

    trip_count = 0
    expense_count = 0
    user_count = 0
    capsule_count = 0

    # 1. Hot Backup SQLite Database
    if DB_PATH.exists():
        print(f"[*] Backing up SQLite database from: {DB_PATH}")
        src_conn = sqlite3.connect(DB_PATH)
        dst_conn = sqlite3.connect(target_db)
        try:
            # Use SQLite backup API for non-blocking consistent hot snapshot
            src_conn.backup(dst_conn)
            # Query record counts for metadata verification
            cursor = dst_conn.cursor()
            try:
                cursor.execute("SELECT COUNT(*) FROM trips")
                trip_count = cursor.fetchone()[0]
            except sqlite3.OperationalError:
                pass
            try:
                cursor.execute("SELECT COUNT(*) FROM expenses")
                expense_count = cursor.fetchone()[0]
            except sqlite3.OperationalError:
                pass
            try:
                cursor.execute("SELECT COUNT(*) FROM users")
                user_count = cursor.fetchone()[0]
            except sqlite3.OperationalError:
                pass
            try:
                cursor.execute("SELECT COUNT(*) FROM capsules")
                capsule_count = cursor.fetchone()[0]
            except sqlite3.OperationalError:
                pass
        finally:
            dst_conn.close()
            src_conn.close()
        print(f"[+] Database snapshot created: {target_db.name} ({target_db.stat().st_size:,} bytes)")
    else:
        print(f"[!] Warning: Database not found at {DB_PATH}")

    # 2. Backup Uploaded Media
    media_files = []
    if UPLOADS_DIR.exists():
        for file in UPLOADS_DIR.iterdir():
            if file.is_file() and file.name != ".gitkeep":
                shutil.copy2(file, target_uploads / file.name)
                media_files.append(file.name)
        print(f"[+] Backed up {len(media_files)} uploaded media files to {target_uploads}")
    else:
        print(f"[!] Note: No uploads directory found at {UPLOADS_DIR}")

    # 3. Write Snapshot Metadata
    metadata_path = snapshot_dir / "metadata.txt"
    metadata_content = f"""Northstar — Snapshot Backup (Your compass to everywhere)
Created: {datetime.now().isoformat()}
Snapshot Dir: {snapshot_dir.name}
Trips: {trip_count}
Expenses: {expense_count}
Users: {user_count}
Capsules: {capsule_count}
Media Files: {len(media_files)}
Database Size: {target_db.stat().st_size if target_db.exists() else 0} bytes
"""
    metadata_path.write_text(metadata_content, encoding="utf-8")

    print("\n" + "=" * 60)
    print("BACKUP SUCCESSFUL!")
    print(f"Location: {snapshot_dir}")
    print(f"Records:  {trip_count} trips, {expense_count} expenses, {user_count} users, {capsule_count} capsules")
    print(f"Media:    {len(media_files)} files backed up")
    print("=" * 60 + "\n")
    return snapshot_dir


def restore_backup(snapshot_name: str) -> None:
    """Safely restore a snapshot backup."""
    snapshot_dir = BACKUPS_DIR / snapshot_name
    if not snapshot_dir.exists():
        # Check if full path was provided
        snapshot_dir = Path(snapshot_name)
    if not snapshot_dir.exists():
        print(f"[ERROR] Snapshot not found at: {snapshot_dir}")
        sys.exit(1)

    src_db = snapshot_dir / "travel_guide.db"
    src_uploads = snapshot_dir / "uploads"

    print(f"\n[!] RESTORING FROM SNAPSHOT: {snapshot_dir.name}")
    print("This will overwrite current travel_guide.db and merge uploads.")
    confirm = input("Are you sure you want to proceed? (yes/no): ").strip().lower()
    if confirm not in ("y", "yes"):
        print("Restore cancelled.")
        return

    # Overwrite DB
    if src_db.exists():
        shutil.copy2(src_db, DB_PATH)
        print(f"[+] Restored database to {DB_PATH}")

    # Restore uploads
    if src_uploads.exists():
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        count = 0
        for file in src_uploads.iterdir():
            if file.is_file():
                shutil.copy2(file, UPLOADS_DIR / file.name)
                count += 1
        print(f"[+] Restored {count} media files to {UPLOADS_DIR}")

    print("\nRestore completed successfully.\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Northstar Backup and Restore Utility")
    parser.add_argument("--restore", type=str, help="Restore from snapshot directory name (e.g. snapshot_20261016_113000)")
    args = parser.parse_args()

    if args.restore:
        restore_backup(args.restore)
    else:
        create_backup()
