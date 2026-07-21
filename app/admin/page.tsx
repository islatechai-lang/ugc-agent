'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Shield, CheckCircle2, XCircle, Clock, Loader2, RefreshCcw, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface PaymentRecord {
    id: string;
    user_id: string;
    username?: string;
    phone?: string;
    package_id: string;
    credits: number;
    amount_php: number;
    receipt_url: string;
    status: 'pending' | 'approved' | 'rejected';
    ai_decision: string;
    ai_reason: string;
    created_at: string;
}

export default function AdminPage() {
    const { user, getIdToken } = useAuth();
    const [payments, setPayments] = useState<PaymentRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    const fetchPayments = async () => {
        setLoading(true);
        try {
            const token = await getIdToken();
            const res = await fetch('/api/payments/pending', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setPayments(data.payments || []);
            }
        } catch (e) {
            console.error("Failed to fetch payments:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPayments();
    }, []);

    const handleAction = async (paymentId: string, action: 'approve' | 'reject') => {
        setProcessingId(paymentId);
        try {
            const token = await getIdToken();
            const res = await fetch('/api/payments/approve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ paymentId, action })
            });

            if (res.ok) {
                await fetchPayments();
            } else {
                const err = await res.json();
                alert(`Error: ${err.error || 'Action failed'}`);
            }
        } catch (e: any) {
            alert(`Error: ${e.message}`);
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--bg-primary,#09090b)] text-white p-6 md:p-12 font-sans">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Top Header */}
                <div className="flex items-center justify-between border-b border-white/10 pb-6">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-white/70 hover:text-white">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-600/30">
                                <Shield className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-black italic uppercase tracking-wider">GCash Admin Review Panel</h1>
                                <p className="text-xs text-white/50">Manage & verify user payment receipt submissions</p>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={fetchPayments}
                        disabled={loading}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold flex items-center gap-2 transition-all"
                    >
                        <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex items-center justify-center py-24 text-orange-500">
                        <Loader2 className="w-10 h-10 animate-spin" />
                    </div>
                ) : payments.length === 0 ? (
                    <div className="p-12 border border-dashed border-white/10 rounded-3xl text-center text-white/40">
                        No GCash payments recorded yet.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6">
                        {payments.map((p) => (
                            <div key={p.id} className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                                {/* Left Info */}
                                <div className="space-y-2 flex-1">
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg font-black text-orange-400">₱{p.amount_php}</span>
                                        <span className="px-2.5 py-0.5 bg-orange-600/20 text-orange-400 border border-orange-500/30 text-[10px] font-bold rounded-full uppercase">
                                            {p.credits} Credits ({p.package_id})
                                        </span>
                                        <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase flex items-center gap-1 ${
                                            p.status === 'approved' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                            p.status === 'rejected' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                            'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                        }`}>
                                            {p.status === 'approved' && <CheckCircle2 className="w-3 h-3" />}
                                            {p.status === 'rejected' && <XCircle className="w-3 h-3" />}
                                            {p.status === 'pending' && <Clock className="w-3 h-3 animate-pulse" />}
                                            {p.status}
                                        </span>
                                    </div>

                                    <div className="text-xs text-white/70 space-y-1">
                                        <div><strong className="text-white">User:</strong> {p.username || 'User'} ({p.user_id})</div>
                                        {p.phone && <div><strong className="text-white">Phone:</strong> {p.phone}</div>}
                                        <div><strong className="text-white">Date:</strong> {new Date(p.created_at).toLocaleString()}</div>
                                        {p.ai_reason && (
                                            <div className="mt-2 p-3 bg-black/40 rounded-xl text-[11px] text-white/80 border border-white/5">
                                                <strong className="text-orange-400">AI Assessment:</strong> {p.ai_reason}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right Receipt Image & Actions */}
                                <div className="flex items-center gap-4 shrink-0 w-full md:w-auto justify-between">
                                    {p.receipt_url && (
                                        <div 
                                            onClick={() => setSelectedImage(p.receipt_url)}
                                            className="w-20 h-28 rounded-xl overflow-hidden border border-white/20 cursor-pointer hover:scale-105 transition-transform bg-black relative group"
                                        >
                                            <img src={p.receipt_url} alt="Receipt" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[9px] font-bold uppercase text-white">
                                                View
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex flex-col gap-2">
                                        {p.status !== 'approved' && (
                                            <button
                                                onClick={() => handleAction(p.id, 'approve')}
                                                disabled={processingId === p.id}
                                                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-green-600/20"
                                            >
                                                {processingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                                Approve (+{p.credits})
                                            </button>
                                        )}
                                        {p.status !== 'rejected' && (
                                            <button
                                                onClick={() => handleAction(p.id, 'reject')}
                                                disabled={processingId === p.id}
                                                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                                            >
                                                <XCircle className="w-3.5 h-3.5" />
                                                Reject
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Receipt Full Preview Modal */}
            {selectedImage && (
                <div 
                    onClick={() => setSelectedImage(null)}
                    className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
                >
                    <div className="max-w-md max-h-[90vh] overflow-hidden rounded-3xl border border-white/20 shadow-2xl">
                        <img src={selectedImage} alt="Receipt Full" className="w-full h-full object-contain" />
                    </div>
                </div>
            )}
        </div>
    );
}
