-- Verify that admin, teacher, and hod roles have marks.enter permission
-- Run this query to check current permission assignments

-- Check which roles have the marks.enter permission
SELECT 
    r.name AS role_name,
    p.name AS permission_name,
    p.description
FROM roles r
INNER JOIN role_permissions rp ON r.id = rp."roleId"
INNER JOIN permissions p ON p.id = rp."permissionId"
WHERE p.name = 'marks.enter'
ORDER BY r.name;

-- Check all marks-related permissions for each role
SELECT 
    r.name AS role_name,
    p.name AS permission_name
FROM roles r
INNER JOIN role_permissions rp ON r.id = rp."roleId"
INNER JOIN permissions p ON p.id = rp."permissionId"
WHERE p.name LIKE 'marks.%'
ORDER BY r.name, p.name;

-- Count permissions per role for marks
SELECT 
    r.name AS role_name,
    COUNT(p.id) AS marks_permissions_count
FROM roles r
LEFT JOIN role_permissions rp ON r.id = rp."roleId"
LEFT JOIN permissions p ON p.id = rp."permissionId" AND p.name LIKE 'marks.%'
WHERE r.name IN ('admin', 'teacher', 'hod', 'director')
GROUP BY r.name
ORDER BY r.name;


