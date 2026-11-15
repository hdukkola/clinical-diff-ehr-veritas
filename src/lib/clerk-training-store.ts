import { auth } from '@clerk/nextjs/server';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { clerkTrainingEnabled } from '@/lib/clerk-training';

const projectId = 'diffmd-training-veritas-26';
const clerkId = /^user_[A-Za-z0-9]{1,64}$/;
export const trainingCaseId = /^SYNC-[A-F0-9]{32}$/;

export function trainingAccessError(request: Request) {
  if (!clerkTrainingEnabled || process.env.DIFFMD_CLERK_TRAINING_PROJECT !== projectId) {
    return { status: 404, error: 'training_unavailable' };
  }
  if (!process.env.DIFFMD_CLERK_TRAINING_ORIGIN
    || request.headers.get('Origin') !== process.env.DIFFMD_CLERK_TRAINING_ORIGIN) {
    return { status: 403, error: 'invalid_origin' };
  }
}

export async function trainingCaseStore() {
  const { userId, sessionId, actor } = await auth({ acceptsToken: 'session_token' });
  if (!userId || !sessionId || actor || !clerkId.test(userId)) {
    return { status: 401, error: 'sign_in_required' } as const;
  }
  const app = getApps().find(({ name }) => name === 'diffmd-clerk-training')
    ?? initializeApp({ projectId }, 'diffmd-clerk-training');
  const database = getFirestore(app);
  const invite = await database.collection('workspaceClerkAccounts').doc(userId).get();
  if (invite.get('enabled') !== true) return { status: 403, error: 'invite_required' } as const;
  const records = database.collection('clerkTrainingWorkspaces').doc(userId).collection('cases');
  return { database, records };
}
