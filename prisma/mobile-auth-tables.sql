-- Mobile Authentication Tables
-- Add these to your Prisma schema.prisma file

-- MFA Settings
model mfa_settings {
  id                  BigInt    @id @default(autoincrement())
  user_id            BigInt    @unique
  totp_secret        String?
  totp_enabled       Boolean   @default(false)
  totp_verified_at   DateTime?
  sms_phone_number   String?
  sms_enabled        Boolean   @default(false)
  sms_verified_at    DateTime?
  created_at         DateTime  @default(now())
  updated_at         DateTime  @default(now()) @updatedAt
  
  users              users     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  
  @@map("mfa_settings")
}

-- MFA Backup Codes
model mfa_backup_codes {
  id         BigInt    @id @default(autoincrement())
  user_id    BigInt
  code       String
  used_at    DateTime?
  created_at DateTime  @default(now())
  
  users      users     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  
  @@map("mfa_backup_codes")
}

-- MFA SMS Codes
model mfa_sms_codes {
  id           BigInt   @id @default(autoincrement())
  user_id      BigInt   @unique
  code         String
  expires_at   DateTime
  created_at   DateTime @default(now())
  
  users        users    @relation(fields: [user_id], references: [id], onDelete: Cascade)
  
  @@map("mfa_sms_codes")
}

-- Failed Login Attempts
model failed_login_attempts {
  id           BigInt   @id @default(autoincrement())
  email        String
  ip_address   String
  user_agent   String
  attempted_at DateTime @default(now())
  
  @@map("failed_login_attempts")
}

-- Account Lockouts
model account_lockouts {
  id          BigInt   @id @default(autoincrement())
  email       String   @unique
  locked_until DateTime
  lock_count  Int      @default(1)
  created_at  DateTime @default(now())
  updated_at  DateTime @default(now()) @updatedAt
  
  @@map("account_lockouts")
}

-- Login History
model login_history {
  id         BigInt   @id @default(autoincrement())
  user_id    BigInt
  ip_address String
  user_agent String
  login_at   DateTime @default(now())
  success    Boolean
  
  users      users    @relation(fields: [user_id], references: [id], onDelete: Cascade)
  
  @@map("login_history")
}

-- Device Fingerprints
model device_fingerprints {
  id              BigInt    @id @default(autoincrement())
  user_id         BigInt
  device_id       String    @unique
  fingerprint_hash String
  user_agent      String
  ip_address      String
  platform        String?
  first_seen_at   DateTime  @default(now())
  last_seen_at    DateTime  @default(now())
  is_trusted      Boolean   @default(false)
  trusted_at      DateTime?
  
  users           users     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  
  @@map("device_fingerprints")
}

-- Request Logs (for rate limiting)
model request_logs {
  id         BigInt   @id @default(autoincrement())
  ip_address String
  endpoint   String
  method     String
  created_at DateTime @default(now())
  
  @@map("request_logs")
}

-- Sessions
model sessions {
  id            BigInt    @id @default(autoincrement())
  session_id    String    @unique
  user_id       BigInt
  device_id     String
  ip_address    String
  user_agent    String
  created_at    DateTime  @default(now())
  last_activity DateTime  @default(now())
  expires_at    DateTime
  is_active     Boolean   @default(true)
  remember_me   Boolean   @default(false)
  invalidated_at DateTime?
  
  users         users     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  
  @@map("sessions")
}

-- Audit Trails
model audit_trails {
  id         BigInt   @id @default(autoincrement())
  user_id    BigInt
  action     String
  resource   String
  details    Json?
  ip_address String
  user_agent String
  timestamp  DateTime @default(now())
  
  users      users    @relation(fields: [user_id], references: [id], onDelete: Cascade)
  
  @@map("audit_trails")
}

-- User Consents
model user_consents {
  id           BigInt   @id @default(autoincrement())
  user_id      BigInt
  consent_type String
  version      String
  granted      Boolean
  ip_address   String
  user_agent   String
  timestamp    DateTime @default(now())
  
  users        users    @relation(fields: [user_id], references: [id], onDelete: Cascade)
  
  @@map("user_consents")
}

-- Data Export Requests
model data_export_requests {
  id           BigInt    @id @default(autoincrement())
  request_id   String    @unique
  user_id      BigInt
  request_type String
  status       String
  requested_at DateTime  @default(now())
  completed_at DateTime?
  download_url String?
  
  users        users     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  
  @@map("data_export_requests")
}

-- Phone Verification Codes
model phone_verification_codes {
  phone_number String   @id
  code         String
  expires_at   DateTime
  attempts     Int      @default(0)
  created_at   DateTime @default(now())
  
  @@map("phone_verification_codes")
}

-- Profile Completion Tokens
model profile_completion_tokens {
  token      String   @id
  user_id    BigInt
  expires_at DateTime
  completed  Boolean  @default(false)
  created_at DateTime @default(now())
  
  users      users    @relation(fields: [user_id], references: [id], onDelete: Cascade)
  
  @@map("profile_completion_tokens")
}

-- System Configs
model system_configs {
  config_key   String    @id
  config_value String?
  description  String?
  created_at   DateTime  @default(now())
  updated_at   DateTime  @default(now()) @updatedAt
  
  @@map("system_configs")
}