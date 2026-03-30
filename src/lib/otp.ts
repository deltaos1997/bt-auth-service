const DEV_MODE = process.env.OTP_DEV_MODE === 'true' || process.env.NODE_ENV === 'development'

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function sendOtp(phone: string, otp: string): Promise<void> {
  if (DEV_MODE) {
    console.log(`\n[OTP DEV] Phone: ${phone} | OTP: ${otp}\n`)
    return
  }
  const { MSG91_AUTH_KEY: authKey, MSG91_TEMPLATE_ID: templateId } = process.env
  if (!authKey || !templateId) throw new Error('MSG91 credentials not configured')
  const res = await fetch(
    `https://api.msg91.com/api/v5/otp?template_id=${templateId}&mobile=91${phone}&authkey=${authKey}&otp=${otp}`,
    { method: 'POST' }
  )
  if (!res.ok) throw new Error(`MSG91 error: ${await res.text()}`)
}
