'use client';

import { useState } from 'react';
import { signIn } from '@/lib/auth';
import { Music } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await signIn(email, password);
            window.location.href = '/';
        } catch (err: unknown) {
            const error = err as Error;
            setError(error.message || 'שגיאה בהתחברות');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4" dir="rtl">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-tr from-amber-400 to-amber-600 shadow-2xl shadow-amber-500/30 mb-4">
                        <Music size={40} className="text-white" />
                    </div>
                    <h1 className="text-3xl font-extrabold text-white tracking-tight">HaydeBot</h1>
                    <p className="text-slate-400 mt-1 text-sm font-medium">מערכת ניהול לידים ואירועים</p>
                </div>

                {/* Login Card */}
                <form onSubmit={handleLogin} className="bg-white backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                    <h2 className="text-xl font-bold text-white mb-6 text-center">התחברות</h2>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3 mb-4">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-300 mb-1.5">אימייל</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 bg-white border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all text-left"
                                placeholder="your@email.com"
                                dir="ltr"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-300 mb-1.5">סיסמה</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-white border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all text-left"
                                placeholder="••••••••"
                                dir="ltr"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-6 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold rounded-xl hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 transition-all shadow-lg shadow-amber-500/25 text-lg"
                    >
                        {loading ? '...מתחבר' : 'כניסה'}
                    </button>
                </form>

                <p className="text-center text-slate-600 text-xs mt-6">© Hayde Music {new Date().getFullYear()}</p>
            </div>
        </div>
    );
}
