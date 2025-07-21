// src/test-drizzle.ts
import { db, initializeDatabase, testDatabaseConnection } from './db';
import { 
  servers, 
  serverUsers, 
  events, 
  participants, 
  responseHistory, 
  eventAuditLogs,
  eventStatusEnum,
  participantStatusEnum,
  auditActionEnum
} from './db/schema';
import { eq, and } from 'drizzle-orm';

async function testDrizzleOperations() {
  console.log('🧪 Testing Drizzle ORM operations...\n');

  try {
    // 1. Initialize database
    await initializeDatabase();
    
    // 2. Test connection
    const connected = await testDatabaseConnection();
    if (!connected) {
      throw new Error('Database connection failed');
    }

    // 3. Create test server
    console.log('📝 Creating test server...');
    const [server] = await db.insert(servers).values({
      id: '123456789012345678',
      name: 'Test Server',
      createdAt: new Date(),
      lastActivityAt: new Date()
    }).returning();
    console.log('✅ Server created:', server.name);

    // 4. Create test user
    console.log('📝 Creating test user...');
    const [serverUser] = await db.insert(serverUsers).values({
      serverId: server.id,
      userId: '306774312864710656',
      username: 'TestUser',
      displayName: 'Test Display Name',
      firstSeenAt: new Date(),
      lastActiveAt: new Date()
    }).returning();
    console.log('✅ User created:', serverUser.username);

    // 5. Create test event
    console.log('📝 Creating test event...');
    const [event] = await db.insert(events).values({
      id: 'test-event-' + Date.now(),
      serverId: server.id,
      title: 'Test Event',
      date: '25.12.2024',
      time: '20:00',
      channelId: '987654321098765432',
      organizerId: serverUser.userId,
      status: 'ACTIVE', // Use string directly
      createdAt: new Date()
    }).returning();
    console.log('✅ Event created:', event.title);

    // 6. Create test participant
    console.log('📝 Creating test participant...');
    const [participant] = await db.insert(participants).values({
      eventId: event.id,
      serverUserId: serverUser.id,
      currentStatus: 'PENDING', // Use string directly
      invitedAt: new Date()
    }).returning();
    console.log('✅ Participant created');

    // 7. Create response history
    console.log('📝 Creating response history...');
    const [response] = await db.insert(responseHistory).values({
      participantId: participant.id,
      oldStatus: null,
      newStatus: 'ACCEPTED', // Use string directly
      responseTimeSeconds: 3600, // 1 hour
      changedAt: new Date()
    }).returning();
    console.log('✅ Response history created');

    // 8. Create audit log
    console.log('📝 Creating audit log...');
    const [auditLog] = await db.insert(eventAuditLogs).values({
      eventId: event.id,
      action: 'PARTICIPANT_RESPONDED', // Use string directly
      performedBy: serverUser.userId,
      performedAt: new Date(),
      details: JSON.stringify({ 
        oldStatus: 'PENDING', 
        newStatus: 'ACCEPTED' 
      })
    }).returning();
    console.log('✅ Audit log created');

    // 9. Test complex query with relations
    console.log('📝 Testing complex query with relations...');
    const eventWithRelations = await db.query.events.findFirst({
      where: eq(events.id, event.id),
      with: {
        server: true,
        organizer: true,
        participants: {
          with: {
            serverUser: true,
            responseHistory: true
          }
        },
        auditLogs: true
      }
    });

    console.log('✅ Complex query successful');
    console.log('📊 Event data:', {
      title: eventWithRelations?.title,
      server: eventWithRelations?.server.name,
      organizer: eventWithRelations?.organizer?.username,
      participantCount: eventWithRelations?.participants.length,
      auditLogCount: eventWithRelations?.auditLogs.length,
      responseHistoryCount: eventWithRelations?.participants[0]?.responseHistory.length
    });

    // 10. Test analytics query
    console.log('📝 Testing analytics query...');
    const analyticsData = await db
      .select({
        eventId: events.id,
        title: events.title,
        status: events.status,
        participantCount: participants.id,
        organizerName: serverUsers.username
      })
      .from(events)
      .leftJoin(participants, eq(events.id, participants.eventId))
      .leftJoin(serverUsers, and(
        eq(serverUsers.serverId, events.serverId),
        eq(serverUsers.userId, events.organizerId)
      ))
      .where(eq(events.serverId, server.id));

    console.log('✅ Analytics query successful:', analyticsData.length, 'records');

    // 11. Clean up test data
    console.log('🧹 Cleaning up test data...');
    await db.delete(servers).where(eq(servers.id, server.id));
    console.log('✅ Test data cleaned up');

    console.log('\n🎉 All Drizzle tests passed!');

  } catch (error) {
    console.error('❌ Drizzle test failed:', error);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  testDrizzleOperations();
}

export { testDrizzleOperations };