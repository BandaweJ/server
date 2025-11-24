-- ============================================================================
-- COMPREHENSIVE SCHEMA MIGRATION FOR RENDER DATABASE
-- ============================================================================
-- This script creates all new tables and enums needed for:
-- 1. Continuous Assessment System
-- 2. Messaging System (Conversations, Messages, Participants, Reads, Attachments)
-- 3. Calendar System (Events, Notifications)
-- 4. System Settings
-- 5. Grading Systems
-- 6. Integrations
-- 
-- SAFE TO RUN: This script is idempotent and won't fail if objects exist
-- Run with: psql "YOUR_CONNECTION_STRING" -f render-schema-migration.sql
-- ============================================================================

-- ============================================================================
-- PART 1: Create Enums
-- ============================================================================

-- Conversation Type Enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversation_type_enum') THEN
        CREATE TYPE "conversation_type_enum" AS ENUM ('direct', 'group', 'class', 'school_wide');
        RAISE NOTICE 'Enum conversation_type_enum created';
    ELSE
        RAISE NOTICE 'Enum conversation_type_enum already exists, skipping';
    END IF;
END $$;

-- Message Type Enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_type_enum') THEN
        CREATE TYPE "message_type_enum" AS ENUM ('text', 'image', 'file', 'system');
        RAISE NOTICE 'Enum message_type_enum created';
    ELSE
        RAISE NOTICE 'Enum message_type_enum already exists, skipping';
    END IF;
END $$;

-- Participant Role Enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'participant_role_enum') THEN
        CREATE TYPE "participant_role_enum" AS ENUM ('admin', 'member');
        RAISE NOTICE 'Enum participant_role_enum created';
    ELSE
        RAISE NOTICE 'Enum participant_role_enum already exists, skipping';
    END IF;
END $$;

-- Integration Type Enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'integration_type_enum') THEN
        CREATE TYPE "integration_type_enum" AS ENUM (
            'PAYMENT_GATEWAY', 'SMS_SERVICE', 'CLOUD_STORAGE', 
            'ACCOUNTING_SOFTWARE', 'PARENT_COMMUNICATION', 
            'LEARNING_MANAGEMENT', 'OTHER'
        );
        RAISE NOTICE 'Enum integration_type_enum created';
    ELSE
        RAISE NOTICE 'Enum integration_type_enum already exists, skipping';
    END IF;
END $$;

