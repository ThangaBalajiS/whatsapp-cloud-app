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
