import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import dbConnect from '../../../../lib/mongodb';
import Contact from '../../../../models/Contact';
import { getUserFromSession } from '../../../../lib/auth';

// GET - Fetch all contacts for the user
export async function GET() {
  try {
    const cookieStore = cookies();
    const session = cookieStore.get('session');
    const user = await getUserFromSession(session?.value);

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const contacts = await Contact.find({ userId: user.id })
      .sort({ lastMessageAt: -1 })
      .lean();

    return NextResponse.json({ contacts });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

