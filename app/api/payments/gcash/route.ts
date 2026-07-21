import { NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db';
import { headers } from 'next/headers';
import { verifyFirebaseIdToken } from '@/lib/firebase-admin';
import { GoogleGenAI } from '@google/genai';

const PACKAGES: Record<string, { credits: number; pricePhp: number; label: string }> = {
    pack_3: { credits: 3, pricePhp: 150, label: 'Starter (3 Credits)' },
    pack_5: { credits: 5, pricePhp: 250, label: 'Standard (5 Credits)' },
    pack_12: { credits: 12, pricePhp: 500, label: 'Pro (12 Credits)' },
    pack_18: { credits: 18, pricePhp: 750, label: 'Agency (18 Credits)' },
};

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
        const userId = decoded.uid;

        const { packageId, receiptImage } = await req.json();

        if (!packageId || !PACKAGES[packageId]) {
            return NextResponse.json({ error: "Invalid credit package selected." }, { status: 400 });
        }

        if (!receiptImage) {
            return NextResponse.json({ error: "Please attach your GCash receipt image." }, { status: 400 });
        }

        const pkg = PACKAGES[packageId];
        const paymentId = `gcash_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const cleanBase64 = receiptImage.includes(',') ? receiptImage.split(',')[1] : receiptImage;

        // 1. Run Gemini AI Vision Analysis on the receipt
        let aiDecision: 'approved' | 'pending' | 'rejected' = 'pending';
        let aiReason = 'Flagged for manual admin review.';

        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (apiKey) {
                const ai = new GoogleGenAI({ apiKey });
                const aiResponse = await ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: {
                        parts: [
                            {
                                text: `You are an expert financial audit AI reviewing a GCash payment receipt screenshot for an automated credit system.
Analyze this image carefully.
Required Amount to match: PHP ${pkg.pricePhp} (or higher).
GCash Account Name: AL****H M** G.
GCash Number: 09454320799.

Evaluate:
1. Is this a genuine GCash transfer receipt / express send confirmation screenshot?
2. Does the paid amount match or exceed ₱${pkg.pricePhp}?
3. Is the reference number visible and clear?
4. Are there any clear signs of image editing or forgery?

Output ONLY a JSON object with:
{
  "isValid": boolean,
  "confidenceScore": number (0-100),
  "amountDetected": number or string,
  "refNo": string,
  "reason": string,
  "autoApprove": boolean (true ONLY if confidenceScore >= 90 and isValid is true and amount matches)
}`
                            },
                            { inlineData: { data: cleanBase64, mimeType: 'image/png' } }
                        ]
                    },
                    config: {
                        responseMimeType: 'application/json'
                    }
                });

                let resultText = aiResponse.text || '{}';
                resultText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
                const aiResult = JSON.parse(resultText);

                if (aiResult.autoApprove === true) {
                    aiDecision = 'approved';
                    aiReason = `AI Auto-Approved: Verified GCash receipt (Ref: ${aiResult.refNo || 'N/A'}, Amount: ₱${aiResult.amountDetected}).`;
                } else {
                    aiDecision = 'pending';
                    aiReason = `AI Flagged (${aiResult.confidenceScore || 0}% confidence): ${aiResult.reason || 'Manual review recommended.'}`;
                }
            }
        } catch (aiErr: any) {
            console.warn("AI Receipt Verification warning:", aiErr);
            aiDecision = 'pending';
            aiReason = 'AI service unavailable, sent for manual review.';
        }

        // 2. Insert into gcash_payments table
        const dbStatus = aiDecision === 'approved' ? 'approved' : 'pending';
        await db.execute({
            sql: `INSERT INTO gcash_payments (id, user_id, package_id, credits, amount_php, receipt_url, status, ai_decision, ai_reason) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [paymentId, userId, packageId, pkg.credits, pkg.pricePhp, receiptImage, dbStatus, aiDecision, aiReason]
        });

        // 3. If AI Auto-Approved, grant credits immediately
        if (dbStatus === 'approved') {
            await db.execute({
                sql: 'UPDATE users SET credits = credits + ? WHERE id = ?',
                args: [pkg.credits, userId]
            });
        }

        return NextResponse.json({
            success: true,
            status: dbStatus,
            creditsAdded: dbStatus === 'approved' ? pkg.credits : 0,
            message: dbStatus === 'approved' 
                ? `Payment verified! ${pkg.credits} credits added to your account.` 
                : 'Receipt submitted successfully! Sent to admin for quick manual verification.'
        });

    } catch (error: any) {
        console.error('GCash Payment API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
