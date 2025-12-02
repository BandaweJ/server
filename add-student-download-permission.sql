-- Add reports.download permission to student role
-- This allows students to download their own reports

INSERT INTO role_permissions ("roleId", "permissionId")
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'student' 
  AND p.name = 'reports.download'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp 
    WHERE rp."roleId" = r.id AND rp."permissionId" = p.id
  );

-- Verify the permission was added
SELECT 
    r.name as role_name,
    p.name as permission_name
FROM role_permissions rp
JOIN roles r ON rp."roleId" = r.id
JOIN permissions p ON rp."permissionId" = p.id
WHERE r.name = 'student' AND p.name = 'reports.download';

