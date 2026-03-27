import { relations } from "drizzle-orm";
import {
    boolean,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

// =================================================================
// ENUMS
// =================================================================

export const userRoleEnum = pgEnum("user_role", ["user", "admin", "developer"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "tool"]);
export const escalationStatusEnum = pgEnum("escalation_status", ["pending", "active", "resolved"]);
export const toolCallStatusEnum = pgEnum("tool_call_status", ["pending", "success", "failed"]);

// =================================================================
// BETTER AUTH REQUIRED TABLES (do not rename — adapter depends on these)
// =================================================================

export const user = pgTable("user", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    // Extended fields for our app
    role: userRoleEnum("role").notNull().default("user"),
});

export const session = pgTable("session", {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

// =================================================================
// AGENT  (E3 — NLP/ML)
// =================================================================

export const agents = pgTable("agents", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    systemPrompt: text("system_prompt").notNull(),
    model: varchar("model", { length: 100 }).notNull().default("gpt-4o"),
    temperature: integer("temperature").notNull().default(70), // stored as 0–100, divided by 100 at runtime
    tools: jsonb("tools").$type<string[]>().default([]),
    isActive: boolean("is_active").notNull().default(true),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// =================================================================
// CONVERSATIONS + MESSAGES  (E2 — Conversational UI)
// =================================================================

export const conversations = pgTable("conversations", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }),
    language: varchar("language", { length: 10 }).default("en"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
    index("conv_user_idx").on(t.userId),
    index("conv_agent_idx").on(t.agentId),
]);

export const messages = pgTable("messages", {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
        .notNull()
        .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    tokens: integer("tokens"),
    toolCallId: uuid("tool_call_id"),                 // links to tool_calls.id if role = 'tool'
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
    index("msg_conv_idx").on(t.conversationId),
]);

// =================================================================
// KNOWLEDGE BASE  (E4 — Knowledge Base & API Integration)
// =================================================================

export const knowledgeBase = pgTable("knowledge_base", {
    id: uuid("id").primaryKey().defaultRandom(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    category: varchar("category", { length: 100 }),
    source: varchar("source", { length: 50 }).default("manual"), // 'manual' | 'imported' | 'generated'
    embedding: jsonb("embedding").$type<number[]>(),             // pgvector ready — swap to vector(1536) when enabled
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
    index("kb_category_idx").on(t.category),
]);

export const escalations = pgTable("escalations", {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
        .notNull()
        .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    reason: text("reason"),
    status: escalationStatusEnum("status").notNull().default("pending"),
    resolvedById: text("resolved_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// =================================================================
// TOOL CALLS  (E3 — NLP/ML)
// =================================================================

export const toolCalls = pgTable("tool_calls", {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
        .notNull()
        .references(() => conversations.id, { onDelete: "cascade" }),
    toolName: varchar("tool_name", { length: 100 }).notNull(),
    input: jsonb("input"),
    output: jsonb("output"),
    status: toolCallStatusEnum("status").notNull().default("pending"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
    index("tc_conv_idx").on(t.conversationId),
]);

// =================================================================
// QUERY LOGS + AUDIT  (E5 — Performance, E8 — Admin)
// =================================================================

export const queryLogs = pgTable("query_logs", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    intent: varchar("intent", { length: 100 }),
    latencyMs: integer("latency_ms"),
    tokensUsed: integer("tokens_used"),
    resolved: boolean("resolved").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
    index("ql_user_idx").on(t.userId),
    index("ql_created_idx").on(t.createdAt),
]);

export const auditLogs = pgTable("audit_logs", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(),     // e.g. 'faq.create', 'user.ban', 'agent.update'
    entity: varchar("entity", { length: 100 }),               // e.g. 'knowledge_base', 'agent'
    entityId: text("entity_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
    index("al_user_idx").on(t.userId),
    index("al_action_idx").on(t.action),
]);

// =================================================================
// RELATIONS
// =================================================================

export const userRelations = relations(user, ({ many }) => ({
    sessions: many(session),
    accounts: many(account),
    conversations: many(conversations),
    agents: many(agents),
}));

export const conversationRelations = relations(conversations, ({ one, many }) => ({
    user: one(user, { fields: [conversations.userId], references: [user.id] }),
    agent: one(agents, { fields: [conversations.agentId], references: [agents.id] }),
    messages: many(messages),
    toolCalls: many(toolCalls),
    escalations: many(escalations),
}));

export const messageRelations = relations(messages, ({ one }) => ({
    conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}));

export const agentRelations = relations(agents, ({ one, many }) => ({
    createdBy: one(user, { fields: [agents.createdById], references: [user.id] }),
    conversations: many(conversations),
}));

export const knowledgeBaseRelations = relations(knowledgeBase, ({ }) => ({}));

export const toolCallRelations = relations(toolCalls, ({ one }) => ({
    conversation: one(conversations, { fields: [toolCalls.conversationId], references: [conversations.id] }),
}));