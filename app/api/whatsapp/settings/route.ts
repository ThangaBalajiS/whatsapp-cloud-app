import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import dbConnect from '../../../../lib/mongodb';
import WhatsAppAccount from '../../../../models/WhatsAppAccount';
import { getUserFromSession } from '../../../../lib/auth';
import { encrypt, decrypt, generateVerifyToken } from '../../../../lib/encryption';

// GET - Fetch current WhatsApp settings
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
      return NextResponse.json({ account: null });
    }

    // Don't send the full access token back, just indicate it's set
    return NextResponse.json({
      account: {
        phoneNumberId: account.phoneNumberId,
        businessAccountId: account.businessAccountId,
        hasAccessToken: !!account.accessToken,
        webhookVerifyToken: account.webhookVerifyToken,
        isConnected: account.isConnected,
      },
      userId: user.id,
    });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

// POST - Create or update WhatsApp settings
export async function POST(request: Request) {
  try {
    const cookieStore = cookies();
    const session = cookieStore.get('session');
    const user = await getUserFromSession(session?.value);

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { phoneNumberId, businessAccountId, accessToken } = await request.json();

    if (!phoneNumberId || !businessAccountId || !accessToken) {
      return NextResponse.json(
        { message: 'Phone Number ID, Business Account ID, and Access Token are required' },
        { status: 400 }
      );
    }

    await dbConnect();

    const encryptedToken = encrypt(accessToken);
    
    let account = await WhatsAppAccount.findOne({ userId: user.id });

    if (account) {
      // Update existing
      account.phoneNumberId = phoneNumberId;
      account.businessAccountId = businessAccountId;
      account.accessToken = encryptedToken;
      await account.save();
    } else {
      // Create new
      const webhookVerifyToken = generateVerifyToken();
      account = await WhatsAppAccount.create({
        userId: user.id,
        phoneNumberId,
        businessAccountId,
        accessToken: encryptedToken,
        webhookVerifyToken,
      });
    }

    return NextResponse.json({
      message: 'Settings saved successfully',
      account: {
        phoneNumberId: account.phoneNumberId,
        businessAccountId: account.businessAccountId,
        hasAccessToken: true,
        webhookVerifyToken: account.webhookVerifyToken,
        isConnected: account.isConnected,
      },
      userId: user.id,
    });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

// DELETE - Remove WhatsApp settings
export async function DELETE() {
  try {
    const cookieStore = cookies();
    const session = cookieStore.get('session');
    const user = await getUserFromSession(session?.value);

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    await WhatsAppAccount.deleteOne({ userId: user.id });

    return NextResponse.json({ message: 'Settings deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

