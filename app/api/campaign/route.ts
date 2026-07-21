import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { headers } from "next/headers";
import { verifyFirebaseIdToken } from '@/lib/firebase-admin';

export async function POST(req: Request) {
    try {
        const head = await headers();
        const authHeader = head.get('authorization') || head.get('x-firebase-token');
        
        if (!authHeader) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const decoded = await verifyFirebaseIdToken(authHeader);
        if (!decoded || !decoded.uid) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = decoded.uid;

        const { action, campaignId, data } = await req.json();

        if (action === 'createCampaign') {
            // Check credits
            const creditCost = data.creditCost || 100; // 100 for 15s, 200 for 30s

            const user = await db.execute({
                sql: "SELECT credits FROM users WHERE id = ?",
                args: [userId]
            });

            if (user.rows.length === 0 || (user.rows[0].credits as number) < creditCost) {
                return NextResponse.json({ error: 'Insufficient credits. You need ' + creditCost + ' credits for this video.' }, { status: 402 });
            }

            // Deduct credits based on duration
            await db.execute({
                sql: "UPDATE users SET credits = credits - ? WHERE id = ?",
                args: [creditCost, userId]
            });

            await db.execute({
                sql: 'INSERT INTO campaigns (id, user_id, vibe, status) VALUES (?, ?, ?, ?)',
                args: [campaignId, userId, data.vibe, 'pending']
            });
            return NextResponse.json({ success: true, newCredits: (user.rows[0].credits as number) - creditCost });
        }

        if (action === 'getCampaigns') {
            const result = await db.execute({
                sql: 'SELECT * FROM campaigns WHERE user_id = ? ORDER BY created_at DESC',
                args: [userId]
            });
            return NextResponse.json({ campaigns: result.rows });
        }

        if (action === 'saveShots') {
            const { shots } = data;
            for (const shot of shots) {
                await db.execute({
                    sql: 'INSERT INTO shots (campaign_id, type, script, image_prompt, video_prompt, status) VALUES (?, ?, ?, ?, ?, ?)',
                    args: [campaignId, shot.type, shot.script, shot.imagePrompt, shot.videoPrompt, 'pending']
                });
            }
            return NextResponse.json({ success: true });
        }

        if (action === 'updateShot') {
            const { type, status, videoUrl, refImage } = data;
            await db.execute({
                sql: 'UPDATE shots SET status = ?, video_url = ?, ref_image = ? WHERE campaign_id = ? AND type = ?',
                args: [status, videoUrl || null, refImage || null, campaignId, type]
            });
            return NextResponse.json({ success: true });
        }

        if (action === 'deleteCampaign') {
            await db.execute({
                sql: 'DELETE FROM shots WHERE campaign_id = ?',
                args: [campaignId]
            });
            await db.execute({
                sql: 'DELETE FROM campaigns WHERE id = ? AND user_id = ?',
                args: [campaignId, userId]
            });
            return NextResponse.json({ success: true });
        }

        if (action === 'finishCampaign') {
            await db.execute({
                sql: 'UPDATE campaigns SET status = ?, master_video_url = ? WHERE id = ?',
                args: ['completed', data.masterVideoUrl, campaignId]
            });
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        console.error('Campaign API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
