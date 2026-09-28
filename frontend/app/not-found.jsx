import Link from 'next/link';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <div className="full-page-center">
      <div className="empty-state">
        <h1 className="empty-state__title">Page not found</h1>
        <p className="empty-state__text">
          The page you are looking for does not exist or has moved.
        </p>
        <Link href="/" className="btn btn--secondary btn--md">
          Go to mail
        </Link>
      </div>
    </div>
  );
}
