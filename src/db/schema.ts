// src/db/schema.ts
import { sqliteTable, text, integer, real, index, unique } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// =================== ENUMS ===================
export const eventStatusEnum = ['ACTIVE', 'CLOSED', 'CANCELLED'] as const;

export const participantStatusEnum = [
  'PENDING',
  'ACCEPTED', 
  'ACCEPTED_WITH_RESERVATION',
  'ACCEPTED_WITHOUT_TIME',
  'OTHER_TIME',
  'DECLINED'
] as const;

export const auditActionEnum = [
  'EVENT_CREATED',
  'EVENT_UPDATED',
  'EVENT_CLOSED',
  'EVENT_CANCELLED',
  'EVENT_REOPENED',
  'PARTICIPANT_ADDED',
  'PARTICIPANT_REMOVED',
  'PARTICIPANT_RESPONDED',
  'PARTICIPANT_INVITED',
  'REMINDER_SENT',
  'START_REMINDER_SENT'
] as const;

// 🔥 NEW: Response Context for Analytics
export const responseContextEnum = [
  'INITIAL',
  'AFTER_REMINDER', 
  'AFTER_START_REMINDER',
  'LAST_MINUTE'
] as const;

// =================== TABLES ===================

// Servers Table
export const servers = sqliteTable('servers', {
  id: text('id').primaryKey(), // Discord Server ID
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  lastActivityAt: integer('last_activity_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Server Users Table (User per Server)
export const serverUsers = sqliteTable('server_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(), // Discord User ID
  username: text('username').notNull(),
  displayName: text('display_name'),
  firstSeenAt: integer('first_seen_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  lastActiveAt: integer('last_active_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  totalInvites: integer('total_invites').notNull().default(0),
  totalResponses: integer('total_responses').notNull().default(0),
  avgResponseTimeSeconds: integer('avg_response_time_seconds'),
  
  // 🔥 NEW: User Behavior Analytics (nullable for backwards compatibility)
  avgResponseTimeHours: real('avg_response_time_hours'), // Average hours to respond
  reminderDependencyRate: real('reminder_dependency_rate'), // % responses only after reminder (0-100)
  lastMinuteCancellationRate: real('last_minute_cancellation_rate'), // % last minute changes (0-100)
  quickResponseRate: real('quick_response_rate'), // % responses < 6h (0-100)
  totalRemindersReceived: integer('total_reminders_received').default(0), // Total reminders sent to user
  totalLastMinuteChanges: integer('total_last_minute_changes').default(0), // Total last minute status changes
}, (table) => ({
  serverUserUnique: unique().on(table.serverId, table.userId),
  serverIdLastActiveIdx: index('server_users_server_id_last_active_idx').on(table.serverId, table.lastActiveAt),
  userIdIdx: index('server_users_user_id_idx').on(table.userId),
  reminderDependencyIdx: index('server_users_reminder_dependency_idx').on(table.reminderDependencyRate),
  quickResponseIdx: index('server_users_quick_response_idx').on(table.quickResponseRate),
}));

// Events Table
export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  date: text('date').notNull(), // Original date string (DD.MM.YYYY)
  time: text('time').notNull(), // Original time string (HH:MM)
  parsedDate: integer('parsed_date', { mode: 'timestamp' }), // Parsed for queries (nullable for migration)
  relativeDate: text('relative_date'), // Discord timestamp
  comment: text('comment'),
  channelId: text('channel_id').notNull(), // Discord Channel ID
  messageId: text('message_id'), // Discord Message ID
  organizerId: text('organizer_id').notNull(), // Discord User ID
  status: text('status', { enum: eventStatusEnum }).notNull().default('ACTIVE'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  closedAt: integer('closed_at', { mode: 'timestamp' }),
  cancelledAt: integer('cancelled_at', { mode: 'timestamp' }),
  cancellationReason: text('cancellation_reason'),
  
  // 🔥 NEW: Event Analytics (nullable for backwards compatibility)
  averageResponseTimeHours: real('average_response_time_hours'), // Average response time for this event
  remindersSent: integer('reminders_sent').default(0), // Total reminders sent for this event
  startRemindersSent: integer('start_reminders_sent').default(0), // Start reminders sent
  lastMinuteChanges: integer('last_minute_changes').default(0), // Count of last minute status changes
}, (table) => ({
  serverIdCreatedAtIdx: index('events_server_id_created_at_idx').on(table.serverId, table.createdAt),
  serverIdStatusIdx: index('events_server_id_status_idx').on(table.serverId, table.status),
  parsedDateIdx: index('events_parsed_date_idx').on(table.parsedDate),
  organizerIdIdx: index('events_organizer_id_idx').on(table.organizerId),
  avgResponseTimeIdx: index('events_avg_response_time_idx').on(table.averageResponseTimeHours),
}));

// Participants Table
export const participants = sqliteTable('participants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  serverUserId: integer('server_user_id').notNull().references(() => serverUsers.id, { onDelete: 'cascade' }),
  invitedAt: integer('invited_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  currentStatus: text('current_status', { enum: participantStatusEnum }).notNull().default('PENDING'),
  alternativeTime: text('alternative_time'),
}, (table) => ({
  eventServerUserUnique: unique().on(table.eventId, table.serverUserId),
  eventIdCurrentStatusIdx: index('participants_event_id_current_status_idx').on(table.eventId, table.currentStatus),
}));

// Response History Table (Analytics Goldmine)
export const responseHistory = sqliteTable('response_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  participantId: integer('participant_id').notNull().references(() => participants.id, { onDelete: 'cascade' }),
  oldStatus: text('old_status', { enum: participantStatusEnum }),
  newStatus: text('new_status', { enum: participantStatusEnum }).notNull(),
  changedAt: integer('changed_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  responseTimeSeconds: integer('response_time_seconds'), // Seconds since invitation
  alternativeTime: text('alternative_time'), // If status is OTHER_TIME
  
  // 🔥 NEW: Response Context Analytics (nullable for backwards compatibility)
  responseContext: text('response_context', { 
    enum: responseContextEnum 
  }), // Context of this response
  reminderCount: integer('reminder_count'), // How many reminders before this response
  hoursBeforeEvent: real('hours_before_event'), // Hours before event start when responded
}, (table) => ({
  participantIdChangedAtIdx: index('response_history_participant_id_changed_at_idx').on(table.participantId, table.changedAt),
  changedAtIdx: index('response_history_changed_at_idx').on(table.changedAt),
  responseContextIdx: index('response_history_context_idx').on(table.responseContext),
  hoursBeforeEventIdx: index('response_history_hours_before_idx').on(table.hoursBeforeEvent),
}));

// Event Audit Log Table
export const eventAuditLogs = sqliteTable('event_audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  action: text('action', { enum: auditActionEnum }).notNull(),
  performedBy: text('performed_by').notNull(), // Discord User ID
  performedAt: integer('performed_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  details: text('details'), // JSON string for additional data
}, (table) => ({
  eventIdPerformedAtIdx: index('event_audit_logs_event_id_performed_at_idx').on(table.eventId, table.performedAt),
  performedByIdx: index('event_audit_logs_performed_by_idx').on(table.performedBy),
  performedAtIdx: index('event_audit_logs_performed_at_idx').on(table.performedAt),
}));

// =================== RELATIONS ===================

export const serversRelations = relations(servers, ({ many }) => ({
  events: many(events),
  serverUsers: many(serverUsers),
}));

export const serverUsersRelations = relations(serverUsers, ({ one, many }) => ({
  server: one(servers, {
    fields: [serverUsers.serverId],
    references: [servers.id],
  }),
  organizedEvents: many(events),
  participations: many(participants),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  server: one(servers, {
    fields: [events.serverId],
    references: [servers.id],
  }),
  organizer: one(serverUsers, {
    fields: [events.serverId, events.organizerId],
    references: [serverUsers.serverId, serverUsers.userId],
  }),
  participants: many(participants),
  auditLogs: many(eventAuditLogs),
}));

export const participantsRelations = relations(participants, ({ one, many }) => ({
  event: one(events, {
    fields: [participants.eventId],
    references: [events.id],
  }),
  serverUser: one(serverUsers, {
    fields: [participants.serverUserId],
    references: [serverUsers.id],
  }),
  responseHistory: many(responseHistory),
}));

export const responseHistoryRelations = relations(responseHistory, ({ one }) => ({
  participant: one(participants, {
    fields: [responseHistory.participantId],
    references: [participants.id],
  }),
}));

export const eventAuditLogsRelations = relations(eventAuditLogs, ({ one }) => ({
  event: one(events, {
    fields: [eventAuditLogs.eventId],
    references: [events.id],
  }),
}));

// =================== TYPES ===================

export type Server = typeof servers.$inferSelect;
export type NewServer = typeof servers.$inferInsert;

export type ServerUser = typeof serverUsers.$inferSelect;
export type NewServerUser = typeof serverUsers.$inferInsert;

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;

export type ResponseHistory = typeof responseHistory.$inferSelect;
export type NewResponseHistory = typeof responseHistory.$inferInsert;

export type EventAuditLog = typeof eventAuditLogs.$inferSelect;
export type NewEventAuditLog = typeof eventAuditLogs.$inferInsert;

// Enhanced types with relations
export type EventWithRelations = Event & {
  server: Server;
  organizer: ServerUser;
  participants: (Participant & {
    serverUser: ServerUser;
    responseHistory: ResponseHistory[];
  })[];
  auditLogs: EventAuditLog[];
};

export type ParticipantWithHistory = Participant & {
  serverUser: ServerUser;
  responseHistory: ResponseHistory[];
  event: Event;
};

export type ServerUserWithStats = ServerUser & {
  organizedEvents: Event[];
  participations: (Participant & {
    event: Event;
  })[];
};

// 🔥 NEW: Analytics-specific types
export type ResponseContext = typeof responseContextEnum[number];

export type UserBehaviorStats = {
  userId: string;
  username: string;
  totalEvents: number;
  avgResponseTimeHours: number;
  reminderDependencyRate: number;
  lastMinuteCancellationRate: number;
  quickResponseRate: number;
  totalRemindersReceived: number;
  totalLastMinuteChanges: number;
};

export type EventAnalytics = {
  eventId: string;
  title: string;
  averageResponseTimeHours: number;
  remindersSent: number;
  startRemindersSent: number;
  lastMinuteChanges: number;
  totalParticipants: number;
  responseRate: number;
};