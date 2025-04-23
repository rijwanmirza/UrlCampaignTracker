declare module 'nodemailer-smtp-transport' {
  import { TransportOptions } from 'nodemailer';
  
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
  
  function smtpTransport(options: SmtpOptions): TransportOptions;
  
  export = smtpTransport;
}