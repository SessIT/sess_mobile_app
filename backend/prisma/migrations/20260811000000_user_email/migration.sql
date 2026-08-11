-- Optional employee email, used as the email OTP fallback channel for login codes.
ALTER TABLE "users" ADD COLUMN "email" TEXT;

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
