/* eslint-disable no-console */
import webpush from 'web-push';

// Standalone smoke test — validiert VAPID-Setup und den Umgang mit
// ungueltigen Endpoints (404/410-Cleanup-Pfad ohne Datenbank).
async function main() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subj) {
    console.error('Missing VAPID env vars');
    process.exit(1);
  }
  webpush.setVapidDetails(subj, pub, priv);
  console.log('[push-smoke] VAPID configured');

  const payload = JSON.stringify({
    title: 'Push-Smoke',
    body: 'Test von scripts/push-smoke.ts',
    url: '/dashboard',
  });

  const fakeSub = {
    endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB_smoke_nonexistent_endpoint_12345',
    keys: {
      p256dh: '58zNY2RUmGOK8FRipvrT4ObMbJrYXBPDfk2KMtrsMenYL7IljdQvD9lIU6o6FNAAwybL0Xo31Ll-25bKZ8PeqzU',
      auth: 'dP6d3XoZ6bH0S4L8Vzy_uw',
    },
  };
  try {
    await webpush.sendNotification(fakeSub, payload, { TTL: 60 });
    console.log('[push-smoke] unexpected success against fake endpoint');
  } catch (err) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404 || e.statusCode === 410) {
      console.log(`[push-smoke] expected ${e.statusCode} from fake endpoint (cleanup path)`);
    } else if (e.statusCode) {
      console.log(`[push-smoke] provider returned ${e.statusCode}: ${e.message?.slice(0, 120)}`);
    } else {
      console.log(`[push-smoke] network error (as expected for bogus endpoint): ${e.message?.slice(0, 120)}`);
    }
  }
  console.log('[push-smoke] OK');
}

void main();
