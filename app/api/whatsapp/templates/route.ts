import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import dbConnect from '../../../../lib/mongodb';
import WhatsAppAccount from '../../../../models/WhatsAppAccount';
import { decrypt } from '../../../../lib/encryption';
import { getUserFromSession } from '../../../../lib/auth';

const GRAPH_VERSION = 'v18.0';

export async function GET() {
  try {
    const cookieStore = cookies();
    const session = cookieStore.get('session');
    const user = await getUserFromSession(session?.value);

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const account = await WhatsAppAccount.findOne({ userId: user.id });

    if (!account) {
      return NextResponse.json(
        { message: 'WhatsApp account is not configured' },
        { status: 404 }
      );
    }

    if (!account.accessToken) {
      return NextResponse.json(
        { message: 'No access token found for this account' },
        { status: 400 }
      );
    }

    const accessToken = decrypt(account.accessToken);

    const url = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/${account.businessAccountId}/message_templates`
    );
    url.searchParams.set('fields', 'name,status,category,language,components');
    url.searchParams.set('limit', '200');
    url.searchParams.set('access_token', accessToken);

    const response = await fetch(url.toString(), { cache: 'no-store' });
    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { message: data?.error?.message || 'Failed to fetch templates' },
        { status: response.status }
      );
    }

    return NextResponse.json({ templates: data.data || [] });
  } catch (error: any) {
    console.error('Templates fetch error:', error);
    return NextResponse.json(
      { message: error?.message || 'Unexpected error fetching templates' },
      { status: 500 }
    );
  }
}

