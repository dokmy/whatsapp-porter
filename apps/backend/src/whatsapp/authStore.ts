import { prisma } from '../db';
import type { AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { proto } from '@whiskeysockets/baileys';
import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';

export async function usePrismaAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const writeData = async (id: string, data: unknown) => {
    const value = JSON.stringify(data, BufferJSON.replacer);
    await prisma.authState.upsert({
      where: { id },
      update: { value },
      create: { id, value },
    });
  };

  const readData = async (id: string): Promise<unknown | null> => {
    const row = await prisma.authState.findUnique({ where: { id } });
    if (!row) return null;
    return JSON.parse(row.value, BufferJSON.reviver);
  };

  const removeData = async (id: string) => {
    await prisma.authState.delete({ where: { id } }).catch(() => {});
  };

  const credsRow = await readData('creds');
  const creds = credsRow ? (credsRow as ReturnType<typeof initAuthCreds>) : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              const value = await readData(`${type}-${id}`);
              if (value) {
                if (type === 'app-state-sync-key') {
                  data[id] = proto.Message.AppStateSyncKeyData.fromObject(value as object) as SignalDataTypeMap[T];
                } else {
                  data[id] = value as SignalDataTypeMap[T];
                }
              }
            })
          );
          return data;
        },
        set: async (data: Record<string, Record<string, unknown>>) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await writeData('creds', creds);
    },
  };
}
