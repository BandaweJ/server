-- Fix script to create messaging tables that failed due to class table name issue
-- Run this after the main migration

-- ============================================================================
-- Create Conversations Table (with correct class reference)
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
-- Create Conversation Participants Table
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
-- Create Messages Table
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
-- Create Message Reads Table
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
-- Create Message Attachments Table
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

-- All messaging tables should now be created!

