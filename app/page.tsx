'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Loader2, Key, ShieldAlert, Smartphone, Sparkles, User, Box, ShoppingBag, Clapperboard, CheckCircle2, AlertCircle, Layers, RefreshCcw, Download, Zap, Plus, ChevronRight, X, Trash2, Menu, ChevronLeft, Shield, Upload, LogOut, Phone } from 'lucide-react';
import { AdVibe, AspectRatio, Config, GenerationStatus } from '../types';
import { VeoService, Shot } from '../services/veoService';
import { CustomVideoPlayer } from './components/CustomVideoPlayer';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { useAuth } from '@/components/AuthProvider';
import { signInWithPopup, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import Link from 'next/link';

declare global {
    var aistudio: {
        hasSelectedApiKey: () => Promise<boolean>;
        openSelectKey: () => Promise<void>;
    };
    interface Window {
        recaptchaVerifier?: RecaptchaVerifier;
    }
}

const GCASH_PACKAGES = [
    { id: 'pack_3', credits: 3, pricePhp: 150, label: 'Starter', popular: false },
    { id: 'pack_5', credits: 5, pricePhp: 250, label: 'Standard', popular: false },
    { id: 'pack_12', credits: 12, pricePhp: 500, label: 'Pro', popular: true },
    { id: 'pack_18', credits: 18, pricePhp: 750, label: 'Agency', popular: false },
];

const App: React.FC = () => {
    const { user, firebaseUser, loading: authLoading, logout, getIdToken, refreshUser } = useAuth();

    const [config, setConfig] = useState<Config>({
        projectId: '',
        location: 'us-central1',
        simulateMode: false,
        aspectRatio: AspectRatio.PORTRAIT
    });

    const [vibe, setVibe] = useState<AdVibe>(AdVibe.EXCITED_UNBOXING);
    const [productImage, setProductImage] = useState<string | null>(null);
    const [avatarImage, setAvatarImage] = useState<string | null>(null);
    const [status, setStatus] = useState<GenerationStatus>({ stage: 'idle', message: '' });
    const [hasKey, setHasKey] = useState(false);
    const [campaignId, setCampaignId] = useState<string | null>(null);
    const [projects, setProjects] = useState<any[]>([]);

    const [shots, setShots] = useState<Shot[]>([]);
    const [currentShotId, setCurrentShotId] = useState<number | null>(null);
    const [masterVideoUrl, setMasterVideoUrl] = useState<string | null>(null);
    const [selectedTemplate, setSelectedTemplate] = useState('/templates/template1.png?v=2');
    const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);

    const ffmpegRef = useRef<any>(null);
    const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
    const [selectedProject, setSelectedProject] = useState<any | null>(null);
    const [modalVideoUrl, setModalVideoUrl] = useState<string | null>(null);

    // Payment Modal State
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedPackageId, setSelectedPackageId] = useState<string>('pack_12');
    const [receiptImage, setReceiptImage] = useState<string | null>(null);
    const [submittingPayment, setSubmittingPayment] = useState(false);
    const [paymentFeedback, setPaymentFeedback] = useState<{ status: 'success' | 'error'; message: string } | null>(null);

    // Phone Verification State
    const [phoneNumber, setPhoneNumber] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
    const [verifyingPhone, setVerifyingPhone] = useState(false);
    const [phoneError, setPhoneError] = useState('');

    const [showQuotaModal, setShowQuotaModal] = useState(false);
    const [quotaMessage, setQuotaMessage] = useState('');
    const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    useEffect(() => {
        const loadAvatar = async (path: string) => {
            try {
                const response = await fetch(path);
                if (response.ok) {
                    const blob = await response.blob();
                    const reader = new FileReader();
                    reader.onloadend = () => setAvatarImage(reader.result as string);
                    reader.readAsDataURL(blob);
                }
            } catch (e) { console.warn("Avatar not found:", path); }
        };
        loadAvatar(selectedTemplate);
        loadFFmpeg();
    }, [selectedTemplate]);

    const loadFFmpeg = async () => {
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        const ffmpeg = new FFmpeg();
        ffmpegRef.current = ffmpeg;

        ffmpeg.on('log', ({ message }) => {
            console.log(message);
        });
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        setFfmpegLoaded(true);
    };

    const fetchProjects = async () => {
        try {
            const token = await getIdToken();
            if (!token) return;
            const response = await fetch('/api/campaign', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ action: 'getCampaigns' })
            });
            if (response.ok) {
                const data = await response.json();
                setProjects(data.campaigns || []);
            }
        } catch (e) { console.error("Failed to fetch projects", e); }
    };

    useEffect(() => {
        if (user) {
            fetchProjects();
        }

        const checkKey = async () => {
            if (window.aistudio) {
                const selected = await window.aistudio.hasSelectedApiKey();
                setHasKey(selected);
            }
        };
        checkKey();
    }, [user]);

    const handleGoogleSignIn = async () => {
        try {
            setPhoneError('');
            await signInWithPopup(auth, googleProvider);
        } catch (e: any) {
            setPhoneError(e.message || "Failed to sign in with Google.");
        }
    };

    const setupRecaptcha = () => {
        if (!window.recaptchaVerifier) {
            window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                size: 'invisible'
            });
        }
    };

    const handleSendOtp = async () => {
        if (!phoneNumber || phoneNumber.length < 10) {
            setPhoneError("Please enter a valid phone number (+639XXXXXXXXX).");
            return;
        }
        setVerifyingPhone(true);
        setPhoneError('');
        try {
            setupRecaptcha();
            const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+63${phoneNumber.replace(/^0/, '')}`;
            const confirmation = await signInWithPhoneNumber(auth, formattedPhone, window.recaptchaVerifier);
            setConfirmationResult(confirmation);
        } catch (e: any) {
            console.error("Phone Auth Error:", e);
            setPhoneError(e.message || "Failed to send OTP. Ensure phone number is valid.");
        } finally {
            setVerifyingPhone(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (!confirmationResult || !otpCode) return;
        setVerifyingPhone(true);
        setPhoneError('');
        try {
            await confirmationResult.confirm(otpCode);
            await refreshUser();
        } catch (e: any) {
            setPhoneError(e.message || "Invalid OTP code. Please try again.");
        } finally {
            setVerifyingPhone(false);
        }
    };

    const handleDeleteProject = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setProjectToDelete(id);
    };

    const confirmDelete = async () => {
        if (!projectToDelete) return;
        try {
            const token = await getIdToken();
            const response = await fetch('/api/campaign', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ action: 'deleteCampaign', campaignId: projectToDelete })
            });

            if (response.ok) {
                setProjects(prev => prev.filter(p => p.id !== projectToDelete));
                if (selectedProject?.id === projectToDelete) {
                    setSelectedProject(null);
                    setModalVideoUrl(null);
                }
            }
        } catch (e) {
            console.error("Failed to delete project", e);
        } finally {
            setProjectToDelete(null);
        }
    };

    const concatenateVideos = async (videoUrls: string[]): Promise<string> => {
        const ffmpeg = ffmpegRef.current;
        if (!ffmpeg || videoUrls.length === 0) return videoUrls[0] || '';

        try {
            const fileNames: string[] = [];
            for (let i = 0; i < videoUrls.length; i++) {
                const name = `input${i}.mp4`;
                const fileData = await fetchFile(videoUrls[i]);
                await ffmpeg.writeFile(name, fileData);
                fileNames.push(name);
            }

            let concatList = '';
            fileNames.forEach(name => {
                concatList += `file '${name}'\n`;
            });
            await ffmpeg.writeFile('concat.txt', concatList);

            await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'output.mp4']);

            const data = await ffmpeg.readFile('output.mp4');
            const blob = new Blob([data], { type: 'video/mp4' });
            return URL.createObjectURL(blob);
        } catch (e) {
            console.error("FFmpeg concat failed:", e);
            return videoUrls[0] || '';
        }
    };

    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    const handleGenerateFullAd = async () => {
        if (!productImage || !avatarImage) {
            setStatus({ stage: 'error', message: 'Please upload a product image first.' });
            return;
        }

        if (user && user.credits <= 0) {
            setShowPaymentModal(true);
            return;
        }

        if (!ffmpegLoaded) {
            setStatus({ stage: 'error', message: 'FFmpeg is still loading. Please wait.' });
            return;
        }

        if (!hasKey && window.aistudio) {
            await window.aistudio.openSelectKey();
            setHasKey(true);
        }

        setStatus({ stage: 'generating', message: 'Analyzing your product...', progress: 5 });
        setShots([]);
        setMasterVideoUrl(null);

        try {
            const token = await getIdToken();
            const productB64 = productImage.split(',')[1];
            const newCampaignId = `camp_${Date.now()}`;
            setCampaignId(newCampaignId);

            const quotaRes = await fetch('/api/quota');
            const quota = await quotaRes.json();

            if (!quota.allowed) {
                setQuotaMessage(quota.message || 'Daily limit reached.');
                setShowQuotaModal(true);
                setStatus({ stage: 'idle', message: '' });
                return;
            }

            const modelToUse = quota.model || 'veo-3.1-fast-generate-preview';

            const createRes = await fetch('/api/campaign', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ action: 'createCampaign', campaignId: newCampaignId, data: { vibe } })
            });

            if (!createRes.ok) {
                const errData = await createRes.json();
                throw new Error(errData.error || 'Failed to create campaign');
            }

            await refreshUser();

            setStatus({ stage: 'generating', message: `Drafting Tagalog viral ad script...`, progress: 15 });
            const generatedShots = await VeoService.createScript(productB64, vibe, config.simulateMode);
            setShots(generatedShots);

            await fetch('/api/campaign', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ action: 'saveShots', campaignId: newCampaignId, data: { shots: generatedShots } })
            });

            const completedVideoUrls: string[] = [];
            const totalShots = generatedShots.length;

            for (let i = 0; i < totalShots; i++) {
                const shot = generatedShots[i];
                setCurrentShotId(shot.id);

                const shotProgressBase = 15;
                const shotProgressRange = 80;
                setStatus({
                    stage: 'generating',
                    message: `Rendering shot ${i + 1}/${totalShots}: ${shot.type}...`,
                    progress: Math.round(shotProgressBase + (i / totalShots) * shotProgressRange)
                });

                setShots(prev => prev.map(s => s.id === shot.id ? { ...s, status: 'generating' } : s));

                const refImg = await VeoService.generateShotReference(shot.imagePrompt, avatarImage, productImage, config.simulateMode);
                setShots(prev => prev.map(s => s.id === shot.id ? { ...s, refImage: refImg } : s));

                const videoUrl = await VeoService.animateShot(shot, refImg, (msg) => {
                    if (!msg.toLowerCase().includes('cooloff') && !msg.toLowerCase().includes('rendering')) {
                        setStatus(prev => ({ ...prev, message: `Finalizing shot details...` }));
                    }
                }, modelToUse, config.simulateMode);

                await fetch('/api/quota', {
                    method: 'POST',
                    body: JSON.stringify({ model: modelToUse })
                });

                completedVideoUrls.push(videoUrl);
                setShots(prev => prev.map(s => s.id === shot.id ? { ...s, status: 'completed', videoUrl } : s));

                await fetch('/api/campaign', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({
                        action: 'updateShot',
                        campaignId: newCampaignId,
                        data: {
                            type: shot.type,
                            status: 'completed',
                            videoUrl: videoUrl,
                            refImage: refImg
                        }
                    })
                });

                if (i < generatedShots.length - 1) {
                    setStatus({
                        stage: 'generating',
                        message: `Staging next shot...`,
                        progress: Math.round(shotProgressBase + ((i + 0.5) / totalShots) * shotProgressRange)
                    });
                }
            }

            setStatus({ stage: 'generating', message: 'Merging final cinematic cut...', progress: 95 });
            const finalBlobUrl = await concatenateVideos(completedVideoUrls);

            let masterVideoUrlToSave = finalBlobUrl;
            if (finalBlobUrl) {
                try {
                    setStatus({ stage: 'generating', message: 'Generating script-based Tagalog subtitles...', progress: 98 });
                    const segments = [];
                    for (const shot of shots) {
                        segments.push({ text: shot.script, duration: 5 });
                    }

                    const subRes = await fetch('/api/video/subtitles', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            videoUrl: finalBlobUrl,
                            segments
                        })
                    });

                    if (subRes.ok) {
                        const render = await subRes.json();
                        if (render.status === 'succeeded' && render.url) {
                            masterVideoUrlToSave = render.url;
                        }
                    }
                } catch (e: any) {
                    console.warn("Subtitle optional step warning:", e);
                }
            }

            if (masterVideoUrlToSave) {
                try {
                    await fetch('/api/campaign', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({
                            action: 'finishCampaign',
                            campaignId: newCampaignId,
                            data: { masterVideoUrl: masterVideoUrlToSave }
                        })
                    });
                } catch (e) { console.error("Failed to finish campaign in DB", e); }
            }

            setMasterVideoUrl(masterVideoUrlToSave);
            setStatus({ stage: 'completed', message: 'Your viral Tagalog UGC video is ready!' });
            fetchProjects();
        } catch (error: any) {
            console.error("Production failure:", error);
            setStatus({ stage: 'error', message: error.message || 'Production encountered an error.' });
        }
    };

    const handleGcashSubmit = async () => {
        if (!receiptImage) {
            setPaymentFeedback({ status: 'error', message: 'Please attach a screenshot of your GCash payment receipt.' });
            return;
        }

        setSubmittingPayment(true);
        setPaymentFeedback(null);
        try {
            const token = await getIdToken();
            const res = await fetch('/api/payments/gcash', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    packageId: selectedPackageId,
                    receiptImage
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setPaymentFeedback({ status: 'success', message: data.message });
                await refreshUser();
                setTimeout(() => {
                    setShowPaymentModal(false);
                    setReceiptImage(null);
                    setPaymentFeedback(null);
                }, 3000);
            } else {
                setPaymentFeedback({ status: 'error', message: data.error || 'Failed to submit receipt.' });
            }
        } catch (e: any) {
            setPaymentFeedback({ status: 'error', message: e.message || 'Submission error. Please try again.' });
        } finally {
            setSubmittingPayment(false);
        }
    };

    if (authLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[#09090b] text-orange-500 gap-4">
                <Loader2 className="w-12 h-12 animate-spin" />
                <span className="text-xs font-bold text-white/50 uppercase tracking-widest">Loading UGC Studio...</span>
            </div>
        );
    }

    // Authentication Gate Screen
    if (!firebaseUser || !user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#09090b] text-white p-6 relative overflow-hidden">
                <div id="recaptcha-container"></div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-orange-600/10 via-transparent to-transparent pointer-events-none" />

                <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-[32px] p-8 shadow-2xl backdrop-blur-xl relative z-10 space-y-8 text-center">
                    <div className="w-20 h-20 bg-orange-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-orange-600/30 italic font-black">
                        <Clapperboard className="w-10 h-10 text-white" />
                    </div>

                    <div>
                        <h1 className="text-3xl font-black italic uppercase tracking-tight">UGC Producer Agent</h1>
                        <p className="text-xs text-white/60 mt-2">Generate viral TikTok UGC ads in Tagalog with AI. Get 1 free credit upon registration!</p>
                    </div>

                    {!firebaseUser ? (
                        <div className="space-y-4 pt-4">
                            <button
                                onClick={handleGoogleSignIn}
                                className="w-full py-4 bg-white text-black hover:bg-white/90 font-black rounded-2xl transition-all flex items-center justify-center gap-3 text-sm uppercase tracking-wider shadow-lg"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                                </svg>
                                Continue with Google
                            </button>

                            {phoneError && (
                                <p className="text-xs text-red-400 font-bold bg-red-500/10 p-3 rounded-xl border border-red-500/20">{phoneError}</p>
                            )}
                        </div>
                    ) : (
                        // Phone Verification Step to bind 1 free credit to phone
                        <div className="space-y-4 pt-2 text-left">
                            <div className="p-4 bg-orange-600/10 border border-orange-500/20 rounded-2xl">
                                <span className="text-xs font-bold text-orange-400 block mb-1">Verify Mobile Number</span>
                                <span className="text-[11px] text-white/60">To claim your 1 free video credit and prevent duplicate accounts, please verify your mobile phone number.</span>
                            </div>

                            {!confirmationResult ? (
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Mobile Number (+63)</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="tel"
                                            placeholder="09454320799"
                                            value={phoneNumber}
                                            onChange={(e) => setPhoneNumber(e.target.value)}
                                            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500"
                                        />
                                        <button
                                            onClick={handleSendOtp}
                                            disabled={verifyingPhone}
                                            className="px-4 py-3 bg-orange-600 hover:bg-orange-500 font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-2"
                                        >
                                            {verifyingPhone ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send OTP"}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Enter 6-Digit OTP</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="123456"
                                            value={otpCode}
                                            onChange={(e) => setOtpCode(e.target.value)}
                                            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 text-center tracking-widest font-mono text-lg"
                                        />
                                        <button
                                            onClick={handleVerifyOtp}
                                            disabled={verifyingPhone}
                                            className="px-4 py-3 bg-green-600 hover:bg-green-500 font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-2"
                                        >
                                            {verifyingPhone ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {phoneError && (
                                <p className="text-xs text-red-400 font-bold bg-red-500/10 p-3 rounded-xl border border-red-500/20">{phoneError}</p>
                            )}

                            <button onClick={logout} className="w-full text-xs text-white/40 hover:text-white pt-2 flex items-center justify-center gap-1">
                                <LogOut className="w-3.5 h-3.5" /> Sign out
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-[#09090b] text-white font-sans overflow-hidden relative">
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-80 bg-[#121215] border-r border-white/10 flex flex-col p-6 overflow-y-auto transition-all duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:hidden'}`}>
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-600/30">
                            <Clapperboard className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight">UGC Producer</h1>
                            <span className="text-[10px] text-orange-400 font-bold uppercase tracking-widest leading-none">Tagalog AI Studio</span>
                        </div>
                    </div>
                    <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-white/50 hover:text-white">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                </div>

                {user && (
                    <div className="mb-8 p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-orange-600/20 border border-orange-500/30 flex items-center justify-center overflow-hidden">
                                {user.profile_pic_url ? (
                                    <img src={user.profile_pic_url} alt={user.username} className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-5 h-5 text-orange-400" />
                                )}
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-sm font-black tracking-tight truncate">{user.username}</span>
                                <span className="text-[10px] text-orange-400 font-bold flex items-center gap-1">
                                    <Zap className="w-3 h-3 fill-orange-400" /> {user.credits} Credits
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setShowPaymentModal(true)}
                                className="py-2.5 bg-orange-600 hover:bg-orange-500 rounded-xl flex items-center justify-center gap-1.5 transition-all text-[10px] font-black uppercase tracking-wider"
                            >
                                <Plus className="w-3.5 h-3.5" /> Top Up
                            </button>
                            <Link
                                href="/admin"
                                className="py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl flex items-center justify-center gap-1.5 transition-all text-[10px] font-bold uppercase tracking-wider text-white/80"
                            >
                                <Shield className="w-3.5 h-3.5 text-orange-400" /> Admin
                            </Link>
                        </div>
                    </div>
                )}

                <div className="flex-1 space-y-3">
                    <div className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-2">Recent Projects</div>
                    {projects.length === 0 ? (
                        <div className="p-4 border border-dashed border-white/10 rounded-2xl text-center text-[10px] text-white/40">
                            No projects generated yet
                        </div>
                    ) : (
                        projects.slice(0, 8).map(p => (
                            <div
                                key={p.id}
                                onClick={() => {
                                    setSelectedProject(p);
                                    setModalVideoUrl(p.master_video_url && p.master_video_url !== 'Saved' ? p.master_video_url : null);
                                }}
                                className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all cursor-pointer flex items-center justify-between group"
                            >
                                <div>
                                    <div className="text-[10px] font-bold text-white/90 truncate max-w-[140px]">{p.vibe}</div>
                                    <div className="text-[9px] text-white/40 font-bold">{new Date(p.created_at).toLocaleDateString()}</div>
                                </div>
                                <button onClick={(e) => handleDeleteProject(e, p.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 text-red-400 rounded-md">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <button onClick={logout} className="pt-4 mt-auto text-xs text-white/40 hover:text-white flex items-center gap-2 border-t border-white/10">
                    <LogOut className="w-4 h-4" /> Sign Out
                </button>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col p-4 lg:p-8 overflow-y-auto items-center relative">
                <div className="max-w-5xl w-full flex flex-col gap-6 lg:gap-10">
                    {!isSidebarOpen && (
                        <div className="flex items-center justify-between pb-6 border-b border-white/10">
                            <div className="flex items-center gap-4">
                                <button onClick={() => setIsSidebarOpen(true)} className="p-1.5 text-white/60 hover:text-orange-500">
                                    <Menu className="w-6 h-6" />
                                </button>
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-600/20">
                                        <Clapperboard className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h1 className="text-sm font-bold">UGC Producer Agent</h1>
                                        <span className="text-[9px] text-orange-400 font-bold uppercase tracking-widest">Tagalog Studio</span>
                                    </div>
                                </div>
                            </div>

                            {user && (
                                <div className="flex items-center gap-3">
                                    <div className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-full flex items-center gap-2">
                                        <Zap className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                                        <span className="text-xs font-black">{user.credits} Credits</span>
                                    </div>
                                    <button onClick={() => setShowPaymentModal(true)} className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-lg shadow-orange-600/20">
                                        <Plus className="w-3 h-3" /> Top Up
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 lg:gap-16 items-start">
                        <div className="space-y-10">
                            <div className={`grid grid-cols-1 ${!isSidebarOpen ? 'md:grid-cols-2' : ''} gap-8`}>
                                {/* Step 1: Upload Product */}
                                <section className="space-y-4">
                                    <label className="text-[10px] font-bold text-white/60 uppercase tracking-widest flex items-center gap-2">
                                        <span className="w-5 h-5 bg-orange-600 rounded-md text-white flex items-center justify-center text-[9px] font-black italic">01</span>
                                        Upload Product Image
                                    </label>
                                    <label className={`flex flex-col items-center justify-center w-full aspect-square max-h-[160px] rounded-[32px] border-2 border-dashed transition-all cursor-pointer ${productImage ? 'border-orange-500/40 bg-orange-500/5' : 'border-white/10 bg-white/5 hover:border-orange-500/30'}`}>
                                        {productImage ? (
                                            <img src={productImage} alt="Product" className="w-full h-full object-contain p-6" />
                                        ) : (
                                            <div className="flex flex-col items-center gap-3 opacity-40">
                                                <ShoppingBag className="w-8 h-8" />
                                                <span className="text-[9px] font-black uppercase tracking-widest">Select Image</span>
                                            </div>
                                        )}
                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const r = new FileReader();
                                                r.onload = () => setProductImage(r.result as string);
                                                r.readAsDataURL(file);
                                            }
                                        }} />
                                    </label>
                                </section>

                                {/* Step 2: Vibe */}
                                <section className="space-y-4">
                                    <label className="text-[10px] font-bold text-white/60 uppercase tracking-widest flex items-center gap-2">
                                        <span className="w-5 h-5 bg-orange-600 rounded-md text-white flex items-center justify-center text-[9px] font-black italic">02</span>
                                        Set Vibe
                                    </label>
                                    <div className="space-y-2">
                                        {Object.values(AdVibe).map((v) => (
                                            <button
                                                key={v}
                                                onClick={() => setVibe(v)}
                                                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all text-xs font-bold ${vibe === v ? 'border-orange-500 bg-orange-600/10 text-white' : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20'}`}
                                            >
                                                <span>{v}</span>
                                                {vibe === v && <CheckCircle2 className="w-4 h-4 text-orange-400" />}
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            </div>

                            {/* Step 3: Template */}
                            <section className="space-y-4">
                                <label className="text-[10px] font-bold text-white/60 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-5 h-5 bg-orange-600 rounded-md text-white flex items-center justify-center text-[9px] font-black italic">03</span>
                                    Select Host Template
                                </label>
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                    {[1, 2, 3, 4, 5, 6].map((num) => {
                                        const path = `/templates/template${num}.png?v=2`;
                                        return (
                                            <button
                                                key={num}
                                                onClick={() => setSelectedTemplate(path)}
                                                className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${selectedTemplate === path ? 'border-orange-500 scale-95 shadow-lg shadow-orange-500/20' : 'border-white/10 opacity-40 hover:opacity-100'}`}
                                            >
                                                <img src={path} className="w-full h-full object-cover" alt={`Template ${num}`} />
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>

                            <button
                                onClick={handleGenerateFullAd}
                                disabled={status.stage === 'generating'}
                                className="w-full py-5 bg-orange-600 hover:bg-orange-500 font-black text-lg uppercase tracking-wider rounded-2xl transition-all shadow-xl shadow-orange-600/30 flex items-center justify-center gap-3 disabled:opacity-50"
                            >
                                {status.stage === 'generating' ? <Loader2 className="w-6 h-6 animate-spin" /> : <Play className="w-6 h-6 fill-white" />}
                                {status.stage === 'generating' ? 'Generating Tagalog UGC Video...' : 'Generate Tagalog UGC Video'}
                            </button>
                        </div>

                        {/* Right Preview */}
                        <div className="space-y-4">
                            <div className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Video Output</div>
                            <div className="aspect-[9/16] bg-black border border-white/10 rounded-[32px] overflow-hidden relative shadow-2xl flex flex-col items-center justify-center">
                                {masterVideoUrl ? (
                                    <CustomVideoPlayer src={masterVideoUrl} />
                                ) : (
                                    <div className="p-8 text-center space-y-4 opacity-40">
                                        <Sparkles className="w-12 h-12 mx-auto text-orange-400" />
                                        <div className="text-xs font-bold uppercase tracking-wider">Preview Canvas</div>
                                        <div className="text-[10px] text-white/60">Your rendered Tagalog TikTok video will appear here.</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* GCash Payment Modal */}
            {showPaymentModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
                    <div className="bg-[#121215] border border-white/10 rounded-[32px] w-full max-w-xl p-6 sm:p-8 space-y-6 relative overflow-hidden shadow-2xl">
                        <button onClick={() => setShowPaymentModal(false)} className="absolute top-6 right-6 text-white/40 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>

                        <div className="text-center space-y-2">
                            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-blue-600/30">
                                <Zap className="w-6 h-6 text-white fill-white" />
                            </div>
                            <h2 className="text-2xl font-black italic uppercase tracking-tight">Top Up Video Credits</h2>
                            <p className="text-xs text-white/60">Pay via GCash to instantly receive generation credits.</p>
                        </div>

                        {/* Package Selector */}
                        <div className="grid grid-cols-2 gap-3">
                            {GCASH_PACKAGES.map(pkg => (
                                <div
                                    key={pkg.id}
                                    onClick={() => setSelectedPackageId(pkg.id)}
                                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${selectedPackageId === pkg.id ? 'border-blue-500 bg-blue-600/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                                >
                                    <div className="text-xs font-bold text-white/60 uppercase">{pkg.label}</div>
                                    <div className="text-xl font-black text-blue-400 mt-1">₱{pkg.pricePhp}</div>
                                    <div className="text-[10px] text-white/40 mt-1">{pkg.credits} Credits</div>
                                </div>
                            ))}
                        </div>

                        {/* GCash Payment Instructions */}
                        <div className="p-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl space-y-2 text-xs">
                            <div className="font-bold text-blue-400 uppercase tracking-wider">GCash Transfer Details:</div>
                            <div><strong className="text-white">GCash Number:</strong> 09454320799</div>
                            <div><strong className="text-white">Registered Name:</strong> AL****H M** G.</div>
                            <div><strong className="text-white">Amount:</strong> ₱{GCASH_PACKAGES.find(p => p.id === selectedPackageId)?.pricePhp}</div>
                        </div>

                        {/* Upload Receipt */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-white/60">Attach GCash Receipt Screenshot</label>
                            <label className={`flex flex-col items-center justify-center w-full h-28 rounded-2xl border-2 border-dashed transition-all cursor-pointer ${receiptImage ? 'border-green-500/40 bg-green-500/5' : 'border-white/10 bg-white/5 hover:border-blue-500/30'}`}>
                                {receiptImage ? (
                                    <div className="flex items-center gap-2 text-green-400 text-xs font-bold">
                                        <CheckCircle2 className="w-5 h-5" /> Receipt Attached! Click to change.
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2 opacity-50 text-xs font-bold">
                                        <Upload className="w-5 h-5" /> Select / Drop Screenshot
                                    </div>
                                )}
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        const r = new FileReader();
                                        r.onload = () => setReceiptImage(r.result as string);
                                        r.readAsDataURL(file);
                                    }
                                }} />
                            </label>
                        </div>

                        {paymentFeedback && (
                            <p className={`text-xs font-bold p-3 rounded-xl border ${paymentFeedback.status === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                                {paymentFeedback.message}
                            </p>
                        )}

                        <button
                            onClick={handleGcashSubmit}
                            disabled={submittingPayment || !receiptImage}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-500 font-black text-sm uppercase tracking-wider rounded-2xl transition-all shadow-xl shadow-blue-600/30 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {submittingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Receipt for AI Verification"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
