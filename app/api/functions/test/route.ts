import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getUserFromSession } from '../../../../lib/auth';
import { runUserFunction } from '../../../../lib/functionRunner';

// POST - Test run a function
export async function POST(request: Request) {
    try {
        const cookieStore = cookies();
        const session = cookieStore.get('session');
        const user = await getUserFromSession(session?.value);

        if (!user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { code, input, inputKey = 'input', timeoutMs = 5000 } = body;

        if (!code) {
            return NextResponse.json(
                { message: 'Code is required' },
                { status: 400 }
            );
        }

        // Create context with input key
        const context: Record<string, unknown> = {
            userId: user.id,
        };
        if (inputKey) {
            context[inputKey] = input;
        }

        const result = await runUserFunction({
            code,
            input,
            context,
            timeoutMs: Math.min(Math.max(timeoutMs, 100), 20000),
        });

        return NextResponse.json({
            success: true,
            output: result.output,
            logs: result.logs,
            durationMs: result.durationMs,
        });
    } catch (error: any) {
        console.error('Function test error:', error);
        return NextResponse.json(
            { message: error?.message || 'Failed to test function' },
            { status: 500 }
        );
    }
}
