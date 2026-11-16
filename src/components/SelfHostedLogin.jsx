import React, { useState } from 'react';
import { storage as AuthStorage } from '@commaai/my-comma-auth';

export default function SelfHostedLogin({ onLoginSuccess }) {
  const [step, setStep] = useState('login'); // 'login' | '2fa_code' | '2fa_setup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [setupData, setSetupData] = useState(null); // { secret, qrCodeUrl }
  const [setupToken, setSetupToken] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleLoginSubmit = async (e) => {
    e?.preventDefault();
    if (!username || !password) {
      setError('Bitte Benutzername und Passwort eingeben.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, code: twoFactorCode || undefined }),
      });

      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setError(data.error || 'Anmeldung fehlgeschlagen.');
        return;
      }

      if (data.requires2fa) {
        setStep('2fa_code');
        return;
      }

      if (data.requires2faSetup) {
        setSetupToken(data.setupToken);
        await initSetup2fa(data.setupToken);
        setStep('2fa_setup');
        return;
      }

      if (data.access_token) {
        finishLogin(data.access_token);
      }
    } catch (err) {
      setLoading(false);
      setError('Verbindung zum Server fehlgeschlagen. Bitte prüfe die Verbindung.');
    }
  };

  const initSetup2fa = async (token) => {
    try {
      const res = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (res.ok) {
        setSetupData(data);
      } else {
        setError(data.error || 'Fehler beim Vorbereiten der 2FA-Einrichtung.');
      }
    } catch (err) {
      setError('Konnte 2FA-Setup nicht initialisieren.');
    }
  };

  const handleVerify2faSetup = async (e) => {
    e?.preventDefault();
    if (!twoFactorCode || twoFactorCode.length < 6) {
      setError('Bitte den 6-stelligen Bestätigungscode eingeben.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${setupToken}`,
        },
        body: JSON.stringify({
          code: twoFactorCode.trim(),
          secret: setupData.secret,
        }),
      });

      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setError(data.error || 'Ungültiger 2FA-Code. Bitte erneut versuchen.');
        return;
      }

      if (data.access_token) {
        finishLogin(data.access_token);
      }
    } catch (err) {
      setLoading(false);
      setError('Verbindungsfehler bei der 2FA-Verifikation.');
    }
  };

  const finishLogin = (token) => {
    AuthStorage.setCommaAccessToken(token);
    localStorage.setItem('lastLoginProvider', 'self-hosted');
    if (onLoginSuccess) {
      onLoginSuccess(token);
    } else {
      window.location.reload();
    }
  };

  const copySecret = () => {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-[#161a1d] border border-gray-800 rounded-2xl p-6 shadow-2xl text-white">
      {error && (
        <div className="mb-4 p-3 bg-red-900/40 border border-red-700/60 rounded-xl text-red-200 text-sm flex items-center gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {step === 'login' && (
        <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
          <div className="text-center mb-1">
            <h3 className="text-xl font-bold">Self-Hosted Login</h3>
            <p className="text-xs text-gray-400 mt-1">
              Melde dich mit deinem Benutzerkonto an
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
              Benutzername / E-Mail
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full px-4 py-3 rounded-xl bg-[#22282d] border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
              Passwort
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl bg-[#22282d] border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 bg-white hover:bg-gray-200 text-black font-semibold rounded-xl transition shadow flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block animate-spin">⏳</span>
            ) : (
              'Anmelden'
            )}
          </button>
        </form>
      )}

      {step === '2fa_code' && (
        <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
          <div className="text-center mb-1">
            <h3 className="text-xl font-bold">Zwei-Faktor-Authentifizierung</h3>
            <p className="text-xs text-gray-400 mt-1">
              Gib den 6-stelligen Code aus deiner Authenticator-App ein.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1 text-center">
              Sicherheitscode (TOTP)
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength="6"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value)}
              placeholder="123456"
              className="w-full text-center text-2xl tracking-[0.3em] font-mono py-3 rounded-xl bg-[#22282d] border border-gray-700 text-white focus:outline-none focus:border-blue-500 transition"
              autoFocus
              required
            />
          </div>

          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => {
                setStep('login');
                setTwoFactorCode('');
                setError(null);
              }}
              className="w-1/3 py-3 px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold rounded-xl transition"
            >
              Zurück
            </button>
            <button
              type="submit"
              disabled={loading || twoFactorCode.length < 6}
              className="w-2/3 py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition shadow disabled:opacity-50"
            >
              {loading ? 'Prüfe...' : 'Bestätigen'}
            </button>
          </div>
        </form>
      )}

      {step === '2fa_setup' && setupData && (
        <form onSubmit={handleVerify2faSetup} className="flex flex-col gap-4">
          <div className="text-center">
            <h3 className="text-xl font-bold">2FA Einrichten</h3>
            <p className="text-xs text-gray-400 mt-1">
              Scanne den QR-Code mit Google Authenticator, 1Password, Bitwarden oder Aegis.
            </p>
          </div>

          <div className="flex justify-center my-2 p-3 bg-white rounded-xl mx-auto">
            <img src={setupData.qrCodeUrl} alt="2FA QR Code" className="w-44 h-44" />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
              Manueller Schlüssel
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={setupData.secret}
                className="w-full px-3 py-2 text-xs font-mono bg-[#22282d] border border-gray-700 rounded-lg text-gray-300 select-all"
              />
              <button
                type="button"
                onClick={copySecret}
                className="px-3 py-2 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg transition"
              >
                {copied ? 'Kopiert!' : 'Kopieren'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1 text-center">
              Bestätigungscode eingeben
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength="6"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value)}
              placeholder="123456"
              className="w-full text-center text-2xl tracking-[0.3em] font-mono py-3 rounded-xl bg-[#22282d] border border-gray-700 text-white focus:outline-none focus:border-blue-500 transition"
              autoFocus
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || twoFactorCode.length < 6}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition shadow disabled:opacity-50"
          >
            {loading ? 'Aktiviere...' : '2FA aktivieren & Einloggen'}
          </button>
        </form>
      )}
    </div>
  );
}
