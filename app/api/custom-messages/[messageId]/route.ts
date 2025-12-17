import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import dbConnect from '../../../../lib/mongodb';
import { getUserFromSession } from '../../../../lib/auth';
import CustomMessage from '../../../../models/CustomMessage';

type RouteParams = {
    params: { messageId: string };
};

// GET - Get a specific custom message
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const cookieStore = cookies();
        const session = cookieStore.get('session');
        const user = await getUserFromSession(session?.value);

        if (!user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { messageId } = params;
        if (!messageId) {
            return NextResponse.json({ message: 'Message ID required' }, { status: 400 });
        }

        await dbConnect();
        const message = await CustomMessage.findOne({ _id: messageId, userId: user.id });

        if (!message) {
            return NextResponse.json({ message: 'Custom message not found' }, { status: 404 });
        }

        return NextResponse.json({ message: message.toObject() });
    } catch (error: any) {
        console.error('Custom message fetch error:', error);
        return NextResponse.json(
            { message: error?.message || 'Failed to load custom message' },
            { status: 500 }
        );
    }
}

// PUT - Update a specific custom message
export async function PUT(request: Request, { params }: RouteParams) {
    try {
        const cookieStore = cookies();
        const session = cookieStore.get('session');
        const user = await getUserFromSession(session?.value);

        if (!user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { messageId } = params;
        if (!messageId) {
            return NextResponse.json({ message: 'Message ID required' }, { status: 400 });
        }

        const body = await request.json();

        await dbConnect();

        // First find the document
        const existing = await CustomMessage.findOne({ _id: messageId, userId: user.id });
        if (!existing) {
            return NextResponse.json({ message: 'Custom message not found' }, { status: 404 });
        }

        // Update fields
        if (body.name !== undefined) existing.name = body.name;
        if (body.content !== undefined) existing.content = body.content;
        if (body.buttons !== undefined) existing.buttons = body.buttons;

        // Save to trigger pre-save hook for placeholder extraction
        await existing.save();

        return NextResponse.json({ message: existing.toObject() });
    } catch (error: any) {
        console.error('Custom message update error:', error);

        if (error.code === 11000) {
            return NextResponse.json(
                { message: 'A custom message with this name already exists' },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { message: error?.message || 'Failed to update custom message' },
            { status: 500 }
        );
    }
}

// DELETE - Delete a specific custom message
export async function DELETE(request: Request, { params }: RouteParams) {
    try {
        const cookieStore = cookies();
        const session = cookieStore.get('session');
        const user = await getUserFromSession(session?.value);

        if (!user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { messageId } = params;
        if (!messageId) {
            return NextResponse.json({ message: 'Message ID required' }, { status: 400 });
        }

        await dbConnect();
        const result = await CustomMessage.findOneAndDelete({ _id: messageId, userId: user.id });

        if (!result) {
            return NextResponse.json({ message: 'Custom message not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Custom message deleted' });
    } catch (error: any) {
        console.error('Custom message delete error:', error);
        return NextResponse.json(
            { message: error?.message || 'Failed to delete custom message' },
            { status: 500 }
        );
    }
}
