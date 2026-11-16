// Secrets de test (jamais ceux du .env) : chargés avant chaque fichier de test.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-access-secret-0123456789abcdef0123456789';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-0123456789abcdef012345678';
