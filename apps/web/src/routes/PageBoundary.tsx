import { Component, Suspense, type ReactNode } from 'react';
import { Link } from 'react-router';
import { BrandMark } from '@/components/ui/BrandMark';
import { Button } from '@/components/ui/Button';

function PageLoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-center">
      <div role="status" aria-live="polite">
        <BrandMark className="mx-auto h-12 w-12" />
        <p className="mt-4 font-semibold text-navy-900">Loading page...</p>
      </div>
    </main>
  );
}

/** The app providers stay mounted when a page download fails or suspends. */
export class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (this.state.failed) {
      return (
        <main className="flex min-h-screen items-center justify-center px-6 text-center">
          <div className="max-w-sm">
            <BrandMark className="mx-auto h-12 w-12" />
            <h1 className="mt-4 text-xl font-bold text-navy-900">Unable to open this page</h1>
            <p className="mt-3 text-gray-600">
              Check your connection and reload the page. If the problem continues, try again later.
            </p>
            <Button className="mt-6" onClick={() => window.location.reload()}>
              Reload page
            </Button>
            <Link to="/" className="mt-4 block font-semibold text-navy-700 underline">
              Back to start
            </Link>
          </div>
        </main>
      );
    }

    return <Suspense fallback={<PageLoadingScreen />}>{this.props.children}</Suspense>;
  }
}
