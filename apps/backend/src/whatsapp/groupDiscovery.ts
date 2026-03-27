import type { WASocket } from '@whiskeysockets/baileys';
import { SOCKET_EVENTS } from '@whatsapp-porter/shared';
import { prisma } from '../db';
import { emit } from '../socket/emitter';
import { logger } from '../utils/logger';

export async function onGroupsDiscovered(sock: WASocket): Promise<void> {
  logger.info('Fetching joined groups...');

  const groups = await sock.groupFetchAllParticipating();
  const groupList = Object.values(groups);

  logger.info(`Found ${groupList.length} groups`);

  for (const group of groupList) {
    await prisma.group.upsert({
      where: { id: group.id },
      update: {
        name: group.subject,
        participantCount: group.participants?.length || 0,
      },
      create: {
        id: group.id,
        name: group.subject,
        participantCount: group.participants?.length || 0,
      },
    });
  }

  const allGroups = await prisma.group.findMany({
    orderBy: { name: 'asc' },
  });

  emit(SOCKET_EVENTS.GROUPS_UPDATED, { groups: allGroups });
}

export async function refreshGroups(sock: WASocket): Promise<void> {
  await onGroupsDiscovered(sock);
}
