import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import { getUserFromSession } from '../../../lib/auth';
import { getUserFlow, saveUserFlow } from '../../../lib/flowEngine';

export async function GET() {
  try {
    const cookieStore = cookies();
    const session = cookieStore.get('session');
    const user = await getUserFromSession(session?.value);

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const flow = await getUserFlow(user.id);

    return NextResponse.json({
      flow: flow ? flow.toObject() : null,
    });
  } catch (error: any) {
    console.error('Flow fetch error:', error);
    return NextResponse.json(
      { message: error?.message || 'Failed to load flow' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = cookies();
    const session = cookieStore.get('session');
    const user = await getUserFromSession(session?.value);

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name : 'Default Flow';
    const connections = Array.isArray(body.connections) ? body.connections : [];
    const functions = Array.isArray(body.functions) ? body.functions : [];

    await dbConnect();

    const flow = await saveUserFlow(user.id, {
      name,
      connections,
      functions,
    });

    return NextResponse.json({ flow: flow?.toObject() });
  } catch (error: any) {
    console.error('Flow save error:', error);
    return NextResponse.json(
      { message: error?.message || 'Failed to save flow' },
      { status: 500 }
    );
  }
}
