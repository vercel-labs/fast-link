'use server';

import { revalidatePath } from 'next/cache';

/** Invalidates the contract destination and returns the server time. */
export async function invalidateDestination(): Promise<number> {
  revalidatePath('/contracts/destination');
  return Date.now();
}
