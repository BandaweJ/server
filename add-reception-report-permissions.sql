-- Add report permissions to reception role
-- Run this on your Render (or production) database to fix 403 when reception downloads reports.
-- Permissions: reports.view, reports.download, reports.edit.comment

INSERT INTO role_permissions ("roleId", "permissionId")
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'reception'
  AND p.name IN ('reports.view', 'reports.download', 'reports.edit.comment')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp."roleId" = r.id AND rp."permissionId" = p.id
  );

-- Verify permissions were added
SELECT r.name AS role_name, p.name AS permission_name
FROM role_permissions rp
JOIN roles r ON rp."roleId" = r.id
JOIN permissions p ON rp."permissionId" = p.id
WHERE r.name = 'reception'
  AND p.name IN ('reports.view', 'reports.download', 'reports.edit.comment');
