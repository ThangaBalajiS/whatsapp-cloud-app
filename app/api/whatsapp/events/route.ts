import { cookies } from 'next/headers';
import { getUserFromSession } from '../../../../lib/auth';
import { eventEmitter } from '../../../../lib/eventEmitter';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cookieStore = cookies();
  const session = cookieStore.get('session');
  const user = await getUserFromSession(session?.value);

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'connected' })}\n\n`));

      // Subscribe to events for this user
      unsubscribe = eventEmitter.subscribe(user.id, (eventData) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`));
        } catch (e) {
          // Stream closed
        }
      });
    },
    cancel() {
      if (unsubscribe) {
        unsubscribe();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

