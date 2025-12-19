import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserFromSession } from '../../../lib/auth';
import dbConnect from '../../../lib/mongodb';
import WhatsAppAccount from '../../../models/WhatsAppAccount';
import FunctionsClient from '../../../components/FunctionsClient';

export default async function FunctionsPage() {
  const cookieStore = cookies();
  const session = cookieStore.get('session');
  const user = await getUserFromSession(session?.value);

  if (!user) {
    redirect('/');
  }

  await dbConnect();
  const account = await WhatsAppAccount.findOne({ userId: user.id }).lean();

  return (
    <FunctionsClient
      userEmail={user.email}
      userId={user.id}
      hasWhatsAppAccount={!!account}
    />
  );
}
