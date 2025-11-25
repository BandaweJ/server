-- Script to assign necessary permissions to teacher role
-- This script ensures teachers have the permissions needed to enter marks

-- First, let's check if the permissions exist and create them if they don't
INSERT INTO permissions (id, name, description, resource, action, active, "createdAt", "updatedAt") 
VALUES 
  (gen_random_uuid(), 'marks.enter', 'Marks: Enter', 'marks', 'enter', true, NOW(), NOW()),
  (gen_random_uuid(), 'marks.view', 'Marks: View', 'marks', 'view', true, NOW(), NOW()),
  (gen_random_uuid(), 'marks.edit', 'Marks: Edit', 'marks', 'edit', true, NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- Now assign these permissions to the teacher role
INSERT INTO role_permissions ("roleId", "permissionId")
SELECT 
  r.id as "roleId",
  p.id as "permissionId"
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'teacher' 
  AND p.name IN ('marks.enter', 'marks.view', 'marks.edit')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp 
    WHERE rp."roleId" = r.id AND rp."permissionId" = p.id
  );

-- Also assign permissions to admin and director roles for completeness
INSERT INTO role_permissions ("roleId", "permissionId")
SELECT 
  r.id as "roleId",
  p.id as "permissionId"
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('admin', 'director', 'hod') 
  AND p.name IN ('marks.enter', 'marks.view', 'marks.edit', 'marks.delete', 'marks.approve')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp 
    WHERE rp."roleId" = r.id AND rp."permissionId" = p.id
  );

-- Verify the assignments
SELECT 
  r.name as role_name,
  p.name as permission_name,
  p.description as permission_description
FROM roles r
JOIN role_permissions rp ON r.id = rp."roleId"
JOIN permissions p ON p.id = rp."permissionId"
WHERE r.name IN ('teacher', 'admin', 'director', 'hod')
  AND p.resource = 'marks'
ORDER BY r.name, p.name;
