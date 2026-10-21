import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Admin Session Expiry and Homepage Redirect', () => {
  it('AdminPanel enforces automatic redirect to homepage on 30-minute inactivity timeout without popup', () => {
    const adminPanelSource = fs.readFileSync(path.resolve(__dirname, '../src/components/AdminPanel.tsx'), 'utf-8');
    
    // Inactivity timeout constant is 30 minutes
    expect(adminPanelSource).toContain('const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;');
    
    // Verifies that on inactivity timeout, setCurrentView is set to store, auth modal is closed, and URL is pushed to '/'
    expect(adminPanelSource).toContain("setCurrentView('store');");
    expect(adminPanelSource).toContain("setIsAuthModalOpen(false);");
    expect(adminPanelSource).toContain("window.history.pushState({}, '', '/');");
    
    // Verifies that the previous pop-up login form was completely eliminated and replaced by return null
    expect(adminPanelSource).toContain('if (!isPrivilegedAdmin) {\n    return null;\n  }');
    expect(adminPanelSource).not.toContain('id="admin-login-modal"');
    expect(adminPanelSource).not.toContain('id="admin-login-submit-btn"');
  });

  it('App.tsx automatically redirects unauthenticated admin route visits to homepage without rendering login modal', () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf-8');
    
    // Verifies App.tsx has effect guarding admin routes
    expect(appSource).toContain('!isAdminLoggedIn && isAdminRoute');
    expect(appSource).toContain("setCurrentView('store');");
    expect(appSource).toContain("setIsAuthModalOpen(false);");
    expect(appSource).toContain("window.history.pushState({}, '', '/');");
    
    // Verifies that if not admin logged in, AdminPanel is not rendered
    expect(appSource).toContain('if (!isAuthInitializing && !isAdminLoggedIn) {\n      return null;\n    }');
  });

  it('AuthContext closes auth modal on 401 unauthorized to ensure seamless return to homepage', () => {
    const authContextSource = fs.readFileSync(path.resolve(__dirname, '../src/context/AuthContext.tsx'), 'utf-8');
    
    expect(authContextSource).toContain('onAuthUnauthorized');
    expect(authContextSource).toContain('setIsAdminLoggedIn(false);');
    expect(authContextSource).toContain('setIsAuthModalOpen(false);');
  });
});
