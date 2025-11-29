# WhatsApp Cloud App

A free, self-hostable dashboard for WhatsApp Cloud API. Receive incoming messages via webhook, view conversations, and send replies—no infrastructure setup required.

## The Problem

When you connect a phone number to WhatsApp Cloud API, you lose access to the regular WhatsApp app for that number. This means you can't see messages people send you unless you:
- Set up your own webhook server
- Pay for an expensive third-party platform

## The Solution

This app gives you:
- **Webhook endpoint** — Add it to your Meta dashboard and start receiving messages instantly
- **Message inbox** — View all incoming messages in a clean dashboard
- **Send messages** — Reply manually or automate responses via flows
- **Free & self-hostable** — No subscriptions, no vendor lock-in

## Features

- User authentication (Signup/Signin)
- Protected dashboard
- MongoDB for message & session persistence
- Secure password hashing with bcryptjs
- JWT-based sessions

## Prerequisites

- Node.js
- MongoDB running locally on `mongodb://localhost:27017` (or configure `MONGODB_URI`)

## Getting Started

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

## License

MIT
