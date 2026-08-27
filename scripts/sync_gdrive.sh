#!/usr/bin/env bash
set -e

# Google Drive Cloud Sync Script via rclone
# Usage: ./scripts/sync_gdrive.sh [remote_name] [destination_folder]

REMOTE="${1:-gdrive}"
DEST_FOLDER="${2:-comma_recordings}"
LOCAL_STORAGE="${STORAGE_DIR:-./data/storage}"

echo "=========================================="
echo "🚀 Starting Sync to Google Drive ($REMOTE:$DEST_FOLDER)..."
echo "📂 Local path: $LOCAL_STORAGE"
echo "=========================================="

if ! command -v rclone &> /dev/null; then
    echo "❌ rclone is not installed. Install via: curl https://rclone.org/install.sh | sudo bash"
    exit 1
fi

rclone sync "$LOCAL_STORAGE" "$REMOTE:$DEST_FOLDER" \
    --transfers 4 \
    --checkers 8 \
    --fast-list \
    --progress \
    --drive-chunk-size 64M

echo "✅ Sync to Google Drive completed successfully!"
