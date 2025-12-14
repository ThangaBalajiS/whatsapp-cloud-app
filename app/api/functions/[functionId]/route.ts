import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import dbConnect from '../../../../lib/mongodb';
import { getUserFromSession } from '../../../../lib/auth';
import Function from '../../../../models/Function';

type RouteParams = {
    params: { functionId: string };
};

// GET - Get a specific function
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const cookieStore = cookies();
        const session = cookieStore.get('session');
        const user = await getUserFromSession(session?.value);

        if (!user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { functionId } = params;
        if (!functionId) {
            return NextResponse.json({ message: 'Function ID required' }, { status: 400 });
        }

        await dbConnect();
        const fn = await Function.findOne({ _id: functionId, userId: user.id });

        if (!fn) {
            return NextResponse.json({ message: 'Function not found' }, { status: 404 });
        }

        return NextResponse.json({ function: fn.toObject() });
    } catch (error: any) {
        console.error('Function fetch error:', error);
        return NextResponse.json(
            { message: error?.message || 'Failed to load function' },
            { status: 500 }
        );
    }
}

// PUT - Update a specific function
export async function PUT(request: Request, { params }: RouteParams) {
    try {
        const cookieStore = cookies();
        const session = cookieStore.get('session');
        const user = await getUserFromSession(session?.value);

        if (!user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { functionId } = params;
        if (!functionId) {
            return NextResponse.json({ message: 'Function ID required' }, { status: 400 });
        }

        const body = await request.json();

        await dbConnect();

        const updateData: Record<string, unknown> = {};
        if (body.name !== undefined) updateData.name = body.name;
        if (body.description !== undefined) updateData.description = body.description;
        if (body.code !== undefined) updateData.code = body.code;
        if (body.inputKey !== undefined) updateData.inputKey = body.inputKey;
        if (body.timeoutMs !== undefined) updateData.timeoutMs = body.timeoutMs;
        if (body.nextTemplate !== undefined) updateData.nextTemplate = body.nextTemplate;

        const fn = await Function.findOneAndUpdate(
            { _id: functionId, userId: user.id },
            { $set: updateData },
            { new: true }
        );

        if (!fn) {
            return NextResponse.json({ message: 'Function not found' }, { status: 404 });
        }

        return NextResponse.json({ function: fn.toObject() });
    } catch (error: any) {
        console.error('Function update error:', error);

        if (error.code === 11000) {
            return NextResponse.json(
                { message: 'A function with this name already exists' },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { message: error?.message || 'Failed to update function' },
            { status: 500 }
        );
    }
}

// DELETE - Delete a specific function
export async function DELETE(request: Request, { params }: RouteParams) {
    try {
        const cookieStore = cookies();
        const session = cookieStore.get('session');
        const user = await getUserFromSession(session?.value);

        if (!user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { functionId } = params;
        if (!functionId) {
            return NextResponse.json({ message: 'Function ID required' }, { status: 400 });
        }

        await dbConnect();
        const result = await Function.findOneAndDelete({ _id: functionId, userId: user.id });

        if (!result) {
            return NextResponse.json({ message: 'Function not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Function deleted' });
    } catch (error: any) {
        console.error('Function delete error:', error);
        return NextResponse.json(
            { message: error?.message || 'Failed to delete function' },
            { status: 500 }
        );
    }
}
