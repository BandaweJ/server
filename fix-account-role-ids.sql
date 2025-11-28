-- Fix accounts that have a role string but no roleId
-- This script updates all accounts to have their roleId set based on their role string
-- Run this on your LOCAL database only

-- First, check which accounts need fixing
SELECT 
    a.id,
    a.username,
    a.role,
    a."roleId",
    r.id AS expected_role_id,
    r.name AS role_name
FROM accounts a
LEFT JOIN roles r ON r.name = a.role
WHERE a."roleId" IS NULL AND a.role IS NOT NULL;

-- Update accounts to set roleId based on role string
UPDATE accounts
SET "roleId" = (
    SELECT id 
    FROM roles 
    WHERE roles.name = accounts.role
)
WHERE "roleId" IS NULL 
  AND role IS NOT NULL
  AND EXISTS (
      SELECT 1 
      FROM roles 
      WHERE roles.name = accounts.role
  );

-- Verify the fix
SELECT 
    a.id,
    a.username,
    a.role,
    a."roleId",
    r.name AS role_entity_name
FROM accounts a
LEFT JOIN roles r ON a."roleId" = r.id
WHERE a.role IS NOT NULL;

