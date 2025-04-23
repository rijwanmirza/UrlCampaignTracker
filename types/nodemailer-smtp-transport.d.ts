declare module 'nodemailer-smtp-transport' {
  interface SmtpOptions {
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: {
      user: string;
      pass: string;
    };
    connectionTimeout?: number;
    greetingTimeout?: number;
    socketTimeout?: number;
    tls?: any;
    tlsOptions?: any;
  }

  export default function smtpTransport(options: SmtpOptions): any;
}