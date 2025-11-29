import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import dbConnect from '../../../../lib/mongodb';
import WhatsAppAccount from '../../../../models/WhatsAppAccount';
import Contact from '../../../../models/Contact';
import Message from '../../../../models/Message';
import { getUserFromSession } from '../../../../lib/auth';
import { decrypt } from '../../../../lib/encryption';

export async function POST(request: Request) {
  try {
    const cookieStore = cookies();
    const session = cookieStore.get('session');
    const user = await getUserFromSession(session?.value);

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { contactId, message } = await request.json();

    if (!contactId || !message) {
      return NextResponse.json(
        { message: 'Contact ID and message are required' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Get WhatsApp account
    const account = await WhatsAppAccount.findOne({ userId: user.id });

    if (!account) {
      return NextResponse.json(
        { message: 'WhatsApp account not configured' },
        { status: 400 }
      );
    }

    // Get contact
    const contact = await Contact.findOne({ _id: contactId, userId: user.id });

    if (!contact) {
      return NextResponse.json({ message: 'Contact not found' }, { status: 404 });
    }

    // Decrypt access token
    const accessToken = decrypt(account.accessToken);

    // Send message via WhatsApp API
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${account.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: contact.waId,
          type: 'text',
          text: {
            preview_url: false,
            body: message,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { message: data.error?.message || 'Failed to send message' },
        { status: response.status }
      );
    }

    // Save message to database
    const newMessage = await Message.create({
      userId: user.id,
      contactId: contact._id,
      waMessageId: data.messages?.[0]?.id || `local_${Date.now()}`,
      direction: 'outgoing',
      type: 'text',
      content: message,
      timestamp: new Date(),
      status: 'sent',
      isRead: true,
    });

    // Update contact's last message time
    contact.lastMessageAt = new Date();
    await contact.save();

    return NextResponse.json({
      message: 'Message sent successfully',
      data: {
        id: newMessage._id,
        waMessageId: newMessage.waMessageId,
        content: newMessage.content,
        timestamp: newMessage.timestamp,
        status: newMessage.status,
      },
    });
  } catch (error: any) {
    console.error('Send message error:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

