import { getSecret } from '#airo/secrets';

export function getDbConfig() {
  const host     = getSecret('DB_HOST');
  const port     = getSecret('DB_PORT');
  const user     = getSecret('DB_USER');
  const password = getSecret('DB_PASSWORD');
  const database = getSecret('DB_NAME');

  return {
    host:     (typeof host     === 'string' ? host     : null) ?? 'localhost',
    port:     parseInt((typeof port === 'string' ? port : null) ?? '3306'),
    user:     (typeof user     === 'string' ? user     : null) ?? 'root',
    password: (typeof password === 'string' ? password : null) ?? '',
    database: (typeof database === 'string' ? database : null) ?? 'padihub',
  };
}

export const JWT_SECRET         = () => {
  const s = getSecret('JWT_SECRET');
  return (typeof s === 'string' ? s : null) ?? 'change-me-in-production';
};
export const JWT_EXPIRES_IN     = '7d';
export const EMAIL_VERIFY_TTL   = 24 * 60 * 60 * 1000; // 24 hours
export const PASSWORD_RESET_TTL = 2  * 60 * 60 * 1000; // 2 hours
export const INVITE_TTL         = 7  * 24 * 60 * 60 * 1000; // 7 days
export const BCRYPT_ROUNDS      = 12;
export const TRUST_SCORE_INITIAL = 50;
export const TRUST_SCORE_MAX     = 100;
export const TRUST_SCORE_MIN     = 0;
