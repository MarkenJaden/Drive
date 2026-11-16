/* global AppleID */
import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';

import { config as AuthConfig } from '@commaai/my-comma-auth';

import { AuthAppleIcon, AuthGithubIcon, AuthGoogleIcon } from '../icons';
import { stringifyQuery } from '../utils/query';
import SelfHostedLogin from './SelfHostedLogin';

const AUTH_PROVIDERS = { GOOGLE: 'g', APPLE: 'a', GITHUB: 'h' };

const styles = () => ({
  logInButton: {
    position: 'relative',
    cursor: 'pointer',
    alignItems: 'center',
    background: '#ffffff',
    display: 'flex',
    borderRadius: 80,
    height: 60,
    justifyContent: 'center',
    textDecoration: 'none',
    width: 360,
    maxWidth: '90%',
    marginBottom: 8,
    '&:hover': {
      background: '#eee',
    },
  },
  lastUsed: {
    position: 'absolute',
    right: 22,
    bottom: -8,
    background: '#e6ebee',
    color: '#4a5861',
    border: '3px solid #1d2225',
    borderRadius: 99,
    padding: '1px 10px',
    fontSize: 11,
    fontWeight: 500,
    lineHeight: '16px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
});

const AnonymousLanding = ({ classes, pathname }) => {
  const [showLegacyOAuth, setShowLegacyOAuth] = useState(false);

  useEffect(() => {
    if (typeof window.sessionStorage !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      const redirectURL = q.get('r') ?? sessionStorage.getItem('redirectURL') ?? pathname;
      sessionStorage.setItem('redirectURL', redirectURL);
    }

    const handleSuccess = (data) => {
      const { code, state } = data.detail.authorization;
      window.location = `${AuthConfig.APPLE_REDIRECT_PATH}?${stringifyQuery({ code, state })}`;
    };
    const handleFailure = console.warn;

    document.addEventListener('AppleIDSignInOnSuccess', handleSuccess);
    document.addEventListener('AppleIDSignInOnFailure', handleFailure);

    const script = document.createElement('script');
    script.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
    script.async = true;
    script.onload = () => {
      AppleID.auth.init({
        clientId: AuthConfig.APPLE_CLIENT_ID,
        scope: AuthConfig.APPLE_SCOPES,
        redirectURI: AuthConfig.APPLE_REDIRECT_URI,
        state: AuthConfig.APPLE_STATE,
      });
    };
    document.body.appendChild(script);

    return () => {
      document.removeEventListener('AppleIDSignInOnSuccess', handleSuccess);
      document.removeEventListener('AppleIDSignInOnFailure', handleFailure);
    };
  }, []);

  const lastLoginProvider = localStorage.getItem('lastLoginProvider');

  return (
    <div className="flex flex-col justify-center min-h-screen py-8">
      <div className="flex flex-col items-center overflow-y-auto px-4 max-w-xl mx-auto w-full">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-[#1e2224] shadow-lg mb-4">
          <img alt="comma" src="/images/comma-white.png" className="h-[42px]" />
        </div>
        <Typography className="text-center text-3xl font-extrabold tracking-tight">MarkenJaden Drive</Typography>
        <Typography className="mt-2 mb-6 text-center text-base text-gray-400 max-w-sm">
          Self-hosted openpilot companion platform mit Zwei-Faktor-Authentifizierung (2FA)
        </Typography>

        <div className="w-full mb-6">
          <SelfHostedLogin />
        </div>

        <div className="w-full flex items-center gap-3 my-4">
          <div className="h-px bg-gray-800 flex-1" />
          <button
            type="button"
            onClick={() => setShowLegacyOAuth(!showLegacyOAuth)}
            className="text-xs text-gray-400 hover:text-white transition uppercase tracking-wider"
          >
            {showLegacyOAuth ? '▲ Externe Logins ausblenden' : '▼ Mit externem Account anmelden'}
          </button>
          <div className="h-px bg-gray-800 flex-1" />
        </div>

        {showLegacyOAuth && (
          <div className="flex flex-col items-center w-full mt-2 animate-fadeIn">
            <a href={AuthConfig.GOOGLE_REDIRECT_LINK} className={classes.logInButton}>
              <img className="h-8" src={AuthGoogleIcon} alt="" />
              <Typography className="w-[190px] whitespace-nowrap text-center text-[16px] font-semibold text-black">
                Sign in with Google
              </Typography>
              {lastLoginProvider === AUTH_PROVIDERS.GOOGLE && <span className={classes.lastUsed}>Last used</span>}
            </a>
            <a onClick={() => AppleID.auth.signIn()} className={classes.logInButton}>
              <img className="h-8" src={AuthAppleIcon} alt="" />
              <Typography className="w-[190px] whitespace-nowrap text-center text-[16px] font-semibold text-black">
                Sign in with Apple
              </Typography>
              {lastLoginProvider === AUTH_PROVIDERS.APPLE && <span className={classes.lastUsed}>Last used</span>}
            </a>
            <a href={AuthConfig.GITHUB_REDIRECT_LINK} className={`${classes.logInButton} githubAuth`}>
              <img className="h-8" src={AuthGithubIcon} alt="" />
              <Typography className="w-[190px] whitespace-nowrap text-center text-[16px] font-semibold text-black">
                Sign in with GitHub
              </Typography>
              {lastLoginProvider === AUTH_PROVIDERS.GITHUB && <span className={classes.lastUsed}>Last used</span>}
            </a>
          </div>
        )}

        <span className="max-w-sm text-center mt-6 text-xs text-gray-500">
          Self-hosted unter drive.markenjaden.de &bull; Geschützt durch TOTP 2FA
        </span>
      </div>
    </div>
  );
};

const stateToProps = (state) => ({
  pathname: state.router.location.pathname,
});

export default connect(stateToProps)(withStyles(styles)(AnonymousLanding));
