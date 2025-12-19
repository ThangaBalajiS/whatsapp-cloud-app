import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import { getUserFromSession } from '../../../lib/auth';
import CustomMessage from '../../../models/CustomMessage';

// GET - List all custom messages for the user
export async function GET() {
    try {
        const cookieStore = cookies();
        const session = cookieStore.get('session');
        const user = await getUserFromSession(session?.value);

        if (!user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const messages = await CustomMessage.find({ userId: user.id }).sort({ updatedAt: -1 });

        return NextResponse.json({
            messages: messages.map(m => m.toObject()),
        });
    } catch (error: any) {
        console.error('Custom messages fetch error:', error);
        return NextResponse.json(
            { message: error?.message || 'Failed to load custom messages' },
            { status: 500 }
        );
    }
}

// POST - Create a new custom message
export async function POST(request: Request) {
    try {
        const cookieStore = cookies();
        const session = cookieStore.get('session');
        const user = await getUserFromSession(session?.value);

        if (!user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        if (!body.name || !body.content) {
            return NextResponse.json(
                { message: 'Name and content are required' },
                { status: 400 }
            );
        }

        await dbConnect();

        const message = await CustomMessage.create({
            userId: user.id,
            name: body.name,
            content: body.content,
            buttons: body.buttons || [],
        });

        return NextResponse.json({ message: message.toObject() });
    } catch (error: any) {
        console.error('Custom message create error:', error);

        // Handle duplicate name error
        if (error.code === 11000) {
            return NextResponse.json(
                { message: 'A custom message with this name already exists' },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { message: error?.message || 'Failed to create custom message' },
            { status: 500 }
        );
    }
}
