import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { generateOtp, sendOtp } from '../lib/otp.js'
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../lib/jwt.js'
import { verifyGoogleToken } from '../lib/google.js'

const OTP_TTL = 300
const otpKey = (phone: string) => `otp:${phone}`
const attemptsKey = (phone: string) => `otp_attempts:${phone}`

const phoneSchema = z.string().refine(
  v => /^[6-9]\d{9}$/.test(v) || v === '+14782159223' || v === '+18777804236',
  'Invalid Indian mobile number'
)
const SdendOtpBody   = z.object({ phone: phoneSchema })
const VerifyOtpBody = z.object({ phone: phoneSchema, otp: z.string().length(6) })
const RegisterBody  = z.object({
  full_name: z.string().min(2).max(100).optional(),
  name: z.string().min(2).max(100).optional(),
  role: z.enum(['shipper', 'driver']),
  email: z.string().email().optional(),
  // driver fields
  truck_number: z.string().optional(),
  truck_type: z.string().optional(),
  license_number: z.string().optional(),
}).refine(d => d.full_name || d.name, { message: 'full_name is required' })

export async function authRoutes(app: FastifyInstance) {

  // POST /auth/send-otp
  app.post('/send-otp', async (req, reply) => {
    const body = SdendOtpBody.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.errors[0].message })
    const { phone } = body.data
    const attempts = await app.redis.incr(attemptsKey(phone))
    if (attempts === 1) await app.redis.expire(attemptsKey(phone), 3600)
    if (process.env.NODE_ENV !== 'development' && attempts > 5) return reply.status(429).send({ success: false, error: 'Too many requests. Try after 1 hour.' })
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

    const { data: existing } = await app.supabase
      .from('users').select('*').eq('phone_number', phone).maybeSingle()
    let user = existing
    if (!user) {
      const { data: created, error } = await app.supabase
        .from('users').insert({ phone_number: phone, role: 'shipper' }).select().single()
      if (error || !created) return reply.status(500).send({ success: false, error: 'Failed to create user' })
      user = created
    }

    const payload = { userId: user.id, phone: user.phone_number, role: user.role }
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

  // POST /auth/register  — complete profile after first OTP verify
  app.post('/register', async (req, reply) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return reply.status(401).send({ success: false, error: 'Authorization required' })
    let jwtPayload: ReturnType<typeof verifyAccessToken>
    try { jwtPayload = verifyAccessToken(token) } catch { return reply.status(401).send({ success: false, error: 'Invalid token' }) }

    const body = RegisterBody.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.errors[0].message })
    const { role, email, truck_number, truck_type, license_number } = body.data
    const full_name = body.data.full_name ?? body.data.name

    const { error: userErr } = await app.supabase
      .from('users')
      .update({ full_name, role, email })
      .eq('id', jwtPayload.userId)
    if (userErr) return reply.status(500).send({ success: false, error: 'Failed to update profile' })

    if (role === 'driver') {
      await app.supabase.from('drivers').upsert({
        user_id: jwtPayload.userId,
        truck_number,
        truck_type,
        license_number,
      })
    }

    const { data: user } = await app.supabase
      .from('users').select('*, drivers(*)').eq('id', jwtPayload.userId).single()

    return reply.send({ success: true, data: { user } })
  })

  // GET /auth/me
  app.get('/me', async (req, reply) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return reply.status(401).send({ success: false, error: 'Authorization required' })
    try {
      const { userId } = verifyAccessToken(token)
      const { data: user } = await app.supabase
        .from('users').select('*, drivers(*)').eq('id', userId).single()
      if (!user) return reply.status(404).send({ success: false, error: 'User not found' })
      return reply.send({ success: true, data: { user } })
    } catch { return reply.status(401).send({ success: false, error: 'Invalid token' }) }
  })

  // POST /auth/google  — Sign In / Sign Up with Google
  app.post('/google', async (req, reply) => {
    const { id_token, role } = (req.body as any) ?? {}
    if (!id_token) return reply.status(400).send({ success: false, error: 'id_token required' })

    let googleUser
    try {
      googleUser = await verifyGoogleToken(id_token)
    } catch {
      return reply.status(401).send({ success: false, error: 'Invalid Google token' })
    }

    let { data: existing } = await app.supabase
      .from('users').select('*, drivers(*)').eq('google_sub', googleUser.sub).maybeSingle()

    if (!existing) {
      const { data: byEmail } = await app.supabase
        .from('users').select('*, drivers(*)').eq('email', googleUser.email).maybeSingle()
      existing = byEmail
    }

    let user = existing
    const isNewUser = !existing

    if (isNewUser) {
      const resolvedRole = role === 'driver' ? 'driver' : 'shipper'
      const { data: created, error } = await app.supabase
        .from('users')
        .insert({
          google_sub: googleUser.sub,
          email: googleUser.email,
          full_name: googleUser.name,
          avatar_url: googleUser.picture,
          role: resolvedRole,
        })
        .select('*, drivers(*)')
        .single()
      if (error || !created) return reply.status(500).send({ success: false, error: 'Failed to create user' })
      user = created
    } else if (!existing.google_sub) {
      await app.supabase
        .from('users')
        .update({ google_sub: googleUser.sub, avatar_url: googleUser.picture, full_name: googleUser.name })
        .eq('id', existing.id)
      user = { ...existing, google_sub: googleUser.sub, avatar_url: googleUser.picture, full_name: googleUser.name }
    }

    const payload = { userId: user.id, phone: user.phone_number ?? undefined, role: user.role }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)
    await app.redis.setex(`refresh:${user.id}`, 7 * 86400, refreshToken)

    return reply.send({
      success: true,
      data: { access_token: accessToken, refresh_token: refreshToken, is_new_user: isNewUser, user },
    })
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
