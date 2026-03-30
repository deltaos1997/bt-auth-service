import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { generateOtp, sendOtp } from '../lib/otp.js'
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../lib/jwt.js'

const OTP_TTL = 300
const otpKey = (phone: string) => `otp:${phone}`
const attemptsKey = (phone: string) => `otp_attempts:${phone}`

const SendOtpBody    = z.object({ phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number') })
const VerifyOtpBody  = z.object({ phone: z.string().regex(/^[6-9]\d{9}$/), otp: z.string().length(6) })
const RegisterBody   = z.object({
  name: z.string().min(2).max(100),
  role: z.enum(['shipper', 'driver', 'fleet_owner']),
  email: z.string().email().optional(),
  company_name: z.string().optional(),
  gst_number: z.string().optional(),
  vehicle_type: z.enum(['mini_truck', 'lcv', 'hcv', 'trailer']).optional(),
  vehicle_number: z.string().optional(),
})

export async function authRoutes(app: FastifyInstance) {

  // POST /auth/send-otp
  app.post('/send-otp', async (req, reply) => {
    const body = SendOtpBody.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.errors[0].message })
    const { phone } = body.data
    const attempts = await app.redis.incr(attemptsKey(phone))
    if (attempts === 1) await app.redis.expire(attemptsKey(phone), 3600)
    if (attempts > 5) return reply.status(429).send({ success: false, error: 'Too many requests. Try after 1 hour.' })
    const otp = generateOtp()
    await app.redis.setex(otpKey(phone), OTP_TTL, otp)
    await sendOtp(phone, otp)
    return reply.send({ success: true, data: { message: 'OTP sent', expires_in: OTP_TTL } })
  })

  // POST /auth/verify-otp
  app.post('/verify-otp', async (req, reply) => {
    const body = VerifyOtpBody.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.errors[0].message })
    const { phone, otp } = body.data
    const stored = await app.redis.get(otpKey(phone))
    if (!stored || stored !== otp) return reply.status(401).send({ success: false, error: 'Invalid or expired OTP' })
    await app.redis.del(otpKey(phone))

    const { data: existing } = await app.supabase.from('users').select('*').eq('phone', phone).maybeSingle()
    let user = existing
    if (!user) {
      const { data: created, error } = await app.supabase.from('users').insert({ phone, role: 'shipper' }).select().single()
      if (error || !created) return reply.status(500).send({ success: false, error: 'Failed to create user' })
      user = created
    }

    const payload = { userId: user.id, phone: user.phone, role: user.role }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)
    await app.redis.setex(`refresh:${user.id}`, 7 * 86400, refreshToken)

    return reply.send({
      success: true,
      data: { access_token: accessToken, refresh_token: refreshToken, is_new_user: !existing, user },
    })
  })

  // POST /auth/refresh
  app.post('/refresh', async (req, reply) => {
    const { refresh_token } = (req.body as any) ?? {}
    if (!refresh_token) return reply.status(400).send({ success: false, error: 'refresh_token required' })
    try {
      const payload = verifyRefreshToken(refresh_token)
      const stored = await app.redis.get(`refresh:${payload.userId}`)
      if (!stored || stored !== refresh_token) return reply.status(401).send({ success: false, error: 'Token revoked' })
      return reply.send({ success: true, data: { access_token: signAccessToken(payload) } })
    } catch {
      return reply.status(401).send({ success: false, error: 'Invalid refresh token' })
    }
  })

  // POST /auth/register
  app.post('/register', async (req, reply) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return reply.status(401).send({ success: false, error: 'Authorization required' })
    let jwtPayload: ReturnType<typeof verifyAccessToken>
    try { jwtPayload = verifyAccessToken(token) } catch { return reply.status(401).send({ success: false, error: 'Invalid token' }) }

    const body = RegisterBody.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.errors[0].message })
    const { name, role, email, company_name, gst_number, vehicle_type, vehicle_number } = body.data

    await app.supabase.from('users').update({ role }).eq('id', jwtPayload.userId)

    if (role === 'shipper' || role === 'fleet_owner') {
      await app.supabase.from('shipper_profiles').upsert({ user_id: jwtPayload.userId, name, email, company_name, gst_number })
    }
    if (role === 'driver') {
      await app.supabase.from('driver_profiles').upsert({ user_id: jwtPayload.userId, name, vehicle_type, vehicle_number })
    }
    return reply.send({ success: true, data: { message: 'Profile registered' } })
  })

  // GET /auth/me
  app.get('/me', async (req, reply) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return reply.status(401).send({ success: false, error: 'Authorization required' })
    try {
      const { userId } = verifyAccessToken(token)
      const { data: user } = await app.supabase
        .from('users').select('*, shipper_profiles(*), driver_profiles(*)').eq('id', userId).single()
      if (!user) return reply.status(404).send({ success: false, error: 'User not found' })
      return reply.send({ success: true, data: { user } })
    } catch { return reply.status(401).send({ success: false, error: 'Invalid token' }) }
  })

  // POST /auth/logout
  app.post('/logout', async (req, reply) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (token) {
      try { const { userId } = verifyAccessToken(token); await app.redis.del(`refresh:${userId}`) } catch {}
    }
    return reply.send({ success: true, data: { message: 'Logged out' } })
  })
}
