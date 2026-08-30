import { db } from '../db';
import { drivers, users } from '@shared/schema';
import { eq } from 'drizzle-orm';

export class NotADriverError extends Error {
  constructor(message: string = 'No driver profile found for this user') {
    super(message);
    this.name = 'NotADriverError';
  }
}

export async function getDriverIdForUser(userId: string): Promise<string | null> {
  const user = await db.select({ driverId: users.driverId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  if (user.length && user[0].driverId) {
    return user[0].driverId;
  }
  
  const driver = await db.select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.userId, userId))
    .limit(1);
  
  if (driver.length) {
    await db.update(users)
      .set({ driverId: driver[0].id, updatedAt: new Date() })
      .where(eq(users.id, userId));
    
    return driver[0].id;
  }
  
  return null;
}

export async function resolveDriverForUser(userId: string): Promise<string> {
  const driverId = await getDriverIdForUser(userId);
  
  if (!driverId) {
    throw new NotADriverError();
  }
  
  return driverId;
}

export async function getDriverContext(userId: string): Promise<{
  driverId: string | null;
  isDriver: boolean;
}> {
  const driverId = await getDriverIdForUser(userId);
  
  return {
    driverId,
    isDriver: driverId !== null,
  };
}
