'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Loader2, Smartphone, Sparkles, User, ShoppingBag, Clapperboard, CheckCircle2, AlertCircle, Download, Zap, Plus, X, Trash2, Menu, ChevronLeft, Shield, Upload, LogOut, Phone, Clock, Edit3, Eye, ChevronRight } from 'lucide-react';
import { AdVibe, AspectRatio, Config, GenerationStatus } from '../types';
import { VeoService, Shot } from '../services/veoService';
import { CustomVideoPlayer } from './components/CustomVideoPlayer';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { useAuth } from '@/components/AuthProvider';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { auth } from '@/lib/firebase';
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
    { id: 'pack_300', credits: 300, pricePhp: 150, label: 'Starter', popular: false },
    { id: 'pack_500', credits: 500, pricePhp: 250, label: 'Standard', popular: false },
    { id: 'pack_1200', credits: 1200, pricePhp: 500, label: 'Pro', popular: true },
    { id: 'pack_1800', credits: 1800, pricePhp: 750, label: 'Agency', popular: false },
];

const DURATIONS = [
    { id: '15s', label: '15 Seconds', cost: 100, seconds: 15 },
    { id: '30s', label: '30 Seconds', cost: 200, seconds: 30 },
];

const App: React.FC = () => {
    const { user, firebaseUser, loading: authLoading, logout, getIdToken, refreshUser } = useAuth();

    const [config] = useState<Config>({
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

    const ffmpegRef = useRef<any>(null);
    const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
    const [selectedProject, setSelectedProject] = useState<any | null>(null);
    const [modalVideoUrl, setModalVideoUrl] = useState<string | null>(null);

    // Duration
    const [selectedDuration, setSelectedDuration] = useState<'15s' | '30s'>('15s');

    // Script Preview
    const [scriptReady, setScriptReady] = useState(false);
    const [editableShots, setEditableShots] = useState<Shot[]>([]);
    const [generatingScript, setGeneratingScript] = useState(false);

    // Payment Modal State
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedPackageId, setSelectedPackageId] = useState<string>('pack_1200');
    const [receiptImage, setReceiptImage] = useState<string | null>(null);
    const [submittingPayment, setSubmittingPayment] = useState(false);
    const [paymentFeedback, setPaymentFeedback] = useState<{ status: 'success' | 'error'; message: string } | null>(null);
    const [paymentStep, setPaymentStep] = useState<'packages' | 'instructions'>('packages');

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
        ffmpeg.on('log', ({ message }) => console.log(message));
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
        if (user) fetchProjects();
        const checkKey = async () => {
            if (window.aistudio) {
                const selected = await window.aistudio.hasSelectedApiKey();
                setHasKey(selected);
            }
        };
        checkKey();
    }, [user]);

    // Phone Auth Functions
    const setupRecaptcha = () => {
        if (!window.recaptchaVerifier) {
            window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
        }
    };

    const handleSendOtp = async () => {
        if (!phoneNumber || phoneNumber.length < 10) {
            setPhoneError("Maglagay ng valid na phone number (+639XXXXXXXXX).");
            return;
        }
        setVerifyingPhone(true);
        setPhoneError('');
        try {
            setupRecaptcha();
            const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+63${phoneNumber.replace(/^0/, '')}`;
            const confirmation = await signInWithPhoneNumber(auth, formattedPhone, window.recaptchaVerifier!);
            setConfirmationResult(confirmation);
        } catch (e: any) {
            setPhoneError(e.message || "Hindi naipadala ang OTP. I-check ang phone number.");
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
            setPhoneError(e.message || "Mali ang OTP code. Subukan ulit.");
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
        } catch (e) { console.error("Failed to delete project", e); }
        finally { setProjectToDelete(null); }
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
            fileNames.forEach(name => { concatList += `file '${name}'\n`; });
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

    // Step 1: Generate Script (Preview before video generation)
    const handleGenerateScript = async () => {
        if (!productImage || !avatarImage) {
            setStatus({ stage: 'error', message: 'Mag-upload muna ng product image.' });
            return;
        }

        const durationConfig = DURATIONS.find(d => d.id === selectedDuration)!;
        if (user && user.credits < durationConfig.cost) {
            setShowPaymentModal(true);
            return;
        }

        setGeneratingScript(true);
        setScriptReady(false);
        setStatus({ stage: 'generating', message: 'Gumagawa ng Tagalog script...', progress: 10 });

        try {
            const productB64 = productImage.split(',')[1];
            const generatedShots = await VeoService.createScript(productB64, vibe, config.simulateMode);
            setEditableShots(generatedShots);
            setScriptReady(true);
            setStatus({ stage: 'idle', message: '' });
        } catch (error: any) {
            setStatus({ stage: 'error', message: error.message || 'Hindi nagawa ang script.' });
        } finally {
            setGeneratingScript(false);
        }
    };

    // Step 2: Generate Videos from approved script
    const handleProduceVideo = async () => {
        if (!productImage || !avatarImage || editableShots.length === 0) return;

        const durationConfig = DURATIONS.find(d => d.id === selectedDuration)!;

        if (!ffmpegLoaded) {
            setStatus({ stage: 'error', message: 'FFmpeg is still loading. Maghintay lang.' });
            return;
        }

        if (!hasKey && window.aistudio) {
            await window.aistudio.openSelectKey();
            setHasKey(true);
        }

        setStatus({ stage: 'generating', message: 'Ini-setup ang production...', progress: 5 });
        setShots(editableShots);
        setMasterVideoUrl(null);
        setScriptReady(false);

        try {
            const token = await getIdToken();
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
                body: JSON.stringify({
                    action: 'createCampaign',
                    campaignId: newCampaignId,
                    data: { vibe, creditCost: durationConfig.cost }
                })
            });

            if (!createRes.ok) {
                const errData = await createRes.json();
                throw new Error(errData.error || 'Failed to create campaign');
            }

            await refreshUser();

            await fetch('/api/campaign', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ action: 'saveShots', campaignId: newCampaignId, data: { shots: editableShots } })
            });

            const completedVideoUrls: string[] = [];
            const totalShots = editableShots.length;

            for (let i = 0; i < totalShots; i++) {
                const shot = editableShots[i];
                setCurrentShotId(shot.id);

                const shotProgressBase = 10;
                const shotProgressRange = 80;
                setStatus({
                    stage: 'generating',
                    message: `Shot ${i + 1}/${totalShots}: ${shot.type}...`,
                    progress: Math.round(shotProgressBase + (i / totalShots) * shotProgressRange)
                });

                setShots(prev => prev.map(s => s.id === shot.id ? { ...s, status: 'generating' } : s));

                const refImg = await VeoService.generateShotReference(shot.imagePrompt, avatarImage!, productImage!, config.simulateMode);
                setShots(prev => prev.map(s => s.id === shot.id ? { ...s, refImage: refImg } : s));

                const videoUrl = await VeoService.animateShot(shot, refImg, (msg) => {
                    setStatus(prev => ({ ...prev, message: `Finalizing shot...` }));
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
                        data: { type: shot.type, status: 'completed', videoUrl, refImage: refImg }
                    })
                });
            }

            setStatus({ stage: 'generating', message: 'Pinagsasama ang mga shots...', progress: 95 });
            const finalBlobUrl = await concatenateVideos(completedVideoUrls);

            let masterVideoUrlToSave = finalBlobUrl;
            try {
                setStatus({ stage: 'generating', message: 'Nilalagyan ng Tagalog subtitles...', progress: 98 });
                const segments = editableShots.map(shot => ({ text: shot.script, duration: durationConfig.seconds / editableShots.length }));
                const subRes = await fetch('/api/video/subtitles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ videoUrl: finalBlobUrl, segments })
                });
                if (subRes.ok) {
                    const render = await subRes.json();
                    if (render.status === 'succeeded' && render.url) masterVideoUrlToSave = render.url;
                }
            } catch (e: any) { console.warn("Subtitle step warning:", e); }

            try {
                await fetch('/api/campaign', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ action: 'finishCampaign', campaignId: newCampaignId, data: { masterVideoUrl: masterVideoUrlToSave } })
                });
            } catch (e) { console.error("Failed to finish campaign", e); }

            setMasterVideoUrl(masterVideoUrlToSave);
            setStatus({ stage: 'completed', message: 'Tapos na ang iyong viral Tagalog UGC video!' });
            fetchProjects();
        } catch (error: any) {
            console.error("Production failure:", error);
            setStatus({ stage: 'error', message: error.message || 'May error sa production.' });
        }
    };

    const handleGcashSubmit = async () => {
        if (!receiptImage) {
            setPaymentFeedback({ status: 'error', message: 'Mag-attach ng GCash receipt screenshot.' });
            return;
        }
        setSubmittingPayment(true);
        setPaymentFeedback(null);
        try {
            const token = await getIdToken();
            const res = await fetch('/api/payments/gcash', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ packageId: selectedPackageId, receiptImage })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setPaymentFeedback({ status: 'success', message: data.message });
                await refreshUser();
                setTimeout(() => {
                    setShowPaymentModal(false);
                    setReceiptImage(null);
                    setPaymentFeedback(null);
                    setPaymentStep('packages');
                }, 3000);
            } else {
                setPaymentFeedback({ status: 'error', message: data.error || 'Failed to submit.' });
            }
        } catch (e: any) {
            setPaymentFeedback({ status: 'error', message: e.message || 'Error sa pag-submit.' });
        } finally {
            setSubmittingPayment(false);
        }
    };

    const durationConfig = DURATIONS.find(d => d.id === selectedDuration)!;

    // ===================== LOADING SCREEN =====================
    if (authLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[#09090b] text-orange-500 gap-4">
                <div className="w-16 h-16 bg-orange-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-orange-600/40 animate-pulse">
                    <Clapperboard className="w-8 h-8 text-white" />
                </div>
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em]">Pinoy UGC Agent</span>
            </div>
        );
    }

    // ===================== PHONE AUTH SCREEN =====================
    if (!firebaseUser || !user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#09090b] text-white p-4 sm:p-6 relative overflow-hidden">
                <div id="recaptcha-container"></div>
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-600/15 via-transparent to-transparent pointer-events-none" />

                <div className="w-full max-w-sm bg-white/[0.03] border border-white/10 rounded-[28px] p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative z-10 space-y-6 text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-700 rounded-2xl flex items-center justify-center mx-auto shadow-2xl shadow-orange-600/40">
                        <Clapperboard className="w-8 h-8 text-white" />
                    </div>

                    <div>
                        <h1 className="text-2xl sm:text-3xl font-black italic uppercase tracking-tight">Pinoy UGC Agent</h1>
                        <p className="text-[11px] text-white/50 mt-2 leading-relaxed">Gumawa ng viral TikTok UGC ads sa Tagalog gamit ang AI. Libre ang 100 credits sa pag-register!</p>
                    </div>

                    <div className="space-y-4 pt-2 text-left">
                        {!confirmationResult ? (
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 flex items-center gap-1.5">
                                    <Phone className="w-3 h-3" /> Phone Number
                                </label>
                                <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-orange-500/50 transition-all">
                                    <span className="px-3 text-sm text-white/50 font-bold border-r border-white/10 bg-white/5">+63</span>
                                    <input
                                        type="tel"
                                        placeholder="9XX XXX XXXX"
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                        className="flex-1 bg-transparent px-3 py-3.5 text-sm focus:outline-none text-white placeholder:text-white/20"
                                    />
                                </div>
                                <button
                                    onClick={handleSendOtp}
                                    disabled={verifyingPhone}
                                    className="w-full py-3.5 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 font-black rounded-xl text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-orange-600/30 transition-all active:scale-[0.98]"
                                >
                                    {verifyingPhone ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                                    {verifyingPhone ? 'Sending...' : 'Send OTP Code'}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
                                    <span className="text-[11px] font-bold text-green-400">OTP sent! I-check ang iyong SMS.</span>
                                </div>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">6-Digit OTP Code</label>
                                <input
                                    type="text"
                                    placeholder="• • • • • •"
                                    value={otpCode}
                                    onChange={(e) => setOtpCode(e.target.value)}
                                    maxLength={6}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-lg text-center tracking-[0.5em] font-mono focus:outline-none focus:border-orange-500/50"
                                />
                                <button
                                    onClick={handleVerifyOtp}
                                    disabled={verifyingPhone || otpCode.length < 6}
                                    className="w-full py-3.5 bg-gradient-to-r from-green-600 to-green-500 font-black rounded-xl text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-green-600/30 transition-all active:scale-[0.98] disabled:opacity-50"
                                >
                                    {verifyingPhone ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                    {verifyingPhone ? 'Verifying...' : 'Verify & Sign In'}
                                </button>
                                <button onClick={() => { setConfirmationResult(null); setOtpCode(''); }} className="w-full text-[11px] text-white/30 hover:text-white/60 pt-1">
                                    ← Ibang number
                                </button>
                            </div>
                        )}

                        {phoneError && (
                            <p className="text-[11px] text-red-400 font-bold bg-red-500/10 p-3 rounded-xl border border-red-500/20">{phoneError}</p>
                        )}
                    </div>

                    <p className="text-[9px] text-white/20 pt-2">Sa pag-register, sumasang-ayon ka sa terms of service.</p>
                </div>
            </div>
        );
    }

    // ===================== MAIN APP =====================
    return (
        <div className="flex h-[100dvh] bg-[#09090b] text-white font-sans overflow-hidden relative">
            {isSidebarOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
            )}

            {/* Sidebar */}
            <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-72 sm:w-80 bg-[#0f0f12] border-r border-white/[0.06] flex flex-col p-4 sm:p-5 overflow-y-auto transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:hidden'}`}>
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-orange-700 rounded-xl flex items-center justify-center shadow-lg shadow-orange-600/30">
                            <Clapperboard className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-sm font-black tracking-tight">Pinoy UGC Agent</h1>
                            <span className="text-[9px] text-orange-400 font-bold uppercase tracking-[0.15em]">Tagalog AI Studio</span>
                        </div>
                    </div>
                    <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-white/40 hover:text-white p-1">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                </div>

                {user && (
                    <div className="mb-5 p-3.5 bg-white/[0.03] border border-white/[0.06] rounded-2xl space-y-3">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-full bg-orange-600/20 border border-orange-500/30 flex items-center justify-center overflow-hidden shrink-0">
                                {user.profile_pic_url ? (
                                    <img src={user.profile_pic_url} alt={user.username} className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-4 h-4 text-orange-400" />
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-xs font-bold truncate">{user.username}</div>
                                <div className="text-[10px] text-orange-400 font-bold flex items-center gap-1">
                                    <Zap className="w-2.5 h-2.5 fill-orange-400" /> {user.credits} Credits
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setShowPaymentModal(true)} className="py-2 bg-orange-600 hover:bg-orange-500 rounded-lg flex items-center justify-center gap-1 text-[9px] font-black uppercase tracking-wider transition-all active:scale-95">
                                <Plus className="w-3 h-3" /> Top Up
                            </button>
                            <Link href="/admin" className="py-2 bg-white/[0.06] hover:bg-white/10 border border-white/[0.06] rounded-lg flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wider text-white/70 transition-all">
                                <Shield className="w-3 h-3 text-orange-400" /> Admin
                            </Link>
                        </div>
                    </div>
                )}

                <div className="flex-1 space-y-2 overflow-y-auto">
                    <div className="text-[9px] text-white/30 font-bold uppercase tracking-[0.2em] ml-1 mb-1">Recent Projects</div>
                    {projects.length === 0 ? (
                        <div className="p-3 border border-dashed border-white/[0.06] rounded-xl text-center text-[10px] text-white/30">Wala pang projects</div>
                    ) : (
                        projects.slice(0, 8).map(p => (
                            <div key={p.id} onClick={() => { setSelectedProject(p); setModalVideoUrl(p.master_video_url && p.master_video_url !== 'Saved' ? p.master_video_url : null); }}
                                className="p-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl hover:bg-white/[0.05] transition-all cursor-pointer flex items-center justify-between group">
                                <div className="min-w-0">
                                    <div className="text-[10px] font-bold text-white/80 truncate">{p.vibe}</div>
                                    <div className="text-[9px] text-white/30">{new Date(p.created_at).toLocaleDateString()}</div>
                                </div>
                                <button onClick={(e) => handleDeleteProject(e, p.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 text-red-400 rounded-md shrink-0">
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <button onClick={logout} className="pt-3 mt-auto text-[10px] text-white/30 hover:text-white/60 flex items-center gap-1.5 border-t border-white/[0.06]">
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-y-auto relative">
                {/* Top Bar */}
                <div className="sticky top-0 z-30 bg-[#09090b]/90 backdrop-blur-xl border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsSidebarOpen(true)} className="p-1 text-white/50 hover:text-orange-500 lg:hidden">
                            <Menu className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-gradient-to-br from-orange-500 to-orange-700 rounded-lg flex items-center justify-center shadow-lg shadow-orange-600/20">
                                <Clapperboard className="w-4 h-4 text-white" />
                            </div>
                            <div className="hidden sm:block">
                                <h1 className="text-xs font-black tracking-tight leading-none">Pinoy UGC Agent</h1>
                                <span className="text-[8px] text-orange-400 font-bold uppercase tracking-[0.15em]">Tagalog Studio</span>
                            </div>
                        </div>
                    </div>
                    {user && (
                        <div className="flex items-center gap-2">
                            <div className="px-2.5 py-1 bg-white/[0.04] border border-white/[0.08] rounded-full flex items-center gap-1.5">
                                <Zap className="w-3 h-3 text-orange-500 fill-orange-500" />
                                <span className="text-[10px] font-black">{user.credits}</span>
                            </div>
                            <button onClick={() => setShowPaymentModal(true)} className="px-3 py-1 bg-orange-600 hover:bg-orange-500 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-lg shadow-orange-600/20 transition-all active:scale-95">
                                <Plus className="w-2.5 h-2.5" /> Top Up
                            </button>
                        </div>
                    )}
                </div>

                {/* Content Area */}
                <div className="flex-1 p-4 sm:p-6 lg:p-8">
                    <div className="max-w-5xl mx-auto">
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 lg:gap-10 items-start">
                            {/* Left Column: Controls */}
                            <div className="space-y-6">
                                {/* Step 1 & 2: Upload + Vibe */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* Upload Product */}
                                    <section className="space-y-2.5">
                                        <label className="text-[9px] font-bold text-white/40 uppercase tracking-[0.2em] flex items-center gap-1.5">
                                            <span className="w-4 h-4 bg-orange-600 rounded text-white flex items-center justify-center text-[8px] font-black">1</span>
                                            Product Image
                                        </label>
                                        <label className={`flex flex-col items-center justify-center w-full aspect-square max-h-[140px] rounded-2xl border-2 border-dashed transition-all cursor-pointer active:scale-[0.98] ${productImage ? 'border-orange-500/30 bg-orange-500/5' : 'border-white/[0.08] bg-white/[0.02] hover:border-orange-500/20'}`}>
                                            {productImage ? (
                                                <img src={productImage} alt="Product" className="w-full h-full object-contain p-4" />
                                            ) : (
                                                <div className="flex flex-col items-center gap-2 opacity-30">
                                                    <ShoppingBag className="w-6 h-6" />
                                                    <span className="text-[8px] font-black uppercase tracking-[0.2em]">Upload</span>
                                                </div>
                                            )}
                                            <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) { const r = new FileReader(); r.onload = () => setProductImage(r.result as string); r.readAsDataURL(file); }
                                            }} />
                                        </label>
                                    </section>

                                    {/* Vibe Selector */}
                                    <section className="space-y-2.5">
                                        <label className="text-[9px] font-bold text-white/40 uppercase tracking-[0.2em] flex items-center gap-1.5">
                                            <span className="w-4 h-4 bg-orange-600 rounded text-white flex items-center justify-center text-[8px] font-black">2</span>
                                            Video Vibe
                                        </label>
                                        <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                                            {Object.values(AdVibe).map((v) => (
                                                <button key={v} onClick={() => setVibe(v)}
                                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-all text-[10px] font-bold active:scale-[0.98] ${vibe === v ? 'border-orange-500/50 bg-orange-600/10 text-white' : 'border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/10'}`}>
                                                    <span className="truncate">{v}</span>
                                                    {vibe === v && <CheckCircle2 className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                </div>

                                {/* Step 3: Template */}
                                <section className="space-y-2.5">
                                    <label className="text-[9px] font-bold text-white/40 uppercase tracking-[0.2em] flex items-center gap-1.5">
                                        <span className="w-4 h-4 bg-orange-600 rounded text-white flex items-center justify-center text-[8px] font-black">3</span>
                                        Host Template
                                    </label>
                                    <div className="grid grid-cols-6 gap-1.5">
                                        {[1, 2, 3, 4, 5, 6].map((num) => {
                                            const path = `/templates/template${num}.png?v=2`;
                                            return (
                                                <button key={num} onClick={() => setSelectedTemplate(path)}
                                                    className={`aspect-square rounded-lg overflow-hidden border-2 transition-all active:scale-90 ${selectedTemplate === path ? 'border-orange-500 shadow-lg shadow-orange-500/20' : 'border-white/[0.06] opacity-50 hover:opacity-80'}`}>
                                                    <img src={path} className="w-full h-full object-cover" alt={`Template ${num}`} />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>

                                {/* Step 4: Duration */}
                                <section className="space-y-2.5">
                                    <label className="text-[9px] font-bold text-white/40 uppercase tracking-[0.2em] flex items-center gap-1.5">
                                        <span className="w-4 h-4 bg-orange-600 rounded text-white flex items-center justify-center text-[8px] font-black">4</span>
                                        Video Duration
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {DURATIONS.map(dur => (
                                            <button key={dur.id} onClick={() => setSelectedDuration(dur.id as '15s' | '30s')}
                                                className={`p-3 rounded-xl border text-center transition-all active:scale-[0.97] ${selectedDuration === dur.id ? 'border-orange-500/50 bg-orange-600/10' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'}`}>
                                                <div className="flex items-center justify-center gap-1.5 mb-1">
                                                    <Clock className="w-3.5 h-3.5 text-orange-400" />
                                                    <span className="text-sm font-black">{dur.label}</span>
                                                </div>
                                                <span className="text-[10px] text-orange-400 font-bold">{dur.cost} Credits</span>
                                            </button>
                                        ))}
                                    </div>
                                </section>

                                {/* Generate Script Button */}
                                {!scriptReady && status.stage !== 'generating' && (
                                    <button onClick={handleGenerateScript} disabled={generatingScript || !productImage}
                                        className="w-full py-4 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 font-black text-sm uppercase tracking-wider rounded-xl transition-all shadow-xl shadow-orange-600/20 flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98]">
                                        {generatingScript ? <Loader2 className="w-5 h-5 animate-spin" /> : <Eye className="w-5 h-5" />}
                                        {generatingScript ? 'Gumagawa ng Script...' : 'Generate & Preview Script'}
                                    </button>
                                )}

                                {/* Script Preview & Edit */}
                                {scriptReady && editableShots.length > 0 && (
                                    <div className="space-y-3 p-4 bg-white/[0.02] border border-white/[0.08] rounded-2xl">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Edit3 className="w-4 h-4 text-orange-400" />
                                                <span className="text-xs font-black uppercase tracking-wider">Script Preview</span>
                                            </div>
                                            <span className="text-[9px] text-white/30 font-bold">I-edit kung may gusto kang baguhin</span>
                                        </div>
                                        {editableShots.map((shot, idx) => (
                                            <div key={idx} className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[9px] font-black text-orange-400 uppercase tracking-wider bg-orange-600/10 px-2 py-0.5 rounded">{shot.type}</span>
                                                </div>
                                                <textarea
                                                    value={shot.script}
                                                    onChange={(e) => {
                                                        const updated = [...editableShots];
                                                        updated[idx] = { ...updated[idx], script: e.target.value };
                                                        setEditableShots(updated);
                                                    }}
                                                    rows={2}
                                                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/90 focus:outline-none focus:border-orange-500/40 resize-none leading-relaxed"
                                                />
                                            </div>
                                        ))}
                                        <div className="flex gap-2 pt-2">
                                            <button onClick={() => { setScriptReady(false); setEditableShots([]); }}
                                                className="flex-1 py-3 bg-white/[0.05] border border-white/[0.08] font-bold rounded-xl text-[10px] uppercase tracking-wider text-white/60 hover:text-white transition-all active:scale-[0.98]">
                                                ← Regenerate
                                            </button>
                                            <button onClick={handleProduceVideo}
                                                className="flex-[2] py-3 bg-gradient-to-r from-green-600 to-green-500 font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-green-600/20 transition-all active:scale-[0.98]">
                                                <Play className="w-4 h-4 fill-white" /> Produce Video ({durationConfig.cost} Credits)
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Generation Progress */}
                                {status.stage === 'generating' && (
                                    <div className="p-4 bg-orange-600/5 border border-orange-500/20 rounded-2xl space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                                            <span className="text-xs font-bold text-orange-300">{status.message}</span>
                                        </div>
                                        {status.progress && (
                                            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-orange-600 to-orange-400 rounded-full transition-all duration-500" style={{ width: `${status.progress}%` }} />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {status.stage === 'completed' && (
                                    <div className="p-4 bg-green-600/10 border border-green-500/20 rounded-2xl flex items-center gap-2">
                                        <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                                        <span className="text-xs font-bold text-green-300">{status.message}</span>
                                    </div>
                                )}

                                {status.stage === 'error' && (
                                    <div className="p-4 bg-red-600/10 border border-red-500/20 rounded-2xl flex items-center gap-2">
                                        <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                                        <span className="text-xs font-bold text-red-300">{status.message}</span>
                                    </div>
                                )}
                            </div>

                            {/* Right Column: Video Preview */}
                            <div className="space-y-3 lg:sticky lg:top-20">
                                <div className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em]">Video Output</div>
                                <div className="aspect-[9/16] bg-black/50 border border-white/[0.06] rounded-2xl overflow-hidden relative shadow-2xl flex flex-col items-center justify-center">
                                    {masterVideoUrl ? (
                                        <CustomVideoPlayer src={masterVideoUrl} />
                                    ) : (
                                        <div className="p-6 text-center space-y-3 opacity-30">
                                            <Sparkles className="w-10 h-10 mx-auto text-orange-400" />
                                            <div className="text-[10px] font-bold uppercase tracking-wider">Preview Canvas</div>
                                            <div className="text-[9px] text-white/50">Dito lalabas ang iyong video.</div>
                                        </div>
                                    )}
                                </div>
                                {masterVideoUrl && (
                                    <a href={masterVideoUrl} download="pinoy-ugc-video.mp4"
                                        className="w-full py-3 bg-white/[0.06] border border-white/[0.08] hover:bg-white/10 font-bold rounded-xl text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
                                        <Download className="w-3.5 h-3.5" /> Download Video
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* ===== GCash Payment Modal ===== */}
            {showPaymentModal && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-end sm:items-center justify-center">
                    <div className="bg-[#0f0f12] border border-white/[0.08] rounded-t-[28px] sm:rounded-[28px] w-full max-w-md max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-5 relative shadow-2xl">
                        <button onClick={() => { setShowPaymentModal(false); setPaymentStep('packages'); setReceiptImage(null); setPaymentFeedback(null); }} className="absolute top-4 right-4 text-white/30 hover:text-white z-10">
                            <X className="w-5 h-5" />
                        </button>

                        {paymentStep === 'packages' ? (
                            <>
                                <div className="text-center space-y-2 pt-2">
                                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-blue-600/30">
                                        <Zap className="w-6 h-6 text-white fill-white" />
                                    </div>
                                    <h2 className="text-xl font-black italic uppercase tracking-tight">Top Up Credits</h2>
                                    <p className="text-[10px] text-white/40">Pumili ng credit package at magbayad via GCash.</p>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5">
                                    {GCASH_PACKAGES.map(pkg => (
                                        <button key={pkg.id} onClick={() => { setSelectedPackageId(pkg.id); setPaymentStep('instructions'); }}
                                            className={`p-3.5 rounded-2xl border transition-all text-left active:scale-[0.97] relative ${pkg.popular ? 'border-blue-500/40 bg-blue-600/10' : 'border-white/[0.08] bg-white/[0.03] hover:border-white/15'}`}>
                                            {pkg.popular && (
                                                <div className="absolute -top-2 right-3 bg-blue-600 px-2 py-0.5 rounded-full">
                                                    <span className="text-[7px] font-black text-white uppercase tracking-widest">Popular</span>
                                                </div>
                                            )}
                                            <div className="text-[9px] font-bold text-white/40 uppercase tracking-wider">{pkg.label}</div>
                                            <div className="text-lg font-black text-blue-400 mt-0.5">₱{pkg.pricePhp}</div>
                                            <div className="text-[10px] text-white/50 font-bold mt-0.5">{pkg.credits.toLocaleString()} Credits</div>
                                        </button>
                                    ))}
                                </div>

                                <div className="p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl text-center">
                                    <p className="text-[9px] text-white/30">15s video = 100 credits • 30s video = 200 credits</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="text-center space-y-1 pt-2">
                                    <h2 className="text-lg font-black italic uppercase tracking-tight">GCash Payment</h2>
                                    <p className="text-[10px] text-white/40">I-send ang payment at i-attach ang receipt.</p>
                                </div>

                                <div className="p-3.5 bg-blue-600/10 border border-blue-500/20 rounded-xl space-y-1.5 text-xs">
                                    <div className="font-bold text-blue-400 uppercase tracking-wider text-[10px]">GCash Details:</div>
                                    <div><strong className="text-white">Number:</strong> <span className="text-white/80 font-mono">09454320799</span></div>
                                    <div><strong className="text-white">Name:</strong> <span className="text-white/80">AL****H M** G.</span></div>
                                    <div><strong className="text-white">Amount:</strong> <span className="text-blue-400 font-black">₱{GCASH_PACKAGES.find(p => p.id === selectedPackageId)?.pricePhp}</span></div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Attach GCash Receipt Screenshot</label>
                                    <label className={`flex flex-col items-center justify-center w-full h-24 rounded-xl border-2 border-dashed transition-all cursor-pointer active:scale-[0.98] ${receiptImage ? 'border-green-500/30 bg-green-500/5' : 'border-white/[0.08] bg-white/[0.02] hover:border-blue-500/20'}`}>
                                        {receiptImage ? (
                                            <div className="flex items-center gap-2 text-green-400 text-[10px] font-bold"><CheckCircle2 className="w-4 h-4" /> Receipt attached!</div>
                                        ) : (
                                            <div className="flex flex-col items-center gap-1.5 opacity-40 text-[10px] font-bold"><Upload className="w-4 h-4" /> Upload Screenshot</div>
                                        )}
                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) { const r = new FileReader(); r.onload = () => setReceiptImage(r.result as string); r.readAsDataURL(file); }
                                        }} />
                                    </label>
                                </div>

                                {paymentFeedback && (
                                    <p className={`text-[10px] font-bold p-3 rounded-xl border ${paymentFeedback.status === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                                        {paymentFeedback.message}
                                    </p>
                                )}

                                <div className="flex gap-2">
                                    <button onClick={() => { setPaymentStep('packages'); setReceiptImage(null); }} className="py-3 px-4 bg-white/[0.05] border border-white/[0.08] rounded-xl text-[10px] font-bold text-white/50 active:scale-[0.98]">←</button>
                                    <button onClick={handleGcashSubmit} disabled={submittingPayment || !receiptImage}
                                        className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-blue-500 font-black text-[10px] uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-40 active:scale-[0.98]">
                                        {submittingPayment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Submit for AI Verification"}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ===== Quota Modal ===== */}
            {showQuotaModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
                    <div className="w-full max-w-xs bg-[#0f0f12] border border-white/[0.08] rounded-2xl p-6 text-center space-y-4 shadow-2xl">
                        <AlertCircle className="w-10 h-10 text-orange-400 mx-auto" />
                        <h2 className="text-lg font-black uppercase tracking-tight">Quota Reached</h2>
                        <p className="text-xs text-white/60">{quotaMessage}</p>
                        <button onClick={() => setShowQuotaModal(false)} className="w-full py-3 bg-orange-600 hover:bg-orange-500 font-bold rounded-xl text-xs uppercase tracking-wider active:scale-[0.98]">OK</button>
                    </div>
                </div>
            )}

            {/* ===== Delete Modal ===== */}
            {projectToDelete && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
                    <div className="w-full max-w-xs bg-[#0f0f12] border border-white/[0.08] rounded-2xl p-6 text-center space-y-4 shadow-2xl">
                        <Trash2 className="w-8 h-8 text-red-500 mx-auto" />
                        <h2 className="text-lg font-black uppercase tracking-tight">Delete Project?</h2>
                        <p className="text-xs text-white/50">Hindi na ito mare-recover.</p>
                        <div className="flex flex-col gap-2">
                            <button onClick={confirmDelete} className="w-full py-3 bg-red-600 hover:bg-red-500 font-bold rounded-xl text-xs uppercase tracking-wider active:scale-[0.98]">Delete</button>
                            <button onClick={() => setProjectToDelete(null)} className="w-full py-3 bg-white/[0.05] border border-white/[0.08] font-bold rounded-xl text-xs uppercase tracking-wider text-white/60 active:scale-[0.98]">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Project View Modal ===== */}
            {selectedProject && (
                <div className="fixed inset-0 z-[90] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="w-full max-w-sm bg-[#0f0f12] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
                        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider">{selectedProject.vibe}</span>
                            <button onClick={() => { setSelectedProject(null); setModalVideoUrl(null); }} className="text-white/30 hover:text-white"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="aspect-[9/16] bg-black">
                            {modalVideoUrl ? (
                                <CustomVideoPlayer src={modalVideoUrl} />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center opacity-30 space-y-3">
                                    <AlertCircle className="w-8 h-8" />
                                    <div className="text-[10px] font-bold uppercase">Video Not Ready</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{ __html: `
                ::-webkit-scrollbar { width: 3px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
            `}} />
        </div>
    );
};

export default App;
