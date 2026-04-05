# bt-auth-service

Authentication and KYC service for [BharatTruck](https://bharattruck.in) — an Indian B2B freight booking platform.

**Stack:** Fastify · TypeScript · Supabase · Redis

---

## Features

- Phone OTP auth (MSG91)
- JWT access + refresh tokens
- KYC module — phone, email, Aadhaar, PAN, DL, RC, GST, face-match, bank (penny drop)

## Project Structure

```
src/
├── lib/
│   ├── jwt.ts            # Token sign / verify
│   ├── otp.ts            # OTP generation + MSG91 dispatch
│   ├── surepass.ts       # Surepass HTTP client
│   └── encryption.ts     # AES-256-GCM for PII at rest
├── plugins/
│   ├── supabase.ts       # Fastify Supabase plugin
│   └── redis.ts          # Fastify Redis plugin
├── modules/kyc/
│   ├── types.ts          # KYCResult, KYCStatus, KYCLevel, UserRole
│   ├── repository.ts     # user_kyc table reads / writes
│   ├── fraud.ts          # Duplicate hash checks, fuzzy name match
│   └── verifications/    # One file per verification type
└── routes/
    ├── auth.ts           # /auth/* endpoints
    └── kyc.ts            # /kyc/* endpoints
```

## Getting Started

```bash
npm install
cp .env.example .env   # fill in values
npm run dev
```

## Environment Variables

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Access token signing secret |
| `JWT_REFRESH_SECRET` | Refresh token signing secret |
| `ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM PII encryption |
| `SUREPASS_API_KEY` | Surepass KYC API key |
| `MSG91_AUTH_KEY` | MSG91 auth key for OTP SMS |
| `MSG91_TEMPLATE_ID` | MSG91 OTP template ID |
| `OTP_DEV_MODE` | Set `true` to log OTPs to console instead of sending |

## KYC Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/kyc/verify/:type` | Run a verification (`phone`, `email`, `aadhaar`, `pan`, `dl`, `rc`, `gst`, `face_match`, `bank`) |
| `GET` | `/kyc/status/:userId` | Get current KYC level (`L0`–`L3`) |

## KYC Levels

| Level | Requirements |
|---|---|
| L0 | No verification |
| L1 | Phone + Email |
| L2 | L1 + Aadhaar + PAN |
| L3 | L2 + DL/RC/GST + Face-match + Bank |

## Scripts

```bash
npm run dev      # tsx watch (hot reload)
npm run build    # tsc compile to dist/
npm run start    # run compiled output
```
