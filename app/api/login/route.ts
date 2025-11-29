import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import User from '../../../models/User';
import { verifyPassword, createSessionToken } from '../../../lib/auth';

type LoginBody = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
  const body = (await request.json()) as LoginBody;
  const email = body.email?.trim();
  const password = body.password?.trim();

  if (!email || !password) {
    return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 });
  }

    await dbConnect();
    
    const user = await User.findOne({ email });

  if (!user) {
    return NextResponse.json({ message: 'Invalid email or password.' }, { status: 401 });
  }

    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
      return NextResponse.json({ message: 'Invalid email or password.' }, { status: 401 });
    }

    const authenticatedUser = {
      id: user._id.toString(),
      email: user.email,
      name: user.name
    };

    const token = await createSessionToken(authenticatedUser);

    const response = NextResponse.json({ message: 'Signed in', user: authenticatedUser });

  response.cookies.set({
    name: 'session',
    value: token,
    httpOnly: true,
    path: '/',
    maxAge: 60 * 60,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return response;
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'An error occurred' }, { status: 500 });
  }
}
