import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserFromSession } from '../../../lib/auth';
import dbConnect from '../../../lib/mongodb';
import WhatsAppAccount from '../../../models/WhatsAppAccount';
import AppointmentsClient from './AppointmentsClient';

export default async function AppointmentsPage() {
  const cookieStore = cookies();
  const session = cookieStore.get('session');
  const user = await getUserFromSession(session?.value);

  if (!user) {
    redirect('/');
  }

  await dbConnect();
  const account = await WhatsAppAccount.findOne({ userId: user.id }).lean();

  return (
    <AppointmentsClient
      userEmail={user.email}
      userId={user.id}
      hasWhatsAppAccount={!!account}
    />
  );
}
