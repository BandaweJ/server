-- Comprehensive Permissions Seeding Script for Render Database
-- This script sets up the complete permissions system for production

-- ============================================================================
-- 1. SEED ROLES
-- ============================================================================

-- Insert system roles if they don't exist
INSERT INTO roles (id, name, description, active, "isSystemRole", "createdAt", "updatedAt") 
VALUES 
  (gen_random_uuid(), 'admin', 'System administrator with full access to all features', true, true, NOW(), NOW()),
  (gen_random_uuid(), 'director', 'School director with comprehensive oversight', true, true, NOW(), NOW()),
  (gen_random_uuid(), 'hod', 'Head of Department with departmental management access', true, true, NOW(), NOW()),
  (gen_random_uuid(), 'teacher', 'Teacher with access to class and student management', true, true, NOW(), NOW()),
  (gen_random_uuid(), 'reception', 'Reception staff with registration and enrollment access', true, true, NOW(), NOW()),
  (gen_random_uuid(), 'auditor', 'Auditor with read-only access to financial records', true, true, NOW(), NOW()),
  (gen_random_uuid(), 'student', 'Student with access to personal records and reports', true, true, NOW(), NOW()),
  (gen_random_uuid(), 'parent', 'Parent with access to child''s records and reports', true, true, NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 2. SEED PERMISSIONS
-- ============================================================================

-- Finance Permissions
INSERT INTO permissions (id, name, description, resource, action, active, "createdAt", "updatedAt") 
VALUES 
  (gen_random_uuid(), 'finance.view', 'Finance: View', 'finance', 'view', true, NOW(), NOW()),
  (gen_random_uuid(), 'finance.create', 'Finance: Create', 'finance', 'create', true, NOW(), NOW()),
  (gen_random_uuid(), 'finance.edit', 'Finance: Edit', 'finance', 'edit', true, NOW(), NOW()),
  (gen_random_uuid(), 'finance.delete', 'Finance: Delete', 'finance', 'delete', true, NOW(), NOW()),
  (gen_random_uuid(), 'finance.void.receipt', 'Finance: Void Receipt', 'finance', 'void.receipt', true, NOW(), NOW()),
  (gen_random_uuid(), 'finance.void.invoice', 'Finance: Void Invoice', 'finance', 'void.invoice', true, NOW(), NOW()),
  (gen_random_uuid(), 'finance.download.receipt', 'Finance: Download Receipt', 'finance', 'download.receipt', true, NOW(), NOW()),
  (gen_random_uuid(), 'finance.download.invoice', 'Finance: Download Invoice', 'finance', 'download.invoice', true, NOW(), NOW()),
  (gen_random_uuid(), 'finance.manage.fees', 'Finance: Manage Fees', 'finance', 'manage.fees', true, NOW(), NOW()),
  (gen_random_uuid(), 'finance.manage.exemptions', 'Finance: Manage Exemptions', 'finance', 'manage.exemptions', true, NOW(), NOW()),
  (gen_random_uuid(), 'finance.view.reports', 'Finance: View Reports', 'finance', 'view.reports', true, NOW(), NOW()),
  (gen_random_uuid(), 'finance.reconcile', 'Finance: Reconcile', 'finance', 'reconcile', true, NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- Reports Permissions
INSERT INTO permissions (id, name, description, resource, action, active, "createdAt", "updatedAt") 
VALUES 
  (gen_random_uuid(), 'reports.view', 'Reports: View', 'reports', 'view', true, NOW(), NOW()),
  (gen_random_uuid(), 'reports.generate', 'Reports: Generate', 'reports', 'generate', true, NOW(), NOW()),
  (gen_random_uuid(), 'reports.save', 'Reports: Save', 'reports', 'save', true, NOW(), NOW()),
  (gen_random_uuid(), 'reports.download', 'Reports: Download', 'reports', 'download', true, NOW(), NOW()),
  (gen_random_uuid(), 'reports.edit.comment', 'Reports: Edit Comment', 'reports', 'edit.comment', true, NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- Marks Permissions (CRITICAL FOR YOUR USE CASE)
INSERT INTO permissions (id, name, description, resource, action, active, "createdAt", "updatedAt") 
VALUES 
  (gen_random_uuid(), 'marks.view', 'Marks: View', 'marks', 'view', true, NOW(), NOW()),
  (gen_random_uuid(), 'marks.enter', 'Marks: Enter', 'marks', 'enter', true, NOW(), NOW()),
  (gen_random_uuid(), 'marks.edit', 'Marks: Edit', 'marks', 'edit', true, NOW(), NOW()),
  (gen_random_uuid(), 'marks.delete', 'Marks: Delete', 'marks', 'delete', true, NOW(), NOW()),
  (gen_random_uuid(), 'marks.approve', 'Marks: Approve', 'marks', 'approve', true, NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- Attendance Permissions
INSERT INTO permissions (id, name, description, resource, action, active, "createdAt", "updatedAt") 
VALUES 
  (gen_random_uuid(), 'attendance.view', 'Attendance: View', 'attendance', 'view', true, NOW(), NOW()),
  (gen_random_uuid(), 'attendance.mark', 'Attendance: Mark', 'attendance', 'mark', true, NOW(), NOW()),
  (gen_random_uuid(), 'attendance.edit', 'Attendance: Edit', 'attendance', 'edit', true, NOW(), NOW()),
  (gen_random_uuid(), 'attendance.view.reports', 'Attendance: View Reports', 'attendance', 'view.reports', true, NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- Enrolment Permissions
INSERT INTO permissions (id, name, description, resource, action, active, "createdAt", "updatedAt") 
VALUES 
  (gen_random_uuid(), 'enrolment.view', 'Enrolment: View', 'enrolment', 'view', true, NOW(), NOW()),
  (gen_random_uuid(), 'enrolment.create', 'Enrolment: Create', 'enrolment', 'create', true, NOW(), NOW()),
  (gen_random_uuid(), 'enrolment.edit', 'Enrolment: Edit', 'enrolment', 'edit', true, NOW(), NOW()),
  (gen_random_uuid(), 'enrolment.delete', 'Enrolment: Delete', 'enrolment', 'delete', true, NOW(), NOW()),
  (gen_random_uuid(), 'enrolment.migrate', 'Enrolment: Migrate', 'enrolment', 'migrate', true, NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- Users Permissions
INSERT INTO permissions (id, name, description, resource, action, active, "createdAt", "updatedAt") 
VALUES 
  (gen_random_uuid(), 'users.view', 'Users: View', 'users', 'view', true, NOW(), NOW()),
  (gen_random_uuid(), 'users.create', 'Users: Create', 'users', 'create', true, NOW(), NOW()),
  (gen_random_uuid(), 'users.edit', 'Users: Edit', 'users', 'edit', true, NOW(), NOW()),
  (gen_random_uuid(), 'users.delete', 'Users: Delete', 'users', 'delete', true, NOW(), NOW()),
  (gen_random_uuid(), 'users.manage.roles', 'Users: Manage Roles', 'users', 'manage.roles', true, NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- System Permissions
INSERT INTO permissions (id, name, description, resource, action, active, "createdAt", "updatedAt") 
VALUES 
  (gen_random_uuid(), 'system.view.settings', 'System: View Settings', 'system', 'view.settings', true, NOW(), NOW()),
  (gen_random_uuid(), 'system.edit.settings', 'System: Edit Settings', 'system', 'edit.settings', true, NOW(), NOW()),
  (gen_random_uuid(), 'system.view.audit', 'System: View Audit', 'system', 'view.audit', true, NOW(), NOW()),
  (gen_random_uuid(), 'system.manage.roles', 'System: Manage Roles', 'system', 'manage.roles', true, NOW(), NOW()),
  (gen_random_uuid(), 'system.manage.permissions', 'System: Manage Permissions', 'system', 'manage.permissions', true, NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 3. ASSIGN PERMISSIONS TO ROLES
-- ============================================================================

-- ADMIN ROLE - Gets ALL permissions
INSERT INTO role_permissions ("roleId", "permissionId")
SELECT 
  r.id as "roleId",
  p.id as "permissionId"
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin' 
  AND p.active = true
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp 
    WHERE rp."roleId" = r.id AND rp."permissionId" = p.id
  );

-- DIRECTOR ROLE - Gets most permissions except system management
INSERT INTO role_permissions ("roleId", "permissionId")
SELECT 
  r.id as "roleId",
  p.id as "permissionId"
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'director' 
  AND p.name IN (
    -- All marks permissions
    'marks.view', 'marks.enter', 'marks.edit', 'marks.delete', 'marks.approve',
    -- All finance permissions
    'finance.view', 'finance.create', 'finance.edit', 'finance.delete', 
    'finance.void.receipt', 'finance.void.invoice', 'finance.download.receipt', 
    'finance.download.invoice', 'finance.manage.fees', 'finance.manage.exemptions', 
    'finance.view.reports', 'finance.reconcile',
    -- All reports permissions
    'reports.view', 'reports.generate', 'reports.save', 'reports.download', 'reports.edit.comment',
    -- All attendance permissions
    'attendance.view', 'attendance.mark', 'attendance.edit', 'attendance.view.reports',
    -- All enrolment permissions
    'enrolment.view', 'enrolment.create', 'enrolment.edit', 'enrolment.delete', 'enrolment.migrate',
    -- Limited system permissions
    'system.view.settings', 'system.view.audit'
  )
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp 
    WHERE rp."roleId" = r.id AND rp."permissionId" = p.id
  );

-- HOD ROLE - Gets marks, reports, and attendance permissions
INSERT INTO role_permissions ("roleId", "permissionId")
SELECT 
  r.id as "roleId",
  p.id as "permissionId"
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'hod' 
  AND p.name IN (
    -- All marks permissions
    'marks.view', 'marks.enter', 'marks.edit', 'marks.delete', 'marks.approve',
    -- All reports permissions
    'reports.view', 'reports.generate', 'reports.save', 'reports.download', 'reports.edit.comment',
    -- All attendance permissions
    'attendance.view', 'attendance.mark', 'attendance.edit', 'attendance.view.reports',
    -- Limited enrolment and finance
    'enrolment.view', 'finance.view'
  )
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp 
    WHERE rp."roleId" = r.id AND rp."permissionId" = p.id
  );

-- TEACHER ROLE - Gets marks entry, view, and basic reporting (CRITICAL FOR YOUR USE CASE)
INSERT INTO role_permissions ("roleId", "permissionId")
SELECT 
  r.id as "roleId",
  p.id as "permissionId"
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'teacher' 
  AND p.name IN (
    -- Essential marks permissions
    'marks.view', 'marks.enter', 'marks.edit',
    -- Basic reporting
    'reports.view', 'reports.generate',
    -- Attendance
    'attendance.view', 'attendance.mark',
    -- View enrolment
    'enrolment.view'
  )
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp 
    WHERE rp."roleId" = r.id AND rp."permissionId" = p.id
  );

-- RECEPTION ROLE - Gets enrolment and basic finance permissions
INSERT INTO role_permissions ("roleId", "permissionId")
SELECT 
  r.id as "roleId",
  p.id as "permissionId"
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'reception' 
  AND p.name IN (
    -- All enrolment permissions
    'enrolment.view', 'enrolment.create', 'enrolment.edit', 'enrolment.delete', 'enrolment.migrate',
    -- Basic finance
    'finance.view', 'finance.create',
    -- User management
    'users.view', 'users.create'
  )
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp 
    WHERE rp."roleId" = r.id AND rp."permissionId" = p.id
  );

-- AUDITOR ROLE - Gets read-only access to finance and reports
INSERT INTO role_permissions ("roleId", "permissionId")
SELECT 
  r.id as "roleId",
  p.id as "permissionId"
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'auditor' 
  AND p.name IN (
    -- Read-only finance
    'finance.view', 'finance.view.reports',
    -- Read-only reports
    'reports.view',
    -- Audit access
    'system.view.audit'
  )
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp 
    WHERE rp."roleId" = r.id AND rp."permissionId" = p.id
  );

-- ============================================================================
-- 4. VERIFICATION QUERIES
-- ============================================================================

-- Verify roles were created
SELECT 'ROLES CREATED:' as info;
SELECT name, description, active, "isSystemRole" FROM roles ORDER BY name;

-- Verify permissions were created
SELECT 'PERMISSIONS CREATED:' as info;
SELECT resource, COUNT(*) as permission_count FROM permissions WHERE active = true GROUP BY resource ORDER BY resource;

-- Verify role-permission assignments
SELECT 'ROLE PERMISSIONS ASSIGNED:' as info;
SELECT 
  r.name as role_name,
  COUNT(rp."permissionId") as permissions_count
FROM roles r
LEFT JOIN role_permissions rp ON r.id = rp."roleId"
WHERE r.active = true
GROUP BY r.name
ORDER BY r.name;

-- Show critical marks permissions for admin, teacher, hod roles
SELECT 'MARKS PERMISSIONS BY ROLE:' as info;
SELECT 
  r.name as role_name,
  p.name as permission_name
FROM roles r
JOIN role_permissions rp ON r.id = rp."roleId"
JOIN permissions p ON p.id = rp."permissionId"
WHERE r.name IN ('admin', 'teacher', 'hod', 'director')
  AND p.resource = 'marks'
ORDER BY r.name, p.name;

-- Final success message
SELECT '✅ PERMISSIONS SEEDING COMPLETED SUCCESSFULLY! ✅' as result;
