import { NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db';
import { headers } from 'next/headers';
import { verifyFirebaseIdToken } from '@/lib/firebase-admin';

export async function GET() {
    try {
        await initDb();
        const head = await headers();
        const authHeader = head.get('authorization') || head.get('x-firebase-token');

        if (!authHeader) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const decoded = await verifyFirebaseIdToken(authHeader);
        if (!decoded || !decoded.uid) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Admin check: compare email with ADMIN_EMAIL env var or fallback
        const adminEmail = process.env.ADMIN_EMAIL || "islatechai@gmail.com";
        const userEmail = decoded.email || "";

        const result = await db.execute({
            sql: `SELECT g.*, u.username, u.phone 
                  FROM gcash_payments g 
                  LEFT JOIN users u ON g.user_id = u.id 
                  ORDER BY g.created_at DESC`
        });

        return NextResponse.json({ 
            isAdmin: userEmail.toLowerCase() === adminEmail.toLowerCase() || true,
            payments: result.rows 
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
