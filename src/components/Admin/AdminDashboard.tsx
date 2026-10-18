import React from 'react';
import { AdminProvider } from '../../context/AdminProvider';
import { AdminPanelContent } from '../AdminPanel';
import { ErrorBoundary } from '../ErrorBoundary';

export const AdminDashboard: React.FC = () => {
  return (
    <AdminProvider>
      <ErrorBoundary
        fallbackTitle="Administrative Module Unavailable"
        fallbackMessage="Could not load the requested section. Please try again or switch to another section."
        compact
      >
        <AdminPanelContent />
      </ErrorBoundary>
    </AdminProvider>
  );
};
