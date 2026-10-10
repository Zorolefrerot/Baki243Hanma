import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './app/AppContext';
import { Banner, Button, Spinner } from './components/ui';
import { Shell } from './components/Shell';
import { ToastProvider } from './components/Toast';
import { LogoMark } from './components/Logo';

// Chargement différé des pages : l'application démarre plus vite sur les petits téléphones.
const LoginPage = lazy(() => import('./pages/Login').then((m) => ({ default: m.LoginPage })));
const OnboardingPage = lazy(() => import('./pages/Login').then((m) => ({ default: m.OnboardingPage })));
const DashboardPage = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.DashboardPage })));
const ProductsPage = lazy(() => import('./pages/Products').then((m) => ({ default: m.ProductsPage })));
const ProductFormPage = lazy(() => import('./pages/ProductForm').then((m) => ({ default: m.ProductFormPage })));
const ProductDetailPage = lazy(() => import('./pages/ProductDetail').then((m) => ({ default: m.ProductDetailPage })));
const NewOrderPage = lazy(() => import('./pages/NewOrder').then((m) => ({ default: m.NewOrderPage })));
const OrdersPage = lazy(() => import('./pages/Orders').then((m) => ({ default: m.OrdersPage })));
const OrderDetailPage = lazy(() => import('./pages/Orders').then((m) => ({ default: m.OrderDetailPage })));
const LivraisonsPage = lazy(() => import('./pages/Livraisons').then((m) => ({ default: m.LivraisonsPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </AppProvider>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="sf-page flex min-h-dvh flex-col items-center justify-center px-4">{children}</div>
  );
}

function PageFallback({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <LogoMark size={34} />
        <div className="sf-skeleton h-5 w-40" />
      </div>
      <div className="sf-skeleton h-24 w-full" />
      <div className="sf-skeleton h-48 w-full" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

function Gate() {
  const app = useApp();

  if (app.auth.status === 'loading') {
    return (
      <FullScreen>
        <div className="flex flex-col items-center gap-4">
          <LogoMark size={54} />
          <Spinner label="Démarrage de ShopFlow…" />
        </div>
      </FullScreen>
    );
  }
  if (app.auth.status === 'signed_out') {
    return (
      <Suspense fallback={<Spinner />}>
        <LoginPage />
      </Suspense>
    );
  }
  if (app.dbError) {
    return (
      <FullScreen>
        <div className="w-full max-w-md">
          <Banner tone="danger" title="Impossible d’ouvrir vos données">
            {app.dbError}
          </Banner>
        </div>
      </FullScreen>
    );
  }
  if (!app.db) {
    return (
      <FullScreen>
        <Spinner label="Préparation de l’application…" />
      </FullScreen>
    );
  }
  if (app.needsShopSetup) {
    return (
      <Suspense fallback={<Spinner />}>
        <OnboardingPage />
      </Suspense>
    );
  }
  if (!app.shop) {
    return (
      <FullScreen>
        <div className="flex w-full max-w-md flex-col gap-4">
          <Banner tone="warning" title="Configuration de la boutique en attente">
            {app.shopSetupError ?? 'Recherche de votre boutique…'}
          </Banner>
          <Button variant="secondary" block onClick={() => window.location.reload()}>
            Réessayer
          </Button>
        </div>
      </FullScreen>
    );
  }

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Suspense fallback={<PageFallback label="Tableau de bord" />}><DashboardPage /></Suspense>} />
        <Route path="articles" element={<Suspense fallback={<PageFallback label="Articles" />}><ProductsPage /></Suspense>} />
        <Route path="articles/nouveau" element={<Suspense fallback={<PageFallback label="Nouvel article" />}><ProductFormPage mode="create" /></Suspense>} />
        <Route path="articles/:id" element={<Suspense fallback={<PageFallback label="Article" />}><ProductDetailPage /></Suspense>} />
        <Route path="articles/:id/modifier" element={<Suspense fallback={<PageFallback label="Modifier l’article" />}><ProductFormPage mode="edit" /></Suspense>} />
        <Route path="commande" element={<Suspense fallback={<PageFallback label="Nouvelle commande" />}><NewOrderPage /></Suspense>} />
        <Route path="livraisons" element={<Suspense fallback={<PageFallback label="Livraisons" />}><LivraisonsPage /></Suspense>} />
        <Route path="historique" element={<Suspense fallback={<PageFallback label="Historique" />}><OrdersPage /></Suspense>} />
        <Route path="historique/:id" element={<Suspense fallback={<PageFallback label="Commande" />}><OrderDetailPage /></Suspense>} />
        <Route path="parametres" element={<Suspense fallback={<PageFallback label="Paramètres" />}><SettingsPage /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
