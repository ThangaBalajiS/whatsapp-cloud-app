import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import dbConnect from '../../../../lib/mongodb';
import { getUserFromSession } from '../../../../lib/auth';
import { executeFunctionNode } from '../../../../lib/flowEngine';

export async function POST(request: Request) {
  try {
    const cookieStore = cookies();
    const session = cookieStore.get('session');
    const user = await getUserFromSession(session?.value);

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const functionName = body.functionName as string;
    const input = body.input;
    const context = body.context || {};

    if (!functionName) {
      return NextResponse.json(
        { message: 'functionName is required' },
        { status: 400 }
      );
    }

    await dbConnect();

    const result = await executeFunctionNode({
      userId: user.id,
      functionName,
      input,
      context,
    });

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error('Function execution error:', error);
    return NextResponse.json(
      { message: error?.message || 'Failed to execute function' },
      { status: 500 }
    );
  }
}
