import twilio from 'twilio'

const DEV_MODE = process.env.OTP_DEV_MODE !== 'false'

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function sendOtp(phone: string, otp: string): Promise<void> {
  if (DEV_MODE) {
    console.log(`\n[OTP DEV] Phone: ${phone} | OTP: ${otp}\n`)
    return
  }

  const { TWILIO_ACCOUNT_SID: accountSid, TWILIO_AUTH_TOKEN: authToken, TWILIO_FROM_NUMBER: fromNumber } = process.env
  if (!accountSid || !authToken || !fromNumber) throw new Error('Twilio credentials not configured')

  const client = twilio(accountSid, authToken)
  await client.messages.create({
    to: phone.startsWith('+') ? phone : `+91${phone}`,
    from: fromNumber,
    body: `Your BharatTruck OTP is ${otp}. Valid for 5 minutes. Do not share it with anyone.`,
  })
}
