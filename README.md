# Мэргэжил.мн

Энэ бол `pinecone-studio/intern-4a` Nx monorepo доторх `apps/mergejil` аппын
**standalone хуулбар** — зөвхөн Vercel deploy хийхэд зориулав (эх monorepo
дотор org-ийн GitHub App зөвшөөрөл байхгүй тул шууд deploy хийх боломжгүй
байсан). Эх repo-той шууд холбоогүй тул хоёр код заримдаа зөрж болно — эх
хувилбарыг өөрчлөхдөө энэ хуулбарыг гараар дахин copy хийж шинэчилнэ үү.

## Тохиргоо

```bash
bun install
cp .env.example .env.local   # утгуудыг бөглөнө
bun run dev
```

## Deploy (Vercel)

Ердийн Next.js app — Vercel автоматаар танина, тусгай тохиргоо хэрэггүй:

- Framework preset: Next.js
- Build command: `next build` (анхдагч)
- Root directory: repo-гийн үндсэн хавтас

Vercel dashboard дээр Environment Variables tab-д дараах утгуудыг нэмнэ:

| Хувьсагч | Тайлбар |
|---|---|
| `DATABASE_URL` | Postgres connection string (Neon гэх мэт) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Нууц үг сэргээх имэйлд |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google OAuth |
| `APP_URL` | Deploy хийсэн бодит domain |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | AI карьерийн профайл (анхдагч утга нь `gemini-3.7-flash`) |

## Prisma

```bash
bunx prisma generate
bunx prisma migrate deploy   # production DB руу migration ажиллуулах
```
