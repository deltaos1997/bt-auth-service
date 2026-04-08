import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret'

export interface JwtPayload { userId: string; phone?: string; role: string }

export const signAccessToken  = (p: JwtPayload) => jwt.sign(p, JWT_SECRET, { expiresIn: '15m' })
export const signRefreshToken = (p: JwtPayload) => jwt.sign(p, JWT_REFRESH_SECRET, { expiresIn: '7d' })
export const verifyAccessToken  = (t: string) => jwt.verify(t, JWT_SECRET) as JwtPayload
export const verifyRefreshToken = (t: string) => jwt.verify(t, JWT_REFRESH_SECRET) as JwtPayload
