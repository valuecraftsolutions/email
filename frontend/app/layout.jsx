import './globals.css';
import './mail.css';
import './productivity.css';
import Providers from '@/components/providers/Providers';

export const metadata = {
  title: { default: 'ValueCraft Mail', template: '%s · ValueCraft Mail' },
  description: 'ValueCraft Minds company webmail',
  robots: { index: false, follow: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1720' },
  ],
};

// Applies the saved theme before first paint to avoid a light/dark flash.
const themeScript = `(function(){try{var p=localStorage.getItem('vcm-theme');if(p!=='light'&&p!=='dark')p='system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.themePreference=p;}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
