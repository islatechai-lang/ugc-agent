import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        let publicUrl = '';
        try {
            const uploadDir = join(process.cwd(), 'public', 'uploads');
            if (!existsSync(uploadDir)) {
                await mkdir(uploadDir, { recursive: true });
            }
            const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            const filePath = join(uploadDir, fileName);
            await writeFile(filePath, buffer);
            publicUrl = `/uploads/${fileName}`;
        } catch (fsErr) {
            // Fallback for serverless read-only environments (Vercel)
            const mimeType = file.type || 'image/png';
            publicUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
        }

        return NextResponse.json({ success: true, url: publicUrl });
    } catch (error: any) {
        console.error('Upload API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
