import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserFromSession } from '../../../lib/auth';
import dbConnect from '../../../lib/mongodb';
import WhatsAppAccount from '../../../models/WhatsAppAccount';
import CustomMessagesClient from '../../../components/CustomMessagesClient';

export default async function CustomMessagesPage() {
    const cookieStore = cookies();
    const session = cookieStore.get('session');
    const user = await getUserFromSession(session?.value);

    if (!user) {
        redirect('/');
    }

    await dbConnect();
    const account = await WhatsAppAccount.findOne({ userId: user.id }).lean();

    return (
        <CustomMessagesClient
            userEmail={user.email}
            userId={user.id}
            hasWhatsAppAccount={!!account}
        />
    );
}
