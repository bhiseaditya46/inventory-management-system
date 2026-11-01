import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, AlertCircle, AlertTriangle, ArrowDownToLine, ArrowRight, Boxes, Check,
  ChevronDown, CircleDollarSign, ClipboardList, FileBarChart2, History, LayoutDashboard, LogOut, Menu,
  Package, PackagePlus, Pencil, Plus, Search, ShieldCheck, SlidersHorizontal, Trash2, Truck,
  Upload, Users, X, XCircle,
} from 'lucide-react';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import {
  getDownloadInventoryReportQueryKey,
  getGetAdminAccessQueryKey,
  getGetCurrentUserQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetProductQueryKey,
  getHealthCheckQueryKey,
  getListAdminUsersQueryKey,
  getListLowStockProductsQueryKey,
  getListProductMovementsQueryKey,
  getListProductsQueryKey,
  getListRecentMovementsQueryKey,
  setAuthTokenGetter,
  useAdjustProductStock,
  useBootstrapAdmin,
  useCreateProduct,
  useDeleteProduct,
  useDownloadInventoryReport,
  useGetAdminAccess,
  useGetCurrentUser,
  useGetDashboardSummary,
  useGetProduct,
  useHealthCheck,
  useListAdminUsers,
  useListLowStockProducts,
  useListProductMovements,
  useListProducts,
  useListRecentMovements,
  useUpdateProduct,
  useUpdateUserRole,
} from '@workspace/api-client-react';
import type {
  ListProductsParams,
  Product,
  ProductInput,
  ProductUpdate,
  UserProfile,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import './app.css';

const queryClient = new QueryClient();
const rawClerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || (import.meta.env as Record<string, string>).CLERK_PUBLISHABLE_KEY;
const clerkPubKey = publishableKeyFromHost(window.location.hostname, rawClerkKey);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}
if (!clerkPubKey) throw new Error('Missing CLERK_PUBLISHABLE_KEY or VITE_CLERK_PUBLISHABLE_KEY in .env file');

const appearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#315b4c', colorForeground: '#263d35', colorMutedForeground: '#6f7b74',
    colorDanger: '#a43f37', colorBackground: '#fffdf8', colorInput: '#fffdf8',
    colorInputForeground: '#263d35', colorNeutral: '#dcd8ce', fontFamily: 'DM Sans',
    borderRadius: '0.7rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center', cardBox: 'bg-[#fffdf8] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none', footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#263d35] font-bold', headerSubtitle: 'text-[#6f7b74]',
    socialButtonsBlockButtonText: 'text-[#263d35]', formFieldLabel: 'text-[#263d35]',
    footerActionLink: 'text-[#315b4c]', footerActionText: 'text-[#6f7b74]', dividerText: 'text-[#6f7b74]',
    identityPreviewEditButton: 'text-[#315b4c]', formFieldSuccessText: 'text-[#315b4c]',
    alertText: 'text-[#263d35]', logoBox: 'rounded-xl', logoImage: 'rounded-lg',
    socialButtonsBlockButton: 'border-[#dcd8ce] bg-[#fffdf8]', formButtonPrimary: 'bg-[#315b4c] hover:bg-[#24483a]',
    formFieldInput: 'border-[#dcd8ce] bg-[#fffdf8] text-[#263d35]', footerAction: 'text-[#6f7b74]',
    dividerLine: 'bg-[#dcd8ce]', alert: 'border-[#e7c3b8]', otpCodeFieldInput: 'border-[#dcd8ce]',
    formFieldRow: 'text-[#263d35]', main: 'text-[#263d35]',
  },
};

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`} aria-label="Stockroom">
    <span className="brand-mark"><Package size={19} strokeWidth={2.2} /></span>
    {!compact && <span className="brand-name">stockroom<span> / inventory</span></span>}
  </div>;
}

function ClerkAuthSync() {
  const { addListener } = useClerk();
  const { getToken, isSignedIn } = useAuth();
  const qc = useQueryClient();
  const [prev, setPrev] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (isSignedIn) {
      setAuthTokenGetter(async () => {
        try {
          return await getToken();
        } catch {
          return null;
        }
      });
      void qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      void qc.invalidateQueries({ queryKey: getGetAdminAccessQueryKey() });
    } else {
      setAuthTokenGetter(null);
    }
  }, [getToken, isSignedIn, qc]);

  useEffect(() => addListener(({ user }) => {
    const id = user?.id ?? null;
    setPrev(old => {
      if (old !== undefined && old !== id) qc.clear();
      return id;
    });
  }), [addListener, qc]);

  return null;
}

function AuthRoutes() {
  return <Switch>
    <Route path="/sign-in/*?" component={() => <AuthPage kind="sign-in" />} />
    <Route path="/sign-up/*?" component={() => <AuthPage kind="sign-up" />} />
    <Route path="/" component={HomeRoute} />
    <Route path="/products" component={() => <Protected><ProductsPage /></Protected>} />
    <Route path="/reports" component={() => <Protected><ReportsPage /></Protected>} />
    <Route path="/users" component={() => <Protected requireAdmin><AdminUsersPage /></Protected>} />
    <Route component={NotFound} />
  </Switch>;
}

function AuthPage({ kind }: { kind: 'sign-in' | 'sign-up' }) {
  return <div className="auth-frame">
    <div className="auth-brand"><Brand /><span>Keep the moving parts in order.</span></div>
    {kind === 'sign-in'
      ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={basePath || '/'} />}
  </div>;
}

function HomeRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <div className="full-loading"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-line" /></div>;
  return isSignedIn ? <Protected><DashboardPage /></Protected> : <LandingPage />;
}

function Protected({ children, requireAdmin = false }: { children: ReactNode; requireAdmin?: boolean }) {
  const { isLoaded, isSignedIn } = useAuth();
  const me = useGetCurrentUser({
    query: {
      enabled: isLoaded && !!isSignedIn,
      queryKey: getGetCurrentUserQueryKey(),
      retry: 2,
      retryDelay: 1000,
    },
  });
  const adminAccess = useGetAdminAccess({
    query: {
      enabled: isLoaded && !!isSignedIn,
      queryKey: getGetAdminAccessQueryKey(),
      retry: 2,
      retryDelay: 1000,
    },
  });

  if (!isLoaded || (isSignedIn && me.isLoading)) return <AppLoading />;
  if (!isSignedIn) return <AccessGate signedOut />;
  if (me.isError) return <AccessGate error />;

  if (requireAdmin && !me.data?.isAdmin) {
    return <AccessGate registrationAllowed={!!adminAccess.data?.registrationAllowed} notAdmin />;
  }

  return <>{children}</>;
}

function LandingPage() {
  const { isLoaded } = useAuth();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), retry: false } });
  return <main className="landing">
    <header className="landing-nav"><Brand /><div className="landing-links"><a href="#workflow">How it works</a><a href="#visibility">Visibility</a></div>
      <div className="landing-actions"><Link href="/sign-in" className="btn btn-quiet">Sign in</Link><Link href="/sign-up" className="btn btn-primary">Create account <ArrowRight size={16} /></Link></div>
    </header>
    <section className="hero">
      <div className="hero-copy fade-up">
        <div className="eyebrow"><span className="pulse-dot" /> A clearer view of what you have</div>
        <h1>Know what’s<br /><em>on the shelf.</em></h1>
        <p className="hero-intro">Inventory that keeps pace with your business. Track what’s moving, catch low stock early, and get back to the work that matters.</p>
        <div className="hero-buttons"><Link href="/sign-up" className="btn btn-primary btn-large">Get started <ArrowRight size={17} /></Link><Link href="/sign-in" className="text-link">I already have an account <ArrowRight size={15} /></Link></div>
        <div className="hero-foot"><ShieldCheck size={16} /><span>Private by design. Every business manages its own secure catalog and records.</span></div>
      </div>
      <div className="hero-art fade-up fade-delay-2" aria-label="Preview of an inventory dashboard">
        <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
        <div className="preview-card">
           <div className="preview-top"><div><span className="preview-kicker">YOUR WORKSPACE</span><b>Inventory overview</b></div><span className="preview-avatar">S</span></div>
          <div className="preview-stats"><div><span>Products</span><b>—</b></div><div><span>On hand</span><b>—</b></div><div><span>Needs attention</span><b className="preview-warn">—</b></div></div>
           <div className="preview-graph"><div className="graph-label"><span>Live inventory data</span><small>Connected to your records</small></div><div className="landing-data-note"><Package size={17} /><span>Your real stock levels appear here after sign-in.</span></div></div>
          <div className="preview-alert"><span className="alert-icon"><AlertTriangle size={15} /></span><span><b>Reorder point reached</b><small>Low stock alerts keep you one step ahead.</small></span><ArrowRight size={15} /></div>
        </div><div className="art-caption"><span>01</span><i /> A steady hand for the everyday</div>
      </div>
    </section>
    <section className="landing-strip" id="workflow"><div><span className="strip-num">01</span><span>Every item, accounted for</span></div><div><span className="strip-num">02</span><span>Low stock, surfaced early</span></div><div><span className="strip-num">03</span><span>Reports, ready when you are</span></div></section>
    <section className="story-section" id="visibility"><div className="story-overline">BUILT FOR THE DAILY ROUND</div><div className="story-content"><h2>Less hunting.<br /><span>More knowing.</span></h2><div><p>Your inventory should be the easiest part of running a business. Stockroom puts the essentials in one calm, dependable workspace—so no one has to wonder what’s left in the back room.</p><a href="#workflow" className="text-link">A better way to keep count <ArrowRight size={15} /></a></div></div>
      <div className="story-grid"><div className="story-tile tile-large"><div className="tile-icon"><Boxes size={20} /></div><div className="tile-number">01 / CATALOG</div><h3>One reliable source<br />for every product.</h3><p>Keep names, SKUs, suppliers, and reorder levels together—not scattered across tabs.</p><div className="tile-lines"><i /><i /><i /></div></div><div className="story-tile tile-small"><div className="tile-icon tile-warm"><Activity size={20} /></div><div className="tile-number">02 / STOCK HEALTH</div><h3>See the pinch<br />before it hits.</h3><p>Low and out-of-stock items rise to the surface. No surprise gaps.</p><div className="tile-status"><span /><span /><span /></div></div><div className="story-tile tile-small tile-accent"><div className="tile-icon"><FileBarChart2 size={20} /></div><div className="tile-number">03 / REPORTS</div><h3>Numbers that<br />travel well.</h3><p>Take a clean CSV of the current inventory wherever it needs to go.</p><div className="tile-file"><FileBarChart2 size={16} /> inventory-report.csv <ArrowDownToLine size={14} /></div></div></div>
    </section>
    <section className="closing"><div className="closing-mark"><Package size={19} /></div><span className="closing-kicker">THE WORKSPACE FOR WHAT’S ON HAND</span><h2>Put your inventory<br />back in good order.</h2><Link href="/sign-up" className="btn btn-light btn-large">Create your account <ArrowRight size={17} /></Link><span className="health-line"><span className={health.isError ? 'health-dot offline' : 'health-dot'} /> {health.isLoading ? 'Checking workspace availability' : health.isError ? 'Workspace connection unavailable' : 'Ready for your first count'}</span></section>
    <footer className="landing-footer"><Brand /><span>Good records. Fewer surprises.</span><span>© Stockroom</span></footer>
    {!isLoaded && null}
  </main>;
}

function AccessGate({ signedOut = false, error = false, registrationAllowed = false, notAdmin = false }: { signedOut?: boolean; error?: boolean; registrationAllowed?: boolean; notAdmin?: boolean }) {
  const bootstrap = useBootstrapAdmin();
  const qc = useQueryClient();
  const { signOut } = useClerk();
  async function claim() {
    try {
      await bootstrap.mutateAsync();
      await qc.invalidateQueries({ queryKey: getGetAdminAccessQueryKey() });
      await qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
    }
    catch { /* mutation error is rendered below */ }
  }
  return <div className="gate-shell"><Brand /><div className="gate-card">
    <div className="gate-icon">{error ? <AlertCircle /> : signedOut ? <ShieldCheck /> : notAdmin ? <ShieldCheck /> : <XCircle />}</div>
    <span className="eyebrow">STOCKROOM ACCESS</span>
    <h1>{signedOut ? 'Your stock, in good order.' : error ? 'We couldn’t verify access.' : notAdmin ? 'Administrator privilege required.' : 'This account isn’t approved yet.'}</h1>
    <p>{signedOut ? 'Sign in to your account to manage your inventory.' : error ? 'The access check could not be completed. Please try again in a moment.' : notAdmin ? 'You are signed in with a Normal User account. Administrator privileges are required to access this section.' : 'An administrator must approve this account before it can perform this action.'}</p>
    {signedOut ? <div className="gate-actions"><Link href="/sign-in" className="btn btn-primary">Sign in <ArrowRight size={16} /></Link><Link href="/" className="btn btn-quiet">Back to home</Link></div>
      : <div className="gate-actions">
          {error && <button className="btn btn-primary" onClick={() => { void qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() }); void qc.invalidateQueries({ queryKey: getGetAdminAccessQueryKey() }); }} data-testid="button-retry-access">Try again</button>}
          {notAdmin && <Link href="/" className="btn btn-primary">Return to my dashboard</Link>}
          {registrationAllowed && <button className="btn btn-primary" onClick={claim} disabled={bootstrap.isPending} data-testid="button-bootstrap-admin">{bootstrap.isPending ? 'Checking eligibility…' : 'Complete administrator setup'}</button>}
          <button className="btn btn-quiet" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out"><LogOut size={16} /> Sign out</button>
        </div>}
    {bootstrap.isError && <p className="inline-error" role="alert">Setup couldn’t be completed. This account may not be the approved initial administrator.</p>}
  </div><p className="gate-foot">Access is controlled by your server administrator.</p></div>;
}

function AppLoading() {
  return <div className="workspace-loading"><div className="loading-sidebar"><Brand compact /></div><div className="loading-main"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-line" /><div className="loading-grid">{[1, 2, 3, 4].map(n => <div className="skeleton loading-box" key={n} />)}</div><div className="skeleton loading-table" /></div></div>;
}

type PageKey = 'overview' | 'products' | 'reports' | 'users';
function Shell({ children, active }: { children: ReactNode; active: PageKey }) {
  const [mobileMenu, setMobileMenu] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();
  const me = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } });
  const userName = user?.firstName || me.data?.name || user?.emailAddresses[0]?.emailAddress || 'User';
  const role = me.data?.role || 'user';
  const isAdmin = me.data?.isAdmin;

  return <div className="workspace">
    <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><Brand /></div>
      <div className="workspace-label">
        {isAdmin ? 'ADMINISTRATOR WORKSPACE' : 'USER WORKSPACE'}
      </div>
      <nav className="side-nav" aria-label="Primary">
        <Link href="/" className={`side-link ${active === 'overview' ? 'side-active' : ''}`} data-testid="link-dashboard"><LayoutDashboard size={18} /><span>Overview</span>{active === 'overview' && <i />}</Link>
        <Link href="/products" className={`side-link ${active === 'products' ? 'side-active' : ''}`} data-testid="link-products"><Package size={18} /><span>Products</span>{active === 'products' && <i />}</Link>
        <Link href="/reports" className={`side-link ${active === 'reports' ? 'side-active' : ''}`} data-testid="link-reports"><FileBarChart2 size={18} /><span>Reports</span>{active === 'reports' && <i />}</Link>
        {isAdmin && (
          <Link href="/users" className={`side-link ${active === 'users' ? 'side-active' : ''}`} data-testid="link-users"><Users size={18} /><span>Team &amp; Users</span>{active === 'users' && <i />}</Link>
        )}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note">
          <ShieldCheck size={16} />
          <span>{isAdmin ? 'Admin Console' : 'Private Inventory'}<br /><b>{isAdmin ? 'Full control' : 'Owner access only'}</b></span>
        </div>
        <button className="side-link side-logout" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out"><LogOut size={18} /><span>Sign out</span></button>
      </div>
    </aside>
    {mobileMenu && <button className="mobile-backdrop" onClick={() => setMobileMenu(false)} aria-label="Close navigation" />}
    <div className="main-column">
      <header className="topbar">
        <button className="icon-button menu-trigger" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Open navigation" data-testid="button-menu"><Menu size={19} /></button>
        <div className="breadcrumb">
          <span>Workspace</span>
          <span className="crumb-slash">/</span>
          <b>{active === 'overview' ? 'Overview' : active === 'products' ? 'Products' : active === 'reports' ? 'Reports' : 'Team & Users'}</b>
        </div>
        <div className="topbar-right">
          <span className="top-date">{new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</span>
          <span className={`role-badge ${isAdmin ? 'admin' : 'user'}`}>{role}</span>
          <div className="profile-dot">{userName.slice(0, 1).toUpperCase()}</div>
          <span className="user-name">{userName}</span>
          <ChevronDown size={14} className="user-chevron" />
        </div>
      </header>
      <main className="page-content">{children}</main>
    </div>
  </div>;
}

function PageHeading({ kicker, title, description, action }: { kicker: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{kicker}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}
function QueryError({ retry, message = 'The inventory service could not be reached.' }: { retry: () => void; message?: string }) {
  return <div className="error-panel"><AlertCircle size={18} /><div><b>Something didn’t load</b><span>{message}</span></div><button onClick={retry} className="btn btn-small btn-outline" data-testid="button-retry">Try again</button></div>;
}
function SkeletonMetric() { return <div className="metric-card metric-skeleton"><div className="skeleton skeleton-label" /><div className="skeleton skeleton-value" /><div className="skeleton skeleton-line" /></div>; }
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
const dateText = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
function statusOf(product: Product) { return product.quantity === 0 ? 'Out of stock' : product.quantity <= product.reorderLevel ? 'Low stock' : 'In stock'; }
function StatusPill({ product }: { product: Product }) {
  const status = statusOf(product);
  return <span className={`status-pill ${status === 'In stock' ? 'status-good' : status === 'Low stock' ? 'status-low' : 'status-out'}`} data-testid={`status-product-${product.id}`}><i />{status}</span>;
}

function DashboardPage() {
  const summary = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const low = useListLowStockProducts({ query: { queryKey: getListLowStockProductsQueryKey() } });
  const recentMovements = useListRecentMovements({ limit: 5 }, { query: { queryKey: getListRecentMovementsQueryKey({ limit: 5 }) } });
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const [, setLocation] = useLocation();

  return <Shell active="overview"><PageHeading kicker="YOUR INVENTORY, AT A GLANCE" title="Good morning." description="Here’s where things stand across your inventory today." action={<Link href="/products" className="btn btn-primary"><Plus size={16} /> Add product</Link>} />
    {summary.isError && <QueryError retry={() => summary.refetch()} />}
    <div className="metric-grid">
      {summary.isLoading ? <>{[1, 2, 3, 4].map(n => <SkeletonMetric key={n} />)}</> : summary.data ? <>
        <Metric label="Products" value={summary.data.productCount.toLocaleString()} hint={`${summary.data.categoryCount} categories`} icon={<Package size={18} />} tone="green" />
        <Metric label="Units on hand" value={summary.data.totalUnits.toLocaleString()} hint="Across all products" icon={<Boxes size={18} />} tone="sand" />
        <Metric label="Retail Value" value={money(summary.data.inventoryValue)} hint="At selling prices" icon={<CircleDollarSign size={18} />} tone="peach" />
        <Metric label="Needs attention" value={(summary.data.lowStockCount + summary.data.outOfStockCount).toLocaleString()} hint={`${summary.data.lowStockCount} low · ${summary.data.outOfStockCount} out of stock`} icon={<AlertTriangle size={18} />} tone="rose" alert />
      </> : <EmptyInline label="No inventory summary available." />}
    </div>
    <div className="dash-content-grid">
      <section className="panel stock-panel"><div className="panel-heading"><div><div className="section-kicker">REPLENISHMENT WATCH</div><h2>Stock to look at</h2></div><Link href="/products" className="panel-link">All products <ArrowRight size={14} /></Link></div>
        {low.isLoading ? <TableSkeleton rows={3} /> : low.isError ? <QueryError retry={() => low.refetch()} /> : low.data?.length ? <div className="watch-list">{low.data.slice(0, 5).map(p => <button className="watch-row" key={p.id} onClick={() => setLocation('/products')} data-testid={`button-watch-product-${p.id}`}><span className="watch-symbol"><Package size={17} /></span><span className="watch-name"><b>{p.name}</b><small>{p.sku} · {p.category}</small></span><span className="watch-qty"><b>{p.quantity}</b><small>of {p.reorderLevel} minimum</small></span><span className={`watch-state ${p.quantity === 0 ? 'out' : ''}`}>{p.quantity === 0 ? 'Out' : 'Low'}</span></button>)}</div> : <div className="empty-state compact-empty"><span className="empty-icon"><Check size={19} /></span><b>All clear for now</b><p>No products are at or below their reorder point.</p></div>}
      </section>
      <section className="panel quick-panel">
        <div className="panel-heading"><div><div className="section-kicker">RECENT ACTIVITY</div><h2>Stock movements</h2></div><span className="quick-mark"><History size={17} /></span></div>
        {recentMovements.isLoading ? <TableSkeleton rows={3} /> : recentMovements.data?.length ? (
          <div className="movements-list">
            {recentMovements.data.map(m => (
              <div key={m.id} className="movement-row">
                <div>
                  <b>{m.productName}</b>
                  <div className="movement-note">{m.note || 'Manual adjustment'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={`delta-badge ${m.delta > 0 ? 'delta-in' : 'delta-out'}`}>
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </span>
                  <div className="movement-date">{new Date(m.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty"><p>No stock changes recorded yet.</p></div>
        )}
        <div className="panel-heading" style={{ marginTop: 18 }}><div><div className="section-kicker">QUICK ACCESS</div><h2>Actions</h2></div></div>
        <button className="quick-action" onClick={() => setLocation('/products')} data-testid="button-view-products"><span className="quick-action-icon"><PackagePlus size={18} /></span><span><b>Manage products</b><small>Search, update, and adjust stock</small></span><ArrowRight size={16} /></button>
        <button className="quick-action" onClick={() => setLocation('/reports')} data-testid="button-open-reports"><span className="quick-action-icon quick-amber"><FileBarChart2 size={18} /></span><span><b>View inventory report</b><small>Review current product records</small></span><ArrowRight size={16} /></button>
        <div className={`service-status ${health.isError ? 'service-offline' : ''}`}><span className="service-dot" /><span>{health.isError ? 'Service connection needs attention' : 'Inventory service operational'}</span><Activity size={14} /></div>
      </section>
    </div>
    <div className="dashboard-foot"><span><ShieldCheck size={15} /> Your inventory is protected and private to your account.</span><span>Updated from live records</span></div>
  </Shell>;
}

function Metric({ label, value, hint, icon, tone, alert = false }: { label: string; value: string; hint: string; icon: ReactNode; tone: string; alert?: boolean }) {
  return <section className={`metric-card metric-${tone} ${alert ? 'metric-alert' : ''}`} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value}</div><div className="metric-hint">{hint}</div></section>;
}
function EmptyInline({ label }: { label: string }) { return <div className="empty-inline">{label}</div>; }
function TableSkeleton({ rows = 4 }: { rows?: number }) { return <div className="table-skeleton">{Array.from({ length: rows }, (_, i) => <div className="table-skeleton-row" key={i}><i /><i /><i /><i /></div>)}</div>; }

type DialogMode = 'create' | 'edit' | 'stock' | 'detail' | 'import' | null;
function ProductsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [stockStatus, setStockStatus] = useState('all');
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [importRows, setImportRows] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');

  const listParams = useMemo<ListProductsParams>(() => ({ ...(search.trim() ? { search: search.trim() } : {}), ...(category ? { category } : {}), ...(stockStatus !== 'all' ? { stockStatus: stockStatus as ListProductsParams['stockStatus'] } : {}) }), [search, category, stockStatus]);
  const products = useListProducts(listParams, { query: { queryKey: getListProductsQueryKey(listParams), placeholderData: previous => previous } });
  const categoryProducts = useListProducts(undefined, { query: { queryKey: getListProductsQueryKey() } });
  const productQuery = useGetProduct(selectedId ?? 0, { query: { enabled: selectedId !== null, queryKey: getGetProductQueryKey(selectedId ?? 0) } });
  const movementsQuery = useListProductMovements(selectedId ?? 0, { query: { enabled: selectedId !== null && dialog === 'detail', queryKey: getListProductMovementsQueryKey(selectedId ?? 0) } });

  const qc = useQueryClient();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const remove = useDeleteProduct();
  const adjust = useAdjustProductStock();
  const categoryOptions = useMemo(() => [...new Set((categoryProducts.data ?? []).map(p => p.category).filter(Boolean))].sort(), [categoryProducts.data]);
  const mutationPending = create.isPending || update.isPending || adjust.isPending;

  async function refresh(id?: number) {
    await Promise.all([
      qc.invalidateQueries({ queryKey: getListProductsQueryKey() }),
      qc.invalidateQueries({ queryKey: getListLowStockProductsQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
      qc.invalidateQueries({ queryKey: getListRecentMovementsQueryKey() }),
      ...(id ? [qc.invalidateQueries({ queryKey: getGetProductQueryKey(id) }), qc.invalidateQueries({ queryKey: getListProductMovementsQueryKey(id) })] : []),
    ]);
  }
  function open(mode: DialogMode, id?: number) {
    setSelectedId(id ?? null);
    setDialog(mode);
    setImportError('');
    setImportSuccess('');
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportError('');
    setImportSuccess('');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result ?? '');
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) {
          setImportError('CSV file must have a header row and at least one product row.');
          return;
        }

        const parseLine = (l: string) => {
          const res = [];
          let cur = '';
          let inQuotes = false;
          for (let i = 0; i < l.length; i++) {
            const ch = l[i];
            if (ch === '"') inQuotes = !inQuotes;
            else if (ch === ',' && !inQuotes) { res.push(cur.trim().replace(/^"|"$/g, '')); cur = ''; }
            else cur += ch;
          }
          res.push(cur.trim().replace(/^"|"$/g, ''));
          return res;
        };

        const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[\s_-]+/g, ''));
        const parsed = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = parseLine(lines[i]);
          const map: Record<string, string> = {};
          headers.forEach((h, idx) => { map[h] = cols[idx] ?? ''; });
          const sku = map.sku || map.productsku || map.itemcode || cols[0] || '';
          const name = map.name || map.productname || map.title || map.itemname || cols[1] || '';
          if (!sku && !name) continue;

          parsed.push({
            sku: sku.trim(),
            name: name.trim(),
            category: map.category || map.group || 'General',
            quantity: Math.max(0, parseInt(map.quantity || map.qty || map.stock || '0', 10) || 0),
            reorderLevel: Math.max(0, parseInt(map.reorderlevel || map.reorder || map.min || '5', 10) || 5),
            costPrice: Math.max(0, parseFloat(map.costprice || map.cost || map.purchaseprice || '0') || 0),
            unitPrice: Math.max(0, parseFloat(map.unitprice || map.price || map.retailprice || map.sellingprice || '0') || 0),
            supplier: map.supplier || map.vendor || '',
            description: map.description || map.notes || '',
          });
        }

        if (parsed.length === 0) {
          setImportError('No valid product rows found. Ensure rows have SKU and Name.');
        } else {
          setImportRows(parsed);
        }
      } catch (err: any) {
        setImportError(`Failed to parse CSV file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  async function executeImport() {
    if (importRows.length === 0) return;
    setImportLoading(true);
    setImportError('');
    try {
      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: importRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to import products');
      setImportSuccess(`Successfully imported ${data.imported} new products and updated ${data.updated} existing items!`);
      await refresh();
      setTimeout(() => {
        setDialog(null);
        setImportRows([]);
        setImportFileName('');
        setImportSuccess('');
      }, 1500);
    } catch (err: any) {
      setImportError(err.message || 'Import failed');
    } finally {
      setImportLoading(false);
    }
  }

  function downloadTemplate() {
    const csv = "sku,name,category,quantity,reorderLevel,costPrice,unitPrice,supplier,description\nPROD-001,Sample Product A,Hardware,25,5,12.50,29.99,Acme Supplies,High durability steel item\nPROD-002,Sample Product B,Electronics,10,3,45.00,89.99,Tech Parts,USB-C powered device\n";
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "stock_upload_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const payload: ProductInput = {
      sku: String(fd.get('sku') ?? '').trim(),
      name: String(fd.get('name') ?? '').trim(),
      category: String(fd.get('category') ?? '').trim(),
      quantity: Number(fd.get('quantity')),
      reorderLevel: Number(fd.get('reorderLevel')),
      unitPrice: Number(fd.get('unitPrice')),
      costPrice: Number(fd.get('costPrice') || 0),
      supplier: String(fd.get('supplier') ?? '').trim() || null,
      description: String(fd.get('description') ?? '').trim() || null,
    };
    try {
      if (dialog === 'edit' && selectedId !== null) {
        const updatePayload: ProductUpdate = {
          sku: payload.sku,
          name: payload.name,
          category: payload.category,
          quantity: payload.quantity,
          reorderLevel: payload.reorderLevel,
          unitPrice: payload.unitPrice,
          costPrice: payload.costPrice,
          supplier: payload.supplier,
          description: payload.description,
        };
        await update.mutateAsync({ id: selectedId, data: updatePayload });
      }
      else await create.mutateAsync({ data: payload });
      await refresh(selectedId ?? undefined); setDialog(null); setSelectedId(null);
    } catch { /* mutation error is shown in the dialog */ }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    try { await remove.mutateAsync({ id: product.id }); await refresh(product.id); setDialog(null); setSelectedId(null); }
    catch { /* mutation error is shown inline */ }
  }

  async function submitStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedId === null) return;
    const fd = new FormData(event.currentTarget);
    try {
      await adjust.mutateAsync({ id: selectedId, data: { delta: Number(fd.get('delta')), note: String(fd.get('note') ?? '').trim() || undefined } });
      await refresh(selectedId); setDialog(null);
    } catch { /* mutation error is shown in the dialog */ }
  }

  const selected = productQuery.data;
  return <Shell active="products">
    <PageHeading
      kicker="PRODUCT CATALOG"
      title="Products"
      description="The items you sell, parts you use, and supplies you keep."
      action={
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => open('import')} data-testid="button-upload-stock">
            <Upload size={16} /> Upload Stock (CSV)
          </button>
          <button className="btn btn-primary" onClick={() => open('create')} data-testid="button-add-product">
            <Plus size={16} /> Add product
          </button>
        </div>
      }
    />
    <section className="catalog-panel">
      <div className="catalog-toolbar"><div className="search-field"><Search size={17} /><input type="search" placeholder="Search name, SKU, supplier…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search products" data-testid="input-search-products" />{search && <button aria-label="Clear search" onClick={() => setSearch('')} data-testid="button-clear-search"><X size={15} /></button>}</div>
        <div className="filter-control"><SlidersHorizontal size={15} /><label htmlFor="category-filter">Category</label><select id="category-filter" value={category} onChange={e => setCategory(e.target.value)} data-testid="select-category-filter"><option value="">All categories</option>{categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        <div className="filter-control status-filter"><label htmlFor="status-filter">Stock status</label><select id="status-filter" value={stockStatus} onChange={e => setStockStatus(e.target.value)} data-testid="select-stock-filter"><option value="all">All stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select><ChevronDown size={13} /></div>
        <span className="result-count">{products.data?.length ?? '—'} {products.data?.length === 1 ? 'item' : 'items'}</span>
      </div>
      {remove.isError && <div className="error-panel delete-error" role="alert"><AlertCircle size={18} /><div><b>Product wasn’t deleted</b><span>{errorMessage(remove.error)}</span></div><button className="icon-button" onClick={() => remove.reset()} aria-label="Dismiss delete error"><X size={16} /></button></div>}
      {products.isError ? <QueryError retry={() => products.refetch()} /> : products.isLoading ? <TableSkeleton /> : products.data?.length ? <div className="table-wrap"><table className="product-table"><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>ON HAND</th><th>PURCHASE PRICE</th><th>SELLING PRICE</th><th>SUPPLIER</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {products.data.map(p => <tr key={p.id} data-testid={`row-product-${p.id}`}>
          <td><button className="product-cell" onClick={() => open('detail', p.id)} data-testid={`button-product-detail-${p.id}`}><span className="product-thumb"><Package size={17} /></span><span><b>{p.name}</b><small className="mono">{p.sku}</small></span></button></td>
          <td><span className="category-chip">{p.category}</span></td>
          <td><span className={`quantity-cell ${p.quantity <= p.reorderLevel ? 'quantity-low' : ''}`}>{p.quantity}</span><small className="reorder-hint">reorder at {p.reorderLevel}</small></td>
          <td className="price-cell">{money(p.costPrice)}</td>
          <td className="price-cell"><b>{money(p.unitPrice)}</b></td>
          <td className="supplier-cell">{p.supplier || <span className="not-set">Not set</span>}</td>
          <td><StatusPill product={p} /></td>
          <td><div className="row-actions"><button title="Adjust stock" aria-label={`Adjust stock for ${p.name}`} onClick={() => open('stock', p.id)} data-testid={`button-adjust-stock-${p.id}`}><Boxes size={16} /></button><button title="Edit product" aria-label={`Edit ${p.name}`} onClick={() => open('edit', p.id)} data-testid={`button-edit-product-${p.id}`}><Pencil size={15} /></button><button title="Delete product" aria-label={`Delete ${p.name}`} onClick={() => deleteProduct(p)} disabled={remove.isPending} data-testid={`button-delete-product-${p.id}`}><Trash2 size={15} /></button></div></td>
        </tr>)}
      </tbody></table></div> : <div className="empty-state"><span className="empty-icon"><Package size={20} /></span><b>{search || category || stockStatus !== 'all' ? 'No products match these filters.' : 'Your product list is ready.'}</b><p>{search || category || stockStatus !== 'all' ? 'Try another search or clear a filter to see more.' : 'Add your first product to start keeping an accurate count.'}</p>{search || category || stockStatus !== 'all' ? <button className="btn btn-outline" onClick={() => { setSearch(''); setCategory(''); setStockStatus('all'); }} data-testid="button-clear-filters">Clear filters</button> : <button className="btn btn-primary" onClick={() => open('create')} data-testid="button-empty-add-product"><Plus size={16} /> Add first product</button>}</div>}
      <div className="catalog-foot"><span><Activity size={14} /> Records come directly from your inventory</span><span>{products.data?.length ? `Showing ${products.data.length} ${products.data.length === 1 ? 'record' : 'records'}` : 'No records shown'}</span></div>
    </section>

    {(dialog === 'create' || dialog === 'edit') && <Modal title={dialog === 'create' ? 'Add a product' : 'Edit product'} subtitle={dialog === 'create' ? 'Add a new item to your private catalog.' : 'Update the product record.'} onClose={() => setDialog(null)}>
      {dialog === 'edit' && productQuery.isLoading ? <TableSkeleton rows={4} /> : dialog === 'edit' && productQuery.isError ? <QueryError retry={() => productQuery.refetch()} /> :
        <form className="form-grid" onSubmit={submitProduct}>
          <Field label="Product name" name="name" required defaultValue={selected?.name} placeholder="e.g. Ceramic travel mug" />
          <Field label="SKU" name="sku" required defaultValue={selected?.sku} placeholder="e.g. MUG-240" />
          <Field label="Category" name="category" required defaultValue={selected?.category} placeholder="e.g. Drinkware" />
          <Field label="Supplier" name="supplier" defaultValue={selected?.supplier ?? ''} placeholder="Supplier or vendor name" />
          <Field label="Quantity on hand" name="quantity" type="number" min="0" required defaultValue={selected?.quantity ?? 0} />
          <Field label="Reorder level" name="reorderLevel" type="number" min="0" required defaultValue={selected?.reorderLevel ?? 5} />
          <Field label="Purchase price (Cost)" name="costPrice" type="number" min="0" step="0.01" required defaultValue={selected?.costPrice ?? '0.00'} placeholder="0.00" />
          <Field label="Selling price (Retail)" name="unitPrice" type="number" min="0" step="0.01" required defaultValue={selected?.unitPrice ?? ''} placeholder="0.00" />
          <label className="form-field full-field"><span>Description</span><textarea name="description" maxLength={1000} defaultValue={selected?.description ?? ''} placeholder="Optional notes about this product" data-testid="input-product-description" /></label>
          {(create.isError || update.isError) && <div className="form-error" role="alert"><AlertCircle size={15} />{errorMessage(create.error || update.error)}</div>}
          <div className="modal-actions"><button type="button" className="btn btn-quiet" onClick={() => setDialog(null)} data-testid="button-cancel-product">Cancel</button><button className="btn btn-primary" disabled={mutationPending} data-testid="button-save-product">{mutationPending ? 'Saving…' : dialog === 'create' ? 'Create product' : 'Save changes'}</button></div>
        </form>}
    </Modal>}

    {dialog === 'stock' && <Modal title="Adjust stock" subtitle={selected ? `${selected.name} · ${selected.sku}` : 'Update the quantity on hand.'} onClose={() => setDialog(null)}>
      {productQuery.isLoading ? <TableSkeleton rows={2} /> : productQuery.isError ? <QueryError retry={() => productQuery.refetch()} /> : selected && <form className="stock-form" onSubmit={submitStock}>
        <div className="stock-current"><span>Current quantity</span><b>{selected.quantity}</b><small>Reorder point: {selected.reorderLevel}</small></div>
        <label className="form-field"><span>Change in quantity <small>Positive number to add, negative (e.g. -5) to remove</small></span><input type="number" name="delta" required step="1" placeholder="+10 or -3" data-testid="input-stock-delta" /></label>
        <label className="form-field"><span>Reason / Note <small>e.g. Shipment received, Restock, Damaged goods, Sale</small></span><textarea name="note" maxLength={300} placeholder="Notes about this adjustment" data-testid="input-stock-note" /></label>
        {adjust.isError && <div className="form-error" role="alert"><AlertCircle size={15} />{errorMessage(adjust.error)}</div>}
        <div className="modal-actions"><button type="button" className="btn btn-quiet" onClick={() => setDialog(null)} data-testid="button-cancel-stock">Cancel</button><button className="btn btn-primary" disabled={adjust.isPending} data-testid="button-submit-stock">{adjust.isPending ? 'Updating…' : 'Update quantity'}</button></div>
      </form>}
    </Modal>}

    {dialog === 'detail' && <Modal title="Product details" subtitle="Live product record" onClose={() => setDialog(null)}>
      {productQuery.isLoading ? <TableSkeleton rows={4} /> : productQuery.isError ? <QueryError retry={() => productQuery.refetch()} /> : selected && <div className="detail-view">
        <div className="detail-title"><span className="product-thumb detail-thumb"><Package size={21} /></span><div><h3>{selected.name}</h3><span className="mono">{selected.sku}</span></div><StatusPill product={selected} /></div>
        <div className="detail-grid">
          <Detail label="Category" value={selected.category} />
          <Detail label="Supplier" value={selected.supplier || 'Not set'} />
          <Detail label="Quantity on hand" value={`${selected.quantity} units`} />
          <Detail label="Reorder level" value={`${selected.reorderLevel} units`} />
          <Detail label="Purchase price (Cost)" value={money(selected.costPrice)} />
          <Detail label="Selling price (Retail)" value={money(selected.unitPrice)} />
          <Detail label="Total cost value" value={money(selected.quantity * selected.costPrice)} />
          <Detail label="Total retail value" value={money(selected.quantity * selected.unitPrice)} />
          <Detail label="Created" value={dateText(selected.createdAt)} />
          <Detail label="Last updated" value={dateText(selected.updatedAt)} />
        </div>
        {selected.description && <div className="detail-description"><span>Description</span><p>{selected.description}</p></div>}

        <div className="movements-section">
          <div className="movements-title">
            <span>Stock History</span>
            <small>{movementsQuery.data?.length ?? 0} adjustments</small>
          </div>
          {movementsQuery.isLoading ? <TableSkeleton rows={2} /> : movementsQuery.data?.length ? (
            <div className="movements-list">
              {movementsQuery.data.map(m => (
                <div key={m.id} className="movement-row">
                  <div>
                    <span className="movement-date">{new Date(m.createdAt).toLocaleString()}</span>
                    <div className="movement-note">{m.note || 'Adjustment'}</div>
                  </div>
                  <span className={`delta-badge ${m.delta > 0 ? 'delta-in' : 'delta-out'}`}>
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </span>
                </div>
              ))}
            </div>
          ) : <p style={{ fontSize: 10, color: '#888' }}>No stock movements recorded yet for this product.</p>}
        </div>

        <div className="modal-actions"><button className="btn btn-outline" onClick={() => open('stock', selected.id)} data-testid="button-detail-adjust-stock"><Boxes size={16} /> Adjust stock</button><button className="btn btn-primary" onClick={() => open('edit', selected.id)} data-testid="button-detail-edit"><Pencil size={15} /> Edit product</button></div>
      </div>}
    </Modal>}

    {dialog === 'import' && (
      <Modal
        title="Upload Stock (CSV Bulk Import)"
        subtitle="Quickly upload a CSV file to add or update multiple products in your inventory."
        onClose={() => { setDialog(null); setImportRows([]); setImportError(''); setImportSuccess(''); }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f5f4ef', padding: '12px 16px', borderRadius: 8, fontSize: 13 }}>
            <span>Need the format? Download our ready template:</span>
            <button type="button" className="btn btn-small btn-outline" onClick={downloadTemplate}>
              <ArrowDownToLine size={14} /> Download Template (.csv)
            </button>
          </div>

          <label className="form-field">
            <span>Choose CSV File <small>Required columns: sku, name. Optional: category, quantity, costPrice, unitPrice, supplier</small></span>
            <input type="file" accept=".csv" onChange={handleCsvFile} data-testid="input-csv-file" style={{ padding: '8px' }} />
          </label>

          {importError && (
            <div className="form-error" role="alert"><AlertCircle size={15} />{importError}</div>
          )}

          {importSuccess && (
            <div style={{ background: '#eef8f3', color: '#1f6b45', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>
              ✓ {importSuccess}
            </div>
          )}

          {importRows.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e2ded5', borderRadius: 8 }}>
              <table style={{ width: '100%', fontSize: 12, textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f8f7f4', position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ padding: '8px 10px' }}>SKU</th>
                    <th style={{ padding: '8px 10px' }}>Name</th>
                    <th style={{ padding: '8px 10px' }}>Category</th>
                    <th style={{ padding: '8px 10px' }}>Qty</th>
                    <th style={{ padding: '8px 10px' }}>Cost</th>
                    <th style={{ padding: '8px 10px' }}>Selling</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.slice(0, 8).map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{r.sku}</td>
                      <td style={{ padding: '6px 10px' }}><b>{r.name}</b></td>
                      <td style={{ padding: '6px 10px' }}>{r.category}</td>
                      <td style={{ padding: '6px 10px' }}>{r.quantity}</td>
                      <td style={{ padding: '6px 10px' }}>${r.costPrice}</td>
                      <td style={{ padding: '6px 10px' }}>${r.unitPrice}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importRows.length > 8 && (
                <div style={{ padding: '6px 10px', fontSize: 11, color: '#777', textAlign: 'center', background: '#faf9f6' }}>
                  ...and {importRows.length - 8} more products ready to import
                </div>
              )}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-quiet" onClick={() => setDialog(null)}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={importRows.length === 0 || importLoading}
              onClick={executeImport}
              data-testid="button-execute-import"
            >
              {importLoading ? 'Uploading & importing…' : `Import ${importRows.length} Product${importRows.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </Modal>
    )}
  </Shell>;
}

function errorMessage(error: unknown) {
  if (!error) return 'Please check the fields and try again.';
  const e = error as { message?: string; data?: { error?: string } };
  return e.data?.error || e.message || 'The request could not be completed.';
}
function Field({ label, name, type = 'text', required, defaultValue, placeholder, min, step }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string | number | null; placeholder?: string; min?: string; step?: string }) {
  return <label className="form-field"><span>{label}</span><input name={name} type={type} required={required} defaultValue={defaultValue ?? ''} placeholder={placeholder} min={min} step={step} data-testid={`input-product-${name}`} /></label>;
}
function Modal({ title, subtitle, children, onClose }: { title: string; subtitle: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => { const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle); }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Close dialog" data-testid="button-close-dialog"><X size={18} /></button></div>{children}</section></div>;
}
function Detail({ label, value }: { label: string; value: string }) { return <div className="detail-item"><span>{label}</span><b>{value}</b></div>; }

function ReportsPage() {
  const summary = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const products = useListProducts(undefined, { query: { queryKey: getListProductsQueryKey() } });
  const low = useListLowStockProducts({ query: { queryKey: getListLowStockProductsQueryKey() } });
  const download = useDownloadInventoryReport({ query: { enabled: false, queryKey: getDownloadInventoryReportQueryKey(), retry: false } });
  const [downloadError, setDownloadError] = useState('');
  async function downloadCsv() {
    setDownloadError('');
    try {
      const result = await download.refetch();
      if (!result.data) throw new Error('The report did not contain any data.');
      const content = result.data as string;
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `inventory-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (e) { setDownloadError(errorMessage(e)); }
  }
  const categories = useMemo(() => new Set((products.data ?? []).map(p => p.category)).size, [products.data]);
  return <Shell active="reports"><PageHeading kicker="INVENTORY REPORT" title="Reports" description="A current snapshot of the records in your inventory." action={<button className="btn btn-primary" onClick={downloadCsv} disabled={download.isFetching} data-testid="button-download-report"><ArrowDownToLine size={16} />{download.isFetching ? 'Preparing CSV…' : 'Download CSV'}</button>} />
    {(summary.isError || products.isError || low.isError) && <QueryError retry={() => { void summary.refetch(); void products.refetch(); void low.refetch(); }} />}
    {downloadError && <div className="error-panel" role="alert"><AlertCircle size={18} /><div><b>Report download failed</b><span>{downloadError}</span></div><button className="icon-button" onClick={() => setDownloadError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
    <section className="report-banner"><div className="report-banner-icon"><FileBarChart2 size={21} /></div><div><span className="section-kicker">LIVE INVENTORY EXPORT</span><h2>A dependable snapshot, ready to share.</h2><p>Export your current product records as a CSV file. Includes purchase cost, selling price, quantities, and reorder levels.</p></div><div className="report-file-mark"><span>CSV</span><FileBarChart2 size={31} /></div></section>
    <div className="report-stat-grid">{summary.isLoading ? <>{[1, 2, 3, 4].map(n => <SkeletonMetric key={n} />)}</> : summary.data && <>
      <Metric label="Catalog items" value={summary.data.productCount.toLocaleString()} hint="Distinct product records" icon={<Package size={18} />} tone="green" />
      <Metric label="Total units" value={summary.data.totalUnits.toLocaleString()} hint="Available across your catalog" icon={<Boxes size={18} />} tone="sand" />
      <Metric label="Retail value" value={money(summary.data.inventoryValue)} hint="At current selling prices" icon={<CircleDollarSign size={18} />} tone="peach" />
      <Metric label="Categories" value={summary.data.categoryCount.toLocaleString()} hint="Product groupings" icon={<ClipboardList size={18} />} tone="rose" />
    </>}</div>
    <div className="report-detail-grid"><section className="panel report-breakdown"><div className="panel-heading"><div><div className="section-kicker">STOCK HEALTH</div><h2>Replenishment overview</h2></div><span className="report-date">CURRENT RECORDS</span></div>
       {summary.isLoading ? <TableSkeleton rows={3} /> : summary.data && <div className="health-rows"><div className="health-row"><span className="health-label"><i className="health-green" />In stock</span><b>{Math.max(summary.data.productCount - summary.data.lowStockCount - summary.data.outOfStockCount, 0).toLocaleString()}</b><span className="health-note">Above reorder level</span></div><div className="health-row"><span className="health-label"><i className="health-amber" />Low stock</span><b>{summary.data.lowStockCount.toLocaleString()}</b><span className="health-note">Above zero, at/below reorder point</span></div><div className="health-row"><span className="health-label"><i className="health-red" />Out of stock</span><b>{summary.data.outOfStockCount.toLocaleString()}</b><span className="health-note">No units currently available</span></div></div>}
    </section><section className="panel report-meta"><div className="section-kicker">ABOUT THIS EXPORT</div><h2>Clean records.<br />No spreadsheet archaeology.</h2><p>Your CSV contains each product’s SKU, name, category, stock quantity, reorder level, cost price, selling price, supplier, and timestamps.</p><div className="meta-lines"><div><Truck size={16} /><span>Supplier &amp; cost details included</span><Check size={15} /></div><div><Activity size={16} /><span>Current stock quantities</span><Check size={15} /></div><div><ArrowDownToLine size={16} /><span>Standard RFC-compliant CSV format</span><Check size={15} /></div></div></section></div>
    <div className="report-footer"><span><ShieldCheck size={15} /> Export contains live verified records from your inventory.</span><span>{low.data?.length ?? 0} products currently need attention · {categories || 0} categories in catalog</span></div>
  </Shell>;
}

function AdminUsersPage() {
  const usersQuery = useListAdminUsers({ query: { queryKey: getListAdminUsersQueryKey() } });
  const updateRole = useUpdateUserRole();
  const qc = useQueryClient();

  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'user' | 'admin'>('user');
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [addUserError, setAddUserError] = useState('');

  async function submitAddUser(e: FormEvent) {
    e.preventDefault();
    if (!newUserEmail.trim()) return;
    setAddUserLoading(true);
    setAddUserError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUserName.trim() || undefined,
          email: newUserEmail.trim(),
          role: newUserRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user account');
      await qc.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
      setAddUserOpen(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserRole('user');
    } catch (err: any) {
      setAddUserError(err.message || 'Failed to create user');
    } finally {
      setAddUserLoading(false);
    }
  }

  async function deleteUser(u: UserProfile) {
    if (!window.confirm(`Delete user ${u.name || u.email}? This will also remove any products assigned to them.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${u.clerkUserId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete user');
      }
      await qc.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
    } catch (err: any) {
      alert(err.message || 'Failed to delete user');
    }
  }

  async function toggleRole(user: UserProfile) {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    const confirmMessage = user.role === 'admin'
      ? `Remove administrator privileges from ${user.name || user.email}?`
      : `Promote ${user.name || user.email} to Administrator?`;

    if (!window.confirm(confirmMessage)) return;

    try {
      await updateRole.mutateAsync({ userId: user.clerkUserId, data: { role: newRole } });
      await qc.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
      await qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
    } catch {
      /* handled by error banner */
    }
  }

  return <Shell active="users">
    <PageHeading
      kicker="ACCESS &amp; PERMISSIONS"
      title="Team &amp; User Accounts"
      description="View registered accounts, manually provision team members, and assign administrator roles."
      action={
        <button className="btn btn-primary" onClick={() => setAddUserOpen(true)} data-testid="button-add-user">
          <Plus size={16} /> Add user account
        </button>
      }
    />
    {updateRole.isError && (
      <div className="error-panel" role="alert">
        <AlertCircle size={18} />
        <div><b>Role update failed</b><span>{errorMessage(updateRole.error)}</span></div>
      </div>
    )}
    <section className="catalog-panel">
      {usersQuery.isLoading ? <TableSkeleton rows={4} /> : usersQuery.isError ? (
        <QueryError retry={() => usersQuery.refetch()} />
      ) : usersQuery.data?.length ? (
        <div className="table-wrap">
          <table className="product-table">
            <thead>
              <tr>
                <th>USER ACCOUNT</th>
                <th>ROLE</th>
                <th>PRODUCTS OWNED</th>
                <th>JOINED</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.data.map(u => (
                <tr key={u.clerkUserId}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="profile-dot" style={{ width: 32, height: 32, fontSize: 13 }}>
                        {(u.name || u.email).slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <b>{u.name || 'Unnamed User'}</b>
                        <div className="mono">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`role-badge ${u.role === 'admin' ? 'admin' : 'user'}`}>
                      {u.role === 'admin' ? 'Administrator' : 'Normal User'}
                    </span>
                  </td>
                  <td><b>{u.productCount}</b> items</td>
                  <td className="mono">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        className="btn btn-small btn-outline"
                        disabled={updateRole.isPending}
                        onClick={() => toggleRole(u)}
                      >
                        {u.role === 'admin' ? 'Demote to User' : 'Make Administrator'}
                      </button>
                      <button
                        className="icon-button"
                        style={{ color: '#a43f37' }}
                        onClick={() => deleteUser(u)}
                        title="Delete user account"
                        data-testid={`button-delete-user-${u.clerkUserId}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <p>No registered users found.</p>
        </div>
      )}
    </section>

    {addUserOpen && (
      <Modal
        title="Add User Account"
        subtitle="Manually provision a team member or employee account."
        onClose={() => { setAddUserOpen(false); setAddUserError(''); }}
      >
        <form onSubmit={submitAddUser} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label className="form-field">
            <span>Full Name</span>
            <input
              type="text"
              required
              placeholder="e.g. Rahul Sharma"
              value={newUserName}
              onChange={e => setNewUserName(e.target.value)}
              data-testid="input-new-user-name"
            />
          </label>

          <label className="form-field">
            <span>Email Address</span>
            <input
              type="email"
              required
              placeholder="e.g. rahul@example.com"
              value={newUserEmail}
              onChange={e => setNewUserEmail(e.target.value)}
              data-testid="input-new-user-email"
            />
          </label>

          <label className="form-field">
            <span>Account Role</span>
            <select
              value={newUserRole}
              onChange={e => setNewUserRole(e.target.value as 'user' | 'admin')}
              data-testid="select-new-user-role"
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #dcd8ce' }}
            >
              <option value="user">Normal User (Access to own private inventory only)</option>
              <option value="admin">Administrator (Full team &amp; system access)</option>
            </select>
          </label>

          {addUserError && (
            <div className="form-error" role="alert"><AlertCircle size={15} />{addUserError}</div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-quiet" onClick={() => setAddUserOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={addUserLoading} data-testid="button-save-new-user">
              {addUserLoading ? 'Creating user…' : 'Create User Account'}
            </button>
          </div>
        </form>
      </Modal>
    )}
  </Shell>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={appearance}
    signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to access your inventory workspace' } }, signUp: { start: { title: 'Create your account', subtitle: 'Your administrator will approve workspace access' } } }}
    routerPush={to => setLocation(stripBase(to))} routerReplace={to => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}><TooltipProvider><ClerkAuthSync /><RoutedBoundary><AuthRoutes /></RoutedBoundary><Toaster /></TooltipProvider></QueryClientProvider>
  </ClerkProvider>;
}
function RoutedBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() { return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>; }
export default App;
