import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import { getUserFromSession } from '../../../lib/auth';
import Function from '../../../models/Function';

// GET - List all functions for the user
export async function GET() {
    try {
        const cookieStore = cookies();
        const session = cookieStore.get('session');
        const user = await getUserFromSession(session?.value);

        if (!user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const functions = await Function.find({ userId: user.id }).sort({ updatedAt: -1 });

        return NextResponse.json({
            functions: functions.map(f => f.toObject()),
        });
    } catch (error: any) {
        console.error('Functions fetch error:', error);
        return NextResponse.json(
            { message: error?.message || 'Failed to load functions' },
            { status: 500 }
        );
    }
}

// POST - Create a new function
export async function POST(request: Request) {
    try {
        const cookieStore = cookies();
        const session = cookieStore.get('session');
        const user = await getUserFromSession(session?.value);

        if (!user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        if (!body.name || !body.code) {
            return NextResponse.json(
                { message: 'Name and code are required' },
                { status: 400 }
            );
        }

        await dbConnect();

        const fn = await Function.create({
            userId: user.id,
            name: body.name,
            description: body.description || '',
            code: body.code,
            inputKey: body.inputKey || 'input',
            timeoutMs: body.timeoutMs || 5000,
            nextTemplate: body.nextTemplate || '',
        });

        return NextResponse.json({ function: fn.toObject() });
    } catch (error: any) {
        console.error('Function create error:', error);

        // Handle duplicate name error
        if (error.code === 11000) {
            return NextResponse.json(
                { message: 'A function with this name already exists' },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { message: error?.message || 'Failed to create function' },
            { status: 500 }
        );
    }
}
