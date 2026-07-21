import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { verifyFirebaseIdToken } from "@/lib/firebase-admin";
import { db, initDb } from "@/lib/db";

export async function GET() {
    try {
        await initDb();
        const head = await headers();
        const authHeader = head.get('authorization') || head.get('x-firebase-token');
        
        if (!authHeader) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const decodedToken = await verifyFirebaseIdToken(authHeader);
        if (!decodedToken || !decodedToken.uid) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = decodedToken.uid;
        const username = decodedToken.name || decodedToken.phone_number || decodedToken.email?.split('@')[0] || "Creator";
        const profilePicUrl = decodedToken.picture || "";
        const phone = decodedToken.phone_number || "";

        // Check if user exists
        const existingUser = await db.execute({
            sql: "SELECT credits, phone FROM users WHERE id = ?",
            args: [userId]
        });

        let credits = 1;

        if (existingUser.rows.length === 0) {
            // New user, insert with 1 free credit
            await db.execute({
                sql: "INSERT INTO users (id, username, profile_pic_url, phone, credits) VALUES (?, ?, ?, ?, 100)",
                args: [userId, username, profilePicUrl, phone]
            });
        } else {
            // Existing user, update profile info (keep credits)
            await db.execute({
                sql: "UPDATE users SET username = ?, profile_pic_url = ?, phone = ? WHERE id = ?",
                args: [username, profilePicUrl, phone, userId]
            });
            credits = existingUser.rows[0].credits as number;
        }

        return NextResponse.json({
            id: userId,
            username: username,
            profile_pic_url: profilePicUrl,
            phone: phone,
            credits: credits
        });
    } catch (error: any) {
        console.error("Auth Me API Error:", error.message || error);
        return NextResponse.json({ error: "Unauthorized", message: error.message }, { status: 401 });
    }
}
