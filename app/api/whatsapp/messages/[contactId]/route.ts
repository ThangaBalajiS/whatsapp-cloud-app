import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import dbConnect from '../../../../../lib/mongodb';
import Contact from '../../../../../models/Contact';
import Message from '../../../../../models/Message';
import { getUserFromSession } from '../../../../../lib/auth';

// GET - Fetch messages for a contact with pagination
export async function GET(
  request: Request,
  { params }: { params: { contactId: string } }
) {
  try {
    const cookieStore = cookies();
    const session = cookieStore.get('session');
    const user = await getUserFromSession(session?.value);

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    // Verify contact belongs to user
    const contact = await Contact.findOne({
      _id: params.contactId,
      userId: user.id,
    });

    if (!contact) {
      return NextResponse.json({ message: 'Contact not found' }, { status: 404 });
    }

    // Parse pagination params
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const before = searchParams.get('before'); // Timestamp cursor for older messages

    // Build query
    const query: any = { contactId: params.contactId };
    if (before) {
      query.timestamp = { $lt: new Date(before) };
    }

    // Fetch messages (get newest first, then reverse for display order)
    const messages = await Message.find(query)
      .sort({ timestamp: -1 })
      .limit(limit + 1) // Fetch one extra to check if there are more
      .lean();

    // Check if there are more messages
    const hasMore = messages.length > limit;
    if (hasMore) {
      messages.pop(); // Remove the extra message
    }

    // Reverse to get chronological order (oldest first)
    messages.reverse();

    // Mark messages as read and reset unread count (only on initial load)
    if (!before) {
      await Message.updateMany(
        { contactId: params.contactId, direction: 'incoming', isRead: false },
        { isRead: true }
      );

      contact.unreadCount = 0;
      await contact.save();
    }

    return NextResponse.json({ contact, messages, hasMore });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

