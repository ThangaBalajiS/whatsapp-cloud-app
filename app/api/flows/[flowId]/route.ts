import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import dbConnect from '../../../../lib/mongodb';
import { getUserFromSession } from '../../../../lib/auth';
import { getFlowById, updateFlow, deleteFlow } from '../../../../lib/flowEngine';

type RouteParams = {
    params: { flowId: string };
};

// GET - Get a specific flow
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const cookieStore = cookies();
        const session = cookieStore.get('session');
        const user = await getUserFromSession(session?.value);

        if (!user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { flowId } = params;
        if (!flowId) {
            return NextResponse.json({ message: 'Flow ID required' }, { status: 400 });
        }

        await dbConnect();
        const flow = await getFlowById(user.id, flowId);

        if (!flow) {
            return NextResponse.json({ message: 'Flow not found' }, { status: 404 });
        }

        return NextResponse.json({ flow: flow.toObject() });
    } catch (error: any) {
        console.error('Flow fetch error:', error);
        return NextResponse.json(
            { message: error?.message || 'Failed to load flow' },
            { status: 500 }
        );
    }
}

// PUT - Update a specific flow
export async function POST(request: Request, { params }: RouteParams) {
    try {
        const cookieStore = cookies();
        const session = cookieStore.get('session');
        const user = await getUserFromSession(session?.value);

        if (!user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { flowId } = params;
        if (!flowId) {
            return NextResponse.json({ message: 'Flow ID required' }, { status: 400 });
        }

        const body = await request.json();

        console.log('[Flow API] PUT request body:', JSON.stringify(body, null, 2));

        await dbConnect();

        const flow = await updateFlow(user.id, flowId, {
            name: body.name,
            trigger: body.trigger,
            firstTemplate: body.firstTemplate,
            connections: body.connections,
            functions: body.functions,
        });

        if (!flow) {
            return NextResponse.json({ message: 'Flow not found' }, { status: 404 });
        }

        return NextResponse.json({ flow: flow.toObject() });
    } catch (error: any) {
        console.error('Flow update error:', error);
        return NextResponse.json(
            { message: error?.message || 'Failed to update flow' },
            { status: 500 }
        );
    }
}

// DELETE - Delete a specific flow
export async function DELETE(request: Request, { params }: RouteParams) {
    try {
        const cookieStore = cookies();
        const session = cookieStore.get('session');
        const user = await getUserFromSession(session?.value);

        if (!user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { flowId } = params;
        if (!flowId) {
            return NextResponse.json({ message: 'Flow ID required' }, { status: 400 });
        }

        await dbConnect();
        const result = await deleteFlow(user.id, flowId);

        if (!result) {
            return NextResponse.json({ message: 'Flow not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Flow deleted' });
    } catch (error: any) {
        console.error('Flow delete error:', error);
        return NextResponse.json(
            { message: error?.message || 'Failed to delete flow' },
            { status: 500 }
        );
    }
}
