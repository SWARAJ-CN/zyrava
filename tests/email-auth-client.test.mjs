import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function client(replies) {
  const loaded = { exports: {} }, calls = [];
  const code = ts.transpileModule(fs.readFileSync('lib/api.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', 'fetch', code)(loaded, loaded.exports, async (url, options) => {
    calls.push({ url, options });
    const [payload, status = 200] = replies.shift();
    return Response.json(payload, { status });
  });
  return { api: loaded.exports, calls };
}
const challenge = { requiresOtp: true, purpose: 'login', challengeId: 'a'.repeat(64), expiresIn: 600, resendAfter: 60 };
test('web sign-in waits for email OTP before storing an access token', async () => {
  const { api, calls } = client([[{ csrfToken: 'csrf' }], [challenge, 202], [{ user: { id: 'email' }, accessToken: 'verified' }]]);
  await assert.rejects(api.loginRequest({ identifier: 'person@example.com', password: 'password123', remember: true }), e => e instanceof api.OtpRequiredError);
  assert.equal(api.getAccessToken(), null);
  assert.deepEqual(await api.verifyEmailOtpRequest(challenge.challengeId, '123456'), { id: 'email' });
  assert.equal(api.getAccessToken(), 'verified');
  assert.equal(calls.at(-1).url, '/api/auth/email/verify');
});
test('web phone sign-in retains the existing password-only contract', async () => {
  const { api } = client([[{ csrfToken: 'csrf' }], [{ user: { id: 'phone' }, accessToken: 'phone-token' }]]);
  assert.deepEqual(await api.loginRequest({ identifier: '+919876543210', password: 'password123', remember: true }), { id: 'phone' });
  assert.equal(api.getAccessToken(), 'phone-token');
});
test('web reset verification does not establish a session', async () => {
  const { api, calls } = client([[{ csrfToken: 'csrf' }], [{ resetToken: 'grant' }], [{ message: 'updated' }]]);
  assert.deepEqual(await api.verifyPasswordReset(challenge.challengeId, '123456'), { resetToken: 'grant' });
  await api.finishPasswordReset('grant', 'newpassword123');
  assert.equal(api.getAccessToken(), null);
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { resetToken: 'grant', password: 'newpassword123' });
});
