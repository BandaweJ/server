/**
 * All entities that live in tenant schemas (not in public).
 * Used to provide request-scoped repositories with search_path set.
 * Exclude TenantEntity (lives in public.tenants only).
 */
import { EntityTarget } from 'typeorm';
import { AccountsEntity } from '../auth/entities/accounts.entity';
import { RoleEntity } from '../auth/entities/role.entity';
import { PermissionEntity } from '../auth/entities/permission.entity';
import { TeachersEntity } from '../profiles/entities/teachers.entity';
import { StudentsEntity } from '../profiles/entities/students.entity';
import { ParentsEntity } from '../profiles/entities/parents.entity';
import { SystemSettingsEntity } from '../system/entities/system-settings.entity';
import { IntegrationEntity } from '../system/entities/integration.entity';
import { GradingSystemEntity } from '../system/entities/grading-system.entity';
import { EventNotificationEntity } from '../system/entities/event-notification.entity';
import { CalendarEventEntity } from '../system/entities/calendar-event.entity';
import { ReportsEntity } from '../reports/entities/report.entity';
import { TeacherCommentEntity } from '../marks/entities/teacher-comments.entity';
import { SubjectsEntity } from '../marks/entities/subjects.entity';
import { MarksEntity } from '../marks/entities/marks.entity';
import { FeesEntity } from '../finance/entities/fees.entity';
import { BillsEntity } from '../finance/entities/bills.entity';
import { BalancesEntity } from '../finance/entities/balances.entity';
import { ExemptionEntity } from '../exemptions/entities/exemptions.entity';
import { TermsEntity } from '../enrolment/entities/term.entity';
import { EnrolEntity } from '../enrolment/entities/enrol.entity';
import { ClassEntity } from '../enrolment/entities/class.entity';
import { ContinuousAssessmentEntity } from '../continuous-assessment/entities/continuous-assessment.entity';
import { ActivityEntity } from '../activity/entities/activity.entity';
import { StudentCreditEntity } from '../payment/entities/student-credit.entity';
import { CreditTransactionEntity } from '../payment/entities/credit-transaction.entity';
import { ReceiptEntity } from '../payment/entities/payment.entity';
import { InvoiceEntity } from '../payment/entities/invoice.entity';
import { FinancialAuditLogEntity } from '../payment/entities/financial-audit-log.entity';
import { CreditInvoiceAllocationEntity } from '../payment/entities/credit-invoice-allocation.entity';
import { ReceiptInvoiceAllocationEntity } from '../payment/entities/receipt-invoice-allocation.entity';
import { ReceiptCreditEntity } from '../payment/entities/receipt-credit.entity';
import { MessageEntity } from '../messaging/entities/message.entity';
import { MessageReadEntity } from '../messaging/entities/message-read.entity';
import { MessageAttachmentEntity } from '../messaging/entities/message-attachment.entity';
import { ConversationEntity } from '../messaging/entities/conversation.entity';
import { ConversationParticipantEntity } from '../messaging/entities/conversation-participant.entity';
import { AttendanceEntity } from '../attendance/entities/attendance.entity';

export const TENANT_SCOPED_ENTITIES: EntityTarget<unknown>[] = [
  AccountsEntity,
  RoleEntity,
  PermissionEntity,
  TeachersEntity,
  StudentsEntity,
  ParentsEntity,
  SystemSettingsEntity,
  IntegrationEntity,
  GradingSystemEntity,
  EventNotificationEntity,
  CalendarEventEntity,
  ReportsEntity,
  TeacherCommentEntity,
  SubjectsEntity,
  MarksEntity,
  FeesEntity,
  BillsEntity,
  BalancesEntity,
  ExemptionEntity,
  TermsEntity,
  EnrolEntity,
  ClassEntity,
  ContinuousAssessmentEntity,
  ActivityEntity,
  StudentCreditEntity,
  CreditTransactionEntity,
  ReceiptEntity,
  InvoiceEntity,
  FinancialAuditLogEntity,
  CreditInvoiceAllocationEntity,
  ReceiptInvoiceAllocationEntity,
  ReceiptCreditEntity,
  MessageEntity,
  MessageReadEntity,
  MessageAttachmentEntity,
  ConversationEntity,
  ConversationParticipantEntity,
  AttendanceEntity,
];
