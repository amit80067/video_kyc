# Video KYC System - Login Credentials

## Admin Credentials

**Username:** `admin`  
**Password:** `Admin@123`  
**Email:** admin@video-kyc.com  
**Role:** Admin  
**Full Name:** System Admin

## Agent Credentials

**Username:** `agent1`  
**Password:** `Agent@123`  
**Email:** agent1@video-kyc.com  
**Role:** Agent  
**Full Name:** Agent One

---

## Important Notes

⚠️ **Security Warning:** These are default credentials. Please change them in production!

### To Change Passwords:

1. Login to the system
2. Go to profile settings
3. Change password

Or update directly in database:

```sql
-- Generate new password hash using bcrypt
-- Then update:
UPDATE users SET password_hash = 'your_new_hash_here' WHERE username = 'admin';
```

---

**Last Updated:** 2025-12-23

