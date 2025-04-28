#!/bin/bash

# This script will handle the duplicate use-toast.ts files
echo "Handling use-toast.ts duplicate files..."

# Create backup directory if it doesn't exist
BACKUP_DIR="./duplicate-backups"
mkdir -p "$BACKUP_DIR"

# Backup files
echo "Creating backups of both use-toast.ts files"
cp client/src/components/ui/use-toast.ts "$BACKUP_DIR/use-toast-components-ui-backup.ts"
cp client/src/hooks/use-toast.ts "$BACKUP_DIR/use-toast-hooks-backup.ts"

# Examine which files are using each version
COMPONENTS_UI_USAGE=$(find client/src -type f -name "*.tsx" -o -name "*.ts" | xargs grep -l "from '@/components/ui/use-toast'" | wc -l)
HOOKS_USAGE=$(find client/src -type f -name "*.tsx" -o -name "*.ts" | xargs grep -l "from '@/hooks/use-toast'" | wc -l)

echo "Files importing from @/components/ui/use-toast: $COMPONENTS_UI_USAGE"
echo "Files importing from @/hooks/use-toast: $HOOKS_USAGE"

# Update the hooks version to re-export from the components version
echo "Creating a clean hook version that re-exports from the canonical UI component"
cat > client/src/hooks/use-toast.ts << 'EOF'
// Re-export the toast hook from the UI components library
// This ensures consistency in toast behavior across the application
export { useToast, toast } from "@/components/ui/use-toast";
EOF

echo "✓ Updated client/src/hooks/use-toast.ts to re-export from components/ui/use-toast.ts"
echo "✓ This ensures all toast functionality is consistent throughout the application"
echo "✓ Original files are backed up in $BACKUP_DIR"

echo "All duplicates have been handled!"