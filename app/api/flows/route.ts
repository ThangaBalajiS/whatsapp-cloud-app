import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import { getUserFromSession } from '../../../lib/auth';
import { getUserFlows, createFlow, saveUserFlow } from '../../../lib/flowEngine';

// GET - List all flows for the user
export async function GET() {
  try {
    const cookieStore = cookies();
    const session = cookieStore.get('session');
    const user = await getUserFromSession(session?.value);

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const flows = await getUserFlows(user.id);

    return NextResponse.json({
      flows: flows.map(f => f.toObject()),
    });
  } catch (error: any) {
    console.error('Flow fetch error:', error);
    return NextResponse.json(
      { message: error?.message || 'Failed to load flows' },
      { status: 500 }
    );
  }
}

// POST - Create a new flow
export async function POST(request: Request) {
  try {
    const cookieStore = cookies();
    const session = cookieStore.get('session');
    const user = await getUserFromSession(session?.value);

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    await dbConnect();

    // If flowId is provided, update existing flow (legacy support)
    if (body.flowId) {
      const name = typeof body.name === 'string' ? body.name : 'Default Flow';
      const connections = Array.isArray(body.connections) ? body.connections : [];
      const functions = Array.isArray(body.functions) ? body.functions : [];

      const flow = await saveUserFlow(user.id, {
        name,
        trigger: body.trigger,
        firstTemplate: body.firstTemplate,
        connections,
        functions,
      });

      return NextResponse.json({ flow: flow?.toObject() });
    }

    // Create new flow
    const flow = await createFlow(user.id, {
      name: body.name || 'New Flow',
      trigger: body.trigger || { matchType: 'any', matchText: '' },
      firstTemplate: body.firstTemplate || '',
      connections: body.connections || [],
      functions: body.functions || [],
    });

    return NextResponse.json({ flow: flow.toObject() });
  } catch (error: any) {
    console.error('Flow save error:', error);
    return NextResponse.json(
      { message: error?.message || 'Failed to save flow' },
      { status: 500 }
    );
  }
}
