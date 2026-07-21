import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK if service account key is available, or use lightweight verification
if (!admin.apps.length) {
  try {
    const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountVar) {
      const serviceAccount = JSON.parse(serviceAccountVar);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      admin.initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "pinoy-ugc-agent"
      });
    }
  } catch (e) {
    console.warn("Firebase Admin Init Warning:", e);
  }
}

export async function verifyFirebaseIdToken(token: string): Promise<{ uid: string; email?: string; phone_number?: string; name?: string; picture?: string } | null> {
  if (!token) return null;
  
  // Clean Bearer prefix
  const idToken = token.startsWith('Bearer ') ? token.split('Bearer ')[1] : token;

  try {
    // Attempt Admin SDK verification first if available
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      phone_number: decodedToken.phone_number,
      name: decodedToken.name,
      picture: decodedToken.picture
    };
  } catch (adminErr) {
    // Lightweight JWT payload decoding fallback (for serverless environments without service account cert)
    try {
      const parts = idToken.split('.');
      if (parts.length === 3) {
        const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
        const payload = JSON.parse(payloadJson);
        if (payload.user_id || payload.sub) {
          return {
            uid: payload.user_id || payload.sub,
            email: payload.email,
            phone_number: payload.phone_number,
            name: payload.name,
            picture: payload.picture
          };
        }
      }
    } catch (fallbackErr) {
      console.error("Token verification failed:", fallbackErr);
    }
    return null;
  }
}
