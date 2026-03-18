/**
 * Permission constants for the application
 * These match the permission names in the database
 */
export const PERMISSIONS = {
  // Finance Permissions
  FINANCE: {
    VIEW: 'finance.view',
    CREATE: 'finance.create',
    EDIT: 'finance.edit',
    DELETE: 'finance.delete',
    VOID_RECEIPT: 'finance.void.receipt',
    VOID_INVOICE: 'finance.void.invoice',
    DOWNLOAD_RECEIPT: 'finance.download.receipt',
    DOWNLOAD_INVOICE: 'finance.download.invoice',
    MANAGE_FEES: 'finance.manage.fees',
    MANAGE_EXEMPTIONS: 'finance.manage.exemptions',
    VIEW_REPORTS: 'finance.view.reports',
    RECONCILE: 'finance.reconcile',
  },

  // Reports Permissions
  REPORTS: {
    VIEW: 'reports.view',
    GENERATE: 'reports.generate',
    SAVE: 'reports.save',
    DOWNLOAD: 'reports.download',
    EDIT_COMMENT: 'reports.edit.comment',
  },

  // Marks Permissions
  MARKS: {
    VIEW: 'marks.view',
    ENTER: 'marks.enter',
    EDIT: 'marks.edit',
    DELETE: 'marks.delete',
    APPROVE: 'marks.approve',
  },

  // Attendance Permissions
  ATTENDANCE: {
    VIEW: 'attendance.view',
    MARK: 'attendance.mark',
    EDIT: 'attendance.edit',
    VIEW_REPORTS: 'attendance.view.reports',
  },

  // Enrolment Permissions
  ENROLMENT: {
    VIEW: 'enrolment.view',
    CREATE: 'enrolment.create',
    EDIT: 'enrolment.edit',
    DELETE: 'enrolment.delete',
    MIGRATE: 'enrolment.migrate',
  },

  // User Management Permissions
  USERS: {
    VIEW: 'users.view',
    CREATE: 'users.create',
    EDIT: 'users.edit',
    DELETE: 'users.delete',
    MANAGE_ROLES: 'users.manage.roles',
  },

  // System Administration Permissions
  SYSTEM: {
    VIEW_SETTINGS: 'system.view.settings',
    EDIT_SETTINGS: 'system.edit.settings',
    VIEW_AUDIT: 'system.view.audit',
    MANAGE_ROLES: 'system.manage.roles',
    MANAGE_PERMISSIONS: 'system.manage.permissions',
  },

  // Requisitions / Procurement Permissions
  REQUISITIONS: {
    CREATE: 'requisitions.create',
    VIEW_OWN: 'requisitions.view.own',
    VIEW_DEPARTMENT: 'requisitions.view.department',
    VIEW_ALL: 'requisitions.view.all',
    SIGN_DEPUTY: 'requisitions.sign.deputy',
    SIGN_HEAD: 'requisitions.sign.head',
    AUTHORISE: 'requisitions.authorise',
  },

  // Inventory Permissions
  INVENTORY: {
    VIEW_OWN_DEPARTMENT: 'inventory.view.own.department',
    VIEW_ALL: 'inventory.view.all',
    MANAGE_OWN_DEPARTMENT: 'inventory.manage.own.department',
  },

  // Chargeable incidents (lost/damaged items)
  INCIDENTS: {
    CREATE: 'incidents.create',
    VIEW_OWN: 'incidents.view.own',
    VIEW_ALL: 'incidents.view.all',
    CONFIRM_HOD: 'incidents.confirm.hod',
    SIGN_DEPUTY: 'incidents.sign.deputy',
    SIGN_HEAD: 'incidents.sign.head',
    ACCEPT: 'incidents.accept',
    REJECT: 'incidents.reject',
  },
} as const;
