/** @jest-environment node */
jest.mock('resend', () => ({ Resend: class {} }));
import { createSmsProvider, TwilioSmsProvider, MessageSendError } from '../messaging';

describe('createSmsProvider', () => {
  it('falls back to the logging stub without credentials', () => {
    expect(createSmsProvider({} as NodeJS.ProcessEnv)).not.toBeInstanceOf(TwilioSmsProvider);
    expect(createSmsProvider({ TWILIO_ACCOUNT_SID: 'AC1' } as unknown as NodeJS.ProcessEnv)).not.toBeInstanceOf(TwilioSmsProvider);
  });
  it('uses Twilio when all three credentials are set', () => {
    const env = { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM_NUMBER: '+447000000000' } as unknown as NodeJS.ProcessEnv;
    expect(createSmsProvider(env)).toBeInstanceOf(TwilioSmsProvider);
  });
});

describe('TwilioSmsProvider', () => {
  it('posts a form-encoded message with basic auth', async () => {
    const f = jest.fn(async () => ({ ok: true, status: 201, text: async () => '{}' }));
    await new TwilioSmsProvider('AC1', 'tok', '+44700', f).send({ to: '+44711', body: 'Hi', whatsapp: false });
    const [url, init] = f.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toContain('/Accounts/AC1/Messages.json');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('AC1:tok').toString('base64')}`);
    expect(new URLSearchParams(init.body).get('To')).toBe('+44711');
  });
  it('prefixes whatsapp addresses', async () => {
    const f = jest.fn(async () => ({ ok: true, status: 201, text: async () => '{}' }));
    await new TwilioSmsProvider('AC1', 't', '+44700', f).send({ to: '+44711', body: 'Hi', whatsapp: true });
    const body = new URLSearchParams((f.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.get('To')).toBe('whatsapp:+44711');
    expect(body.get('From')).toBe('whatsapp:+44700');
  });
  it('throws a MessageSendError with the provider message on failure', async () => {
    const f = jest.fn(async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ message: 'Invalid To', code: 21211 }) }));
    await expect(new TwilioSmsProvider('AC1', 't', '+44700', f).send({ to: 'x', body: 'Hi', whatsapp: false })).rejects.toThrow(MessageSendError);
  });
});

describe('email reply-to', () => {
  it('passes the business contact email as replyTo so customer replies reach the business', async () => {
    jest.resetModules();
    const send = jest.fn(async () => ({ error: null }));
    jest.doMock('resend', () => ({ Resend: class { emails = { send }; } }));
    jest.doMock('@/lib/email-events', () => ({ notifyEmailSent: jest.fn() }));
    process.env.RESEND_API_KEY = 'k';
    const { sendMessage } = await import('../messaging');
    await sendMessage({ channel: 'email', to: { email: 'real.customer@gmail.com' }, subject: 's', text: 't', replyTo: 'owner@salon.co.uk' }, 'Salon');
    await sendMessage({ channel: 'email', to: { email: 'real.customer@gmail.com' }, subject: 's', text: 't', replyTo: null }, 'Salon');
    const calls = send.mock.calls as unknown as Array<[Record<string, unknown>]>;
    expect(calls[0][0].replyTo).toBe('owner@salon.co.uk');
    expect('replyTo' in calls[1][0]).toBe(false);
  });
});
