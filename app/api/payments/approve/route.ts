import { NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db';
import { headers } from 'next/headers';
import { verifyFirebaseIdToken } from '@/lib/firebase-admin';

export async function POST(req: Request) {
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

        const { paymentId, action } = await req.json(); // action: 'approve' | 'reject'

        if (!paymentId || !['approve', 'reject'].includes(action)) {
            return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
        }

        // Fetch payment details
        const paymentRes = await db.execute({
            sql: "SELECT * FROM gcash_payments WHERE id = ?",
            args: [paymentId]
        });

        if (paymentRes.rows.length === 0) {
            return NextResponse.json({ error: "Payment not found" }, { status: 404 });
        }

        const payment = paymentRes.rows[0];

        if (action === 'approve') {
            if (payment.status !== 'approved') {
                // Add credits to user
                await db.execute({
                    sql: "UPDATE users SET credits = credits + ? WHERE id = ?",
                    args: [payment.credits as number, payment.user_id as string]
                });
                
                // Update payment status
                await db.execute({
                    sql: "UPDATE gcash_payments SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    args: [paymentId]
                });
            }
            return NextResponse.json({ success: true, message: `Approved! Added ${payment.credits} credits.` });
        } else {
            // Reject payment
            await db.execute({
                sql: "UPDATE gcash_payments SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                args: [paymentId]
            });
            return NextResponse.json({ success: true, message: "Payment rejected." });
        }

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
