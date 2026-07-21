import { NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db';
import { headers } from 'next/headers';
import { verifyFirebaseIdToken } from '@/lib/firebase-admin';

export async function GET(req: Request) {
    try {
        await initDb();
        const head = await headers();
        const authHeader = head.get('authorization') || head.get('x-firebase-token');
        const adminKey = head.get('x-admin-key');

        let authorized = false;

        if (adminKey === 'pinoy123') {
            authorized = true;
        }

        if (!authorized && authHeader) {
            const decoded = await verifyFirebaseIdToken(authHeader);
            if (decoded && decoded.uid) {
                authorized = true;
            }
        }

        if (!authorized) {
            return NextResponse.json({ error: "Unauthorized access to Admin Panel." }, { status: 401 });
        }

        const result = await db.execute({
            sql: `SELECT g.*, u.username, u.phone 
                  FROM gcash_payments g 
                  LEFT JOIN users u ON g.user_id = u.id 
                  ORDER BY g.created_at DESC`
        });

        return NextResponse.json({ 
            isAdmin: true,
            payments: result.rows 
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
