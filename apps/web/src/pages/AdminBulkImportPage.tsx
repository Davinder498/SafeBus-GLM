import { Navigate } from 'react-router';

// Preserve existing bookmarks after moving imports into the people directories.
export function AdminBulkImportPage() {
  return <Navigate to="/admin/guardians?import=1" replace />;
}