-- Integration Status Enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'integration_status_enum') THEN
        CREATE TYPE "integration_status_enum" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR', 'PENDING');
        RAISE NOTICE 'Enum integration_status_enum created';
    ELSE
        RAISE NOTICE 'Enum integration_status_enum already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- PART 2: Continuous Assessment Table
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'continuous_assessments'
    ) THEN
        CREATE TABLE "continuous_assessments" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "studentId" character varying NOT NULL,
            "teacherId" character varying NULL,
            "classId" integer NOT NULL,
            "subjectCode" character varying NULL,
            "topicOrSkill" character varying(255) NOT NULL,
            "assessmentDate" TIMESTAMP NOT NULL,
            "score" numeric(6,2) NOT NULL,
            "maxScore" numeric(6,2) NULL,
            "assessmentType" character varying(100) NOT NULL DEFAULT 'exercise',
            "cohort" character varying(100) NULL,
            "notes" text NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_continuous_assessments" PRIMARY KEY ("id"),
            CONSTRAINT "FK_continuous_assessments_student" 
                FOREIGN KEY ("studentId") 
                REFERENCES "students"("studentNumber") 
                ON DELETE RESTRICT,
            CONSTRAINT "FK_continuous_assessments_teacher" 
                FOREIGN KEY ("teacherId") 
                REFERENCES "teachers"("id") 
                ON DELETE SET NULL,
            CONSTRAINT "FK_continuous_assessments_subject" 
                FOREIGN KEY ("subjectCode") 
                REFERENCES "subjects"("code") 
                ON DELETE SET NULL
        );
        
        CREATE INDEX "IDX_continuous_assessments_studentId" ON "continuous_assessments"("studentId");
        CREATE INDEX "IDX_continuous_assessments_classId" ON "continuous_assessments"("classId");
        CREATE INDEX "IDX_continuous_assessments_assessmentDate" ON "continuous_assessments"("assessmentDate");
        
        RAISE NOTICE 'Table continuous_assessments created successfully';
    ELSE
        RAISE NOTICE 'Table continuous_assessments already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- PART 3: Conversations Table
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'conversations'
    ) THEN
        CREATE TABLE "conversations" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "type" "conversation_type_enum" NOT NULL DEFAULT 'direct',
            "name" character varying NULL,
            "description" text NULL,
            "createdById" character varying NOT NULL,
            "classId" integer NULL,
            "isArchived" boolean NOT NULL DEFAULT false,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            "lastMessageAt" TIMESTAMP NULL,
            CONSTRAINT "PK_conversations" PRIMARY KEY ("id"),
            CONSTRAINT "FK_conversations_createdBy" 
                FOREIGN KEY ("createdById") 
                REFERENCES "accounts"("id") 
                ON DELETE RESTRICT,
            CONSTRAINT "FK_conversations_class" 
                FOREIGN KEY ("classId") 
                REFERENCES "classes"("id") 
                ON DELETE SET NULL
        );
        
        CREATE INDEX "IDX_conversations_createdById" ON "conversations"("createdById");
        CREATE INDEX "IDX_conversations_classId" ON "conversations"("classId");
        CREATE INDEX "IDX_conversations_lastMessageAt" ON "conversations"("lastMessageAt");
        
        RAISE NOTICE 'Table conversations created successfully';
    ELSE
        RAISE NOTICE 'Table conversations already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- PART 4: Conversation Participants Table
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'conversation_participants'
    ) THEN
        CREATE TABLE "conversation_participants" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "conversationId" uuid NOT NULL,
            "userId" character varying NOT NULL,
            "role" "participant_role_enum" NOT NULL DEFAULT 'member',
            "joinedAt" TIMESTAMP NOT NULL DEFAULT now(),
            "leftAt" TIMESTAMP NULL,
            "lastReadAt" TIMESTAMP NULL,
            "isMuted" boolean NOT NULL DEFAULT false,
            "isArchived" boolean NOT NULL DEFAULT false,
            CONSTRAINT "PK_conversation_participants" PRIMARY KEY ("id"),
            CONSTRAINT "FK_conversation_participants_conversation" 
                FOREIGN KEY ("conversationId") 
                REFERENCES "conversations"("id") 
                ON DELETE CASCADE,
            CONSTRAINT "FK_conversation_participants_user" 
                FOREIGN KEY ("userId") 
                REFERENCES "accounts"("id") 
                ON DELETE CASCADE,
            CONSTRAINT "UQ_conversation_participants_conversation_user" 
                UNIQUE ("conversationId", "userId")
        );
        
        CREATE INDEX "IDX_conversation_participants_conversationId" ON "conversation_participants"("conversationId");
        CREATE INDEX "IDX_conversation_participants_userId" ON "conversation_participants"("userId");
        
        RAISE NOTICE 'Table conversation_participants created successfully';
    ELSE
        RAISE NOTICE 'Table conversation_participants already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- PART 5: Messages Table
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'messages'
    ) THEN
        CREATE TABLE "messages" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "conversationId" uuid NOT NULL,
            "senderId" character varying NULL,
            "content" text NOT NULL,
            "type" "message_type_enum" NOT NULL DEFAULT 'text',
            "replyToId" uuid NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            "editedAt" TIMESTAMP NULL,
            "deletedAt" TIMESTAMP NULL,
            "isPinned" boolean NOT NULL DEFAULT false,
            CONSTRAINT "PK_messages" PRIMARY KEY ("id"),
            CONSTRAINT "FK_messages_conversation" 
                FOREIGN KEY ("conversationId") 
                REFERENCES "conversations"("id") 
                ON DELETE CASCADE,
            CONSTRAINT "FK_messages_sender" 
                FOREIGN KEY ("senderId") 
                REFERENCES "accounts"("id") 
                ON DELETE SET NULL,
            CONSTRAINT "FK_messages_replyTo" 
                FOREIGN KEY ("replyToId") 
                REFERENCES "messages"("id") 
                ON DELETE SET NULL
        );
        
        CREATE INDEX "IDX_messages_conversationId" ON "messages"("conversationId");
        CREATE INDEX "IDX_messages_senderId" ON "messages"("senderId");
        CREATE INDEX "IDX_messages_createdAt" ON "messages"("createdAt");
        
        RAISE NOTICE 'Table messages created successfully';
    ELSE
        RAISE NOTICE 'Table messages already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- PART 6: Message Reads Table
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'message_reads'
    ) THEN
        CREATE TABLE "message_reads" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "messageId" uuid NOT NULL,
            "userId" character varying NOT NULL,
            "readAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_message_reads" PRIMARY KEY ("id"),
            CONSTRAINT "FK_message_reads_message" 
                FOREIGN KEY ("messageId") 
                REFERENCES "messages"("id") 
                ON DELETE CASCADE,
            CONSTRAINT "FK_message_reads_user" 
                FOREIGN KEY ("userId") 
                REFERENCES "accounts"("id") 
                ON DELETE CASCADE,
            CONSTRAINT "UQ_message_reads_message_user" 
                UNIQUE ("messageId", "userId")
        );
        
        CREATE INDEX "IDX_message_reads_messageId" ON "message_reads"("messageId");
        CREATE INDEX "IDX_message_reads_userId" ON "message_reads"("userId");
        
        RAISE NOTICE 'Table message_reads created successfully';
    ELSE
        RAISE NOTICE 'Table message_reads already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- PART 7: Message Attachments Table
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'message_attachments'
    ) THEN
        CREATE TABLE "message_attachments" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "messageId" uuid NOT NULL,
            "fileName" character varying NOT NULL,
            "fileType" character varying NOT NULL,
            "fileSize" bigint NOT NULL,
            "filePath" character varying NOT NULL,
            "mimeType" character varying NOT NULL,
            "thumbnailPath" character varying NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_message_attachments" PRIMARY KEY ("id"),
            CONSTRAINT "FK_message_attachments_message" 
                FOREIGN KEY ("messageId") 
                REFERENCES "messages"("id") 
                ON DELETE CASCADE
        );
        
        CREATE INDEX "IDX_message_attachments_messageId" ON "message_attachments"("messageId");
        
        RAISE NOTICE 'Table message_attachments created successfully';
    ELSE
        RAISE NOTICE 'Table message_attachments already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- PART 8: Calendar Events Table
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'calendar_events'
    ) THEN
        CREATE TABLE "calendar_events" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "title" character varying NOT NULL,
            "description" text NULL,
            "startDate" TIMESTAMP NOT NULL,
            "endDate" TIMESTAMP NOT NULL,
            "allDay" boolean NOT NULL DEFAULT false,
            "location" character varying NULL,
            "color" character varying NULL,
            "isPublic" boolean NOT NULL DEFAULT true,
            "createdById" character varying NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_calendar_events" PRIMARY KEY ("id"),
            CONSTRAINT "FK_calendar_events_createdBy" 
                FOREIGN KEY ("createdById") 
                REFERENCES "accounts"("id") 
                ON DELETE RESTRICT
        );
        
        CREATE INDEX "IDX_calendar_events_startDate" ON "calendar_events"("startDate");
        CREATE INDEX "IDX_calendar_events_createdById" ON "calendar_events"("createdById");
        
        RAISE NOTICE 'Table calendar_events created successfully';
    ELSE
        RAISE NOTICE 'Table calendar_events already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- PART 9: Event Notifications Table
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'event_notifications'
    ) THEN
        CREATE TABLE "event_notifications" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "eventId" uuid NOT NULL,
            "userId" character varying NOT NULL,
            "enabled" boolean NOT NULL DEFAULT true,
            "reminderMinutes" integer[] NOT NULL DEFAULT '{}',
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_event_notifications" PRIMARY KEY ("id"),
            CONSTRAINT "FK_event_notifications_event" 
                FOREIGN KEY ("eventId") 
                REFERENCES "calendar_events"("id") 
                ON DELETE CASCADE,
            CONSTRAINT "FK_event_notifications_user" 
                FOREIGN KEY ("userId") 
                REFERENCES "accounts"("id") 
                ON DELETE CASCADE,
            CONSTRAINT "UQ_event_notifications_event_user" 
                UNIQUE ("eventId", "userId")
        );
        
        CREATE INDEX "IDX_event_notifications_eventId" ON "event_notifications"("eventId");
        CREATE INDEX "IDX_event_notifications_userId" ON "event_notifications"("userId");
        
        RAISE NOTICE 'Table event_notifications created successfully';
    ELSE
        RAISE NOTICE 'Table event_notifications already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- PART 10: System Settings Table
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'system_settings'
    ) THEN
        CREATE TABLE "system_settings" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "schoolName" character varying NULL,
            "schoolAddress" character varying NULL,
            "schoolPhone" character varying NULL,
            "schoolEmail" character varying NULL,
            "schoolWebsite" character varying NULL,
            "schoolLogo" character varying NULL,
            "primaryColor" character varying NULL,
            "accentColor" character varying NULL,
            "warnColor" character varying NULL,
            "smtpHost" character varying NULL,
            "smtpPort" integer NULL,
            "smtpSecure" boolean NOT NULL DEFAULT false,
            "smtpUser" character varying NULL,
            "smtpPassword" character varying NULL,
            "smtpFromEmail" character varying NULL,
            "smtpFromName" character varying NULL,
            "emailNotificationsEnabled" boolean NOT NULL DEFAULT true,
            "smsNotificationsEnabled" boolean NOT NULL DEFAULT true,
            "sessionTimeoutMinutes" integer NOT NULL DEFAULT 30,
            "requirePasswordChange" boolean NOT NULL DEFAULT true,
            "passwordExpiryDays" integer NOT NULL DEFAULT 90,
            "defaultLanguage" character varying NOT NULL DEFAULT 'en',
            "timezone" character varying NOT NULL DEFAULT 'Africa/Harare',
            "currency" character varying NOT NULL DEFAULT 'USD',
            "dateFormat" character varying NOT NULL DEFAULT 'dd/MM/yyyy',
            "maxLoginAttempts" integer NOT NULL DEFAULT 5,
            "lockoutDurationMinutes" integer NOT NULL DEFAULT 15,
            "enableTwoFactorAuth" boolean NOT NULL DEFAULT true,
            "autoBackupEnabled" boolean NOT NULL DEFAULT true,
            "backupRetentionDays" integer NOT NULL DEFAULT 7,
            "backupSchedule" character varying NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_system_settings" PRIMARY KEY ("id")
        );
        
        -- Insert default settings if none exist
        INSERT INTO "system_settings" ("id", "schoolName")
        SELECT gen_random_uuid(), 'Junior High School'
        WHERE NOT EXISTS (SELECT 1 FROM "system_settings");
        
        RAISE NOTICE 'Table system_settings created successfully';
    ELSE
        RAISE NOTICE 'Table system_settings already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- PART 11: Grading Systems Table
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'grading_systems'
    ) THEN
        CREATE TABLE "grading_systems" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "level" character varying NOT NULL,
            "gradeThresholds" json NOT NULL,
            "failGrade" character varying NULL,
            "active" boolean NOT NULL DEFAULT true,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_grading_systems" PRIMARY KEY ("id"),
            CONSTRAINT "UQ_grading_systems_level" UNIQUE ("level")
        );
        
        RAISE NOTICE 'Table grading_systems created successfully';
    ELSE
        RAISE NOTICE 'Table grading_systems already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- PART 12: Integrations Table
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'integrations'
    ) THEN
        CREATE TABLE "integrations" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "type" "integration_type_enum" NOT NULL,
            "name" character varying NOT NULL,
            "description" character varying NULL,
            "status" "integration_status_enum" NOT NULL DEFAULT 'INACTIVE',
            "configuration" json NULL,
            "isTestMode" boolean NOT NULL DEFAULT false,
            "lastSyncAt" TIMESTAMP NULL,
            "lastError" text NULL,
            "lastErrorAt" TIMESTAMP NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_integrations" PRIMARY KEY ("id")
        );
        
        CREATE INDEX "IDX_integrations_type" ON "integrations"("type");
        CREATE INDEX "IDX_integrations_status" ON "integrations"("status");
        
        RAISE NOTICE 'Table integrations created successfully';
    ELSE
        RAISE NOTICE 'Table integrations already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- VERIFICATION: Check all tables were created
-- ============================================================================
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_name IN (
        'continuous_assessments',
        'conversations',
        'conversation_participants',
        'messages',
        'message_reads',
        'message_attachments',
        'calendar_events',
        'event_notifications',
        'system_settings',
        'grading_systems',
        'integrations'
    );
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration completed!';
    RAISE NOTICE 'Total new tables created: %', table_count;
    RAISE NOTICE '========================================';
END $$;

