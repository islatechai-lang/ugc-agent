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
        }

        return NextResponse.json({ error: 'Storage provider unavailable' }, { status: 500 });
    } catch (error: any) {
        console.error('Video Upload Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
