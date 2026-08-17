import { NextResponse } from 'next/server';
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

        const formData = await req.formData();
        const videoFile = formData.get('video') as File;

        if (!videoFile) {
            return NextResponse.json({ error: 'No video provided' }, { status: 400 });
        }

        const apiKey = process.env.CREATOMATE_API_KEY;
        if (apiKey && apiKey.length > 10 && apiKey !== 'your_creatomate_api_key_here') {
            try {
                const uploadFormData = new FormData();
                uploadFormData.append('file', videoFile, `ugc_${Date.now()}.mp4`);

                const uploadRes = await fetch('https://api.creatomate.com/v1/uploads', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: uploadFormData
                });

                if (uploadRes.ok) {
                    const data = await uploadRes.json();
                    if (data.url) {
                        return NextResponse.json({ success: true, url: data.url });
                    }
                }
            } catch (creatErr) {
                console.warn('Creatomate upload failed, falling back to DB storage:', creatErr);
            }
        }

        // Fallback: Store directly in database temp_assets
        const bytes = await videoFile.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const assetId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const { db, initDb } = await import('@/lib/db');
        await initDb();
        await db.execute({
            sql: "INSERT INTO temp_assets (id, content, content_type) VALUES (?, ?, ?)",
            args: [assetId, buffer, videoFile.type || 'video/mp4']
        });

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
        const serveUrl = `${appUrl}/api/video/serve/${assetId}`;

        return NextResponse.json({ success: true, url: serveUrl });
    } catch (error: any) {
        console.error('Video Upload Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
