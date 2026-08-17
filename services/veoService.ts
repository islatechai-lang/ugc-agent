
import { GoogleGenAI, VideoGenerationReferenceType, Type } from "@google/genai";

export interface Shot {
  id: number;
  type: 'Hook' | 'Feature' | 'Demo' | 'CTA';
  script: string;
  imagePrompt: string;
  videoPrompt: string;
  status: 'pending' | 'generating' | 'completed' | 'error';
  videoUrl?: string;
  refImage?: string;
}

export class VeoService {
  private static veoCallTimestamps: number[] = [];
  private static queueMutex = Promise.resolve();

  /**
   * Slot management strictly for Veo Video generation (2 RPM limit).
   * Uses serialized mutex to allow parallel Shot requests to queue properly.
   */
  private static async acquireVeoSlot(onProgress?: (msg: string) => void): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queueMutex = this.queueMutex.then(async () => {
        const now = Date.now();
        this.veoCallTimestamps = this.veoCallTimestamps.filter(t => now - t < 62000);

        if (this.veoCallTimestamps.length >= 2) {
          const waitTime = 62000 - (now - this.veoCallTimestamps[0]);
          if (waitTime > 0) {
            await this.serverLog('info', `2 RPM Quota Window: Waiting ${Math.ceil(waitTime / 1000)}s for next video slot...`);
            if (onProgress) onProgress(`Optimizing slot (${Math.ceil(waitTime / 1000)}s)...`);
            await new Promise(res => setTimeout(res, waitTime));
          }
          this.veoCallTimestamps = this.veoCallTimestamps.filter(t => Date.now() - t < 62000);
        }

        this.veoCallTimestamps.push(Date.now());
        resolve();
      });
    });
  }

  /**
   * Helper to ensure we only send raw base64 to the API
   */
  private static cleanBase64(b64: string): string {
    if (!b64) return "";
    return b64.includes(",") ? b64.split(",")[1] : b64;
  }

  /**
   * Helper to send logs to the server for visibility
   */
  private static async serverLog(level: 'info' | 'warn' | 'error', message: string, data?: any) {
    try {
      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, message, data })
      });
    } catch (e) {
      console.warn("Failed to send server log:", e);
    }
  }

  /**
   * Helper to handle API retries for 429s (Quota) and 500s (Internal Errors)
   */
  private static async callWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 15000): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const errorMsg = (error.message || "").toLowerCase();
      const isRateLimit = errorMsg.includes("429") || errorMsg.includes("resource_exhausted") || errorMsg.includes("quota");
      const isInternalError = errorMsg.includes("500") || errorMsg.includes("503") || errorMsg.includes("internal error") || errorMsg.includes("server issue");

      if (isRateLimit || isInternalError) {
        if (retries > 0) {
          const type = isRateLimit ? "Rate limit" : "Server issue";
          await this.serverLog('warn', `${type} hit. Waiting ${delay / 1000}s for cooloff... (${retries} attempts left)`);
          await new Promise(res => setTimeout(res, delay));
          return this.callWithRetry(fn, retries - 1, delay * 1.5);
        }
      }
      throw error;
    }
  }

  /**
   * Stage 1: Generate a 4-part script by looking at the product image.
   */
  static async createScript(
    productB64: string,
    vibe: string,
    duration: '15s' | '30s' = '15s',
    simulateMode = false
  ): Promise<Shot[]> {
    await this.serverLog('info', `Generating script for vibe: ${vibe} with duration: ${duration}`);

    const is15s = duration === '15s';
    const shotDuration = is15s ? 4 : 8;

    if (simulateMode) {
      await new Promise(res => setTimeout(res, 2000));
      return is15s ? [
        { id: 0, type: 'Hook', script: 'Hoy mga beh, tingnan niyo ito!', imagePrompt: 'Filipino host holding the product with a smile', videoPrompt: 'Holding product toward camera smiling', status: 'pending' },
        { id: 1, type: 'Feature', script: 'Super ganda ng texture at packaging nito.', imagePrompt: 'Close up of product detail', videoPrompt: 'Showing product details close to lens', status: 'pending' },
        { id: 2, type: 'Demo', script: 'Araw-araw ko na itong ginagamit ngayon.', imagePrompt: 'Product on a table', videoPrompt: 'Natural handheld usage demonstrating product', status: 'pending' },
        { id: 3, type: 'CTA', script: 'I-click niyo na yung yellow basket sa baba!', imagePrompt: 'Filipino host pointing down with product', videoPrompt: 'Friendly smile naturally pointing downward toward bottom of frame', status: 'pending' }
      ] : [
        { id: 0, type: 'Hook', script: 'Sobrang tagal ko nang naghahanap ng ganito. Buti na lang nahanap ko ito online!', imagePrompt: 'Filipino host holding the product with an excited smile', videoPrompt: 'Speaking enthusiastically directly to camera showing product', status: 'pending' },
        { id: 1, type: 'Feature', script: 'Tingnan niyo naman ang napakagandang quality nito, solid talaga ang pagkakagawa at napaka-effective.', imagePrompt: 'Close up of product detail', videoPrompt: 'Turning product around showing fine details in natural light', status: 'pending' },
        { id: 2, type: 'Demo', script: 'Swak na swak ito sa pang-araw-araw na gamit. Napakadali pang dalhin kahit saan ka pumunta.', imagePrompt: 'Product on a table', videoPrompt: 'Testing and applying or demonstrating the product naturally', status: 'pending' },
        { id: 3, type: 'CTA', script: 'Kaya i-click niyo na yung yellow basket sa baba at mag-checkout na habang naka-sale pa!', imagePrompt: 'Filipino host pointing down with product', videoPrompt: 'Waving with product and naturally pointing downward toward bottom of frame', status: 'pending' }
      ];
    }

    return this.callWithRetry(async () => {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            {
              text: `You are an expert TikTok UGC ad director specializing in creating high-converting TikTok Shop Affiliate videos for Filipino audiences.

Your task is to analyze the uploaded product image and the chosen Vibe, then generate a seamless 4-part viral UGC ad script and prompt package (Hook, Feature, Demo, CTA).

Your objective is to generate shots that look indistinguishable from authentic TikTok Shop Affiliate content created by a real Filipino creator. The final stitched video should feel completely natural, authentic, and native to TikTok—never AI-generated or rushed.

────────────────────────────────────────
TARGET VIDEO DURATION & STRICT WORD LIMITS
────────────────────────────────────────

Target Video Setting: ${duration}
(Clip Duration Per Shot: ${shotDuration} seconds)

CRITICAL TIMING & PACING RULES (TO PREVENT DIALOGUE FROM GETTING CUT OFF):
Natural Tagalog speech runs at ~2 to 2.5 words per second. Every clip MUST have a 0.5-second natural silence/pause at the end so it never cuts off mid-sentence.

${is15s ? `• 15-SECOND VIDEO MODE (4 seconds per shot):
  - STRICT WORD LIMIT: Exactly 6 to 9 words MAXIMUM per shot script.
  - Structure: One single short, punchy sentence only.
  - Examples:
    * Hook: "Hoy mga beh, tingnan niyo 'to!" (6 words)
    * Feature: "Super creamy at hindi malagkit sa balat." (7 words)
    * Demo: "Araw-araw ko na 'tong ginagamit, grabe." (6 words)
    * CTA: "I-click niyo na yung yellow basket sa baba!" (8 words)` : `• 30-SECOND VIDEO MODE (8 seconds per shot):
  - STRICT WORD LIMIT: Exactly 14 to 18 words MAXIMUM per shot script.
  - Structure: Two short conversational sentences with a brief reaction pause.
  - Example: "Sobrang tagal ko nang naghahanap ng ganito. Buti na lang nahanap ko 'to online!" (14 words)`}

NEVER exceed these word limits. Dialogue must comfortably finish with time to spare before the clip ends.

────────────────────────────────────────
OVERALL OBJECTIVE & STRUCTURE
────────────────────────────────────────

The 4 video shots will be animated and stitched together into ONE continuous, seamless TikTok advertisement:

1. HOOK (Shot 1):
   • Immediate pattern interrupt speaking directly to camera in casual Tagalog/Taglish.
   • Grabs attention through curiosity, relatable problem, or surprising reaction.

2. FEATURE (Shot 2):
   • Showcases the key selling point or texture/details of the product naturally.
   • Authentic close-up or creator interaction with the item.

3. DEMO (Shot 3):
   • Natural in-action usage in a daily life / handheld vlog style.
   • Authentic reaction and genuine testimonial.

4. CTA (Shot 4):
   • High-converting TikTok Shop affiliate call-to-action.
   • The creator verbally tells viewers to check the yellow basket while naturally pointing downward.

────────────────────────────────────────
CONSISTENCY & CREATOR IDENTITY
────────────────────────────────────────

The SAME host (from Reference 1) and the SAME product (from Reference 2) must appear consistently across all 4 shots.

Maintain identical:
• Face, hair, outfit, and accessories
• Room setting, natural lighting, and background
• Voice, tone, accent, and casual energy level

────────────────────────────────────────
DIALOGUE & ACTING STYLE
────────────────────────────────────────

• Vibe: ${vibe}
• Language: Strictly natural, conversational everyday Filipino / Taglish.
• Tone: Friendly, authentic, and relatable—like a friend recommending something they personally bought with their own money.
• Natural Slang (when appropriate):
  - Female creators: "Mga beh...", "Girl...", "Sis...", "Sobrang ganda nito..."
  - Male creators: "Mga par...", "Bro...", "Tol...", "Solid 'to..."
• NEVER use formal Tagalog, robotic script language, or corporate commercial tones.
• The creator should speak naturally, breathe naturally, and maintain believable pacing.

────────────────────────────────────────
CAMERA, FRAMING & STRICT NO-UI RULES
────────────────────────────────────────

• Camera Style: Vertical 9:16 authentic smartphone camera quality, realistic handheld camera physics, natural daylight, shot like an organic TikTok vlog.
• NEVER generate on-screen phone borders, phone screen frames, camera UI, or recording buttons.
• NEVER generate on-screen text overlays, burned-in subtitles, captions, TikTok watermarks, or like/share icons.
• NEVER generate artificial graphics, floating arrows, emoji stickers, or yellow basket graphics.
• In the CTA shot, the Yellow Basket must ONLY be referred to verbally while the creator naturally points downward toward the bottom-left of the frame.

────────────────────────────────────────
OUTPUT REQUIREMENTS (STRICT JSON)
────────────────────────────────────────

Output ONLY a valid JSON array of 4 objects with the following keys for each shot:
1. type: "Hook" | "Feature" | "Demo" | "CTA"
2. script: The exact spoken dialogue strictly in casual Tagalog / Taglish adhering to the word count limit.
3. imagePrompt: Detailed visual prompt to generate the 9:16 reference frame photo of the host holding/using the product.
4. videoPrompt: Detailed motion and camera prompt describing the host's natural movement, expression, gestures, and interaction with the product.

Do not include markdown formatting or extra text outside the JSON array.`
            },
            { inlineData: { data: this.cleanBase64(productB64), mimeType: 'image/png' } }
          ]
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                script: { type: Type.STRING },
                imagePrompt: { type: Type.STRING },
                videoPrompt: { type: Type.STRING }
              },
              required: ['type', 'script', 'imagePrompt', 'videoPrompt']
            }
          }
        }
      });

      let text = response.text || "[]";
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const data = JSON.parse(text);
      await this.serverLog('info', `Script generated successfully: ${data.length} shots`);
      return data.map((d: any, i: number) => ({ ...d, id: i, status: 'pending' }));
    });
  }

  /**
   * Stage 2: Generate unique reference images for shots using Nano Banana Pro.
   */
  static async generateShotReference(prompt: string, avatarB64: string, productB64: string, simulateMode = false): Promise<string> {
    await this.serverLog('info', `Generating reference frame...`);

    if (simulateMode) {
      await new Promise(res => setTimeout(res, 2000));
      return productB64; // Return product image as mock ref
    }

    return this.callWithRetry(async () => {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [
            { text: `High-quality smartphone selfie photo. The host (Ref 1) is holding the product (Ref 2). ${prompt}. Real background, natural lighting, authentic social media quality, vertical 9:16, shot on iPhone.` },
            { inlineData: { data: this.cleanBase64(avatarB64), mimeType: 'image/png' } },
            { inlineData: { data: this.cleanBase64(productB64), mimeType: 'image/png' } }
          ]
        },
        config: {
          imageConfig: { aspectRatio: "9:16" }
        }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          await this.serverLog('info', `Reference frame generated successfully`);
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      throw new Error("No image data in response");
    });
  }

  /**
   * Stage 3: Animate a specific shot with "Shot on Phone" physics.
   */
  static async animateShot(
    shot: Shot,
    refImageB64: string,
    onProgress: (msg: string) => void,
    modelName: string, // Dynamic model name
    durationSeconds: number = 8, // 4s for 15s video, 8s for 30s video
    simulateMode = false
  ): Promise<string> {
    await this.serverLog('info', `Starting animation for shot: ${shot.type} using ${modelName} (${durationSeconds}s)`);

    if (simulateMode) {
      onProgress("Simulating render...");
      await new Promise(res => setTimeout(res, 3000));
      return "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"; // Sample public video
    }

    const finalPrompt = `Authentic vertical 9:16 TikTok UGC video. A natural Filipino creator is speaking in casual Tagalog directly to the camera. ${shot.videoPrompt}. Realistic natural lighting, authentic handheld smartphone camera feel, organic expressions, genuine vlog style. Do not show phone frame, device borders, camera UI, subtitles, text overlays, or graphics.`;

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey });

    let operation = await this.callWithRetry(async () => {
      await this.acquireVeoSlot(onProgress);
      return ai.models.generateVideos({
        model: modelName,
        prompt: finalPrompt,
        image: {
          imageBytes: this.cleanBase64(refImageB64),
          mimeType: 'image/png'
        },
        config: {
          numberOfVideos: 1,
          durationSeconds: durationSeconds,
          resolution: '720p',
          aspectRatio: '9:16'
        }
      });
    });

    // Polling loop
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 15000)); // Snappier 15s polling
      const statusMsg = `Enhancing footage (checking progress)...`;
      onProgress(statusMsg);
      await this.serverLog('info', `Polling status for ${shot.type}...`);

      const aiStatus = new GoogleGenAI({ apiKey });
      operation = await this.callWithRetry(() => aiStatus.operations.getVideosOperation({ operation: operation }));

      if (operation.error) {
        throw new Error(`Video generation failed: ${operation.error.message || 'Unknown API error'}`);
      }
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("No download link returned.");

    await this.serverLog('info', `Shot ${shot.type} complete. Downloading...`);
    const response = await this.callWithRetry(() => fetch(`${downloadLink}&key=${apiKey}`));

    if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }
}
