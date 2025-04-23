declare module 'mailparser' {
  export function simpleParser(source: string | Buffer): Promise<{
    text?: string;
    html?: string;
    textAsHtml?: string;
    subject?: string;
    from?: { text: string; value: any[] };
    to?: { text: string; value: any[] };
    cc?: { text: string; value: any[] };
    bcc?: { text: string; value: any[] };
    headers?: Map<string, { value: any; params: any }>;
    date?: Date;
    messageId?: string;
  }>;
}