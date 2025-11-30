import { NextResponse } from 'next/server';
import dbConnect from '../../../../../lib/mongodb';
import WhatsAppAccount from '../../../../../models/WhatsAppAccount';
import Contact from '../../../../../models/Contact';
import Message from '../../../../../models/Message';
import { eventEmitter } from '../../../../../lib/eventEmitter';

// GET - Webhook verification (Meta sends this to verify the endpoint)
export async function GET(
  request: Request,
  { params }: { params: { userId: string } }
) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (!mode || !token || !challenge) {
    return NextResponse.json({ message: 'Missing parameters' }, { status: 400 });
  }

  if (mode !== 'subscribe') {
    return NextResponse.json({ message: 'Invalid mode' }, { status: 403 });
  }

  try {
    await dbConnect();

    const account = await WhatsAppAccount.findOne({ userId: params.userId });

    if (!account) {
      return NextResponse.json({ message: 'Account not found' }, { status: 404 });
    }

    if (token !== account.webhookVerifyToken) {
      return NextResponse.json({ message: 'Invalid verify token' }, { status: 403 });
    }

    // Mark account as connected
    account.isConnected = true;
    await account.save();

    // Emit webhook connected event
    eventEmitter.emit(params.userId, 'webhook_connected', { isConnected: true });

    // Return the challenge to verify
    return new NextResponse(challenge, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

// POST - Receive incoming messages from WhatsApp
export async function POST(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const body = await request.json();

    await dbConnect();

    const account = await WhatsAppAccount.findOne({ userId: params.userId });

    if (!account) {
      // Still return 200 to prevent Meta from retrying
      return NextResponse.json({ message: 'OK' }, { status: 200 });
    }

    // Mark as connected if not already (first message received)
    if (!account.isConnected) {
      account.isConnected = true;
      await account.save();
      eventEmitter.emit(params.userId, 'webhook_connected', { isConnected: true });
    }

    // Process the webhook payload
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) {
      return NextResponse.json({ message: 'OK' }, { status: 200 });
    }

    // Handle incoming messages
    const messages = value.messages;
    const contacts = value.contacts;

    if (messages && messages.length > 0) {
      for (const msg of messages) {
        const contactInfo = contacts?.find((c: any) => c.wa_id === msg.from);
        
        // Find or create contact
        let contact = await Contact.findOne({
          userId: params.userId,
          waId: msg.from,
        });

        let isNewContact = false;
        if (!contact) {
          isNewContact = true;
          contact = await Contact.create({
            userId: params.userId,
            waId: msg.from,
            phoneNumber: msg.from,
            name: contactInfo?.profile?.name || msg.from,
          });
        } else if (contactInfo?.profile?.name && contact.name !== contactInfo.profile.name) {
          contact.name = contactInfo.profile.name;
          await contact.save();
        }

        // Determine message type and content
        let type = 'text';
        let content = '';
        let mediaUrl = '';

        if (msg.type === 'text') {
          type = 'text';
          content = msg.text?.body || '';
        } else if (msg.type === 'image') {
          type = 'image';
          content = msg.image?.caption || '[Image]';
          mediaUrl = msg.image?.id || '';
        } else if (msg.type === 'document') {
          type = 'document';
          content = msg.document?.filename || '[Document]';
          mediaUrl = msg.document?.id || '';
        } else if (msg.type === 'audio') {
          type = 'audio';
          content = '[Audio]';
          mediaUrl = msg.audio?.id || '';
        } else if (msg.type === 'video') {
          type = 'video';
          content = msg.video?.caption || '[Video]';
          mediaUrl = msg.video?.id || '';
        } else if (msg.type === 'sticker') {
          type = 'sticker';
          content = '[Sticker]';
          mediaUrl = msg.sticker?.id || '';
        } else if (msg.type === 'location') {
          type = 'location';
          content = `[Location: ${msg.location?.latitude}, ${msg.location?.longitude}]`;
        } else {
          type = 'unknown';
          content = `[${msg.type}]`;
        }

        // Check if message already exists (prevent duplicates)
        const existingMessage = await Message.findOne({ waMessageId: msg.id });
        
        if (!existingMessage) {
          const newMessage = await Message.create({
            userId: params.userId,
            contactId: contact._id,
            waMessageId: msg.id,
            direction: 'incoming',
            type,
            content,
            mediaUrl,
            timestamp: new Date(parseInt(msg.timestamp) * 1000),
            isRead: false,
          });

          // Update contact's last message time and unread count
          contact.lastMessageAt = new Date();
          contact.unreadCount = (contact.unreadCount || 0) + 1;
          await contact.save();

          // Emit new message event
          eventEmitter.emit(params.userId, 'new_message', {
            message: {
              _id: newMessage._id,
              contactId: contact._id,
              direction: 'incoming',
              type,
              content,
              timestamp: newMessage.timestamp,
              status: 'received',
            },
            contact: {
              _id: contact._id,
              waId: contact.waId,
              phoneNumber: contact.phoneNumber,
              name: contact.name,
              lastMessageAt: contact.lastMessageAt,
              unreadCount: contact.unreadCount,
              isNew: isNewContact,
            },
          });
        }
      }
    }

    // Handle status updates (sent, delivered, read)
    const statuses = value.statuses;
    if (statuses && statuses.length > 0) {
      for (const status of statuses) {
        await Message.updateOne(
          { waMessageId: status.id },
          { status: status.status }
        );

        // Emit status update event
        eventEmitter.emit(params.userId, 'message_status', {
          waMessageId: status.id,
          status: status.status,
        });
      }
    }

    return NextResponse.json({ message: 'OK' }, { status: 200 });
  } catch (error: any) {
    console.error('Webhook error:', error);
    // Always return 200 to prevent Meta from retrying
    return NextResponse.json({ message: 'OK' }, { status: 200 });
  }
}
