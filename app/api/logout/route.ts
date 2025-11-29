import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ message: 'Signed out' });
  response.cookies.set({
    name: 'session',
    value: '',
    httpOnly: true,
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return response;
}
