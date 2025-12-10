import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import FlowBuilderClient from '../../../components/FlowBuilderClient';
import { getUserFromSession } from '../../../lib/auth';
import dbConnect from '../../../lib/mongodb';
import WhatsAppAccount from '../../../models/WhatsAppAccount';

export default async function FlowBuilderPage() {
  const cookieStore = cookies();
  const session = cookieStore.get('session');
  const user = await getUserFromSession(session?.value);

  if (!user) {
    redirect('/');
  }

  await dbConnect();
  const account = await WhatsAppAccount.findOne({ userId: user.id }).lean();

  return (
    <FlowBuilderClient
      userEmail={user.email}
      userId={user.id}
      hasWhatsAppAccount={!!account}
    />
  );
}


