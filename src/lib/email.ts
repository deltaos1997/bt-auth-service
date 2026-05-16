import nodemailer from 'nodemailer'

const DEV_MODE = process.env.EMAIL_DEV_MODE !== 'false'

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter

  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT ?? 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) {
    throw new Error('SMTP credentials not configured (SMTP_HOST, SMTP_USER, SMTP_PASS)')
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })

  return transporter
}

export async function sendMagicLinkEmail(to: string, link: string): Promise<void> {
  if (DEV_MODE) {
    console.log(`\n[MAGIC LINK DEV] To: ${to} | Link: ${link}\n`)
    return
  }

  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER!
  const transport = getTransporter()

  await transport.sendMail({
    from,
    to,
    subject: 'BharatTruck — Sign in to your account',
    text: `Sign in to BharatTruck: ${link}\n\nThis link is valid for 15 minutes. Do not share it with anyone.`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a1a;">Sign in to BharatTruck</h2>
        <p>Click the button below to sign in to your account:</p>
        <a href="${link}" style="display: inline-block; background: #2563eb; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 16px 0;">Sign In</a>
        <p style="color: #666;">This link is valid for 15 minutes. Do not share it with anyone.</p>
        <p style="color: #999; font-size: 12px; margin-top: 16px;">If the button doesn't work, copy and paste this URL: ${link}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">BharatTruck Logistics</p>
      </div>
    `,
  })
}

export async function sendEmailOtp(to: string, otp: string): Promise<void> {
  if (DEV_MODE) {
    console.log(`\n[EMAIL OTP DEV] To: ${to} | OTP: ${otp}\n`)
    return
  }

  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER!
  const transport = getTransporter()

  await transport.sendMail({
    from,
    to,
    subject: 'BharatTruck — Verify your email',
    text: `Your verification code is ${otp}. It is valid for 10 minutes. Do not share it with anyone.`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a1a;">Verify your email</h2>
        <p>Your verification code is:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #2563eb; padding: 16px 0;">${otp}</div>
        <p style="color: #666;">This code is valid for 10 minutes. Do not share it with anyone.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">BharatTruck Logistics</p>
      </div>
    `,
  })
}
