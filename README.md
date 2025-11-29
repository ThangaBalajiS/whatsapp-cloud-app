# WhatsApp Cloud App

A Next.js (App Router) application with user authentication using MongoDB, Mongoose, and JWT sessions.

## Features

- User Signup (Name, Email, Password)
- User Signin
- Protected Dashboard
- Persistent storage with MongoDB
- Secure password hashing with bcryptjs

## Prerequisites

- Node.js
- MongoDB running locally on `mongodb://localhost:27017` (or configure `MONGODB_URI`)

## Getting started

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file (optional, defaults provided for local dev):
```env
MONGODB_URI=mongodb://localhost:27017/whatsapp-cloud-app
JWT_SECRET_KEY=your-secret-key
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.
