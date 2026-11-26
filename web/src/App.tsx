import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./components/Layout";
import { GuestOnly, RequireAuth } from "./components/RequireAuth";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";

const Explorer = lazy(() => import("./pages/Explorer"));
const OpportunityPage = lazy(() => import("./pages/OpportunityPage"));
const ConstellationPage = lazy(() => import("./pages/ConstellationPage"));
const Observatory = lazy(() => import("./pages/Observatory"));
const Journal = lazy(() => import("./pages/Journal"));
const Support = lazy(() => import("./pages/Support"));
const Login = lazy(() => import("./pages/auth/Login"));
const Register = lazy(() => import("./pages/auth/Register"));
const Forgot = lazy(() => import("./pages/auth/Forgot"));
const Reset = lazy(() => import("./pages/auth/Reset"));
const Verify = lazy(() => import("./pages/auth/Verify"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Radar = lazy(() => import("./pages/Radar"));
const Prepare = lazy(() => import("./pages/Prepare"));
const Vault = lazy(() => import("./pages/Vault"));
const Settings = lazy(() => import("./pages/Settings"));
const Admin = lazy(() => import("./pages/Admin"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const Legal = lazy(() => import("./pages/Legal"));

function Loading() {
  return (
    <div className="page container route-loading" aria-busy>
      <span className="spinner" />
    </div>
  );
}

const s = (node: ReactNode) => <Suspense fallback={<Loading />}>{node}</Suspense>;
const auth = (node: ReactNode, admin = false) => s(<RequireAuth admin={admin}>{node}</RequireAuth>);
const guest = (node: ReactNode) => s(<GuestOnly>{node}</GuestOnly>);

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/explorer", element: s(<Explorer />) },
      { path: "/offre/:id", element: s(<OpportunityPage />) },
      { path: "/constellation", element: s(<ConstellationPage />) },
      { path: "/observatoire", element: s(<Observatory />) },
      { path: "/journal", element: s(<Journal />) },
      { path: "/soutenir", element: s(<Support />) },
      { path: "/connexion", element: guest(<Login />) },
      { path: "/inscription", element: guest(<Register />) },
      { path: "/mot-de-passe-oublie", element: s(<Forgot />) },
      { path: "/reinitialiser", element: s(<Reset />) },
      { path: "/verifier", element: s(<Verify />) },
      { path: "/desabonnement", element: s(<Unsubscribe />) },
      { path: "/bienvenue", element: auth(<Onboarding />) },
      { path: "/radar", element: auth(<Radar />) },
      { path: "/preparer/:id", element: auth(<Prepare />) },
      { path: "/coffre", element: auth(<Vault />) },
      { path: "/reglages", element: auth(<Settings />) },
      { path: "/admin", element: auth(<Admin />, true) },
      { path: "/a-propos", element: s(<Legal page="about" />) },
      { path: "/confidentialite", element: s(<Legal page="privacy" />) },
      { path: "/conditions", element: s(<Legal page="terms" />) },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
