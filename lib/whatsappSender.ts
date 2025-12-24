import { decrypt } from './encryption';

const GRAPH_VERSION = 'v18.0';

export type TemplateComponent = {
    type: 'header' | 'body' | 'button';
    parameters?: Array<{
        type: 'text' | 'image' | 'document' | 'video';
        text?: string;
        image?: { link: string };
        document?: { link: string };
        video?: { link: string };
    }>;
    sub_type?: string;
    index?: string;
};

export type SendTemplateOptions = {
    phoneNumberId: string;
    accessToken: string; // encrypted
    recipientPhone: string;
    templateName: string;
    languageCode?: string;
    components?: TemplateComponent[];
};

export type SendTemplateResult = {
    success: boolean;
    messageId?: string;
    error?: string;
};

/**
 * Send a WhatsApp template message to a recipient
 */
export async function sendWhatsAppTemplate({
    phoneNumberId,
    accessToken,
    recipientPhone,
    templateName,
    languageCode = 'en',
    components = [],
}: SendTemplateOptions): Promise<SendTemplateResult> {
    try {
        const decryptedToken = decrypt(accessToken);

        const payload: Record<string, unknown> = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipientPhone,
            type: 'template',
            template: {
                name: templateName,
                language: {
                    code: languageCode,
                },
            },
        };

        // Add components if provided
        if (components.length > 0) {
            (payload.template as Record<string, unknown>).components = components;
        }

        const response = await fetch(
            `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${decryptedToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error('WhatsApp template send error:', data);
            return {
                success: false,
                error: data.error?.message || 'Failed to send template',
            };
        }

        return {
            success: true,
            messageId: data.messages?.[0]?.id,
        };
    } catch (error: any) {
        console.error('WhatsApp template send exception:', error);
        return {
            success: false,
            error: error.message || 'Unexpected error sending template',
        };
    }
}

/**
 * Send a plain text message via WhatsApp
 */
export async function sendWhatsAppText(options: {
    phoneNumberId: string;
    accessToken: string;
    recipientPhone: string;
    message: string;
}): Promise<SendTemplateResult> {
    try {
        const decryptedToken = decrypt(options.accessToken);

        const response = await fetch(
            `https://graph.facebook.com/${GRAPH_VERSION}/${options.phoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${decryptedToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: options.recipientPhone,
                    type: 'text',
                    text: {
                        preview_url: false,
                        body: options.message,
                    },
                }),
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data.error?.message || 'Failed to send message',
            };
        }

        return {
            success: true,
            messageId: data.messages?.[0]?.id,
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Unexpected error sending message',
        };
    }
}

export type CustomMessageButton = {
    type: 'quick_reply' | 'url' | 'call';
    text: string;
    payload?: string;
    url?: string;
    phone?: string;
};

export type SendCustomMessageOptions = {
    phoneNumberId: string;
    accessToken: string; // encrypted
    recipientPhone: string;
    content: string;
    buttons?: CustomMessageButton[];
};

/**
 * Send a custom message (interactive message with optional buttons)
 * Note: WhatsApp interactive messages only support quick_reply buttons natively.
 * URL and Call buttons are appended to the message body as clickable links/numbers.
 */
export async function sendWhatsAppCustomMessage({
    phoneNumberId,
    accessToken,
    recipientPhone,
    content,
    buttons = [],
}: SendCustomMessageOptions): Promise<SendTemplateResult> {
    try {
        const decryptedToken = decrypt(accessToken);

        // Separate button types
        const quickReplyButtons = buttons.filter(btn => btn.type === 'quick_reply');
        const urlButtons = buttons.filter(btn => btn.type === 'url' && btn.url);
        const callButtons = buttons.filter(btn => btn.type === 'call' && btn.phone);

        // Build the message content with URL and Call buttons appended
        let finalContent = content;

        // Append URL buttons as clickable links
        if (urlButtons.length > 0) {
            const urlLinks = urlButtons
                .map(btn => `🔗 ${btn.text}: ${btn.url}`)
                .join('\n');
            finalContent += '\n\n' + urlLinks;
        }

        // Append Call buttons as phone numbers
        if (callButtons.length > 0) {
            const callLinks = callButtons
                .map(btn => `📞 ${btn.text}: ${btn.phone}`)
                .join('\n');
            finalContent += '\n\n' + callLinks;
        }

        // If no quick_reply buttons, send as plain text (with URL/Call info appended)
        if (quickReplyButtons.length === 0) {
            return sendWhatsAppText({
                phoneNumberId,
                accessToken,
                recipientPhone,
                message: finalContent,
            });
        }

        // With quick_reply buttons, send as interactive message
        const interactiveButtons = quickReplyButtons
            .slice(0, 3) // Max 3 buttons
            .map((btn, index) => ({
                type: 'reply',
                reply: {
                    id: btn.payload || `btn_${index}`,
                    title: btn.text.substring(0, 20), // Max 20 chars
                },
            }));

        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipientPhone,
            type: 'interactive',
            interactive: {
                type: 'button',
                body: {
                    text: finalContent,
                },
                action: {
                    buttons: interactiveButtons,
                },
            },
        };

        const response = await fetch(
            `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${decryptedToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error('WhatsApp custom message send error:', data);
            return {
                success: false,
                error: data.error?.message || 'Failed to send custom message',
            };
        }

        return {
            success: true,
            messageId: data.messages?.[0]?.id,
        };
    } catch (error: any) {
        console.error('WhatsApp custom message send exception:', error);
        return {
            success: false,
            error: error.message || 'Unexpected error sending custom message',
        };
    }
}
