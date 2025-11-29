import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import dbConnect from '../../../../../lib/mongodb';
import Contact from '../../../../../models/Contact';
import Message from '../../../../../models/Message';
import { getUserFromSession } from '../../../../../lib/auth';

// GET - Fetch messages for a contact
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

    // Fetch messages
    const messages = await Message.find({ contactId: params.contactId })
      .sort({ timestamp: 1 })
      .lean();

    // Mark messages as read and reset unread count
    await Message.updateMany(
      { contactId: params.contactId, direction: 'incoming', isRead: false },
      { isRead: true }
    );

    contact.unreadCount = 0;
    await contact.save();

    return NextResponse.json({ contact, messages });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

