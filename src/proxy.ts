import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { clerkTrainingEnabled } from '@/lib/clerk-training';

const origin = process.env.DIFFMD_CLERK_TRAINING_ORIGIN;
const clerkReady = clerkTrainingEnabled && origin
  && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_')
  && process.env.CLERK_SECRET_KEY?.startsWith('sk_test_');

const authenticate = clerkReady ? clerkMiddleware({ authorizedParties: [origin] }) : undefined;

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!clerkTrainingEnabled) return NextResponse.next();
  if (!authenticate) return new NextResponse('Training sign-in is unavailable.', { status: 503 });
  return authenticate(request, event);
}

export const config = { matcher: ['/', '/api/training/cases'] };
